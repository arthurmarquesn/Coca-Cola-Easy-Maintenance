from __future__ import annotations

import argparse
import hashlib
import json
import math
import warnings
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.exceptions import ConvergenceWarning
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
)
from sklearn.pipeline import FeatureUnion
from sklearn.svm import LinearSVC

from ml.scripts.prepare_marilia_dataset import (
    DATASET_VERSION,
    normalize_classification,
    normalize_observation,
)


MODEL_VERSION = "failure_classifier_marilia_v1_3_candidate"
RANDOM_SEED = 42
DEFAULT_DATASET = (
    "ml/data/human/marilia/prepared/marilia_human_v1.csv"
)
DEFAULT_MODEL_OUTPUT = (
    "ml/models/failure_classifier_marilia_v1_3_candidate.joblib"
)
DEFAULT_REPORT_DIR = "ml/reports"
TARGET_PRECISIONS = (0.90, 0.95, 0.97, 0.99)
MIN_VALIDATION_AUTOMATIONS = 30
NON_AUTOMATABLE_FAILURE_MODES = {"SEM MODO DE FALHA IDENTIFICADO"}
OPTIONAL_CONTEXT_FIELDS = (
    "equipment",
    "line",
    "stop_type",
    "stop_key_1",
    "stop_subkey",
)


@dataclass(frozen=True)
class VectorizerConfig:
    name: str
    word_ngram: tuple[int, int]
    char_ngram: tuple[int, int]
    min_df: int
    max_df: float
    sublinear_tf: bool
    word_max_features: int
    char_max_features: int


VECTORIZER_CONFIGS = (
    VectorizerConfig(
        "word_11_char_35",
        (1, 1),
        (3, 5),
        1,
        1.0,
        True,
        30000,
        50000,
    ),
    VectorizerConfig(
        "word_12_char_36",
        (1, 2),
        (3, 6),
        1,
        1.0,
        True,
        50000,
        75000,
    ),
    VectorizerConfig(
        "word_12_char_25_regularized",
        (1, 2),
        (2, 5),
        2,
        0.98,
        False,
        40000,
        60000,
    ),
)


def rounded(value: float, digits: int = 8) -> float:
    return round(float(value), digits)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def stable_hash(value: str, seed: int) -> int:
    digest = hashlib.sha256(f"{seed}|{value}".encode("utf-8")).hexdigest()
    return int(digest[:16], 16)


def load_dataset(path: Path) -> pd.DataFrame:
    dataset = pd.read_csv(path, dtype=str).fillna("")
    required = {
        "row_id",
        "observation",
        "observation_norm",
        "classification_original",
        "classification_norm",
    }
    missing = required - set(dataset.columns)
    if missing:
        raise ValueError(f"Dataset sem colunas obrigatorias: {sorted(missing)}")
    dataset["row_id"] = pd.to_numeric(
        dataset["row_id"], errors="raise"
    ).astype(int)
    recalculated_observation = dataset["observation"].map(
        normalize_observation
    )
    recalculated_classification = dataset["classification_original"].map(
        normalize_classification
    )
    if not recalculated_observation.equals(dataset["observation_norm"]):
        raise RuntimeError("observation_norm nao e deterministico/reproduzivel.")
    if not recalculated_classification.equals(dataset["classification_norm"]):
        raise RuntimeError("classification_norm nao e deterministico/reproduzivel.")
    if (dataset["observation_norm"] == "").any() or (
        dataset["classification_norm"] == ""
    ).any():
        raise RuntimeError("Dataset preparado contem observacao ou rotulo vazio.")
    conflicts = dataset.groupby("observation_norm")[
        "classification_norm"
    ].nunique()
    if (conflicts > 1).any():
        raise RuntimeError("Dataset preparado ainda contem conflitos humanos.")
    return dataset


