from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
import sklearn
from scipy import sparse
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
)
from sklearn.svm import LinearSVC

from ml.classifier_wrappers import (
    CanonicalRemapClassifier,
    HierarchicalGateClassifier,
    PrototypeRerankerClassifier,
)
from ml.scripts.build_marilia_taxonomy_v2 import TAXONOMY_VERSION
from ml.scripts.train_failure_classifier_marilia_v1_3 import (
    MIN_VALIDATION_AUTOMATIONS,
    NON_AUTOMATABLE_FAILURE_MODES,
    TARGET_PRECISIONS,
    VectorizerConfig,
    build_confidence_curve,
    build_vectorizer,
    calculate_metrics,
    choose_operational_threshold,
    decision_scores,
    evaluate_threshold,
    json_ready,
    margins_from_scores,
    select_thresholds,
    top_k_from_scores,
)


MODEL_VERSION = "failure_classifier_marilia_v1_4_candidate"
DATASET_VERSION = "marilia-human-v1-canonical-taxonomy-v2"
RANDOM_SEED = 42
DEFAULT_DATASET = (
    "ml/data/human/marilia/prepared/marilia_human_v2_canonical.csv"
)
DEFAULT_TAXONOMY = (
    "ml/data/human/marilia/taxonomy/canonical_taxonomy_v2.csv"
)
DEFAULT_TAXONOMY_CANDIDATES = (
    "ml/reports/failure_classifier_marilia_v1_4_taxonomy_candidates.csv"
)
DEFAULT_V13_EVAL = (
    "ml/models/failure_classifier_marilia_v1_3_candidate_eval.joblib"
)
DEFAULT_V13_OPERATIONAL = (
    "ml/models/failure_classifier_marilia_v1_3_candidate.joblib"
)
DEFAULT_MODEL_OUTPUT = (
    "ml/models/failure_classifier_marilia_v1_4_candidate.joblib"
)
DEFAULT_REPORT_DIR = "ml/reports"

BASE_CONFIG = VectorizerConfig(
    "word_12_char_36",
    (1, 2),
    (3, 6),
    1,
    1.0,
    True,
    50000,
    75000,
)
COMPACT_CONFIG = VectorizerConfig(
    "word_12_char_35",
    (1, 2),
    (3, 5),
    1,
    1.0,
    True,
    50000,
    65000,
)
FLAT_CANDIDATES = (
    (BASE_CONFIG, 1.5, "balanced"),
    (BASE_CONFIG, 1.0, "balanced"),
    (BASE_CONFIG, 2.0, "balanced"),
    (BASE_CONFIG, 1.5, None),
    (COMPACT_CONFIG, 1.5, "balanced"),
)
GENERIC_CLASSES = {
    "SEM MODO DE FALHA IDENTIFICADO",
    "FALHA DE COMPONENTE",
    "FALHA DE EQUIPAMENTO",
    "FALHA DE ENCHIMENTO",
    "FALHA DE ESTEIRA",
    "FALHA DE MOTOR",
    "FALHA DE ROBO",
    "FALHA DE SENSOR",
    "FALHA DE TRANSPORTE",
    "FALHA DE VALVULA",
    "QUEBRA DE COMPONENTE",
}


@dataclass(frozen=True)
class ArchitectureSpec:
    name: str
    vectorizer_config: VectorizerConfig | None
    c: float | None
    class_weight: str | None
    alpha: float | None = None


def load_inputs(
    dataset_path: Path,
    taxonomy_path: Path,
) -> tuple[pd.DataFrame, pd.DataFrame, dict[str, str]]:
    dataset = pd.read_csv(dataset_path, dtype=str).fillna("")
    taxonomy = pd.read_csv(taxonomy_path, dtype=str).fillna("")
    required = {
        "row_id",
        "observation",
        "observation_norm",
        "classification_original",
        "classification_original_norm",
        "classification_canonical",
        "technical_family",
        "split",
    }
    missing = required - set(dataset.columns)
    if missing:
        raise ValueError(f"Canonical dataset missing columns: {sorted(missing)}")
    if dataset["row_id"].duplicated().any():
        raise RuntimeError("row_id is not unique in canonical dataset.")
    groups = dataset.groupby("observation_norm")["split"].nunique()
    if (groups > 1).any():
        raise RuntimeError("Leakage: observation_norm appears in multiple splits.")
    train_classes = set(
        dataset.loc[dataset["split"] == "TRAIN", "classification_canonical"]
    )
    missing_train = sorted(set(dataset["classification_canonical"]) - train_classes)
    if missing_train:
        raise RuntimeError(f"Canonical classes missing from TRAIN: {missing_train}")
    mapping = dict(
        zip(taxonomy["original_label"], taxonomy["suggested_canonical_label"])
    )
    return dataset, taxonomy, mapping


