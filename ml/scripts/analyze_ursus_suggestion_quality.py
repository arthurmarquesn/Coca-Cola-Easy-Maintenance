from __future__ import annotations

import argparse
import hashlib
import json
import math
from collections import Counter
from pathlib import Path
from typing import Any, Iterable

import joblib
import numpy as np
import pandas as pd
from scipy import sparse
from sklearn.metrics import f1_score

from ml.classifier_wrappers import LearnedCandidateRerankerClassifier, TextFeatureBatch
from ml.scripts.prepare_marilia_dataset import normalize_observation


ANALYSIS_VERSION = "ursus-suggestion-quality-v1"
GENERATED_AT = "2026-10-04T00:00:00-03:00"
DEFAULT_DATASET = "ml/data/human/marilia/prepared/marilia_human_v2_canonical.csv"
DEFAULT_MODEL = "ml/models/failure_classifier_marilia_v1_5_candidate_eval.joblib"
DEFAULT_TAXONOMY_DIR = "ml/taxonomy"
DEFAULT_REPORT_DIR = "ml/reports"
DEFAULT_INVENTORY = "ml/reports/ursus_v1_6_class_inventory.csv"
DEFAULT_SEPARABILITY = "ml/reports/ursus_v1_6_class_separability.csv"
DEFAULT_PERSISTENT = "ml/reports/ursus_v1_6_persistent_confusions.csv"
DEFAULT_LABEL_NOISE = "ml/reports/ursus_v1_6_possible_label_noise.csv"
DEFAULT_TAXONOMY_QUEUE = "ml/reports/ursus_v1_6_taxonomy_review_queue.csv"
DEFAULT_V15_METRICS = "ml/reports/failure_classifier_marilia_v1_5_metrics.json"