def exclude_external_holdout(
    dataset: pd.DataFrame,
    external_path: Path | None,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    if external_path is None:
        return dataset.copy(), dataset.iloc[0:0].copy()
    if not external_path.exists():
        raise FileNotFoundError(f"Holdout externo nao encontrado: {external_path}")
    suffix = external_path.suffix.lower()
    external = (
        pd.read_excel(external_path, dtype=object)
        if suffix in {".xlsx", ".xls"}
        else pd.read_csv(external_path, dtype=object)
    )
    normalized_columns = {
        normalize_classification(column): column for column in external.columns
    }
    candidates = ("OBSERVACOES", "OBSERVACAO", "OCORRENCIA", "OCORRENCIAS")
    observation_column = next(
        (normalized_columns[name] for name in candidates if name in normalized_columns),
        None,
    )
    if observation_column is None:
        raise ValueError("Holdout externo nao possui coluna de observacao reconhecida.")
    external_norms = set(
        external[observation_column].map(normalize_observation)
    ) - {""}
    mask = dataset["observation_norm"].isin(external_norms)
    return dataset[~mask].copy(), dataset[mask].copy()


def create_group_split(dataset: pd.DataFrame, seed: int) -> pd.DataFrame:
    groups = (
        dataset.groupby("observation_norm", as_index=False)
        .agg(
            classification_norm=("classification_norm", "first"),
            rows=("row_id", "size"),
        )
    )
    groups["hash"] = groups["observation_norm"].map(
        lambda value: stable_hash(str(value), seed)
    )
    groups["split"] = "TRAIN"

    for classification, class_groups in groups.groupby(
        "classification_norm", sort=True
    ):
        ordered = class_groups.sort_values(
            ["hash", "observation_norm"]
        )
        count = len(ordered)
        if count == 1:
            continue
        if count == 2:
            holdout = (
                "VALIDATION"
                if stable_hash(f"holdout|{classification}", seed) % 2 == 0
                else "TEST"
            )
            groups.loc[ordered.index[:1], "split"] = holdout
            continue

        validation_count = max(1, round(count * 0.15))
        test_count = max(1, round(count * 0.15))
        while validation_count + test_count > count - 1:
            if validation_count >= test_count and validation_count > 1:
                validation_count -= 1
            elif test_count > 1:
                test_count -= 1
            else:
                break
        groups.loc[ordered.index[:test_count], "split"] = "TEST"
        groups.loc[
            ordered.index[test_count : test_count + validation_count], "split"
        ] = "VALIDATION"

    split_map = dict(zip(groups["observation_norm"], groups["split"]))
    result = dataset.copy()
    result["split"] = result["observation_norm"].map(split_map)
    return result


def verify_split(dataset: pd.DataFrame) -> dict[str, Any]:
    sets = {
        split: set(
            dataset.loc[dataset["split"] == split, "observation_norm"]
        )
        for split in ("TRAIN", "VALIDATION", "TEST")
    }
    leakage = {
        "train_validation": len(sets["TRAIN"] & sets["VALIDATION"]),
        "train_test": len(sets["TRAIN"] & sets["TEST"]),
        "validation_test": len(sets["VALIDATION"] & sets["TEST"]),
    }
    if any(leakage.values()):
        raise RuntimeError(f"Data leakage detectado: {leakage}")
    train_classes = set(
        dataset.loc[dataset["split"] == "TRAIN", "classification_norm"]
    )
    all_classes = set(dataset["classification_norm"])
    missing = sorted(all_classes - train_classes)
    if missing:
        raise RuntimeError(f"Classes ausentes no TRAIN: {missing}")
    split_rows = dataset["split"].value_counts().to_dict()
    if any(split_rows.get(split, 0) == 0 for split in sets):
        raise RuntimeError("TRAIN, VALIDATION ou TEST ficou vazio.")
    return {
        "leakage": leakage,
        "rows": {split.lower(): int(split_rows.get(split, 0)) for split in sets},
        "groups": {
            split.lower(): int(len(groups)) for split, groups in sets.items()
        },
        "classes_in_train": int(len(train_classes)),
    }


def build_display_label_map(dataset: pd.DataFrame) -> dict[str, str]:
    return {
        str(label): str(group["classification_original"].value_counts().index[0])
        for label, group in dataset.groupby("classification_norm")
    }


def build_vectorizer(config: VectorizerConfig) -> FeatureUnion:
    common = {
        "min_df": config.min_df,
        "max_df": config.max_df,
        "sublinear_tf": config.sublinear_tf,
        "strip_accents": "unicode",
        "lowercase": True,
        "dtype": np.float32,
    }
    return FeatureUnion(
        [
            (
                "word",
                TfidfVectorizer(
                    analyzer="word",
                    ngram_range=config.word_ngram,
                    max_features=config.word_max_features,
                    **common,
                ),
            ),
            (
                "char",
                TfidfVectorizer(
                    analyzer="char_wb",
                    ngram_range=config.char_ngram,
                    max_features=config.char_max_features,
                    **common,
                ),
            ),
        ]
    )


def build_classifier(
    algorithm: str,
    class_weight: str | None,
    seed: int,
) -> Any:
    if algorithm == "LinearSVC":
        return LinearSVC(
            C=1.5,
            class_weight=class_weight,
            max_iter=10000,
            random_state=seed,
        )
    if algorithm == "LogisticRegression":
        return LogisticRegression(
            C=4.0,
            class_weight=class_weight,
            solver="saga",
            max_iter=300,
            tol=1e-2,
            random_state=seed,
        )
    raise ValueError(f"Algoritmo desconhecido: {algorithm}")


def decision_scores(classifier: Any, features: Any) -> np.ndarray:
    scores = np.asarray(classifier.decision_function(features), dtype=float)
    if scores.ndim == 1:
        scores = np.column_stack([-scores, scores])
    return scores


def margins_from_scores(scores: np.ndarray) -> np.ndarray:
    ordered = np.sort(scores, axis=1)
    if ordered.shape[1] < 2:
        return np.full(ordered.shape[0], np.inf)
    return ordered[:, -1] - ordered[:, -2]


def top_k_from_scores(
    scores: np.ndarray,
    classes: np.ndarray,
    k: int = 3,
) -> list[list[str]]:
    limit = min(k, len(classes))
    indices = np.argsort(scores, axis=1)[:, -limit:][:, ::-1]
    return [[str(classes[index]) for index in row] for row in indices]


def calculate_metrics(
    true_labels: np.ndarray,
    predictions: np.ndarray,
    top3: list[list[str]],
) -> dict[str, float]:
    return {
        "accuracy": rounded(accuracy_score(true_labels, predictions)),
        "macro_f1": rounded(
            f1_score(true_labels, predictions, average="macro", zero_division=0)
        ),
        "weighted_f1": rounded(
            f1_score(
                true_labels, predictions, average="weighted", zero_division=0
            )
        ),
        "top3_accuracy": rounded(
            np.mean(
                [
                    true_label in candidates
                    for true_label, candidates in zip(true_labels, top3)
                ]
            )
        ),
    }


def blocked_prediction(label: str) -> bool:
    return normalize_classification(label) in NON_AUTOMATABLE_FAILURE_MODES


def build_confidence_curve(
    true_labels: np.ndarray,
    predictions: np.ndarray,
    margins: np.ndarray,
) -> pd.DataFrame:
    rows: list[dict[str, object]] = []
    eligible = np.array(
        [not blocked_prediction(str(label)) for label in predictions], dtype=bool
    )
    total = len(true_labels)
    for threshold in np.sort(np.unique(margins))[::-1]:
        mask = (margins >= threshold) & eligible
        automated = int(mask.sum())
        if automated < MIN_VALIDATION_AUTOMATIONS:
            continue
        correct = int((true_labels[mask] == predictions[mask]).sum())
        rows.append(
            {
                "threshold": rounded(threshold),
                "automated_rows": automated,
                "coverage": rounded(automated / total),
                "correct": correct,
                "precision": rounded(correct / automated),
                "blocked_by_guardrail": int((~eligible).sum()),
            }
        )
    return pd.DataFrame(rows)


def select_thresholds(curve: pd.DataFrame) -> dict[str, dict[str, Any] | None]:
    selected: dict[str, dict[str, Any] | None] = {}
    for target in TARGET_PRECISIONS:
        key = str(int(target * 100))
        candidates = curve[curve["precision"] >= target] if not curve.empty else curve
        if candidates.empty:
            selected[key] = None
            continue
        best = candidates.sort_values(
            ["automated_rows", "precision", "threshold"],
            ascending=[False, False, True],
        ).iloc[0]
        selected[key] = {
            "threshold": float(best["threshold"]),
            "selected": int(best["automated_rows"]),
            "total": int(round(best["automated_rows"] / best["coverage"])),
            "coverage": float(best["coverage"]),
            "precision": float(best["precision"]),
        }
    return selected


def evaluate_threshold(
    true_labels: np.ndarray,
    predictions: np.ndarray,
    margins: np.ndarray,
    threshold: float,
) -> dict[str, Any]:
    eligible = np.array(
        [not blocked_prediction(str(label)) for label in predictions], dtype=bool
    )
    mask = (margins >= threshold) & eligible
    automated = int(mask.sum())
    correct = int((true_labels[mask] == predictions[mask]).sum())
    total = len(true_labels)
    return {
        "threshold": rounded(threshold),
        "automated": automated,
        "review": total - automated,
        "total": total,
        "coverage": rounded(automated / total if total else 0.0),
        "correct": correct,
        "precision": rounded(correct / automated) if automated else None,
        "blocked_by_guardrail": int((~eligible).sum()),
    }


def candidate_metrics(
    classifier: Any,
    validation_features: Any,
    validation_labels: np.ndarray,
) -> tuple[dict[str, float], dict[str, dict[str, Any] | None]]:
    predictions = np.asarray(classifier.predict(validation_features)).astype(str)
    scores = decision_scores(classifier, validation_features)
    top3 = top_k_from_scores(scores, np.asarray(classifier.classes_).astype(str))
    metrics = calculate_metrics(validation_labels, predictions, top3)
    curve = build_confidence_curve(
        validation_labels, predictions, margins_from_scores(scores)
    )
    return metrics, select_thresholds(curve)


def selection_key(row: dict[str, Any]) -> tuple[float, ...]:
    threshold_95 = row["thresholds"].get("95")
    high_precision = float(threshold_95["precision"]) if threshold_95 else 0.0
    high_coverage = float(threshold_95["coverage"]) if threshold_95 else 0.0
    return (
        float(row["validation_macro_f1"]),
        float(row["validation_accuracy"]),
        float(row["validation_weighted_f1"]),
        high_precision,
        high_coverage,
    )


def search_candidates(
    train: pd.DataFrame,
    validation: pd.DataFrame,
    seed: int,
) -> tuple[dict[str, Any], pd.DataFrame]:
    train_text = train["observation"].astype(str).to_numpy()
    validation_text = validation["observation"].astype(str).to_numpy()
    train_labels = train["classification_norm"].astype(str).to_numpy()
    validation_labels = validation["classification_norm"].astype(str).to_numpy()
    search_rows: list[dict[str, Any]] = []

    # Stage 1 compares every required TF-IDF setting with both class weights.
    for config in VECTORIZER_CONFIGS:
        vectorizer = build_vectorizer(config)
        train_features = vectorizer.fit_transform(train_text)
        validation_features = vectorizer.transform(validation_text)
        for class_weight in (None, "balanced"):
            print(
                "Validacao: LinearSVC | "
                f"{config.name} | class_weight={class_weight}"
            )
            classifier = build_classifier("LinearSVC", class_weight, seed)
            classifier.fit(train_features, train_labels)
            metrics, thresholds = candidate_metrics(
                classifier, validation_features, validation_labels
            )
            search_rows.append(
                {
                    "feature_set": "observation_only",
                    "vectorizer_config": config.name,
                    "algorithm": "LinearSVC",
                    "class_weight": class_weight or "None",
                    "feature_count": int(train_features.shape[1]),
                    **{f"validation_{key}": value for key, value in metrics.items()},
                    "thresholds": thresholds,
                }
            )

    best_svc = max(search_rows, key=selection_key)
    best_config = next(
        config
        for config in VECTORIZER_CONFIGS
        if config.name == best_svc["vectorizer_config"]
    )

    # Stage 2 compares both algorithms fairly on the best validation-selected
    # representation, again with class_weight=None and balanced.
    vectorizer = build_vectorizer(best_config)
    train_features = vectorizer.fit_transform(train_text)
    validation_features = vectorizer.transform(validation_text)
    for algorithm in ("LogisticRegression",):
        for class_weight in (None, "balanced"):
            print(
                f"Validacao: {algorithm} | {best_config.name} | "
                f"class_weight={class_weight}"
            )
            classifier = build_classifier(algorithm, class_weight, seed)
            with warnings.catch_warnings(record=True) as caught:
                warnings.simplefilter("always", ConvergenceWarning)
                classifier.fit(train_features, train_labels)
            metrics, thresholds = candidate_metrics(
                classifier, validation_features, validation_labels
            )
            search_rows.append(
                {
                    "feature_set": "observation_only",
                    "vectorizer_config": best_config.name,
                    "algorithm": algorithm,
                    "class_weight": class_weight or "None",
                    "feature_count": int(train_features.shape[1]),
                    **{f"validation_{key}": value for key, value in metrics.items()},
                    "thresholds": thresholds,
                    "convergence_warnings": sum(
                        issubclass(item.category, ConvergenceWarning)
                        for item in caught
                    ),
                }
            )

    winner = max(search_rows, key=selection_key)
    report_rows = []
    for row in search_rows:
        flat = {key: value for key, value in row.items() if key != "thresholds"}
        for target, selected in row["thresholds"].items():
            flat[f"validation_hc_{target}_precision"] = (
                selected["precision"] if selected else None
            )
            flat[f"validation_hc_{target}_coverage"] = (
                selected["coverage"] if selected else None
            )
        flat["selected"] = row is winner
        report_rows.append(flat)
    return winner, pd.DataFrame(report_rows)


def choose_operational_threshold(
    thresholds: dict[str, dict[str, Any] | None],
    curve: pd.DataFrame,
) -> tuple[str, dict[str, Any]]:
    for target in ("97", "95"):
        if thresholds.get(target) is not None:
            return target, dict(thresholds[target] or {})
    if curve.empty:
        raise RuntimeError("Nao foi possivel construir curva de confianca.")
    best = curve.sort_values(
        ["precision", "automated_rows", "threshold"],
        ascending=[False, False, True],
    ).iloc[0]
    return "best_available", {
        "threshold": float(best["threshold"]),
        "selected": int(best["automated_rows"]),
        "total": int(round(best["automated_rows"] / best["coverage"])),
        "coverage": float(best["coverage"]),
        "precision": float(best["precision"]),
    }


def confusion_outputs(
    test: pd.DataFrame,
    predictions: np.ndarray,
    labels: np.ndarray,
    report_dir: Path,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    true_labels = test["classification_norm"].astype(str).to_numpy()
    report = classification_report(
        true_labels,
        predictions,
        labels=labels,
        output_dict=True,
        zero_division=0,
    )
    class_rows = []
    for label in labels:
        values = report[str(label)]
        class_rows.append(
            {
                "class": str(label),
                "precision": values["precision"],
                "recall": values["recall"],
                "f1": values["f1-score"],
                "support": int(values["support"]),
            }
        )
    class_report = pd.DataFrame(class_rows)
    matrix = confusion_matrix(true_labels, predictions, labels=labels)
    matrix_frame = pd.DataFrame(matrix, index=labels, columns=labels)
    matrix_frame.index.name = "expected"
    matrix_frame.to_csv(
        report_dir / "failure_classifier_marilia_v1_3_confusion_matrix.csv",
        encoding="utf-8-sig",
    )
    class_report.to_csv(
        report_dir / "failure_classifier_marilia_v1_3_classification_report.csv",
        index=False,
        encoding="utf-8-sig",
    )
    errors = pd.DataFrame({"expected": true_labels, "predicted": predictions})
    top_confusions = (
        errors[errors["expected"] != errors["predicted"]]
        .groupby(["expected", "predicted"])
        .size()
        .rename("count")
        .reset_index()
        .sort_values(["count", "expected", "predicted"], ascending=[False, True, True])
    )
    top_confusions.to_csv(
        report_dir / "failure_classifier_marilia_v1_3_top_confusions.csv",
        index=False,
        encoding="utf-8-sig",
    )
    return class_report, top_confusions


def json_ready(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): json_ready(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_ready(item) for item in value]
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        return float(value)
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    return value


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Seleciona o failure classifier Marilia v1.3 apenas na VALIDATION "
            "e abre o TEST uma unica vez apos a selecao."
        )
    )
    parser.add_argument("--dataset", default=DEFAULT_DATASET)
    parser.add_argument("--external-holdout")
    parser.add_argument("--model-output", default=DEFAULT_MODEL_OUTPUT)
    parser.add_argument("--report-dir", default=DEFAULT_REPORT_DIR)
    parser.add_argument("--seed", type=int, default=RANDOM_SEED)
    args = parser.parse_args()

    dataset_path = Path(args.dataset).resolve()
    model_path = Path(args.model_output).resolve()
    eval_model_path = model_path.with_name(f"{model_path.stem}_eval{model_path.suffix}")
    report_dir = Path(args.report_dir).resolve()
    external_path = (
        Path(args.external_holdout).resolve() if args.external_holdout else None
    )
    if not dataset_path.exists():
        raise FileNotFoundError(f"Dataset preparado nao encontrado: {dataset_path}")
    model_path.parent.mkdir(parents=True, exist_ok=True)
    report_dir.mkdir(parents=True, exist_ok=True)

    dataset = load_dataset(dataset_path)
    dataset, external_overlap = exclude_external_holdout(dataset, external_path)
    if external_path is not None:
        external_overlap.to_csv(
            report_dir / "failure_classifier_marilia_v1_3_external_overlap.csv",
            index=False,
            encoding="utf-8-sig",
        )
    split = create_group_split(dataset, args.seed)
    split_audit = verify_split(split)
    split.to_csv(
        report_dir / "failure_classifier_marilia_v1_3_split.csv",
        index=False,
        encoding="utf-8-sig",
    )

    train = split[split["split"] == "TRAIN"].copy()
    validation = split[split["split"] == "VALIDATION"].copy()
    test = split[split["split"] == "TEST"].copy()

    winner, selection_report = search_candidates(train, validation, args.seed)
    selection_report.to_csv(
        report_dir / "failure_classifier_marilia_v1_3_model_selection.csv",
        index=False,
        encoding="utf-8-sig",
    )
    winner_config = next(
        config
        for config in VECTORIZER_CONFIGS
        if config.name == winner["vectorizer_config"]
    )
    winner_class_weight = (
        None if winner["class_weight"] == "None" else winner["class_weight"]
    )

    # Refit the validation-selected evaluation model using TRAIN only.
    vectorizer = build_vectorizer(winner_config)
    train_features = vectorizer.fit_transform(train["observation"].astype(str))
    validation_features = vectorizer.transform(
        validation["observation"].astype(str)
    )
    classifier = build_classifier(
        winner["algorithm"], winner_class_weight, args.seed
    )
    classifier.fit(train_features, train["classification_norm"].astype(str))

    validation_labels = validation["classification_norm"].astype(str).to_numpy()
    validation_predictions = np.asarray(
        classifier.predict(validation_features)
    ).astype(str)
    validation_scores = decision_scores(classifier, validation_features)
    validation_margins = margins_from_scores(validation_scores)
    validation_top3 = top_k_from_scores(
        validation_scores, np.asarray(classifier.classes_).astype(str)
    )
    validation_metrics = calculate_metrics(
        validation_labels, validation_predictions, validation_top3
    )
    confidence_curve = build_confidence_curve(
        validation_labels, validation_predictions, validation_margins
    )
    thresholds = select_thresholds(confidence_curve)
    operational_target, operational_threshold = choose_operational_threshold(
        thresholds, confidence_curve
    )

    threshold_report = confidence_curve.copy()
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
        report_dir / "failure_classifier_marilia_v1_3_thresholds.csv",
        index=False,
        encoding="utf-8-sig",
    )

    display_label_map = build_display_label_map(dataset)
    training_metadata = {
        "artifact_role": "evaluation_train_only",
        "dataset_path": str(dataset_path),
        "dataset_sha256": sha256_file(dataset_path),
        "external_holdout": str(external_path) if external_path else None,
        "external_overlap_rows_removed": int(len(external_overlap)),
        "feature_set": "observation_only",
        "context_fields_available": [
            field for field in OPTIONAL_CONTEXT_FIELDS if field in dataset.columns
        ],
        "context_model_status": (
            "not_available_no_context_columns_in_source"
            if not any(field in dataset.columns for field in OPTIONAL_CONTEXT_FIELDS)
            else "available_but_not_selected"
        ),
        "algorithm": winner["algorithm"],
        "class_weight": winner["class_weight"],
        "vectorizer": asdict(winner_config),
        "feature_count": int(train_features.shape[1]),
        "split": split_audit,
        "library_versions": {
            "scikit_learn": sklearn.__version__,
            "joblib": joblib.__version__,
            "numpy": np.__version__,
            "pandas": pd.__version__,
        },
        "test_opened_after_model_selection": True,
    }
    eval_artifact = {
        "model_version": f"{MODEL_VERSION}_eval",
        "dataset_version": DATASET_VERSION,
        "purpose": "evaluation_train_only",
        "text_fields": ["observation"],
        "vectorizer": vectorizer,
        "classifier": classifier,
        "classes": classifier.classes_,
        "display_label_map": display_label_map,
        "confidence_type": "linear_svc_top1_minus_top2_margin",
        "automation_thresholds": thresholds,
        "high_confidence_threshold": operational_threshold["threshold"],
        "non_automatable_failure_modes": sorted(NON_AUTOMATABLE_FAILURE_MODES),
        "split_strategy": "deterministic_stratified_group_by_observation_norm_70_15_15_priority",
        "random_seed": args.seed,
        "training_metadata": training_metadata,
        "metrics_summary": {"validation": validation_metrics},
    }
    joblib.dump(eval_artifact, eval_model_path)

    # The TEST is transformed and evaluated only here, after all choices above.
    test_features = vectorizer.transform(test["observation"].astype(str))
    test_labels = test["classification_norm"].astype(str).to_numpy()
    test_predictions = np.asarray(classifier.predict(test_features)).astype(str)
    test_scores = decision_scores(classifier, test_features)
    test_margins = margins_from_scores(test_scores)
    test_top3 = top_k_from_scores(
        test_scores, np.asarray(classifier.classes_).astype(str)
    )
    test_metrics = calculate_metrics(test_labels, test_predictions, test_top3)
    test_thresholds = {
        target: (
            evaluate_threshold(
                test_labels,
                test_predictions,
                test_margins,
                float(selected["threshold"]),
            )
            if selected is not None
            else None
        )
        for target, selected in thresholds.items()
    }
    test_high_confidence = evaluate_threshold(
        test_labels,
        test_predictions,
        test_margins,
        float(operational_threshold["threshold"]),
    )

    _, top_confusions = confusion_outputs(
        test,
        test_predictions,
        np.asarray(classifier.classes_).astype(str),
        report_dir,
    )
    errors = test.copy()
    errors["context_text"] = errors["observation"]
    errors["expected"] = test_labels
    errors["predicted"] = test_predictions
    errors["top_3"] = [" | ".join(values) for values in test_top3]
    errors["decision_margin"] = test_margins
    errors = errors[errors["expected"] != errors["predicted"]]
    error_columns = [
        "row_id",
        "observation",
        "context_text",
        "expected",
        "predicted",
        "top_3",
        "decision_margin",
    ]
    error_columns.extend(
        field for field in OPTIONAL_CONTEXT_FIELDS if field in errors.columns
    )
    errors[error_columns].to_csv(
        report_dir / "failure_classifier_marilia_v1_3_errors.csv",
        index=False,
        encoding="utf-8-sig",
    )

    # Operational artifact: refit on TRAIN + VALIDATION. It is deliberately not
    # evaluated on TEST, so the reported holdout remains the TRAIN-only model.
    operational_train = pd.concat([train, validation], ignore_index=True)
    operational_vectorizer = build_vectorizer(winner_config)
    operational_features = operational_vectorizer.fit_transform(
        operational_train["observation"].astype(str)
    )
    operational_classifier = build_classifier(
        winner["algorithm"], winner_class_weight, args.seed
    )
    operational_classifier.fit(
        operational_features,
        operational_train["classification_norm"].astype(str),
    )
    operational_metadata = dict(training_metadata)
    operational_metadata.update(
        {
            "artifact_role": "operational_train_plus_validation",
            "training_rows": int(len(operational_train)),
            "test_metrics_belong_to": str(eval_model_path),
            "operational_artifact_not_evaluated_on_test": True,
        }
    )
    operational_artifact = {
        "model_version": MODEL_VERSION,
        "dataset_version": DATASET_VERSION,
        "purpose": "operational_candidate_train_plus_validation",
        "text_fields": ["observation"],
        "vectorizer": operational_vectorizer,
        "classifier": operational_classifier,
        "classes": operational_classifier.classes_,
        "display_label_map": display_label_map,
        "confidence_type": "linear_svc_top1_minus_top2_margin",
        "automation_thresholds": thresholds,
        "high_confidence_threshold": operational_threshold["threshold"],
        "non_automatable_failure_modes": sorted(NON_AUTOMATABLE_FAILURE_MODES),
        "split_strategy": "deterministic_stratified_group_by_observation_norm_70_15_15_priority",
        "random_seed": args.seed,
        "training_metadata": operational_metadata,
        "metrics_summary": {
            "validation_train_only_model": validation_metrics,
            "test_train_only_model": test_metrics,
            "high_confidence_test_train_only_model": test_high_confidence,
        },
    }
    joblib.dump(operational_artifact, model_path)

    # Load-back compatibility checks required by ml/api/app.py.
    loaded = joblib.load(model_path)
    required_keys = {
        "model_version",
        "dataset_version",
        "vectorizer",
        "classifier",
        "classes",
        "display_label_map",
        "confidence_type",
        "automation_thresholds",
    }
    missing_keys = required_keys - set(loaded)
    if missing_keys:
        raise RuntimeError(f"Artefato sem chaves obrigatorias: {missing_keys}")
    loaded_classifier = loaded["classifier"]
    for method in ("predict", "decision_function"):
        if not callable(getattr(loaded_classifier, method, None)):
            raise RuntimeError(f"Classificador sem {method}().")
    if not np.array_equal(
        np.asarray(loaded["classes"]).astype(str),
        np.asarray(loaded_classifier.classes_).astype(str),
    ):
        raise RuntimeError("classes do artefato divergem de classifier.classes_.")
    smoke_features = loaded["vectorizer"].transform(["teste de manutencao"])
    loaded_classifier.predict(smoke_features)
    loaded_classifier.decision_function(smoke_features)

    metrics = {
        "model_version": MODEL_VERSION,
        "dataset_version": DATASET_VERSION,
        "evaluation_integrity": {
            "winner_selected_on": "VALIDATION",
            "test_used_for_selection_or_tuning": False,
            "test_evaluations": 1,
            "zero_group_leakage": not any(split_audit["leakage"].values()),
            "external_holdout_used_for_training": False,
        },
        "dataset": {
            "rows": int(len(dataset)),
            "unique_observations": int(dataset["observation_norm"].nunique()),
            "classes": int(dataset["classification_norm"].nunique()),
            "external_overlap_rows_removed_at_training": int(len(external_overlap)),
            **split_audit,
        },
        "feature_comparison": {
            "model_a": "observation_only",
            "model_b": "not_available_no_context_columns_in_source",
            "context_fields_found": [
                field for field in OPTIONAL_CONTEXT_FIELDS if field in dataset.columns
            ],
        },
        "winner": {
            key: value
            for key, value in winner.items()
            if key != "thresholds"
        },
        "winner_parameters": {
            "vectorizer": asdict(winner_config),
            "classifier": {
                "algorithm": winner["algorithm"],
                "C": 1.5 if winner["algorithm"] == "LinearSVC" else 4.0,
                "class_weight": winner["class_weight"],
                "random_state": args.seed,
            },
        },
        "validation": validation_metrics,
        "thresholds_selected_on_validation": thresholds,
        "operational_threshold_target": operational_target,
        "operational_threshold_validation": operational_threshold,
        "test": test_metrics,
        "thresholds_applied_to_test": test_thresholds,
        "high_confidence_test": test_high_confidence,
        "top_10_confusions": top_confusions.head(10).to_dict(orient="records"),
        "errors": {
            "count": int(len(errors)),
            "classes_responsible": (
                errors["expected"].value_counts().head(20).to_dict()
            ),
        },
        "artifacts": {
            "evaluation": str(eval_model_path),
            "operational_candidate": str(model_path),
            "operational_candidate_size_bytes": int(model_path.stat().st_size),
            "joblib_load_verified": True,
            "app_contract_verified": True,
        },
        "target_accuracy_gt_90": bool(test_metrics["accuracy"] > 0.90),
    }
    metrics_path = report_dir / "failure_classifier_marilia_v1_3_metrics.json"
    metrics_path.write_text(
        json.dumps(json_ready(metrics), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(json_ready(metrics), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