def build_display_label_map(dataset: pd.DataFrame) -> dict[str, str]:
    return {
        str(label): str(group["classification_original"].value_counts().index[0])
        for label, group in dataset.groupby("classification_canonical")
    }


def train_flat_classifier(
    features: Any,
    labels: pd.Series,
    c: float,
    class_weight: str | None,
    seed: int,
) -> LinearSVC:
    classifier = LinearSVC(
        C=c,
        class_weight=class_weight,
        max_iter=10000,
        random_state=seed,
    )
    classifier.fit(features, labels.astype(str))
    return classifier


def evaluate_classifier(
    classifier: Any,
    features: Any,
    true_labels: np.ndarray,
) -> dict[str, Any]:
    predictions = np.asarray(classifier.predict(features)).astype(str)
    scores = decision_scores(classifier, features)
    margins = margins_from_scores(scores)
    top3 = top_k_from_scores(
        scores, np.asarray(classifier.classes_).astype(str), k=3
    )
    metrics = calculate_metrics(true_labels, predictions, top3)
    curve = build_confidence_curve(true_labels, predictions, margins)
    thresholds = select_thresholds(curve)
    report = classification_report(
        true_labels,
        predictions,
        output_dict=True,
        zero_division=0,
    )
    nonzero_recall = sum(
        float(values.get("recall", 0.0)) > 0
        for label, values in report.items()
        if label not in {"accuracy", "macro avg", "weighted avg"}
    )
    return {
        "metrics": metrics,
        "thresholds": thresholds,
        "confidence_curve": curve,
        "predictions": predictions,
        "scores": scores,
        "margins": margins,
        "top3": top3,
        "classes_with_nonzero_recall": int(nonzero_recall),
    }


def high_confidence_for_selection(
    thresholds: dict[str, dict[str, Any] | None],
) -> tuple[float, float]:
    selected = thresholds.get("97")
    if selected is None:
        return 0.0, 0.0
    return float(selected["precision"]), float(selected["coverage"])


def selection_key(row: dict[str, Any]) -> tuple[float, ...]:
    precision, coverage = high_confidence_for_selection(row["thresholds"])
    return (
        float(row["validation_macro_f1"]),
        float(row["validation_accuracy"]),
        precision,
        coverage,
        float(row["classes_with_nonzero_recall"]),
        -float(row["complexity_rank"]),
    )


def make_selection_row(
    architecture: str,
    result: dict[str, Any],
    complexity_rank: int,
    parameters: dict[str, Any],
) -> dict[str, Any]:
    precision, coverage = high_confidence_for_selection(result["thresholds"])
    return {
        "architecture": architecture,
        **{
            f"validation_{key}": value
            for key, value in result["metrics"].items()
        },
        "validation_hc_97_precision": precision or None,
        "validation_hc_97_coverage": coverage or None,
        "classes_with_nonzero_recall": result["classes_with_nonzero_recall"],
        "complexity_rank": complexity_rank,
        "parameters": parameters,
        "thresholds": result["thresholds"],
    }


def build_centroids(
    features: Any,
    labels: np.ndarray,
    classes: np.ndarray,
) -> sparse.csr_matrix:
    rows = []
    for label in classes:
        rows.append(sparse.csr_matrix(features[labels == label].mean(axis=0)))
    return sparse.vstack(rows, format="csr")


def flatten_selection_rows(rows: list[dict[str, Any]], winner: dict[str, Any]) -> pd.DataFrame:
    output = []
    for row in rows:
        flat = {
            key: value
            for key, value in row.items()
            if key not in {"parameters", "thresholds", "classifier", "vectorizer"}
        }
        flat["parameters"] = json.dumps(row["parameters"], ensure_ascii=False)
        for target in ("90", "95", "97", "99"):
            selected = row["thresholds"].get(target)
            flat[f"hc_{target}_precision"] = (
                selected["precision"] if selected else None
            )
            flat[f"hc_{target}_coverage"] = (
                selected["coverage"] if selected else None
            )
        flat["selected"] = row is winner
        output.append(flat)
    return pd.DataFrame(output)


