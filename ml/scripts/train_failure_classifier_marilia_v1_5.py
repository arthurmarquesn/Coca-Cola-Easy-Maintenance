from __future__ import annotations

import argparse
import json
import math
from dataclasses import asdict
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Sequence

import joblib
import numpy as np
import pandas as pd
import sklearn
from scipy import sparse
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
from sklearn.preprocessing import normalize
from sklearn.svm import LinearSVC

from ml.classifier_wrappers import (
    CanonicalRemapClassifier,
    LearnedCandidateRerankerClassifier,
    SoftHierarchicalClassifier,
    TextFeatureBatch,
    TextPreservingVectorizer,
    TopKFamilyGateClassifier,
)
from ml.scripts.build_marilia_taxonomy_v2 import TAXONOMY_VERSION, content_tokens
from ml.scripts.train_failure_classifier_marilia_v1_3 import (
    NON_AUTOMATABLE_FAILURE_MODES,
    build_confidence_curve,
    build_vectorizer,
    choose_operational_threshold,
    evaluate_threshold,
    json_ready,
    margins_from_scores,
    select_thresholds,
    stable_hash,
    top_k_from_scores,
)
from ml.scripts.train_failure_classifier_marilia_v1_4 import (
    COMPACT_CONFIG,
    build_display_label_map,
    rarity_bucket,
    relation_lookup,
)


MODEL_VERSION = "failure_classifier_marilia_v1_5_candidate"
DATASET_VERSION = "marilia-human-v1-canonical-taxonomy-v2"
RANDOM_SEED = 42
DEFAULT_DATASET = "ml/data/human/marilia/prepared/marilia_human_v2_canonical.csv"
DEFAULT_TAXONOMY = "ml/data/human/marilia/taxonomy/canonical_taxonomy_v2.csv"
DEFAULT_V14_CONFUSIONS = "ml/reports/failure_classifier_marilia_v1_4_top_confusions.csv"
DEFAULT_V14_CANDIDATES = "ml/reports/failure_classifier_marilia_v1_4_taxonomy_candidates.csv"
DEFAULT_V13_EVAL = "ml/models/failure_classifier_marilia_v1_3_candidate_eval.joblib"
DEFAULT_V14_EVAL = "ml/models/failure_classifier_marilia_v1_4_candidate_eval.joblib"
DEFAULT_MODEL_OUTPUT = "ml/models/failure_classifier_marilia_v1_5_candidate.joblib"
DEFAULT_REPORT_DIR = "ml/reports"
EXPECTED_SPLIT_ROWS = {"TRAIN": 3072, "VALIDATION": 685, "TEST": 698}
RANKER_FEATURES = LearnedCandidateRerankerClassifier.feature_names
PROTOTYPE_FEATURE_INDICES = tuple(range(6))
LABEL_FEATURE_INDICES = tuple(list(range(6)) + list(range(8, 14)))
FULL_FEATURE_INDICES = tuple(range(len(RANKER_FEATURES)))


def decision_scores(classifier: Any, features: Any) -> np.ndarray:
    scores = np.asarray(classifier.decision_function(features), dtype=float)
    if scores.ndim == 1:
        scores = np.column_stack([-scores, scores])
    return scores


def load_inputs(dataset_path: Path, taxonomy_path: Path) -> tuple[pd.DataFrame, pd.DataFrame]:
    dataset = pd.read_csv(dataset_path, dtype=str).fillna("")
    taxonomy = pd.read_csv(taxonomy_path, dtype=str).fillna("")
    required = {
        "row_id", "observation", "observation_norm", "classification_original_norm",
        "classification_canonical", "technical_family", "split",
    }
    missing = required - set(dataset.columns)
    if missing:
        raise RuntimeError(f"Canonical dataset missing columns: {sorted(missing)}")
    counts = dataset["split"].value_counts().to_dict()
    if counts != EXPECTED_SPLIT_ROWS:
        raise RuntimeError(f"Split changed: expected={EXPECTED_SPLIT_ROWS}; actual={counts}")
    if dataset["row_id"].duplicated().any():
        raise RuntimeError("row_id is not unique.")
    split_per_group = dataset.groupby("observation_norm")["split"].nunique()
    if (split_per_group != 1).any():
        raise RuntimeError("Leakage: observation_norm crosses splits.")
    train_classes = set(dataset.loc[dataset["split"] == "TRAIN", "classification_canonical"])
    missing_train = sorted(set(dataset["classification_canonical"]) - train_classes)
    if missing_train:
        raise RuntimeError(f"Classes missing from TRAIN: {missing_train}")
    return dataset, taxonomy


def train_svc(features: Any, labels: Sequence[str], seed: int) -> LinearSVC:
    model = LinearSVC(C=1.5, class_weight="balanced", max_iter=10000, random_state=seed)
    model.fit(features, np.asarray(labels).astype(str))
    return model


def train_family(features: Any, labels: Sequence[str], seed: int) -> LinearSVC:
    model = LinearSVC(C=1.0, class_weight="balanced", max_iter=10000, random_state=seed)
    model.fit(features, np.asarray(labels).astype(str))
    return model


def build_class_to_family(taxonomy: pd.DataFrame) -> dict[str, str]:
    return {
        str(row.suggested_canonical_label): str(row.technical_family)
        for row in taxonomy.itertuples(index=False)
    }


def calculate_metrics(
    true_labels: np.ndarray,
    predictions: np.ndarray,
    top3: list[list[str]],
    top5: list[list[str]],
) -> dict[str, float]:
    return {
        "accuracy": round(float(accuracy_score(true_labels, predictions)), 8),
        "macro_f1": round(float(f1_score(true_labels, predictions, average="macro", zero_division=0)), 8),
        "weighted_f1": round(float(f1_score(true_labels, predictions, average="weighted", zero_division=0)), 8),
        "top3_accuracy": round(float(np.mean([label in values for label, values in zip(true_labels, top3)])), 8),
        "top5_accuracy": round(float(np.mean([label in values for label, values in zip(true_labels, top5)])), 8),
    }