OUTPUT_FILES = (
    "ursus_suggestion_quality_test_rows.csv",
    "ursus_top3_misses.csv",
    "ursus_top3_by_class.csv",
    "ursus_top3_by_family.csv",
    "ursus_top5_recoverable_to_top3.csv",
    "ursus_reranker_rank_movements.csv",
    "ursus_ranking_quality_segments.csv",
    "ursus_suggestion_quality_summary.json",
    "ursus_suggestion_quality_summary.md",
)
RANK_BUCKETS = ("4", "5", "6-10", "11-20", ">20")
SUPPORT_BUCKETS = ("1", "2-3", "4-5", "6-10", "11-20", ">20")
PRIORITY_FAMILIES = (
    "LATA", "ROTULO", "MANGUEIRA", "CARTAO", "OTHER_UNKNOWN",
    "ESTEIRA", "TRANSPORTE", "VALVULA",
)
STRONG_FAMILIES = ("SENSOR", "PACOTE", "TAMPA", "ENCHIMENTO")
FAILURE_REASON_ORDER = (
    "SINGLETON", "LOW_SUPPORT", "LABEL_NOISE_CANDIDATE", "GENERIC_SPECIFIC",
    "CAUSE_EFFECT", "TAXONOMY_AMBIGUITY", "SEMANTIC_OVERLAP", "WRONG_FAMILY",
    "OTHER_UNKNOWN", "RERANKER_FAILURE", "FLAT_MODEL_FAILURE",
    "OUT_OF_VOCABULARY_PATTERN", "INSUFFICIENT_CONTEXT", "OTHER",
)
TAXONOMY_REASONS = {
    "SEMANTIC_OVERLAP", "TAXONOMY_AMBIGUITY", "GENERIC_SPECIFIC",
    "CAUSE_EFFECT", "OTHER_UNKNOWN",
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_csv(path: Path) -> pd.DataFrame:
    return pd.read_csv(path, dtype=str, keep_default_na=False)


def write_csv(frame: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(path, index=False, encoding="utf-8-sig")


def support_bucket(support: int) -> str:
    if support <= 1:
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


def expected_rank_bucket(rank: int) -> str:
    if rank == 4:
        return "4"
    if rank == 5:
        return "5"
    if rank <= 10:
        return "6-10"
    if rank <= 20:
        return "11-20"
    return ">20"


def ranked_indices(scores: np.ndarray) -> np.ndarray:
    return np.argsort(scores, axis=1)[:, ::-1]


def expected_ranks(order: np.ndarray, classes: np.ndarray, labels: np.ndarray) -> np.ndarray:
    class_index = {str(label): index for index, label in enumerate(classes)}
    expected_indices = np.asarray([class_index[str(label)] for label in labels], dtype=int)
    inverse = np.empty_like(order)
    inverse[np.arange(len(order))[:, None], order] = np.arange(order.shape[1])
    return inverse[np.arange(len(order)), expected_indices] + 1


def ranking_metrics(ranks: Iterable[int]) -> dict[str, float | int]:
    values = np.asarray(list(ranks), dtype=int)
    if len(values) == 0:
        return {
            "rows": 0, "recall_at_1": 0.0, "recall_at_2": 0.0,
            "recall_at_3": 0.0, "recall_at_5": 0.0, "recall_at_10": 0.0,
            "mrr": 0.0, "mean_expected_rank": 0.0, "median_expected_rank": 0.0,
        }
    return {
        "rows": int(len(values)),
        "recall_at_1": round(float(np.mean(values <= 1)), 8),
        "recall_at_2": round(float(np.mean(values <= 2)), 8),
        "recall_at_3": round(float(np.mean(values <= 3)), 8),
        "recall_at_5": round(float(np.mean(values <= 5)), 8),
        "recall_at_10": round(float(np.mean(values <= 10)), 8),
        "mrr": round(float(np.mean(1.0 / values)), 8),
        "mean_expected_rank": round(float(np.mean(values)), 8),
        "median_expected_rank": round(float(np.median(values)), 8),
    }


def goal_distance(rows: int, current_hits: int, targets: Iterable[float]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for target in targets:
        required = int(math.ceil(target * rows - 1e-12))
        result[f"{int(target * 100)}"] = {
            "target": target,
            "required_hits": required,
            "current_hits": int(current_hits),
            "additional_hits_needed": max(0, required - int(current_hits)),
        }
    return result


def main_reason(values: Iterable[str]) -> str:
    counts: Counter[str] = Counter()
    for value in values:
        counts.update(item for item in str(value).split(" | ") if item)
    if not counts:
        return ""
    priority = {reason: index for index, reason in enumerate(FAILURE_REASON_ORDER)}
    return min(counts, key=lambda item: (-counts[item], priority.get(item, 999), item))


def pair_key(left: str, right: str) -> tuple[str, str]:
    return tuple(sorted((str(left), str(right))))


def pair_evidence(
    taxonomy_queue: pd.DataFrame,
    decisions: pd.DataFrame,
    persistent: pd.DataFrame,
) -> tuple[set[tuple[str, str]], set[tuple[str, str]], dict[tuple[str, str], set[str]], dict[tuple[str, str], float]]:
    pending: set[tuple[str, str]] = set()
    persistent_pairs: set[tuple[str, str]] = set()
    relations: dict[tuple[str, str], set[str]] = {}
    similarities: dict[tuple[str, str], float] = {}

    for row in decisions.itertuples(index=False):
        key = pair_key(row.label_a, row.label_b)
        decision = str(row.decision)
        relations.setdefault(key, set()).add(decision)
        if decision == "PENDING":
            pending.add(key)
    for row in taxonomy_queue.itertuples(index=False):
        key = pair_key(row.label_a, row.label_b)
        relations.setdefault(key, set()).add(str(row.relation))
        try:
            similarities[key] = max(similarities.get(key, -1.0), float(row.semantic_similarity))
        except (TypeError, ValueError):
            pass
    for row in persistent.itertuples(index=False):
        key = pair_key(row.expected, row.predicted)
        persistent_pairs.add(key)
        relations.setdefault(key, set()).add("PERSISTENT_CONFUSION")
        try:
            similarities[key] = max(similarities.get(key, -1.0), float(row.semantic_similarity))
        except (TypeError, ValueError):
            pass
    return pending, persistent_pairs, relations, similarities


def feature_advantages(
    classifier: LearnedCandidateRerankerClassifier,
    batch: TextFeatureBatch,
    flat_scores: np.ndarray,
    final_order: np.ndarray,
    labels: np.ndarray,
    selected_rows: np.ndarray,
) -> dict[int, str]:
    if len(selected_rows) == 0:
        return {}
    matrix = batch.matrix[selected_rows]
    texts = tuple(batch.texts[index] for index in selected_rows)
    local_flat = flat_scores[selected_rows]
    limit = min(classifier.candidate_n, flat_scores.shape[1])
    candidates = ranked_indices(local_flat)[:, :limit]
    features = classifier._candidate_features(matrix, texts, local_flat, candidates)
    coefficients = np.asarray(classifier.ranker.coef_[0], dtype=float)
    selected_coefficients = coefficients
    feature_names = [classifier.feature_names[index] for index in classifier.feature_indices]
    class_index = {str(label): index for index, label in enumerate(classifier.classes_)}
    result: dict[int, str] = {}
    offset = 0
    for local_index, global_index in enumerate(selected_rows):
        row_candidates = candidates[local_index]
        top_index = int(final_order[global_index, 0])
        expected_index = class_index[str(labels[global_index])]
        top_positions = np.flatnonzero(row_candidates == top_index)
        expected_positions = np.flatnonzero(row_candidates == expected_index)
        if not len(top_positions) or not len(expected_positions):
            result[int(global_index)] = "EXPECTED_OUTSIDE_RERANKER_CANDIDATES"
            offset += len(row_candidates)
            continue
        top_features = features[offset + int(top_positions[0]), classifier.feature_indices]
        expected_features = features[offset + int(expected_positions[0]), classifier.feature_indices]
        contributions = (top_features - expected_features) * selected_coefficients
        favored = [
            (feature_names[index], float(value))
            for index, value in enumerate(contributions)
            if value > 1e-12
        ]
        favored.sort(key=lambda item: (-item[1], item[0]))
        result[int(global_index)] = (
            " | ".join(f"{name}={value:.6f}" for name, value in favored[:4])
            if favored else "NO_POSITIVE_DIFFERENTIAL"
        )
        offset += len(row_candidates)
    return result


def _segment_rows(frame: pd.DataFrame, segment_type: str, column: str) -> list[dict[str, Any]]:
    rows = []
    for segment, group in frame.groupby(column, sort=True):
        rows.append({"segment_type": segment_type, "segment": segment, **ranking_metrics(group["expected_rank"])})
    return rows


def _metric_or_blank(group: pd.DataFrame, key: str) -> float | str:
    if group.empty:
        return ""
    return float(ranking_metrics(group["expected_rank"])[key])


def build_class_report(rows: pd.DataFrame, canonical: pd.DataFrame) -> pd.DataFrame:
    output = []
    for entry in canonical.sort_values("canonical_label").itertuples(index=False):
        group = rows[rows["expected_label"] == entry.canonical_label]
        misses = group[group["expected_rank"] > 3]
        competitor = ""
        if not misses.empty:
            competitor = str(misses["top1"].value_counts().sort_index().sort_values(ascending=False, kind="stable").index[0])
        output.append({
            "canonical_label": entry.canonical_label,
            "family": entry.family,
            "train_support": int(group["train_support"].iloc[0]) if not group.empty else 0,
            "test_support": int(len(group)),
            "top1_accuracy": _metric_or_blank(group, "recall_at_1"),
            "recall_at_3": _metric_or_blank(group, "recall_at_3"),
            "recall_at_5": _metric_or_blank(group, "recall_at_5"),
            "mrr": _metric_or_blank(group, "mrr"),
            "average_expected_rank": _metric_or_blank(group, "mean_expected_rank"),
            "top3_miss_count": int(len(misses)),
            "main_competitor": competitor,
            "main_failure_reason": main_reason(misses["failure_reason"]),
        })
    return pd.DataFrame(output)


def build_family_report(rows: pd.DataFrame, canonical: pd.DataFrame) -> pd.DataFrame:
    class_counts = canonical.groupby("family")["canonical_label"].nunique().to_dict()
    output = []
    for family in sorted(class_counts):
        group = rows[rows["expected_family"] == family]
        misses = group[group["expected_rank"] > 3]
        output.append({
            "family": family,
            "classes": int(class_counts[family]),
            "test_support": int(len(group)),
            "top1_accuracy": _metric_or_blank(group, "recall_at_1"),
            "recall_at_3": _metric_or_blank(group, "recall_at_3"),
            "recall_at_5": _metric_or_blank(group, "recall_at_5"),
            "mrr": _metric_or_blank(group, "mrr"),
            "top3_misses": int(len(misses)),
            "main_failure_reason": main_reason(misses["failure_reason"]),
        })
    return pd.DataFrame(output)


def _records(frame: pd.DataFrame) -> list[dict[str, Any]]:
    return json.loads(frame.to_json(orient="records", force_ascii=False))


def analyze(
    dataset_path: Path,
    model_path: Path,
    taxonomy_dir: Path,
    inventory_path: Path,
    separability_path: Path,
    persistent_path: Path,
    noise_path: Path,
    taxonomy_queue_path: Path,
    v15_metrics_path: Path,
) -> dict[str, Any]:
    protected = [
        dataset_path, model_path, taxonomy_dir / "canonical_failure_modes.csv",
        taxonomy_dir / "failure_mode_aliases.csv", taxonomy_dir / "taxonomy_review_decisions.csv",
    ]
    hashes_before = {str(path): sha256_file(path) for path in protected}
    dataset = read_csv(dataset_path)
    test = dataset[dataset["split"] == "TEST"].copy().reset_index(drop=True)
    train = dataset[dataset["split"] == "TRAIN"].copy()
    if len(test) != 698:
        raise RuntimeError(f"Frozen TEST split changed: expected 698 rows, found {len(test)}")

    package = joblib.load(model_path)
    classifier = package["classifier"]
    vectorizer = package["vectorizer"]
    if not isinstance(classifier, LearnedCandidateRerankerClassifier):
        raise RuntimeError(f"Unexpected frozen classifier type: {type(classifier)!r}")
    batch = vectorizer.transform(test["observation"].astype(str))
    if not isinstance(batch, TextFeatureBatch):
        raise RuntimeError("Frozen v1.5 vectorizer did not preserve source text")

    final_scores = np.asarray(classifier.decision_function(batch), dtype=float)
    flat_scores = np.asarray(classifier.base_classifier.decision_function(batch.matrix), dtype=float)
    classes = np.asarray(classifier.classes_).astype(str)
    final_order = ranked_indices(final_scores)
    flat_order = ranked_indices(flat_scores)
    labels = test["classification_canonical"].astype(str).to_numpy()
    final_ranks = expected_ranks(final_order, classes, labels)
    flat_ranks = expected_ranks(flat_order, classes, labels)
    class_indices = {label: index for index, label in enumerate(classes)}
    expected_indices = np.asarray([class_indices[label] for label in labels], dtype=int)

    canonical = read_csv(taxonomy_dir / "canonical_failure_modes.csv")
    decisions = read_csv(taxonomy_dir / "taxonomy_review_decisions.csv")
    inventory = read_csv(inventory_path)
    separability = read_csv(separability_path)
    persistent = read_csv(persistent_path)
    label_noise = read_csv(noise_path)
    taxonomy_queue = read_csv(taxonomy_queue_path)
    v15_metrics = json.loads(v15_metrics_path.read_text(encoding="utf-8-sig"))
    if len(inventory) != len(canonical) or inventory["canonical_label"].nunique() != len(canonical):
        raise RuntimeError("Frozen class inventory no longer matches the candidate taxonomy")
    family_map = canonical.set_index("canonical_label")["family"].to_dict()
    status_map = canonical.set_index("canonical_label")["status"].to_dict()
    separation_map = separability.set_index("canonical_label")["separation_margin"].to_dict()
    train_support = train["classification_canonical"].value_counts().to_dict()
    noise_ids = set(label_noise.loc[label_noise["split"] == "TEST", "row_id"].astype(str))
    pending_pairs, persistent_pairs, relations, similarities = pair_evidence(
        taxonomy_queue, decisions, persistent
    )

    top_labels = classes[final_order[:, :10]]
    top_scores = np.take_along_axis(final_scores, final_order[:, :10], axis=1)
    flat_top_labels = classes[flat_order[:, :10]]
    margins = top_scores[:, 0] - top_scores[:, 1]
    feature_counts = np.asarray(batch.matrix.getnnz(axis=1) if sparse.issparse(batch.matrix) else np.count_nonzero(batch.matrix, axis=1))
    rows: list[dict[str, Any]] = []
    for index, source in enumerate(test.itertuples(index=False)):
        expected = labels[index]
        predicted = str(top_labels[index, 0])
        expected_family = family_map.get(expected, "OTHER_UNKNOWN")
        predicted_family = family_map.get(predicted, "OTHER_UNKNOWN")
        support = int(train_support.get(expected, 0))
        candidates = [str(value) for value in top_labels[index, :3]]
        candidate_pairs = [pair_key(expected, value) for value in candidates if value != expected]
        pair_relations = set().union(*(relations.get(key, set()) for key in candidate_pairs)) if candidate_pairs else set()
        pair_similarity = max((similarities.get(key, -1.0) for key in candidate_pairs), default=-1.0)
        separation = float(separation_map.get(expected, "nan"))
        is_persistent = any(key in persistent_pairs for key in candidate_pairs)
        has_pending_pair = any(key in pending_pairs for key in candidate_pairs)
        taxonomy_status = status_map.get(expected, "REVIEW")
        possible_noise = str(source.row_id) in noise_ids
        reasons: list[str] = []
        if final_ranks[index] > 3:
            if support == 1:
                reasons.append("SINGLETON")
            if support <= 10:
                reasons.append("LOW_SUPPORT")
            if is_persistent or pair_similarity >= 0.55 or (not math.isnan(separation) and separation < 0):
                reasons.append("SEMANTIC_OVERLAP")
            if taxonomy_status == "REVIEW" or has_pending_pair:
                reasons.append("TAXONOMY_AMBIGUITY")
            if "GENERIC_SPECIFIC" in pair_relations:
                reasons.append("GENERIC_SPECIFIC")
            if "CAUSE_EFFECT" in pair_relations:
                reasons.append("CAUSE_EFFECT")
            if predicted_family != expected_family:
                reasons.append("WRONG_FAMILY")
            if expected_family == "OTHER_UNKNOWN":
                reasons.append("OTHER_UNKNOWN")
            if possible_noise:
                reasons.append("LABEL_NOISE_CANDIDATE")
            if int(feature_counts[index]) == 0:
                reasons.append("OUT_OF_VOCABULARY_PATTERN")
            if flat_ranks[index] <= 3:
                reasons.append("RERANKER_FAILURE")
            else:
                reasons.append("FLAT_MODEL_FAILURE")
            if len(normalize_observation(source.observation).split()) <= 3:
                reasons.append("INSUFFICIENT_CONTEXT")
            if not reasons:
                reasons.append("OTHER")
        expected_score = float(final_scores[index, expected_indices[index]])
        rows.append({
            "row_id": str(source.row_id),
            "observation": str(source.observation),
            "expected_label": expected,
            "expected_family": expected_family,
            "train_support": support,
            "rarity_bucket": support_bucket(support),
            "top1": str(top_labels[index, 0]), "top1_score": round(float(top_scores[index, 0]), 10),
            "top2": str(top_labels[index, 1]), "top2_score": round(float(top_scores[index, 1]), 10),
            "top3": str(top_labels[index, 2]), "top3_score": round(float(top_scores[index, 2]), 10),
            "top4": str(top_labels[index, 3]), "top4_score": round(float(top_scores[index, 3]), 10),
            "top5": str(top_labels[index, 4]), "top5_score": round(float(top_scores[index, 4]), 10),
            "expected_rank": int(final_ranks[index]),
            "expected_rank_bucket": expected_rank_bucket(int(final_ranks[index])) if final_ranks[index] > 3 else "TOP3",
            "expected_score": round(expected_score, 10),
            "top5_contains_expected": bool(final_ranks[index] <= 5),
            "predicted_family": predicted_family,
            "persistent_confusion": bool(is_persistent),
            "taxonomy_status": taxonomy_status,
            "pending_taxonomy_pair": bool(has_pending_pair),
            "separation_margin": "" if math.isnan(separation) else round(separation, 8),
            "possible_label_noise": bool(possible_noise),
            "failure_reason": " | ".join(reasons),
            "flat_expected_rank": int(flat_ranks[index]),
            "flat_top1": str(flat_top_labels[index, 0]),
            "rank_change_from_flat": int(flat_ranks[index] - final_ranks[index]),
            "feature_count": int(feature_counts[index]),
            "decision_margin": round(float(margins[index]), 10),
        })
    row_frame = pd.DataFrame(rows)
    miss_frame = row_frame[row_frame["expected_rank"] > 3].copy().reset_index(drop=True)

    recoverable_indices = np.flatnonzero((final_ranks > 3) & (final_ranks <= 5))
    advantages = feature_advantages(
        classifier, batch, flat_scores, final_order, labels, recoverable_indices
    )
    recoverable_rows = []
    for index in recoverable_indices:
        source = row_frame.iloc[int(index)]
        recoverable_rows.append({
            "row_id": source["row_id"], "observation": source["observation"],
            "expected": source["expected_label"], "current_rank": int(source["expected_rank"]),
            "top1": source["top1"], "top2": source["top2"], "top3": source["top3"],
            "top4": source["top4"], "top5": source["top5"],
            "family": source["expected_family"], "support": int(source["train_support"]),
            "reasons": source["failure_reason"],
            "features_that_favored_wrong_labels": advantages.get(int(index), ""),
        })
    recoverable = pd.DataFrame(recoverable_rows)

    movement_rows = []
    for index in np.flatnonzero(final_ranks > 3):
        delta = int(flat_ranks[index] - final_ranks[index])
        movement = "IMPROVED" if delta > 0 else "WORSENED" if delta < 0 else "NEUTRAL"
        source = row_frame.iloc[int(index)]
        movement_rows.append({
            "row_id": source["row_id"], "observation": source["observation"],
            "expected_label": source["expected_label"], "expected_family": source["expected_family"],
            "flat_expected_rank": int(flat_ranks[index]),
            "reranker_expected_rank": int(final_ranks[index]),
            "rank_change": delta, "movement": movement,
            "flat_top1": str(flat_top_labels[index, 0]), "reranker_top1": source["top1"],
            "flat_top3_contains_expected": bool(flat_ranks[index] <= 3),
            "reranker_top3_contains_expected": False,
            "failure_reason": source["failure_reason"],
        })
    movements = pd.DataFrame(movement_rows)

    class_report = build_class_report(row_frame, canonical)
    family_report = build_family_report(row_frame, canonical)
    segment_rows = _segment_rows(row_frame, "rarity_bucket", "rarity_bucket")
    segment_rows.extend(_segment_rows(row_frame, "family", "expected_family"))
    row_frame["support_bucket"] = row_frame["train_support"].map(lambda value: support_bucket(int(value)))
    segment_rows.extend(_segment_rows(row_frame, "support_bucket", "support_bucket"))
    segments = pd.DataFrame(segment_rows)

    global_metrics = ranking_metrics(final_ranks)
    top1 = classes[final_order[:, 0]]
    global_metrics.update({
        "top1_accuracy": global_metrics["recall_at_1"],
        "top2_hit_rate": global_metrics["recall_at_2"],
        "top3_hit_rate": global_metrics["recall_at_3"],
        "top5_hit_rate": global_metrics["recall_at_5"],
        "top10_hit_rate": global_metrics["recall_at_10"],
        "macro_f1": round(float(f1_score(labels, top1, average="macro", zero_division=0)), 8),
        "weighted_f1": round(float(f1_score(labels, top1, average="weighted", zero_division=0)), 8),
    })
    expected_v15 = v15_metrics["test"]
    for expected_key, actual_key in (
        ("accuracy", "top1_accuracy"), ("top3_accuracy", "top3_hit_rate"),
        ("top5_accuracy", "top5_hit_rate"),
    ):
        if not math.isclose(float(expected_v15[expected_key]), float(global_metrics[actual_key]), abs_tol=1e-8):
            raise RuntimeError(f"Frozen metric mismatch for {expected_key}")

    non_suggestible = set(str(value) for value in package.get("non_automatable_failure_modes", []))
    eligible = np.asarray([prediction not in non_suggestible for prediction in top1])
    threshold = float(package["high_confidence_threshold"])
    legacy_review_mask = ~((margins >= threshold) & eligible)
    legacy_review_ranks = final_ranks[legacy_review_mask]
    review_metrics = ranking_metrics(legacy_review_ranks)
    review_metrics["top3_misses"] = int(np.sum(legacy_review_ranks > 3))
    if int(legacy_review_mask.sum()) != int(v15_metrics["review_assistance_test"]["review_rows"]):
        raise RuntimeError("Frozen legacy review cohort no longer reproduces v1.5")

    miss_reasons = miss_frame["failure_reason"].map(lambda value: set(str(value).split(" | ")))
    taxonomy_associated = miss_reasons.map(lambda values: bool(values & TAXONOMY_REASONS))
    low_separation = miss_frame["separation_margin"].map(
        lambda value: value != "" and float(value) < 0
    )
    generic_or_cause = miss_reasons.map(
        lambda values: bool(values & {"GENERIC_SPECIFIC", "CAUSE_EFFECT"})
    )
    strong_taxonomy_signal = (
        miss_frame["expected_family"].eq("OTHER_UNKNOWN")
        | low_separation
        | generic_or_cause
    )
    low_support = miss_frame["train_support"].astype(int) <= 10
    rank_distribution = {
        bucket: int((miss_frame["expected_rank_bucket"] == bucket).sum()) for bucket in RANK_BUCKETS
    }
    movement_counts = {
        key.lower(): int(value) for key, value in movements["movement"].value_counts().to_dict().items()
    }
    for key in ("improved", "worsened", "neutral"):
        movement_counts.setdefault(key, 0)
    reranker_top3_transitions = {
        "flat_top3_hits": int(np.sum(flat_ranks <= 3)),
        "reranker_top3_hits": int(np.sum(final_ranks <= 3)),
        "rescued_into_top3": int(np.sum((flat_ranks > 3) & (final_ranks <= 3))),
        "pushed_out_of_top3": int(np.sum((flat_ranks <= 3) & (final_ranks > 3))),
    }
    reranker_top3_transitions["net_top3_hits"] = (
        reranker_top3_transitions["reranker_top3_hits"]
        - reranker_top3_transitions["flat_top3_hits"]
    )

    top_classes = class_report[class_report["test_support"] > 0].sort_values(
        ["recall_at_3", "top3_miss_count", "test_support", "canonical_label"],
        ascending=[True, False, False, True],
    ).head(20)
    top_families = family_report[family_report["test_support"] > 0].sort_values(
        ["recall_at_3", "top3_misses", "test_support", "family"],
        ascending=[True, False, False, True],
    ).head(10)
    rarity_report = segments[segments["segment_type"] == "rarity_bucket"].copy()
    rarity_report["_order"] = rarity_report["segment"].map({value: index for index, value in enumerate(SUPPORT_BUCKETS)})
    rarity_report = rarity_report.sort_values("_order").drop(columns="_order")

    test_hits = int(np.sum(final_ranks <= 3))
    review_hits = int(np.sum(legacy_review_ranks <= 3))
    taxonomy_count = int(taxonomy_associated.sum())
    strong_taxonomy_count = int(strong_taxonomy_signal.sum())
    low_support_count = int(low_support.sum())
    priority_counts = {
        "A_improve_taxonomy": strong_taxonomy_count,
        "B_review_labels": int(miss_reasons.map(lambda values: "LABEL_NOISE_CANDIDATE" in values).sum()),
        "C_collect_data": low_support_count,
        "D_improve_reranker": int(miss_reasons.map(lambda values: "RERANKER_FAILURE" in values).sum()),
        "E_improve_text_representation": int(miss_reasons.map(lambda values: "FLAT_MODEL_FAILURE" in values or "OUT_OF_VOCABULARY_PATTERN" in values).sum()),
        "F_improve_family_component_mechanism": int(miss_reasons.map(lambda values: "WRONG_FAMILY" in values).sum()),
        "G_other": int(miss_reasons.map(lambda values: "OTHER" in values or "INSUFFICIENT_CONTEXT" in values).sum()),
    }
    summary = {
        "result": "PASS",
        "analysis_version": ANALYSIS_VERSION,
        "generated_at": GENERATED_AT,
        "product_principle": "OBSERVATION -> TOP-3 SUGGESTIONS -> HUMAN VALIDATION -> FINAL CLASSIFICATION",
        "scope": {
            "decision_support_only": True,
            "no_automation_readiness_assessment": True,
            "no_training_performed": True,
            "test_used_for_frozen_analysis_only": True,
            "model": str(model_path),
            "taxonomy_version": "canonical-taxonomy-v3-candidate",
        },
        "global": global_metrics,
        "top3_misses": int(len(miss_frame)),
        "distance_to_targets": goal_distance(len(final_ranks), test_hits, (0.90, 0.92, 0.95)),
        "legacy_review_cohort": {
            **review_metrics,
            "note": "Reproduces the frozen v1.5 review subset only for comparison; it is not an automation-readiness cohort.",
            "distance_to_targets": goal_distance(len(legacy_review_ranks), review_hits, (0.90, 0.92, 0.95)),
        },
        "top5_recoverable_to_top3": int(len(recoverable)),
        "rank_distribution_of_top3_misses": rank_distribution,
        "reranker_movements_for_top3_misses": movement_counts,
        "reranker_top3_transitions_all_test": reranker_top3_transitions,
        "taxonomy_impact": {
            "broad_diagnostic_association_misses": taxonomy_count,
            "broad_share_of_top3_misses": round(taxonomy_count / len(miss_frame), 8) if len(miss_frame) else 0.0,
            "strong_signal_misses": strong_taxonomy_count,
            "strong_signal_share_of_top3_misses": round(strong_taxonomy_count / len(miss_frame), 8) if len(miss_frame) else 0.0,
            "definition": sorted(TAXONOMY_REASONS),
            "indicators": {
                "taxonomy_status_review": int(miss_frame["taxonomy_status"].eq("REVIEW").sum()),
                "pending_pair_in_top3": int(miss_frame["pending_taxonomy_pair"].astype(bool).sum()),
                "persistent_confusion_in_top3": int(miss_frame["persistent_confusion"].astype(bool).sum()),
                "other_unknown": int(miss_frame["expected_family"].eq("OTHER_UNKNOWN").sum()),
                "negative_separation_margin": int(low_separation.sum()),
                "generic_specific_or_cause_effect": int(generic_or_cause.sum()),
                "possible_label_noise": int(miss_frame["possible_label_noise"].astype(bool).sum()),
            },
            "methodological_warning": (
                "The v1.6 taxonomy queue and persistent-confusion report were derived partly from the same "
                "frozen TEST errors. Broad association is diagnostic cross-reference, not independent causal evidence."
            ),
        },
        "low_support_impact": {
            "support_le_10_misses": low_support_count,
            "share_of_top3_misses": round(low_support_count / len(miss_frame), 8) if len(miss_frame) else 0.0,
        },
        "counterfactuals": {
            "recover_rank_4_only": {
                "cases": rank_distribution["4"],
                "top3_hit_rate": round((test_hits + rank_distribution["4"]) / len(final_ranks), 8),
            },
            "recover_rank_4_and_5": {
                "cases": rank_distribution["4"] + rank_distribution["5"],
                "top3_hit_rate": round((test_hits + rank_distribution["4"] + rank_distribution["5"]) / len(final_ranks), 8),
            },
            "taxonomy_associated_theoretical_ceiling": {
                "cases": taxonomy_count,
                "top3_hit_rate": round((test_hits + taxonomy_count) / len(final_ranks), 8),
                "warning": "Broad upper bound only; the diagnostic inputs reuse these TEST errors and do not establish causality or recoverability.",
            },
            "strong_taxonomy_signal_theoretical_ceiling": {
                "cases": strong_taxonomy_count,
                "top3_hit_rate": round((test_hits + strong_taxonomy_count) / len(final_ranks), 8),
                "warning": "Upper bound for stronger indicators only; causes overlap and recoverability is not demonstrated.",
            },
            "low_support_misses": low_support_count,
        },
        "bottleneck_related_miss_counts_non_exclusive": priority_counts,
        "top_20_classes_worst_recall_at_3": _records(top_classes),
        "top_10_families_worst_recall_at_3": _records(top_families),
        "top3_by_rarity_bucket": _records(rarity_report),
        "priority_family_comparison": _records(family_report[family_report["family"].isin(PRIORITY_FAMILIES)]),
        "strong_family_comparison": _records(family_report[family_report["family"].isin(STRONG_FAMILIES)]),
        "integrity": {
            "protected_hashes_before": hashes_before,
            "protected_hashes_after": {str(path): sha256_file(path) for path in protected},
            "protected_files_unchanged": False,
            "all_test_rows_represented": len(row_frame) == len(test) and row_frame["row_id"].nunique() == len(test),
            "no_model_artifact_created": True,
        },
        "artifacts": list(OUTPUT_FILES),
    }
    summary["integrity"]["protected_files_unchanged"] = (
        summary["integrity"]["protected_hashes_before"] == summary["integrity"]["protected_hashes_after"]
    )
    if not summary["integrity"]["protected_files_unchanged"]:
        raise RuntimeError("A protected input changed during analysis")
    if not summary["integrity"]["all_test_rows_represented"]:
        raise RuntimeError("Not all TEST rows were represented")
    return {
        "rows": row_frame,
        "misses": miss_frame,
        "classes": class_report,
        "families": family_report,
        "recoverable": recoverable,
        "movements": movements,
        "segments": segments,
        "summary": summary,
    }


def markdown_summary(summary: dict[str, Any]) -> str:
    global_metrics = summary["global"]
    review = summary["legacy_review_cohort"]
    rank_distribution = summary["rank_distribution_of_top3_misses"]
    movements = summary["reranker_movements_for_top3_misses"]
    transitions = summary["reranker_top3_transitions_all_test"]
    taxonomy = summary["taxonomy_impact"]
    targets = summary["distance_to_targets"]
    bottlenecks = summary["bottleneck_related_miss_counts_non_exclusive"]
    lines = [
        "# Ursus — qualidade das sugestões Top-K",
        "",
        f"Resultado: **{summary['result']}**  ",
        f"Versão da análise: `{summary['analysis_version']}`  ",
        "Princípio: **observação → Top-3 sugestões → validação humana → classificação final**.",
        "",
        "Esta análise não avalia prontidão para automação e não altera modelo, labels ou taxonomia.",
        "",
        "## Métricas globais do TEST congelado",
        "",
        "| Métrica | Valor |",
        "|---|---:|",
        f"| Linhas | {global_metrics['rows']} |",
        f"| Top-1 | {global_metrics['recall_at_1']:.4%} |",
        f"| Top-2 | {global_metrics['recall_at_2']:.4%} |",
        f"| Top-3 | {global_metrics['recall_at_3']:.4%} |",
        f"| Top-5 | {global_metrics['recall_at_5']:.4%} |",
        f"| Top-10 | {global_metrics['recall_at_10']:.4%} |",
        f"| MRR | {global_metrics['mrr']:.6f} |",
        f"| Mean expected rank | {global_metrics['mean_expected_rank']:.4f} |",
        f"| Median expected rank | {global_metrics['median_expected_rank']:.4f} |",
        "",
        f"Top-3 misses: **{summary['top3_misses']}**.",
        "",
        "## Distância para as metas Top-3",
        "",
        "| Meta | Casos adicionais |",
        "|---|---:|",
        f"| 90% | {targets['90']['additional_hits_needed']} |",
        f"| 92% | {targets['92']['additional_hits_needed']} |",
        f"| 95% | {targets['95']['additional_hits_needed']} |",
        "",
        "## Coorte histórica de revisão v1.5",
        "",
        f"Linhas: **{review['rows']}**; Top-3: **{review['recall_at_3']:.4%}**; misses: **{review['top3_misses']}**.  ",
        "Ela é reproduzida apenas para comparabilidade e não representa prontidão para automação.",
        "",
        "## Distribuição de rank dos misses",
        "",
        "| Rank | Casos |",
        "|---|---:|",
    ]
    lines.extend(f"| {bucket} | {rank_distribution[bucket]} |" for bucket in RANK_BUCKETS)
    lines.extend([
        "",
        f"Recuperáveis do Top-5 para Top-3: **{summary['top5_recoverable_to_top3']}**.",
        "",
        "## Diagnóstico do reranker nos misses Top-3",
        "",
        f"Melhorou: **{movements['improved']}**; piorou: **{movements['worsened']}**; neutro: **{movements['neutral']}**.",
        f"No TEST completo, trouxe **{transitions['rescued_into_top3']}** casos para o Top-3 e expulsou **{transitions['pushed_out_of_top3']}**, com saldo de **{transitions['net_top3_hits']}** hits.",
        "",
        "## Impacto taxonômico",
        "",
        f"Associação diagnóstica ampla: **{taxonomy['broad_diagnostic_association_misses']}** misses.  ",
        f"Sinais taxonômicos fortes: **{taxonomy['strong_signal_misses']}** misses.  ",
        "A associação ampla reutiliza diagnósticos construídos parcialmente sobre estes mesmos erros TEST; não é evidência causal independente.",
        "",
        "## Gargalos relacionados — contagens não exclusivas",
        "",
        "| Frente | Misses relacionados |",
        "|---|---:|",
    ])
    lines.extend(f"| {name} | {count} |" for name, count in bottlenecks.items())
    lines.extend([
        "",
        "## Próxima ação recomendada",
        "",
        "1. Revisar primeiro os casos em rank 4–5, confrontando flat ranking e reranker.",
        "2. Validar humanamente os misses ligados a pares taxonômicos pendentes e possíveis label noises.",
        "3. Coletar exemplos reais para classes de baixo suporte antes de qualquer novo treinamento.",
        "4. Somente depois repetir o treino em uma versão futura e medir o mesmo TEST sem usá-lo para seleção.",
        "",
        "As contagens de gargalos se sobrepõem e não são estimativas de ganho futuro.",
    ])
    return "\n".join(lines) + "\n"


def write_outputs(result: dict[str, Any], report_dir: Path) -> None:
    report_dir.mkdir(parents=True, exist_ok=True)
    write_csv(result["rows"], report_dir / "ursus_suggestion_quality_test_rows.csv")
    miss_columns = [
        "observation", "expected_label", "expected_family", "train_support", "rarity_bucket",
        "top1", "top1_score", "top2", "top2_score", "top3", "top3_score",
        "expected_rank", "expected_rank_bucket", "expected_score", "top5_contains_expected",
        "predicted_family", "persistent_confusion", "taxonomy_status", "pending_taxonomy_pair",
        "separation_margin", "possible_label_noise", "failure_reason",
    ]
    write_csv(result["misses"][["row_id", *miss_columns]], report_dir / "ursus_top3_misses.csv")
    write_csv(result["classes"], report_dir / "ursus_top3_by_class.csv")
    write_csv(result["families"], report_dir / "ursus_top3_by_family.csv")
    write_csv(result["recoverable"], report_dir / "ursus_top5_recoverable_to_top3.csv")
    write_csv(result["movements"], report_dir / "ursus_reranker_rank_movements.csv")
    write_csv(result["segments"], report_dir / "ursus_ranking_quality_segments.csv")
    (report_dir / "ursus_suggestion_quality_summary.json").write_text(
        json.dumps(result["summary"], ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (report_dir / "ursus_suggestion_quality_summary.md").write_text(
        markdown_summary(result["summary"]), encoding="utf-8"
    )


def run_analysis(args: argparse.Namespace) -> dict[str, Any]:
    result = analyze(
        Path(args.dataset).resolve(), Path(args.model).resolve(), Path(args.taxonomy_dir).resolve(),
        Path(args.inventory).resolve(), Path(args.separability).resolve(),
        Path(args.persistent_confusions).resolve(), Path(args.label_noise).resolve(),
        Path(args.taxonomy_queue).resolve(), Path(args.v15_metrics).resolve(),
    )
    write_outputs(result, Path(args.report_dir).resolve())
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Analyze why the frozen Ursus v1.5 correct label falls outside Top-3.")
    parser.add_argument("--dataset", default=DEFAULT_DATASET)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--taxonomy-dir", default=DEFAULT_TAXONOMY_DIR)
    parser.add_argument("--inventory", default=DEFAULT_INVENTORY)
    parser.add_argument("--separability", default=DEFAULT_SEPARABILITY)
    parser.add_argument("--persistent-confusions", default=DEFAULT_PERSISTENT)
    parser.add_argument("--label-noise", default=DEFAULT_LABEL_NOISE)
    parser.add_argument("--taxonomy-queue", default=DEFAULT_TAXONOMY_QUEUE)
    parser.add_argument("--v15-metrics", default=DEFAULT_V15_METRICS)
    parser.add_argument("--report-dir", default=DEFAULT_REPORT_DIR)
    args = parser.parse_args()
    result = run_analysis(args)
    print(json.dumps(result["summary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