def rarity_bucket(support: int) -> str:
    if support == 1:
        return "1"
    if support <= 3:
        return "2-3"
    if support <= 5:
        return "4-5"
    if support <= 10:
        return "6-10"
    if support <= 20:
        return "11-20"
    return ">20"


def build_rarity_analysis(
    true_labels: np.ndarray,
    predictions: np.ndarray,
    train_support: pd.Series,
) -> pd.DataFrame:
    frame = pd.DataFrame({"expected": true_labels, "predicted": predictions})
    frame["train_support"] = frame["expected"].map(train_support).fillna(0).astype(int)
    frame["rarity_bucket"] = frame["train_support"].map(rarity_bucket)
    rows = []
    for bucket in ("1", "2-3", "4-5", "6-10", "11-20", ">20"):
        group = frame[frame["rarity_bucket"] == bucket]
        if group.empty:
            continue
        rows.append(
            {
                "analysis_type": "bucket",
                "segment": bucket,
                "rows": int(len(group)),
                "classes": int(group["expected"].nunique()),
                "accuracy": float(
                    accuracy_score(group["expected"], group["predicted"])
                ),
                "macro_f1": float(
                    f1_score(
                        group["expected"],
                        group["predicted"],
                        average="macro",
                        zero_division=0,
                    )
                ),
            }
        )
    for minimum in (5, 10, 20):
        group = frame[frame["train_support"] >= minimum]
        rows.append(
            {
                "analysis_type": "minimum_support",
                "segment": f">={minimum}",
                "rows": int(len(group)),
                "classes": int(group["expected"].nunique()),
                "accuracy": float(
                    accuracy_score(group["expected"], group["predicted"])
                ) if len(group) else None,
                "macro_f1": float(
                    f1_score(
                        group["expected"],
                        group["predicted"],
                        average="macro",
                        zero_division=0,
                    )
                ) if len(group) else None,
            }
        )
    return pd.DataFrame(rows)


def relation_lookup(candidates: pd.DataFrame) -> dict[tuple[str, str], str]:
    priority = {
        "EXACT_VARIANT": 7,
        "ORTHOGRAPHIC_VARIANT": 6,
        "MORPHOLOGICAL_VARIANT": 5,
        "LIKELY_EQUIVALENT": 4,
        "GENERIC_SPECIFIC": 3,
        "RELATED_NOT_EQUIVALENT": 2,
        "UNIQUE": 1,
    }
    result: dict[tuple[str, str], str] = {}
    for row in candidates.itertuples(index=False):
        left = str(row.original_label)
        right = str(row.suggested_canonical_label)
        relation = str(row.relation_type)
        for pair in ((left, right), (right, left)):
            current = result.get(pair)
            if current is None or priority.get(relation, 0) > priority.get(current, 0):
                result[pair] = relation
    return result