def review_assistance(
    true_labels: np.ndarray,
    predictions: np.ndarray,
    top3: list[list[str]],
    top5: list[list[str]],
    margins: np.ndarray,
    threshold: float,
) -> dict[str, Any]:
    eligible = np.asarray([label not in NON_AUTOMATABLE_FAILURE_MODES for label in predictions])
    automated = (margins >= threshold) & eligible
    review = ~automated
    review_rows = int(review.sum())
    return {
        "automated_rows": int(automated.sum()),
        "auto_precision": (
            round(float(np.mean(true_labels[automated] == predictions[automated])), 8)
            if automated.any() else None
        ),
        "auto_coverage": round(float(automated.mean()), 8),
        "review_rows": review_rows,
        "review_top3_accuracy": (
            round(float(np.mean([label in candidates for label, candidates in zip(true_labels[review], np.asarray(top3, dtype=object)[review])])), 8)
            if review_rows else None
        ),
        "review_top5_accuracy": (
            round(float(np.mean([label in candidates for label, candidates in zip(true_labels[review], np.asarray(top5, dtype=object)[review])])), 8)
            if review_rows else None
        ),
        "guardrail_blocked_rows": int((~eligible).sum()),
    }


def evaluate_model(classifier: Any, features: Any, true_labels: np.ndarray) -> dict[str, Any]:
    scores = decision_scores(classifier, features)
    classes = np.asarray(classifier.classes_).astype(str)
    predictions = classes[np.argmax(scores, axis=1)]
    top3 = top_k_from_scores(scores, classes, 3)
    top5 = top_k_from_scores(scores, classes, 5)
    margins = margins_from_scores(scores)
    curve = build_confidence_curve(true_labels, predictions, margins)
    thresholds = select_thresholds(curve)
    selected_97 = thresholds.get("97")
    review = (
        review_assistance(true_labels, predictions, top3, top5, margins, float(selected_97["threshold"]))
        if selected_97 else {
            "automated_rows": 0, "auto_precision": None, "auto_coverage": 0.0,
            "review_rows": int(len(true_labels)),
            "review_top3_accuracy": round(float(np.mean([label in values for label, values in zip(true_labels, top3)])), 8),
            "review_top5_accuracy": round(float(np.mean([label in values for label, values in zip(true_labels, top5)])), 8),
            "guardrail_blocked_rows": int(np.isin(predictions, list(NON_AUTOMATABLE_FAILURE_MODES)).sum()),
        }
    )
    return {
        "metrics": calculate_metrics(true_labels, predictions, top3, top5),
        "predictions": predictions,
        "scores": scores,
        "margins": margins,
        "top3": top3,
        "top5": top5,
        "confidence_curve": curve,
        "thresholds": thresholds,
        "review_97": review,
    }


def make_selection_row(
    name: str,
    result: dict[str, Any],
    parameters: dict[str, Any],
    complexity_rank: int,
) -> dict[str, Any]:
    selected = result["thresholds"].get("97")
    return {
        "architecture": name,
        **{f"validation_{key}": value for key, value in result["metrics"].items()},
        "validation_hc_97_precision": selected["precision"] if selected else None,
        "validation_hc_97_coverage": selected["coverage"] if selected else 0.0,
        "validation_hc_97_rows": selected["selected"] if selected else 0,
        "validation_review_rows": result["review_97"]["review_rows"],
        "validation_review_top3_accuracy": result["review_97"]["review_top3_accuracy"],
        "validation_review_top5_accuracy": result["review_97"]["review_top5_accuracy"],
        "complexity_rank": complexity_rank,
        "parameters": parameters,
        "thresholds": result["thresholds"],
    }


def selection_key(row: dict[str, Any]) -> tuple[float, ...]:
    precision = float(row["validation_hc_97_precision"] or 0.0)
    qualifying_coverage = float(row["validation_hc_97_coverage"]) if precision >= 0.97 else 0.0
    return (
        float(row["validation_macro_f1"]),
        float(row["validation_accuracy"]),
        float(row["validation_top3_accuracy"]),
        qualifying_coverage,
        float(row["validation_review_top3_accuracy"] or 0.0),
        -float(row["complexity_rank"]),
    )


def build_prototypes(
    features: Any,
    labels: np.ndarray,
    classes: np.ndarray,
    texts: Sequence[str],
    vectorizer: Any,
    include_summary: bool,
) -> tuple[sparse.csr_matrix, sparse.csr_matrix, np.ndarray, sparse.csr_matrix, list[dict[str, Any]]]:
    normalized_features = normalize(features, norm="l2", axis=1, copy=True)
    centroid_rows = []
    for label in classes:
        centroid_rows.append(sparse.csr_matrix(normalized_features[labels == label].mean(axis=0)))
    centroids = normalize(sparse.vstack(centroid_rows, format="csr"), norm="l2", axis=1)
    all_similarities = np.asarray((normalized_features @ centroids.T).toarray(), dtype=float)
    exemplar_indices: list[int] = []
    exemplar_labels: list[str] = []
    summary: list[dict[str, Any]] = []
    feature_names = vectorizer.get_feature_names_out() if include_summary else None
    for class_index, label in enumerate(classes):
        indices = np.flatnonzero(labels == label)
        own = all_similarities[indices, class_index]
        central_order = indices[np.argsort(own)[::-1][:5]]
        if len(classes) > 1:
            other = all_similarities[indices].copy()
            other[:, class_index] = -np.inf
            discriminative = own - np.max(other, axis=1)
        else:
            discriminative = own
        discriminative_order = indices[np.argsort(discriminative)[::-1][:5]]
        chosen: list[int] = []
        for value in np.concatenate([central_order, discriminative_order]):
            if int(value) not in chosen:
                chosen.append(int(value))
        exemplar_indices.extend(chosen)
        exemplar_labels.extend([str(label)] * len(chosen))
        if include_summary:
            dense = centroids[class_index].toarray().ravel()
            top_indices = np.argsort(dense)[::-1][:10]
            top_terms = [str(feature_names[index]) for index in top_indices if dense[index] > 0]
            summary.append({
                "class": str(label),
                "support": int(len(indices)),
                "top_terms": top_terms,
                "central_examples": [str(texts[index]) for index in central_order],
                "discriminative_examples": [str(texts[index]) for index in discriminative_order],
            })
    exemplars = normalized_features[exemplar_indices].tocsr()
    label_features = normalize(vectorizer.transform(classes), norm="l2", axis=1)
    return centroids, exemplars, np.asarray(exemplar_labels), label_features, summary


def build_reranker(
    ranker: Any,
    candidate_n: int,
    feature_indices: Sequence[int],
    base_classifier: Any,
    family_classifier: Any,
    class_to_family: dict[str, str],
    prototypes: tuple[Any, Any, np.ndarray, Any, list[dict[str, Any]]],
    support: pd.Series,
) -> LearnedCandidateRerankerClassifier:
    centroids, exemplars, exemplar_labels, label_features, _ = prototypes
    return LearnedCandidateRerankerClassifier(
        base_classifier, family_classifier, class_to_family,
        centroids, label_features, exemplars, exemplar_labels,
        {str(key): int(value) for key, value in support.items()},
        ranker, candidate_n, feature_indices,
    )


def build_oof_ranker_data(
    train: pd.DataFrame,
    class_to_family: dict[str, str],
    seed: int,
    folds: int = 5,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, dict[str, Any]]:
    fold_ids = train["observation_norm"].map(lambda value: stable_hash(str(value), seed) % folds).to_numpy()
    feature_parts: list[np.ndarray] = []
    target_parts: list[np.ndarray] = []
    rank_parts: list[np.ndarray] = []
    evaluated_rows = 0
    positives = 0
    for fold in range(folds):
        fit = train.iloc[np.flatnonzero(fold_ids != fold)].copy()
        holdout = train.iloc[np.flatnonzero(fold_ids == fold)].copy()
        vectorizer = build_vectorizer(COMPACT_CONFIG)
        fit_features = vectorizer.fit_transform(fit["observation"].astype(str))
        holdout_features = vectorizer.transform(holdout["observation"].astype(str))
        base = train_svc(fit_features, fit["classification_canonical"], seed + fold)
        family = train_family(fit_features, fit["technical_family"], seed + fold)
        classes = np.asarray(base.classes_).astype(str)
        labels = fit["classification_canonical"].astype(str).to_numpy()
        prototypes = build_prototypes(
            fit_features, labels, classes, fit["observation"].astype(str).tolist(),
            vectorizer, include_summary=False,
        )
        scorer = build_reranker(
            LogisticRegression(), 10, FULL_FEATURE_INDICES, base, family,
            class_to_family, prototypes, fit["classification_canonical"].value_counts(),
        )
        flat_scores = decision_scores(base, holdout_features)
        limit = min(10, len(classes))
        candidate_indices = np.argsort(flat_scores, axis=1)[:, -limit:][:, ::-1]
        numeric = scorer._candidate_features(
            holdout_features,
            tuple(holdout["observation"].astype(str)),
            flat_scores,
            candidate_indices,
        )
        candidate_labels = classes[candidate_indices].reshape(-1)
        expected = np.repeat(holdout["classification_canonical"].astype(str).to_numpy(), limit)
        targets = (candidate_labels == expected).astype(int)
        ranks = np.tile(np.arange(limit), len(holdout))
        feature_parts.append(numeric)
        target_parts.append(targets)
        rank_parts.append(ranks)
        evaluated_rows += len(holdout)
        positives += int(targets.sum())
    features = np.vstack(feature_parts)
    targets = np.concatenate(target_parts)
    ranks = np.concatenate(rank_parts)
    audit = {
        "folds": folds,
        "train_rows": int(len(train)),
        "evaluated_oof_rows": int(evaluated_rows),
        "candidate_rows": int(len(targets)),
        "positive_candidate_rows": int(positives),
        "grouping": "deterministic_hash_by_observation_norm",
        "self_row_excluded": True,
        "validation_or_test_used": False,
    }
    return features, targets, ranks, audit


def train_ranker(
    oof_features: np.ndarray,
    oof_targets: np.ndarray,
    oof_ranks: np.ndarray,
    candidate_n: int,
    c: float,
    feature_indices: Sequence[int],
    seed: int,
) -> LogisticRegression:
    mask = oof_ranks < candidate_n
    model = LogisticRegression(
        C=c, class_weight="balanced", solver="liblinear", max_iter=2000,
        random_state=seed,
    )
    model.fit(oof_features[mask][:, feature_indices], oof_targets[mask])
    return model


def flatten_selection(rows: list[dict[str, Any]], winner: dict[str, Any]) -> pd.DataFrame:
    output = []
    for row in rows:
        flat = {key: value for key, value in row.items() if key not in {"parameters", "thresholds"}}
        flat["parameters"] = json.dumps(row["parameters"], ensure_ascii=False)
        for target in ("90", "95", "97", "99"):
            selected = row["thresholds"].get(target)
            flat[f"hc_{target}_threshold"] = selected["threshold"] if selected else None
            flat[f"hc_{target}_precision"] = selected["precision"] if selected else None
            flat[f"hc_{target}_coverage"] = selected["coverage"] if selected else None
        flat["selected"] = row is winner
        output.append(flat)
    return pd.DataFrame(output)