def write_test_reports(
    test: pd.DataFrame,
    result: dict[str, Any],
    train: pd.DataFrame,
    candidates: pd.DataFrame,
    report_dir: Path,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, list[dict[str, Any]]]:
    true_labels = test["classification_canonical"].astype(str).to_numpy()
    predictions = result["predictions"]
    scores = result["scores"]
    classes = np.asarray(result["classifier"].classes_).astype(str)
    class_indices = {label: index for index, label in enumerate(classes)}
    ranked = np.argsort(scores, axis=1)[:, ::-1]
    train_support = train["classification_canonical"].value_counts()
    relations = relation_lookup(candidates)

    report = classification_report(
        true_labels,
        predictions,
        labels=classes,
        output_dict=True,
        zero_division=0,
    )
    class_report = pd.DataFrame(
        [
            {
                "class": label,
                "precision": report[label]["precision"],
                "recall": report[label]["recall"],
                "f1": report[label]["f1-score"],
                "support": int(report[label]["support"]),
                "train_support": int(train_support.get(label, 0)),
            }
            for label in classes
        ]
    )
    class_report.to_csv(
        report_dir / "failure_classifier_marilia_v1_4_classification_report.csv",
        index=False,
        encoding="utf-8-sig",
    )
    matrix = confusion_matrix(true_labels, predictions, labels=classes)
    matrix_frame = pd.DataFrame(matrix, index=classes, columns=classes)
    matrix_frame.index.name = "expected"
    matrix_frame.to_csv(
        report_dir / "failure_classifier_marilia_v1_4_confusion_matrix.csv",
        encoding="utf-8-sig",
    )

    error_rows = []
    for row_position, (_, source) in enumerate(test.iterrows()):
        expected = true_labels[row_position]
        predicted = predictions[row_position]
        if expected == predicted:
            continue
        order = ranked[row_position]
        top_labels = [str(classes[index]) for index in order[:3]]
        top_scores = [float(scores[row_position, index]) for index in order[:3]]
        error_rows.append(
            {
                "row_id": source["row_id"],
                "observation": source["observation"],
                "expected_original": source["classification_original"],
                "expected_canonical": expected,
                "predicted": predicted,
                "top1_score": top_scores[0],
                "top2": top_labels[1],
                "top2_score": top_scores[1],
                "top3": top_labels[2],
                "top3_score": top_scores[2],
                "decision_margin": result["margins"][row_position],
                "expected_train_support": int(train_support.get(expected, 0)),
                "predicted_train_support": int(train_support.get(predicted, 0)),
                "taxonomy_relation": relations.get(
                    (expected, predicted), "NO_RECORDED_RELATION"
                ),
                "rarity_bucket": rarity_bucket(int(train_support.get(expected, 0))),
            }
        )
    errors = pd.DataFrame(error_rows)
    errors.to_csv(
        report_dir / "failure_classifier_marilia_v1_4_errors.csv",
        index=False,
        encoding="utf-8-sig",
    )

    confusion_rows = []
    if not errors.empty:
        grouped = (
            errors.groupby(["expected_canonical", "predicted"])
            .size()
            .rename("count")
            .reset_index()
            .sort_values(
                ["count", "expected_canonical", "predicted"],
                ascending=[False, True, True],
            )
        )
        for row in grouped.itertuples(index=False):
            examples = errors[
                (errors["expected_canonical"] == row.expected_canonical)
                & (errors["predicted"] == row.predicted)
            ]["observation"].head(3)
            relation = relations.get(
                (str(row.expected_canonical), str(row.predicted)),
                "NO_RECORDED_RELATION",
            )
            confusion_rows.append(
                {
                    "expected": row.expected_canonical,
                    "predicted": row.predicted,
                    "count": int(row.count),
                    "expected_support": int(train_support.get(row.expected_canonical, 0)),
                    "predicted_support": int(train_support.get(row.predicted, 0)),
                    "potential_taxonomy_overlap": relation,
                    "example_observations": " || ".join(examples.astype(str)),
                }
            )
    top_confusions = pd.DataFrame(confusion_rows)
    top_confusions.to_csv(
        report_dir / "failure_classifier_marilia_v1_4_top_confusions.csv",
        index=False,
        encoding="utf-8-sig",
    )
    rarity = build_rarity_analysis(true_labels, predictions, train_support)
    rarity.to_csv(
        report_dir / "failure_classifier_marilia_v1_4_rarity_analysis.csv",
        index=False,
        encoding="utf-8-sig",
    )

    generic_confusions = []
    for row in confusion_rows:
        expected_generic = row["expected"] in GENERIC_CLASSES
        predicted_generic = row["predicted"] in GENERIC_CLASSES
        if expected_generic == predicted_generic:
            continue
        generic_confusions.append(
            {
                "direction": (
                    "GENERIC_TO_SPECIFIC"
                    if expected_generic
                    else "SPECIFIC_TO_GENERIC"
                ),
                **row,
            }
        )
    return class_report, errors, top_confusions, generic_confusions