def build_rarity_analysis(true_labels: np.ndarray, predictions: np.ndarray, support: pd.Series) -> pd.DataFrame:
    frame = pd.DataFrame({"expected": true_labels, "predicted": predictions})
    frame["train_support"] = frame["expected"].map(support).fillna(0).astype(int)
    frame["segment"] = frame["train_support"].map(rarity_bucket)
    rows = []
    for segment in ("1", "2-3", "4-5", "6-10", "11-20", ">20"):
        group = frame[frame["segment"] == segment]
        if group.empty:
            continue
        rows.append({
            "segment": segment, "rows": int(len(group)), "classes": int(group["expected"].nunique()),
            "accuracy": float(accuracy_score(group["expected"], group["predicted"])),
            "macro_f1": float(f1_score(group["expected"], group["predicted"], average="macro", zero_division=0)),
        })
    return pd.DataFrame(rows)


def build_family_analysis(
    true_labels: np.ndarray,
    predictions: np.ndarray,
    class_to_family: dict[str, str],
) -> pd.DataFrame:
    frame = pd.DataFrame({"expected": true_labels, "predicted": predictions})
    frame["family"] = frame["expected"].map(class_to_family).fillna("OTHER_UNKNOWN")
    rows = []
    for family, group in frame.groupby("family", sort=True):
        rows.append({
            "family": family, "support": int(len(group)), "classes": int(group["expected"].nunique()),
            "accuracy": float(accuracy_score(group["expected"], group["predicted"])),
            "macro_f1": float(f1_score(group["expected"], group["predicted"], average="macro", zero_division=0)),
        })
    return pd.DataFrame(rows).sort_values(["support", "family"], ascending=[False, True])