def validate_artifact(path: Path) -> dict[str, Any]:
    package = joblib.load(path)
    required = {
        "model_version",
        "dataset_version",
        "vectorizer",
        "classifier",
        "classes",
        "display_label_map",
        "confidence_type",
        "automation_thresholds",
    }
    missing = required - set(package)
    if missing:
        raise RuntimeError(f"Artifact missing keys: {sorted(missing)}")
    classifier = package["classifier"]
    if not callable(getattr(classifier, "predict", None)):
        raise RuntimeError("Artifact classifier has no predict().")
    if not callable(getattr(classifier, "decision_function", None)):
        raise RuntimeError("Artifact classifier has no decision_function().")
    if not hasattr(classifier, "classes_"):
        raise RuntimeError("Artifact classifier has no classes_.")
    if not np.array_equal(
        np.asarray(package["classes"]).astype(str),
        np.asarray(classifier.classes_).astype(str),
    ):
        raise RuntimeError("Artifact classes differ from classifier.classes_.")
    features = package["vectorizer"].transform(["falha no sensor da esteira"])
    prediction = classifier.predict(features)
    scores = decision_scores(classifier, features)
    return {
        "loaded": True,
        "predict": str(prediction[0]),
        "decision_shape": list(scores.shape),
        "classes": int(len(classifier.classes_)),
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Train and evaluate the Marilia failure classifier v1.4."
    )
    parser.add_argument("--dataset", default=DEFAULT_DATASET)
    parser.add_argument("--taxonomy", default=DEFAULT_TAXONOMY)
    parser.add_argument("--taxonomy-candidates", default=DEFAULT_TAXONOMY_CANDIDATES)
    parser.add_argument("--v1-3-eval", default=DEFAULT_V13_EVAL)
    parser.add_argument("--v1-3-operational", default=DEFAULT_V13_OPERATIONAL)
    parser.add_argument("--model-output", default=DEFAULT_MODEL_OUTPUT)
    parser.add_argument("--report-dir", default=DEFAULT_REPORT_DIR)
    parser.add_argument("--seed", type=int, default=RANDOM_SEED)
    parser.add_argument("--validation-only", action="store_true")
    args = parser.parse_args()

    dataset_path = Path(args.dataset).resolve()
    taxonomy_path = Path(args.taxonomy).resolve()
    candidates_path = Path(args.taxonomy_candidates).resolve()
    v13_eval_path = Path(args.v1_3_eval).resolve()
    v13_operational_path = Path(args.v1_3_operational).resolve()
    model_path = Path(args.model_output).resolve()
    eval_model_path = model_path.with_name(f"{model_path.stem}_eval{model_path.suffix}")
    report_dir = Path(args.report_dir).resolve()
    report_dir.mkdir(parents=True, exist_ok=True)
    model_path.parent.mkdir(parents=True, exist_ok=True)

    dataset, taxonomy, original_to_canonical = load_inputs(
        dataset_path, taxonomy_path
    )
    candidates = pd.read_csv(candidates_path, dtype=str).fillna("")
    train = dataset[dataset["split"] == "TRAIN"].copy()
    validation = dataset[dataset["split"] == "VALIDATION"].copy()
    test = dataset[dataset["split"] == "TEST"].copy()
    train_labels = train["classification_canonical"].astype(str).to_numpy()
    validation_labels = validation[
        "classification_canonical"
    ].astype(str).to_numpy()

    selection_rows: list[dict[str, Any]] = []
    objects: dict[str, tuple[Any, Any, ArchitectureSpec]] = {}

    # Published v1.3 evaluation artifact, remapped without retraining.
    v13_package = joblib.load(v13_eval_path)
    v13_classifier = CanonicalRemapClassifier(
        v13_package["classifier"], original_to_canonical
    )
    v13_validation_features = v13_package["vectorizer"].transform(
        validation["observation"].astype(str)
    )
    v13_result = evaluate_classifier(
        v13_classifier, v13_validation_features, validation_labels
    )
    v13_row = make_selection_row(
        "v1.3_baseline_remapped",
        v13_result,
        1,
        {"source_artifact": str(v13_eval_path)},
    )
    selection_rows.append(v13_row)
    objects[v13_row["architecture"]] = (
        v13_package["vectorizer"],
        v13_classifier,
        ArchitectureSpec("v1.3_baseline_remapped", None, None, None),
    )

    # Flat v1.4 tuning on VALIDATION only.
    feature_cache: dict[str, tuple[Any, Any, Any]] = {}
    for config, c, class_weight in FLAT_CANDIDATES:
        if config.name not in feature_cache:
            vectorizer = build_vectorizer(config)
            train_features = vectorizer.fit_transform(
                train["observation"].astype(str)
            )
            validation_features = vectorizer.transform(
                validation["observation"].astype(str)
            )
            feature_cache[config.name] = (
                vectorizer,
                train_features,
                validation_features,
            )
        vectorizer, train_features, validation_features = feature_cache[config.name]
        classifier = train_flat_classifier(
            train_features,
            train["classification_canonical"],
            c,
            class_weight,
            args.seed,
        )
        result = evaluate_classifier(classifier, validation_features, validation_labels)
        architecture = (
            f"v1.4_flat_{config.name}_c{c}_cw{class_weight or 'none'}"
        )
        row = make_selection_row(
            architecture,
            result,
            1,
            {
                "vectorizer": asdict(config),
                "C": c,
                "class_weight": class_weight or "None",
            },
        )
        selection_rows.append(row)
        objects[architecture] = (
            vectorizer,
            classifier,
            ArchitectureSpec(architecture, config, c, class_weight),
        )

    flat_rows = [
        row for row in selection_rows if row["architecture"].startswith("v1.4_flat")
    ]
    best_flat_row = max(flat_rows, key=selection_key)
    best_vectorizer, best_flat_classifier, best_flat_spec = objects[
        best_flat_row["architecture"]
    ]
    _, best_train_features, best_validation_features = feature_cache[
        str(best_flat_spec.vectorizer_config.name)
    ]

    # Hierarchical family -> mode gate.
    family_classifier = LinearSVC(
        C=1.0,
        class_weight="balanced",
        max_iter=10000,
        random_state=args.seed,
    )
    family_classifier.fit(best_train_features, train["technical_family"].astype(str))
    class_to_family = {
        str(row.suggested_canonical_label): str(row.technical_family)
        for row in taxonomy.itertuples(index=False)
    }
    hierarchical = HierarchicalGateClassifier(
        best_flat_classifier, family_classifier, class_to_family
    )
    hierarchical_result = evaluate_classifier(
        hierarchical, best_validation_features, validation_labels
    )
    hierarchical_row = make_selection_row(
        "v1.4_hierarchical_hard_family_gate",
        hierarchical_result,
        3,
        {
            "base": best_flat_row["architecture"],
            "family_classifier_C": 1.0,
            "families": int(train["technical_family"].nunique()),
        },
    )
    selection_rows.append(hierarchical_row)
    objects[hierarchical_row["architecture"]] = (
        best_vectorizer,
        hierarchical,
        ArchitectureSpec(
            hierarchical_row["architecture"],
            best_flat_spec.vectorizer_config,
            best_flat_spec.c,
            best_flat_spec.class_weight,
        ),
    )

    # TRAIN-only prototypes and reranking weights selected on VALIDATION.
    centroids = build_centroids(
        best_train_features,
        train_labels,
        np.asarray(best_flat_classifier.classes_).astype(str),
    )
    for alpha in np.arange(0.1, 1.0, 0.1):
        alpha = round(float(alpha), 1)
        reranker = PrototypeRerankerClassifier(
            best_flat_classifier, centroids, alpha=alpha, top_k=3
        )
        reranked_result = evaluate_classifier(
            reranker, best_validation_features, validation_labels
        )
        architecture = f"v1.4_reranked_top3_alpha_{alpha:.1f}"
        row = make_selection_row(
            architecture,
            reranked_result,
            2,
            {
                "base": best_flat_row["architecture"],
                "alpha": alpha,
                "prototype": "TRAIN_only_tfidf_centroid",
                "top_k": 3,
            },
        )
        selection_rows.append(row)
        objects[architecture] = (
            best_vectorizer,
            reranker,
            ArchitectureSpec(
                architecture,
                best_flat_spec.vectorizer_config,
                best_flat_spec.c,
                best_flat_spec.class_weight,
                alpha=alpha,
            ),
        )

    winner_row = max(selection_rows, key=selection_key)
    selection_report = flatten_selection_rows(selection_rows, winner_row)
    selection_report.to_csv(
        report_dir / "failure_classifier_marilia_v1_4_model_selection.csv",
        index=False,
        encoding="utf-8-sig",
    )
    print(selection_report.to_string(index=False))
    if args.validation_only:
        print(
            json.dumps(
                {
                    "validation_only": True,
                    "winner": {
                        key: value
                        for key, value in winner_row.items()
                        if key not in {"thresholds"}
                    },
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return

    winner_vectorizer, winner_classifier, winner_spec = objects[
        winner_row["architecture"]
    ]
    winner_validation_features = winner_vectorizer.transform(
        validation["observation"].astype(str)
    )
    validation_result = evaluate_classifier(
        winner_classifier, winner_validation_features, validation_labels
    )
    thresholds = validation_result["thresholds"]
    threshold_target, operational_threshold = choose_operational_threshold(
        thresholds, validation_result["confidence_curve"]
    )
    threshold_report = validation_result["confidence_curve"].copy()
    threshold_report["selected_for_targets"] = ""
    for target, selected in thresholds.items():
        if selected is None:
            continue
        mask = np.isclose(
            threshold_report["threshold"].astype(float),
            float(selected["threshold"]),
        )
        threshold_report.loc[mask, "selected_for_targets"] = (
            threshold_report.loc[mask, "selected_for_targets"].map(
                lambda current: f"{current}|{target}".strip("|")
            )
        )
    threshold_report.to_csv(
        report_dir / "failure_classifier_marilia_v1_4_thresholds.csv",
        index=False,
        encoding="utf-8-sig",
    )

    display_label_map = build_display_label_map(dataset)
    common_metadata = {
        "taxonomy_version": TAXONOMY_VERSION,
        "architecture": winner_row["architecture"],
        "parameters": winner_row["parameters"],
        "text_fields": ["observation"],
        "prototype_source": (
            "TRAIN_only" if "reranked" in winner_row["architecture"] else None
        ),
        "split_preserved_from_v1_3": True,
        "split_rows": {
            "train": int(len(train)),
            "validation": int(len(validation)),
            "test": int(len(test)),
        },
        "library_versions": {
            "scikit_learn": sklearn.__version__,
            "joblib": joblib.__version__,
            "numpy": np.__version__,
            "pandas": pd.__version__,
        },
    }
    eval_artifact = {
        "model_version": f"{MODEL_VERSION}_eval",
        "dataset_version": DATASET_VERSION,
        "purpose": "evaluation_train_only",
        "text_fields": ["observation"],
        "vectorizer": winner_vectorizer,
        "classifier": winner_classifier,
        "classes": winner_classifier.classes_,
        "display_label_map": display_label_map,
        "confidence_type": "v1_4_top1_minus_top2_decision_margin",
        "automation_thresholds": thresholds,
        "high_confidence_threshold": operational_threshold["threshold"],
        "non_automatable_failure_modes": sorted(NON_AUTOMATABLE_FAILURE_MODES),
        "split_strategy": "preserved_v1_3_grouped_observation_norm_split",
        "random_seed": args.seed,
        "training_metadata": {
            **common_metadata,
            "artifact_role": "evaluation_train_only",
        },
        "metrics_summary": {"validation": validation_result["metrics"]},
    }
    joblib.dump(eval_artifact, eval_model_path)

    # TEST is opened exactly once, after taxonomy/model/reranker selection.
    test_features = winner_vectorizer.transform(test["observation"].astype(str))
    test_labels = test["classification_canonical"].astype(str).to_numpy()
    test_result = evaluate_classifier(winner_classifier, test_features, test_labels)
    test_result["classifier"] = winner_classifier
    test_thresholds = {
        target: (
            evaluate_threshold(
                test_labels,
                test_result["predictions"],
                test_result["margins"],
                float(selected["threshold"]),
            )
            if selected is not None
            else None
        )
        for target, selected in thresholds.items()
    }
    test_high_confidence = evaluate_threshold(
        test_labels,
        test_result["predictions"],
        test_result["margins"],
        float(operational_threshold["threshold"]),
    )
    _, errors, top_confusions, generic_confusions = write_test_reports(
        test, test_result, train, candidates, report_dir
    )

    # Refit the selected architecture on TRAIN + VALIDATION. TEST is not used.
    operational_train = pd.concat([train, validation], ignore_index=True)
    if winner_spec.name == "v1.3_baseline_remapped":
        v13_operational = joblib.load(v13_operational_path)
        operational_vectorizer = v13_operational["vectorizer"]
        operational_classifier = CanonicalRemapClassifier(
            v13_operational["classifier"], original_to_canonical
        )
    else:
        if winner_spec.vectorizer_config is None or winner_spec.c is None:
            raise RuntimeError("Winner has incomplete operational specification.")
        operational_vectorizer = build_vectorizer(winner_spec.vectorizer_config)
        operational_features = operational_vectorizer.fit_transform(
            operational_train["observation"].astype(str)
        )
        operational_base = train_flat_classifier(
            operational_features,
            operational_train["classification_canonical"],
            winner_spec.c,
            winner_spec.class_weight,
            args.seed,
        )
        if "reranked" in winner_spec.name:
            operational_centroids = build_centroids(
                operational_features,
                operational_train["classification_canonical"].astype(str).to_numpy(),
                np.asarray(operational_base.classes_).astype(str),
            )
            operational_classifier = PrototypeRerankerClassifier(
                operational_base,
                operational_centroids,
                alpha=float(winner_spec.alpha),
                top_k=3,
            )
        elif "hierarchical" in winner_spec.name:
            operational_family = LinearSVC(
                C=1.0,
                class_weight="balanced",
                max_iter=10000,
                random_state=args.seed,
            )
            operational_family.fit(
                operational_features,
                operational_train["technical_family"].astype(str),
            )
            operational_classifier = HierarchicalGateClassifier(
                operational_base, operational_family, class_to_family
            )
        else:
            operational_classifier = operational_base

    operational_artifact = {
        "model_version": MODEL_VERSION,
        "dataset_version": DATASET_VERSION,
        "purpose": "operational_candidate_train_plus_validation",
        "text_fields": ["observation"],
        "vectorizer": operational_vectorizer,
        "classifier": operational_classifier,
        "classes": operational_classifier.classes_,
        "display_label_map": display_label_map,
        "confidence_type": "v1_4_top1_minus_top2_decision_margin",
        "automation_thresholds": thresholds,
        "high_confidence_threshold": operational_threshold["threshold"],
        "non_automatable_failure_modes": sorted(NON_AUTOMATABLE_FAILURE_MODES),
        "split_strategy": "preserved_v1_3_grouped_observation_norm_split",
        "random_seed": args.seed,
        "training_metadata": {
            **common_metadata,
            "artifact_role": "operational_train_plus_validation",
            "training_rows": int(len(operational_train)),
            "operational_artifact_not_evaluated_on_test": True,
            "test_metrics_belong_to": str(eval_model_path),
        },
        "metrics_summary": {
            "validation_train_only_model": validation_result["metrics"],
            "test_train_only_model": test_result["metrics"],
            "high_confidence_test_train_only_model": test_high_confidence,
        },
    }
    joblib.dump(operational_artifact, model_path)
    artifact_validation = validate_artifact(model_path)

    v12_metrics = json.loads(
        Path("ml/models/failure_classifier_real_v1_2_metrics.json").read_text(
            encoding="utf-8-sig"
        )
    )
    v13_metrics = json.loads(
        Path("ml/reports/failure_classifier_marilia_v1_3_metrics.json").read_text(
            encoding="utf-8-sig"
        )
    )
    taxonomy_audit = json.loads(
        (report_dir / "failure_classifier_marilia_v1_4_dataset_audit.json").read_text(
            encoding="utf-8-sig"
        )
    )
    rarity = pd.read_csv(
        report_dir / "failure_classifier_marilia_v1_4_rarity_analysis.csv"
    )
    metrics = {
        "model_version": MODEL_VERSION,
        "dataset_version": DATASET_VERSION,
        "taxonomy": taxonomy_audit,
        "evaluation_integrity": {
            "split_preserved_from_v1_3": True,
            "winner_selected_on": "VALIDATION",
            "test_used_for_taxonomy_model_or_reranker_selection": False,
            "test_evaluations": 1,
            "zero_leakage": True,
            "prototypes_built_from": "TRAIN_only",
        },
        "winner": {
            key: value
            for key, value in winner_row.items()
            if key not in {"thresholds"}
        },
        "validation": validation_result["metrics"],
        "architectures_validation": {
            row["architecture"]: {
                "accuracy": row["validation_accuracy"],
                "macro_f1": row["validation_macro_f1"],
                "weighted_f1": row["validation_weighted_f1"],
                "top3_accuracy": row["validation_top3_accuracy"],
            }
            for row in selection_rows
        },
        "thresholds_selected_on_validation": thresholds,
        "operational_threshold_target": threshold_target,
        "operational_threshold_validation": operational_threshold,
        "test": test_result["metrics"],
        "thresholds_applied_to_test": test_thresholds,
        "high_confidence_test": test_high_confidence,
        "rarity_analysis": rarity.to_dict(orient="records"),
        "generic_specific_confusions": generic_confusions,
        "top_20_confusions": top_confusions.head(20).to_dict(orient="records"),
        "errors": int(len(errors)),
        "comparison": {
            "v1.2_published_different_split": v12_metrics["test"]["row_level"],
            "v1.3_same_split_original_taxonomy": v13_metrics["test"],
            "v1.4_same_split_canonical_taxonomy": test_result["metrics"],
        },
        "artifact": {
            "evaluation": str(eval_model_path),
            "operational": str(model_path),
            "size_bytes": int(model_path.stat().st_size),
            "validation": artifact_validation,
        },
        "target_accuracy_gt_90": bool(test_result["metrics"]["accuracy"] > 0.90),
    }
    (report_dir / "failure_classifier_marilia_v1_4_metrics.json").write_text(
        json.dumps(json_ready(metrics), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(json_ready(metrics), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