def write_test_reports(
    test: pd.DataFrame,
    result: dict[str, Any],
    classes: np.ndarray,
    train_support: pd.Series,
    class_to_family: dict[str, str],
    report_dir: Path,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    expected = test["classification_canonical"].astype(str).to_numpy()
    predicted = result["predictions"]
    report = classification_report(expected, predicted, labels=classes, output_dict=True, zero_division=0)
    class_report = pd.DataFrame([{
        "class": label,
        "precision": report[label]["precision"], "recall": report[label]["recall"],
        "f1": report[label]["f1-score"], "support": int(report[label]["support"]),
        "train_support": int(train_support.get(label, 0)),
    } for label in classes])
    class_report.to_csv(report_dir / "failure_classifier_marilia_v1_5_classification_report.csv", index=False, encoding="utf-8-sig")
    matrix = confusion_matrix(expected, predicted, labels=classes)
    matrix_frame = pd.DataFrame(matrix, index=classes, columns=classes)
    matrix_frame.index.name = "expected"
    matrix_frame.to_csv(report_dir / "failure_classifier_marilia_v1_5_confusion_matrix.csv", encoding="utf-8-sig")
    error_rows = []
    for position, source in enumerate(test.itertuples(index=False)):
        if expected[position] == predicted[position]:
            continue
        error_rows.append({
            "row_id": source.row_id, "observation": source.observation,
            "expected": expected[position], "predicted": predicted[position],
            "top3": " | ".join(result["top3"][position]),
            "top5": " | ".join(result["top5"][position]),
            "decision_margin": float(result["margins"][position]),
            "expected_train_support": int(train_support.get(expected[position], 0)),
            "predicted_train_support": int(train_support.get(predicted[position], 0)),
            "expected_family": class_to_family.get(expected[position], "OTHER_UNKNOWN"),
            "predicted_family": class_to_family.get(predicted[position], "OTHER_UNKNOWN"),
            "rarity_bucket": rarity_bucket(int(train_support.get(expected[position], 0))),
        })
    errors = pd.DataFrame(error_rows)
    errors.to_csv(report_dir / "failure_classifier_marilia_v1_5_errors.csv", index=False, encoding="utf-8-sig")
    top_confusions = (
        errors.groupby(["expected", "predicted"]).size().rename("count").reset_index()
        .sort_values(["count", "expected", "predicted"], ascending=[False, True, True])
    )
    top_confusions["expected_support"] = top_confusions["expected"].map(train_support).fillna(0).astype(int)
    top_confusions["predicted_support"] = top_confusions["predicted"].map(train_support).fillna(0).astype(int)
    top_confusions["family_expected"] = top_confusions["expected"].map(class_to_family).fillna("OTHER_UNKNOWN")
    top_confusions["family_predicted"] = top_confusions["predicted"].map(class_to_family).fillna("OTHER_UNKNOWN")
    top_confusions.to_csv(report_dir / "failure_classifier_marilia_v1_5_top_confusions.csv", index=False, encoding="utf-8-sig")
    rarity = build_rarity_analysis(expected, predicted, train_support)
    rarity.to_csv(report_dir / "failure_classifier_marilia_v1_5_rarity_analysis.csv", index=False, encoding="utf-8-sig")
    family = build_family_analysis(expected, predicted, class_to_family)
    family.to_csv(report_dir / "failure_classifier_marilia_v1_5_family_analysis.csv", index=False, encoding="utf-8-sig")
    return errors, top_confusions, rarity, family


def build_taxonomy_priority_review(
    v14_confusions: pd.DataFrame,
    v14_candidates: pd.DataFrame,
    train_support: pd.Series,
    class_to_family: dict[str, str],
    centroids: Any,
    classes: np.ndarray,
) -> pd.DataFrame:
    class_index = {label: index for index, label in enumerate(classes)}
    relations = relation_lookup(v14_candidates)
    rows = []
    for row in v14_confusions.itertuples(index=False):
        expected, predicted = str(row.expected), str(row.predicted)
        lexical = SequenceMatcher(None, expected, predicted).ratio()
        left, right = set(content_tokens(expected)), set(content_tokens(predicted))
        token_similarity = len(left & right) / len(left | right) if left | right else 0.0
        if expected in class_index and predicted in class_index:
            prototype_similarity = float(
                centroids[class_index[expected]]
                .multiply(centroids[class_index[predicted]])
                .sum()
            )
        else:
            prototype_similarity = 0.0
        similarity = max(lexical, token_similarity, prototype_similarity)
        relation = relations.get((expected, predicted), "NO_RECORDED_RELATION")
        family_expected = class_to_family.get(expected, "OTHER_UNKNOWN")
        family_predicted = class_to_family.get(predicted, "OTHER_UNKNOWN")
        if relation == "GENERIC_SPECIFIC":
            action = "REVIEW_GENERIC_SPECIFIC"
        elif set(content_tokens(expected)) == set(content_tokens(predicted)) and similarity >= 0.95:
            action = "SAFE_MERGE_CANDIDATE"
        elif family_expected != family_predicted:
            action = "REVIEW_FAMILY"
        elif similarity >= 0.55:
            action = "KEEP_SEPARATE"
        else:
            action = "INSUFFICIENT_EVIDENCE"
        rows.append({
            "expected": expected, "predicted": predicted,
            "confusion_count": int(row.count),
            "expected_support": int(train_support.get(expected, 0)),
            "predicted_support": int(train_support.get(predicted, 0)),
            "family_expected": family_expected, "family_predicted": family_predicted,
            "relation_type": relation, "similarity_score": round(float(similarity), 6),
            "recommended_action": action, "requires_human_review": True,
            "reason": (
                f"v1.4 TEST confusion; lexical={lexical:.4f}; token={token_similarity:.4f}; "
                f"TRAIN prototype cosine={prototype_similarity:.4f}; no automatic merge applied."
            ),
        })
    return pd.DataFrame(rows).sort_values(
        ["confusion_count", "similarity_score", "expected", "predicted"],
        ascending=[False, False, True, True],
    )


def validate_artifact(path: Path) -> dict[str, Any]:
    package = joblib.load(path)
    classifier = package["classifier"]
    features = package["vectorizer"].transform(["falha no sensor da esteira"])
    prediction = classifier.predict(features)
    scores = classifier.decision_function(features)
    if not np.array_equal(np.asarray(package["classes"]).astype(str), np.asarray(classifier.classes_).astype(str)):
        raise RuntimeError("Artifact classes differ from classifier.classes_.")
    return {
        "loaded": True, "prediction": str(prediction[0]),
        "decision_shape": list(np.asarray(scores).shape), "classes": int(len(classifier.classes_)),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Train/evaluate Marilia failure classifier v1.5.")
    parser.add_argument("--dataset", default=DEFAULT_DATASET)
    parser.add_argument("--taxonomy", default=DEFAULT_TAXONOMY)
    parser.add_argument("--v1-4-confusions", default=DEFAULT_V14_CONFUSIONS)
    parser.add_argument("--v1-4-candidates", default=DEFAULT_V14_CANDIDATES)
    parser.add_argument("--v1-3-eval", default=DEFAULT_V13_EVAL)
    parser.add_argument("--v1-4-eval", default=DEFAULT_V14_EVAL)
    parser.add_argument("--model-output", default=DEFAULT_MODEL_OUTPUT)
    parser.add_argument("--report-dir", default=DEFAULT_REPORT_DIR)
    parser.add_argument("--seed", type=int, default=RANDOM_SEED)
    parser.add_argument("--validation-only", action="store_true")
    args = parser.parse_args()

    dataset_path = Path(args.dataset).resolve()
    taxonomy_path = Path(args.taxonomy).resolve()
    report_dir = Path(args.report_dir).resolve()
    model_path = Path(args.model_output).resolve()
    eval_path = model_path.with_name(f"{model_path.stem}_eval{model_path.suffix}")
    report_dir.mkdir(parents=True, exist_ok=True)
    model_path.parent.mkdir(parents=True, exist_ok=True)
    dataset, taxonomy = load_inputs(dataset_path, taxonomy_path)
    train = dataset[dataset["split"] == "TRAIN"].copy()
    validation = dataset[dataset["split"] == "VALIDATION"].copy()
    test = dataset[dataset["split"] == "TEST"].copy()
    class_to_family = build_class_to_family(taxonomy)
    train_labels = train["classification_canonical"].astype(str).to_numpy()
    validation_labels = validation["classification_canonical"].astype(str).to_numpy()

    vectorizer = build_vectorizer(COMPACT_CONFIG)
    train_features = vectorizer.fit_transform(train["observation"].astype(str))
    validation_features = vectorizer.transform(validation["observation"].astype(str))
    base = train_svc(train_features, train_labels, args.seed)
    family_classifier = train_family(train_features, train["technical_family"], args.seed)
    classes = np.asarray(base.classes_).astype(str)
    prototypes = build_prototypes(
        train_features, train_labels, classes, train["observation"].astype(str).tolist(),
        vectorizer, include_summary=True,
    )
    train_support = train["classification_canonical"].value_counts()

    selection_rows: list[dict[str, Any]] = []
    model_objects: dict[str, tuple[Any, Any, dict[str, Any]]] = {}
    ablation_rows: list[dict[str, Any]] = []

    def register(name: str, classifier: Any, features: Any, parameters: dict[str, Any], complexity: int) -> dict[str, Any]:
        result = evaluate_model(classifier, features, validation_labels)
        row = make_selection_row(name, result, parameters, complexity)
        selection_rows.append(row)
        model_objects[name] = (classifier, features, parameters)
        return row

    flat_row = register(
        "v1.5_flat_canonical", base, validation_features,
        {"vectorizer": asdict(COMPACT_CONFIG), "C": 1.5, "class_weight": "balanced"}, 1,
    )
    ablation_rows.append({"stage": "canonical_taxonomy_flat", **{key.replace("validation_", "validation_"): value for key, value in flat_row.items() if key in {"validation_accuracy", "validation_macro_f1", "validation_top3_accuracy"}}})

    for top_k in (1, 2, 3):
        gated = TopKFamilyGateClassifier(base, family_classifier, class_to_family, top_k)
        register(
            f"v1.5_family_top{top_k}_gate", gated, validation_features,
            {"base": "v1.5_flat_canonical", "top_k_families": top_k, "normalized_scores": True}, 2,
        )

    soft_rows = []
    for alpha in (0.6, 0.7, 0.8, 0.9, 1.0):
        for beta in (0.0, 0.1, 0.2, 0.3, 0.4):
            soft = SoftHierarchicalClassifier(base, family_classifier, class_to_family, alpha, beta)
            row = register(
                f"v1.5_soft_a{alpha:.1f}_b{beta:.1f}", soft, validation_features,
                {"base": "v1.5_flat_canonical", "alpha": alpha, "beta": beta, "normalization": "row_minmax"}, 2,
            )
            soft_rows.append(row)
    best_soft = max(soft_rows, key=selection_key)
    ablation_rows.append({
        "stage": "family_soft_score",
        "validation_accuracy": best_soft["validation_accuracy"],
        "validation_macro_f1": best_soft["validation_macro_f1"],
        "validation_top3_accuracy": best_soft["validation_top3_accuracy"],
    })

    oof_features, oof_targets, oof_ranks, oof_audit = build_oof_ranker_data(train, class_to_family, args.seed)
    ablation_specs = [
        ("prototype_similarity", PROTOTYPE_FEATURE_INDICES),
        ("label_overlap", LABEL_FEATURE_INDICES),
    ]
    for stage, feature_indices in ablation_specs:
        ranker = train_ranker(oof_features, oof_targets, oof_ranks, 5, 1.0, feature_indices, args.seed)
        reranker = build_reranker(ranker, 5, feature_indices, base, family_classifier, class_to_family, prototypes, train_support)
        result = evaluate_model(
            reranker,
            TextFeatureBatch(validation_features, tuple(validation["observation"].astype(str))),
            validation_labels,
        )
        ablation_rows.append({
            "stage": stage,
            "validation_accuracy": result["metrics"]["accuracy"],
            "validation_macro_f1": result["metrics"]["macro_f1"],
            "validation_top3_accuracy": result["metrics"]["top3_accuracy"],
        })

    for candidate_n in (3, 5, 10):
        for c in (0.1, 1.0, 10.0):
            ranker = train_ranker(oof_features, oof_targets, oof_ranks, candidate_n, c, FULL_FEATURE_INDICES, args.seed)
            reranker = build_reranker(
                ranker, candidate_n, FULL_FEATURE_INDICES, base, family_classifier,
                class_to_family, prototypes, train_support,
            )
            name = f"v1.5_reranker_oof_top{candidate_n}_c{c:g}"
            register(
                name, reranker,
                TextFeatureBatch(validation_features, tuple(validation["observation"].astype(str))),
                {
                    "base": "v1.5_flat_canonical", "candidate_n": candidate_n,
                    "ranker": "LogisticRegression", "C": c, "class_weight": "balanced",
                    "features": list(RANKER_FEATURES), "training": "5_fold_OOF_TRAIN_only",
                }, 3,
            )

    # Historical remapped baseline is ablation-only and cannot influence v1.5 model objects.
    v13_package = joblib.load(Path(args.v1_3_eval).resolve())
    mapping = dict(zip(taxonomy["original_label"], taxonomy["suggested_canonical_label"]))
    v13_remapped = CanonicalRemapClassifier(v13_package["classifier"], mapping)
    v13_features = v13_package["vectorizer"].transform(validation["observation"].astype(str))
    v13_result = evaluate_model(v13_remapped, v13_features, validation_labels)
    ablation_rows.insert(0, {
        "stage": "flat_baseline_v1_3_remapped",
        "validation_accuracy": v13_result["metrics"]["accuracy"],
        "validation_macro_f1": v13_result["metrics"]["macro_f1"],
        "validation_top3_accuracy": v13_result["metrics"]["top3_accuracy"],
    })

    winner_row = max(selection_rows, key=selection_key)
    ablation_rows.append({
        "stage": "reranker_selected",
        "validation_accuracy": winner_row["validation_accuracy"],
        "validation_macro_f1": winner_row["validation_macro_f1"],
        "validation_top3_accuracy": winner_row["validation_top3_accuracy"],
    })
    selection_frame = flatten_selection(selection_rows, winner_row)
    selection_frame.to_csv(report_dir / "failure_classifier_marilia_v1_5_model_selection.csv", index=False, encoding="utf-8-sig")
    pd.DataFrame(ablation_rows).to_csv(report_dir / "failure_classifier_marilia_v1_5_ablation.csv", index=False, encoding="utf-8-sig")
    print(selection_frame.sort_values(["selected", "validation_macro_f1", "validation_accuracy"], ascending=False).to_string(index=False))
    if args.validation_only:
        print(json.dumps({"validation_only": True, "winner": {key: value for key, value in winner_row.items() if key != "thresholds"}, "oof_audit": oof_audit}, ensure_ascii=False, indent=2))
        return

    winner_classifier, winner_validation_features, winner_parameters = model_objects[winner_row["architecture"]]
    validation_result = evaluate_model(winner_classifier, winner_validation_features, validation_labels)
    threshold_target, operational_threshold = choose_operational_threshold(
        validation_result["thresholds"], validation_result["confidence_curve"]
    )
    threshold_frame = validation_result["confidence_curve"].copy()
    threshold_frame["selected_for_targets"] = ""
    for target, selected in validation_result["thresholds"].items():
        if selected:
            mask = np.isclose(threshold_frame["threshold"], float(selected["threshold"]))
            threshold_frame.loc[mask, "selected_for_targets"] = target
    threshold_frame.to_csv(report_dir / "failure_classifier_marilia_v1_5_thresholds.csv", index=False, encoding="utf-8-sig")

    packaged_vectorizer = (
        TextPreservingVectorizer(vectorizer)
        if isinstance(winner_classifier, LearnedCandidateRerankerClassifier)
        else vectorizer
    )
    display_map = build_display_label_map(dataset)
    common = {
        "taxonomy_version": TAXONOMY_VERSION,
        "architecture": winner_row["architecture"],
        "parameters": winner_parameters,
        "split_rows": {key.lower(): value for key, value in EXPECTED_SPLIT_ROWS.items()},
        "split_preserved_from_v1_3": True,
        "oof_reranker_audit": oof_audit,
        "prototype_source": "TRAIN_only",
        "prototype_summary": prototypes[4],
        "library_versions": {
            "scikit_learn": sklearn.__version__, "joblib": joblib.__version__,
            "numpy": np.__version__, "pandas": pd.__version__,
        },
    }
    eval_artifact = {
        "model_version": f"{MODEL_VERSION}_eval", "dataset_version": DATASET_VERSION,
        "purpose": "evaluation_train_only", "text_fields": ["observation"],
        "vectorizer": packaged_vectorizer, "classifier": winner_classifier,
        "classes": winner_classifier.classes_, "display_label_map": display_map,
        "confidence_type": "v1_5_normalized_final_top1_minus_top2_margin",
        "automation_thresholds": validation_result["thresholds"],
        "high_confidence_threshold": operational_threshold["threshold"],
        "non_automatable_failure_modes": sorted(NON_AUTOMATABLE_FAILURE_MODES),
        "split_strategy": "preserved_v1_3_grouped_observation_norm_split",
        "random_seed": args.seed, "training_metadata": {**common, "artifact_role": "evaluation_train_only"},
        "metrics_summary": {"validation": validation_result["metrics"]},
    }
    joblib.dump(eval_artifact, eval_path)

    # TEST is transformed and evaluated only after every architecture and threshold is frozen.
    test_labels = test["classification_canonical"].astype(str).to_numpy()
    test_matrix = vectorizer.transform(test["observation"].astype(str))
    test_features: Any = (
        TextFeatureBatch(test_matrix, tuple(test["observation"].astype(str)))
        if isinstance(winner_classifier, LearnedCandidateRerankerClassifier)
        else test_matrix
    )
    test_result = evaluate_model(winner_classifier, test_features, test_labels)
    test_thresholds = {
        target: (
            evaluate_threshold(test_labels, test_result["predictions"], test_result["margins"], float(selected["threshold"]))
            if selected else None
        )
        for target, selected in validation_result["thresholds"].items()
    }
    test_hc = evaluate_threshold(
        test_labels, test_result["predictions"], test_result["margins"],
        float(operational_threshold["threshold"]),
    )
    test_review = review_assistance(
        test_labels, test_result["predictions"], test_result["top3"], test_result["top5"],
        test_result["margins"], float(operational_threshold["threshold"]),
    )
    errors, top_confusions, rarity, family = write_test_reports(
        test, test_result, np.asarray(winner_classifier.classes_).astype(str), train_support,
        class_to_family, report_dir,
    )
    pd.DataFrame([{"split": "TEST", **test_review}]).to_csv(
        report_dir / "failure_classifier_marilia_v1_5_review_assistance.csv", index=False, encoding="utf-8-sig"
    )

    v14_confusions = pd.read_csv(Path(args.v1_4_confusions).resolve())
    v14_candidates = pd.read_csv(Path(args.v1_4_candidates).resolve())
    taxonomy_priority = build_taxonomy_priority_review(
        v14_confusions, v14_candidates, train_support, class_to_family, prototypes[0], classes,
    )
    taxonomy_priority.to_csv(
        report_dir / "failure_classifier_marilia_v1_5_taxonomy_priority_review.csv",
        index=False, encoding="utf-8-sig",
    )

    # Refit selected base/family/prototypes on TRAIN+VALIDATION only.
    operational_train = pd.concat([train, validation], ignore_index=True)
    operational_vectorizer = build_vectorizer(COMPACT_CONFIG)
    operational_features = operational_vectorizer.fit_transform(operational_train["observation"].astype(str))
    operational_labels = operational_train["classification_canonical"].astype(str).to_numpy()
    operational_base = train_svc(operational_features, operational_labels, args.seed)
    operational_family = train_family(operational_features, operational_train["technical_family"], args.seed)
    operational_classes = np.asarray(operational_base.classes_).astype(str)
    operational_prototypes = build_prototypes(
        operational_features, operational_labels, operational_classes,
        operational_train["observation"].astype(str).tolist(), operational_vectorizer, include_summary=False,
    )
    name = winner_row["architecture"]
    if name == "v1.5_flat_canonical":
        operational_classifier: Any = operational_base
    elif name.startswith("v1.5_family_top"):
        operational_classifier = TopKFamilyGateClassifier(
            operational_base, operational_family, class_to_family,
            int(winner_parameters["top_k_families"]),
        )
    elif name.startswith("v1.5_soft_"):
        operational_classifier = SoftHierarchicalClassifier(
            operational_base, operational_family, class_to_family,
            float(winner_parameters["alpha"]), float(winner_parameters["beta"]),
        )
    elif name.startswith("v1.5_reranker_"):
        operational_classifier = build_reranker(
            winner_classifier.ranker, int(winner_parameters["candidate_n"]),
            winner_classifier.feature_indices, operational_base, operational_family,
            class_to_family, operational_prototypes,
            operational_train["classification_canonical"].value_counts(),
        )
    else:
        raise RuntimeError(f"Unknown winner: {name}")
    operational_packaged_vectorizer = (
        TextPreservingVectorizer(operational_vectorizer)
        if isinstance(operational_classifier, LearnedCandidateRerankerClassifier)
        else operational_vectorizer
    )
    operational_artifact = {
        "model_version": MODEL_VERSION, "dataset_version": DATASET_VERSION,
        "purpose": "operational_candidate_train_plus_validation", "text_fields": ["observation"],
        "vectorizer": operational_packaged_vectorizer, "classifier": operational_classifier,
        "classes": operational_classifier.classes_, "display_label_map": display_map,
        "confidence_type": "v1_5_normalized_final_top1_minus_top2_margin",
        "automation_thresholds": validation_result["thresholds"],
        "high_confidence_threshold": operational_threshold["threshold"],
        "non_automatable_failure_modes": sorted(NON_AUTOMATABLE_FAILURE_MODES),
        "split_strategy": "preserved_v1_3_grouped_observation_norm_split",
        "random_seed": args.seed,
        "training_metadata": {
            **common, "artifact_role": "operational_train_plus_validation",
            "training_rows": int(len(operational_train)), "test_metrics_belong_to": str(eval_path),
            "operational_artifact_not_evaluated_on_test": True,
        },
        "metrics_summary": {
            "validation_train_only_model": validation_result["metrics"],
            "test_train_only_model": test_result["metrics"],
            "high_confidence_test_train_only_model": test_hc,
        },
    }
    joblib.dump(operational_artifact, model_path)
    artifact_validation = validate_artifact(model_path)

    v12 = json.loads(Path("ml/models/failure_classifier_real_v1_2_metrics.json").read_text(encoding="utf-8-sig"))
    v13 = json.loads((report_dir / "failure_classifier_marilia_v1_3_metrics.json").read_text(encoding="utf-8-sig"))
    v14 = json.loads((report_dir / "failure_classifier_marilia_v1_4_metrics.json").read_text(encoding="utf-8-sig"))
    taxonomy_audit = json.loads((report_dir / "failure_classifier_marilia_v1_4_dataset_audit.json").read_text(encoding="utf-8-sig"))
    def historical_top5(package_path: str, label_column: str) -> float:
        package = joblib.load(Path(package_path).resolve())
        historical_features = package["vectorizer"].transform(test["observation"].astype(str))
        historical_scores = decision_scores(package["classifier"], historical_features)
        historical_top5 = top_k_from_scores(
            historical_scores, np.asarray(package["classifier"].classes_).astype(str), 5
        )
        historical_labels = test[label_column].astype(str).to_numpy()
        return round(float(np.mean([label in values for label, values in zip(historical_labels, historical_top5)])), 8)

    comparison = {
        "v1.2_published_different_split": {
            **v12["test"]["row_level"], "top5_accuracy": None,
            "high_confidence": v12["test"]["automation"].get("97"),
        },
        "v1.3_same_split_original_taxonomy": {
            **v13["test"],
            "top5_accuracy": historical_top5(args.v1_3_eval, "classification_original_norm"),
            "high_confidence": v13["high_confidence_test"],
        },
        "v1.4_same_split_canonical_taxonomy": {
            **v14["test"],
            "top5_accuracy": historical_top5(args.v1_4_eval, "classification_canonical"),
            "high_confidence": v14["high_confidence_test"],
        },
        "v1.5_same_split_canonical_taxonomy": {
            **test_result["metrics"], "high_confidence": test_hc,
        },
    }
    metrics = {
        "model_version": MODEL_VERSION, "dataset_version": DATASET_VERSION,
        "evaluation_integrity": {
            "split_preserved_from_v1_3": True, "split_rows": EXPECTED_SPLIT_ROWS,
            "zero_group_leakage": True, "winner_selected_on": "VALIDATION",
            "test_used_for_selection_or_tuning": False, "test_evaluations": 1,
            "reranker_training": oof_audit,
        },
        "taxonomy": taxonomy_audit["after"],
        "winner": {key: value for key, value in winner_row.items() if key != "thresholds"},
        "validation": validation_result["metrics"],
        "thresholds_selected_on_validation": validation_result["thresholds"],
        "operational_threshold_target": threshold_target,
        "operational_threshold_validation": operational_threshold,
        "test": test_result["metrics"], "thresholds_applied_to_test": test_thresholds,
        "high_confidence_test": test_hc, "review_assistance_test": test_review,
        "top_20_confusions": top_confusions.head(20).to_dict(orient="records"),
        "rarity_analysis": rarity.to_dict(orient="records"),
        "family_analysis": family.to_dict(orient="records"),
        "ablation": ablation_rows, "comparison": comparison,
        "errors": int(len(errors)),
        "artifacts": {
            "evaluation": str(eval_path), "operational_candidate": str(model_path),
            "operational_size_bytes": int(model_path.stat().st_size), "validation": artifact_validation,
        },
        "target_accuracy_ge_90": bool(test_result["metrics"]["accuracy"] >= 0.90),
        "v1_5_better_than_v1_4": bool(
            test_result["metrics"]["accuracy"] > float(v14["test"]["accuracy"])
            and test_result["metrics"]["macro_f1"] > float(v14["test"]["macro_f1"])
            and (
                test_result["metrics"]["top3_accuracy"] > float(v14["test"]["top3_accuracy"])
                or float(test_hc["coverage"]) > float(v14["high_confidence_test"]["coverage"])
                or float(test_review["review_top3_accuracy"] or 0.0) >= 0.90
            )
        ),
    }
    (report_dir / "failure_classifier_marilia_v1_5_metrics.json").write_text(
        json.dumps(json_ready(metrics), ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(json_ready(metrics), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
