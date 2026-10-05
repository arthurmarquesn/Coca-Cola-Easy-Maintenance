from __future__ import annotations

import argparse
import json
import math
from collections import Counter
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from ml.classifier_wrappers import LearnedCandidateRerankerClassifier, TextFeatureBatch
from ml.scripts.analyze_ursus_suggestion_quality import (
    DEFAULT_DATASET,
    DEFAULT_LABEL_NOISE,
    DEFAULT_MODEL,
    DEFAULT_PERSISTENT,
    DEFAULT_SEPARABILITY,
    DEFAULT_TAXONOMY_DIR,
    DEFAULT_TAXONOMY_QUEUE,
    expected_ranks,
    pair_evidence,
    pair_key,
    ranked_indices,
    read_csv,
    sha256_file,
    support_bucket,
    write_csv,
)


ANALYSIS_VERSION = "ursus-reranker-failure-diagnosis-v1"
GENERATED_AT = "2026-10-04T00:00:00-03:00"
DEFAULT_REPORT_DIR = "ml/reports"
OUTPUT_FILES = (
    "ursus_rank4_rank5_diagnosis.csv",
    "ursus_reranker_expulsions.csv",
    "ursus_reranker_feature_contributions.csv",
    "ursus_reranker_family_support_analysis.csv",
    "ursus_reranker_failure_summary.json",
    "ursus_reranker_failure_summary.md",
)
FEATURE_CATEGORY = {
    "flat_score": "OTHER",
    "normalized_flat_score": "OTHER",
    "family_score": "FAMILY",
    "centroid_similarity": "CENTROID",
    "max_neighbor_similarity": "NEIGHBOR",
    "mean_top3_neighbor_similarity": "NEIGHBOR",
    "log_class_support": "SUPPORT",
    "top1_gap": "GAP",
    "token_overlap": "TOKEN_OVERLAP",
    "root_overlap": "ROOT_OVERLAP",
    "char_overlap": "CHAR_SIMILARITY",
    "label_cosine": "OTHER",
    "component_present": "COMPONENT",
    "mechanism_present": "MECHANISM",
}
GENERIC_CLASSES = {
    "SEM MODO DE FALHA IDENTIFICADO", "FALHA DE COMPONENTE",
    "FALHA DE EQUIPAMENTO", "FALHA DE ENCHIMENTO", "FALHA DE ESTEIRA",
    "FALHA DE MOTOR", "FALHA DE ROBO", "FALHA DE SENSOR",
    "FALHA DE TRANSPORTE", "FALHA DE VALVULA", "QUEBRA DE COMPONENTE",
}
SUPPORT_BUCKET_ORDER = {value: index for index, value in enumerate(("1", "2-3", "4-5", "6-10", "11-20", ">20"))}


def _feature_coefficients(classifier: LearnedCandidateRerankerClassifier) -> np.ndarray:
    selected = np.asarray(classifier.ranker.coef_[0], dtype=float)
    coefficients = np.zeros(len(classifier.feature_names), dtype=float)
    for position, feature_index in enumerate(classifier.feature_indices):
        coefficients[int(feature_index)] = selected[position]
    return coefficients


def candidate_feature_map(
    classifier: LearnedCandidateRerankerClassifier,
    batch: TextFeatureBatch,
    flat_scores: np.ndarray,
    selected_rows: np.ndarray,
) -> dict[int, dict[str, np.ndarray]]:
    matrix = batch.matrix[selected_rows]
    texts = tuple(batch.texts[int(index)] for index in selected_rows)
    local_scores = flat_scores[selected_rows]
    candidates = ranked_indices(local_scores)[:, : classifier.candidate_n]
    feature_matrix = classifier._candidate_features(
        matrix, texts, local_scores, candidates
    )
    result: dict[int, dict[str, np.ndarray]] = {}
    offset = 0
    for local_index, global_index in enumerate(selected_rows):
        row_candidates = candidates[local_index]
        result[int(global_index)] = {
            str(classifier.classes_[class_index]): feature_matrix[offset + position]
            for position, class_index in enumerate(row_candidates)
        }
        offset += len(row_candidates)
    return result


def feature_delta(
    wrong: np.ndarray,
    expected: np.ndarray,
    coefficients: np.ndarray,
    indices: tuple[int, ...],
) -> float:
    values = (wrong - expected) * coefficients
    return float(values[list(indices)].sum())


def classify_recovery(
    flat_rank: int,
    reranker_rank: int,
    support: int,
    strong_taxonomy_signal: bool,
) -> str:
    """Assign one documented, mutually exclusive diagnostic category.

    Precedence: a flat Top-3 answer demoted only to rank 4/5 is an easy
    reranking restoration; strong taxonomy evidence comes next; support <=3
    is a data problem; a flat rank worse than 5 points to representation;
    every remaining boundary case is a possible reranking recovery.
    """

    if flat_rank <= 3 and reranker_rank <= 5:
        return "EASY_RERANK_RECOVERY"
    if strong_taxonomy_signal:
        return "LIKELY_TAXONOMY_PROBLEM"
    if support <= 3:
        return "LIKELY_DATA_PROBLEM"
    if flat_rank > 5:
        return "LIKELY_REPRESENTATION_PROBLEM"
    return "POSSIBLE_RERANK_RECOVERY"


def likely_failure_mode(
    dominant_category: str,
    expected_support: int,
    promoted_support: int,
    expected_family: str,
    promoted_family: str,
    relations: set[str],
) -> str:
    if "GENERIC_SPECIFIC" in relations:
        return "GENERIC_SPECIFIC_BOUNDARY_SWAP"
    if "CAUSE_EFFECT" in relations:
        return "CAUSE_EFFECT_BOUNDARY_SWAP"
    if dominant_category == "FAMILY" and expected_family != promoted_family:
        return "FAMILY_FEATURE_OVERWEIGHT"
    if dominant_category == "SUPPORT" and promoted_support > expected_support:
        return "SUPPORT_BIAS_TOWARD_FREQUENT_CLASS"
    if dominant_category in {"CENTROID", "NEIGHBOR"}:
        return "SIMILARITY_FEATURE_OVERWEIGHT"
    if dominant_category in {
        "TOKEN_OVERLAP", "ROOT_OVERLAP", "CHAR_SIMILARITY", "COMPONENT", "MECHANISM",
    }:
        return "LEXICAL_FEATURE_OVERWEIGHT"
    return "MULTI_FEATURE_BOUNDARY_SWAP"


def _evidence_conclusion(mean_delta: float, positive_cases: int, total: int) -> str:
    if mean_delta > 0 and positive_cases >= math.ceil(total / 2):
        return "SUPPORTED_IN_EXPULSION_SAMPLE"
    if mean_delta <= 0 and positive_cases < math.ceil(total / 2):
        return "NOT_SUPPORTED"
    return "INCONCLUSIVE"


def analyze(
    dataset_path: Path,
    model_path: Path,
    taxonomy_dir: Path,
    separability_path: Path,
    persistent_path: Path,
    taxonomy_queue_path: Path,
    label_noise_path: Path,
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
        raise RuntimeError(f"Frozen TEST split changed: expected 698, found {len(test)}")

    package = joblib.load(model_path)
    classifier = package["classifier"]
    if not isinstance(classifier, LearnedCandidateRerankerClassifier):
        raise RuntimeError(f"Unexpected classifier: {type(classifier)!r}")
    batch = package["vectorizer"].transform(test["observation"].astype(str))
    if not isinstance(batch, TextFeatureBatch):
        raise RuntimeError("Frozen vectorizer did not return TextFeatureBatch")
    classes = np.asarray(classifier.classes_).astype(str)
    final_scores = np.asarray(classifier.decision_function(batch), dtype=float)
    flat_scores = np.asarray(classifier.base_classifier.decision_function(batch.matrix), dtype=float)
    final_order, flat_order = ranked_indices(final_scores), ranked_indices(flat_scores)
    labels = test["classification_canonical"].astype(str).to_numpy()
    final_ranks = expected_ranks(final_order, classes, labels)
    flat_ranks = expected_ranks(flat_order, classes, labels)
    rank45_indices = np.flatnonzero((final_ranks == 4) | (final_ranks == 5))
    expulsion_indices = np.flatnonzero((flat_ranks <= 3) & (final_ranks > 3))
    if len(rank45_indices) != 18 or len(expulsion_indices) != 11:
        raise RuntimeError(
            f"Frozen case counts changed: rank4-5={len(rank45_indices)}, expulsions={len(expulsion_indices)}"
        )

    selected_indices = np.asarray(sorted(set(rank45_indices) | set(expulsion_indices)), dtype=int)
    features_by_row = candidate_feature_map(classifier, batch, flat_scores, selected_indices)
    coefficients = _feature_coefficients(classifier)
    feature_index = {name: index for index, name in enumerate(classifier.feature_names)}
    class_index = {label: index for index, label in enumerate(classes)}
    train_support = train["classification_canonical"].value_counts().to_dict()
    test_support = test["classification_canonical"].value_counts().to_dict()

    canonical = read_csv(taxonomy_dir / "canonical_failure_modes.csv")
    decisions = read_csv(taxonomy_dir / "taxonomy_review_decisions.csv")
    separability = read_csv(separability_path)
    persistent = read_csv(persistent_path)
    taxonomy_queue = read_csv(taxonomy_queue_path)
    label_noise = read_csv(label_noise_path)
    family_map = canonical.set_index("canonical_label")["family"].to_dict()
    status_map = canonical.set_index("canonical_label")["status"].to_dict()
    separation_map = separability.set_index("canonical_label")["separation_margin"].to_dict()
    noise_ids = set(label_noise.loc[label_noise["split"] == "TEST", "row_id"].astype(str))
    pending_pairs, persistent_pairs, relation_map, _ = pair_evidence(
        taxonomy_queue, decisions, persistent
    )

    rank45_rows: list[dict[str, Any]] = []
    recovery_classes: dict[int, str] = {}
    for index in rank45_indices:
        index = int(index)
        source = test.iloc[index]
        expected = labels[index]
        expected_family = family_map.get(expected, "OTHER_UNKNOWN")
        final_labels = [str(classes[value]) for value in final_order[index, :5]]
        flat_labels = [str(classes[value]) for value in flat_order[index, :5]]
        expected_features = features_by_row[index][expected]
        pairs = [pair_key(expected, candidate) for candidate in final_labels[:3] if candidate != expected]
        relations = set().union(*(relation_map.get(key, set()) for key in pairs)) if pairs else set()
        separation_raw = separation_map.get(expected, "")
        separation = float(separation_raw) if separation_raw != "" else math.nan
        strong_taxonomy = (
            expected_family == "OTHER_UNKNOWN"
            or (not math.isnan(separation) and separation < 0)
            or bool(relations & {"GENERIC_SPECIFIC", "CAUSE_EFFECT"})
        )
        support = int(train_support.get(expected, 0))
        category = classify_recovery(
            int(flat_ranks[index]), int(final_ranks[index]), support, strong_taxonomy
        )
        recovery_classes[index] = category
        boundary_score = float(final_scores[index, final_order[index, 2]])
        expected_final_score = float(final_scores[index, class_index[expected]])
        final_top1_family = family_map.get(final_labels[0], "OTHER_UNKNOWN")
        evidence = [
            f"flat_rank={int(flat_ranks[index])}",
            f"reranker_rank={int(final_ranks[index])}",
            f"gap_to_top3={boundary_score - expected_final_score:.6f}",
            f"support={support}",
        ]
        if strong_taxonomy:
            evidence.append("strong_taxonomy_signal")
        if str(source.row_id) in noise_ids:
            evidence.append("possible_label_noise")
        rank45_rows.append({
            "row_id": str(source.row_id),
            "observation": str(source.observation),
            "expected_label": expected,
            "expected_family": expected_family,
            "train_support": support,
            "test_support": int(test_support.get(expected, 0)),
            "flat_rank": int(flat_ranks[index]),
            "reranker_rank": int(final_ranks[index]),
            **{f"flat_top{position + 1}": label for position, label in enumerate(flat_labels)},
            **{f"reranker_top{position + 1}": label for position, label in enumerate(final_labels)},
            "expected_flat_score": round(float(flat_scores[index, class_index[expected]]), 10),
            "expected_reranker_score": round(expected_final_score, 10),
            "top3_boundary_score": round(boundary_score, 10),
            "expected_score_gap_to_top3": round(boundary_score - expected_final_score, 10),
            "family_match": final_top1_family == expected_family,
            "component_match": bool(expected_features[feature_index["component_present"]]),
            "mechanism_match": bool(expected_features[feature_index["mechanism_present"]]),
            "label_token_overlap": round(float(expected_features[feature_index["token_overlap"]]), 10),
            "observation_label_overlap": round(float(expected_features[feature_index["char_overlap"]]), 10),
            "centroid_similarity": round(float(expected_features[feature_index["centroid_similarity"]]), 10),
            "neighbor_similarity": round(float(expected_features[feature_index["max_neighbor_similarity"]]), 10),
            "prototype_similarity": round(float(expected_features[feature_index["label_cosine"]]), 10),
            "support_feature": round(float(expected_features[feature_index["log_class_support"]]), 10),
            "rarity_bucket": support_bucket(support),
            "persistent_confusion": any(key in persistent_pairs for key in pairs),
            "taxonomy_status": status_map.get(expected, "REVIEW"),
            "other_unknown": expected_family == "OTHER_UNKNOWN",
            "reranker_helped": int(final_ranks[index]) < int(flat_ranks[index]),
            "reranker_hurt": int(final_ranks[index]) > int(flat_ranks[index]),
            "recovery_class": category,
            "diagnostic_reason": "; ".join(evidence),
        })
    rank45 = pd.DataFrame(rank45_rows).sort_values(
        ["reranker_rank", "expected_score_gap_to_top3", "row_id"]
    ).reset_index(drop=True)

    contribution_rows: list[dict[str, Any]] = []
    expulsion_rows: list[dict[str, Any]] = []
    case_feature_deltas: dict[int, dict[str, float]] = {}
    category_deltas_by_case: dict[int, dict[str, float]] = {}
    for index in expulsion_indices:
        index = int(index)
        source = test.iloc[index]
        expected = labels[index]
        flat_top3_indices = set(int(value) for value in flat_order[index, :3])
        newly_promoted = [
            int(value) for value in final_order[index, :3]
            if int(value) not in flat_top3_indices
        ]
        if not newly_promoted:
            raise RuntimeError(f"No promoted Top-3 candidate found for row {source.row_id}")
        promoted_index = newly_promoted[0]
        promoted = str(classes[promoted_index])
        expected_features = features_by_row[index][expected]
        promoted_features = features_by_row[index][promoted]
        weighted_delta = (promoted_features - expected_features) * coefficients
        feature_deltas = {
            name: float(weighted_delta[position])
            for position, name in enumerate(classifier.feature_names)
        }
        case_feature_deltas[index] = feature_deltas
        category_delta: Counter[str] = Counter()
        for name, value in feature_deltas.items():
            category_delta[FEATURE_CATEGORY[name]] += value
        category_deltas_by_case[index] = dict(category_delta)
        favored = sorted(
            ((name, value) for name, value in feature_deltas.items() if value > 1e-12),
            key=lambda item: (-item[1], item[0]),
        )
        dominant = favored[0][0] if favored else "NONE"
        secondary = favored[1][0] if len(favored) > 1 else "NONE"
        dominant_category = FEATURE_CATEGORY.get(dominant, "OTHER")
        expected_family = family_map.get(expected, "OTHER_UNKNOWN")
        promoted_family = family_map.get(promoted, "OTHER_UNKNOWN")
        relation = relation_map.get(pair_key(expected, promoted), set())
        expected_support = int(train_support.get(expected, 0))
        promoted_support = int(train_support.get(promoted, 0))
        final_top3 = [str(classes[value]) for value in final_order[index, :3]]
        flat_top3 = [str(classes[value]) for value in flat_order[index, :3]]
        expulsion_rows.append({
            "row_id": str(source.row_id),
            "observation": str(source.observation),
            "expected_label": expected,
            "expected_family": expected_family,
            "flat_rank": int(flat_ranks[index]),
            "reranker_rank": int(final_ranks[index]),
            "positions_lost": int(final_ranks[index] - flat_ranks[index]),
            "flat_top3": " | ".join(flat_top3),
            "reranker_top3": " | ".join(final_top3),
            "promoted_wrong_label": promoted,
            "promoted_wrong_family": promoted_family,
            "expected_flat_score": round(float(flat_scores[index, class_index[expected]]), 10),
            "expected_reranker_score": round(float(final_scores[index, class_index[expected]]), 10),
            "promoted_candidate_score": round(float(final_scores[index, promoted_index]), 10),
            "family_score_delta": round(feature_delta(promoted_features, expected_features, coefficients, (feature_index["family_score"],)), 10),
            "centroid_score_delta": round(feature_delta(promoted_features, expected_features, coefficients, (feature_index["centroid_similarity"],)), 10),
            "neighbor_score_delta": round(feature_delta(promoted_features, expected_features, coefficients, (feature_index["max_neighbor_similarity"], feature_index["mean_top3_neighbor_similarity"])), 10),
            "support_score_delta": round(feature_delta(promoted_features, expected_features, coefficients, (feature_index["log_class_support"],)), 10),
            "gap_score_delta": round(feature_delta(promoted_features, expected_features, coefficients, (feature_index["top1_gap"],)), 10),
            "token_overlap_delta": round(feature_delta(promoted_features, expected_features, coefficients, (feature_index["token_overlap"],)), 10),
            "root_overlap_delta": round(feature_delta(promoted_features, expected_features, coefficients, (feature_index["root_overlap"],)), 10),
            "char_similarity_delta": round(feature_delta(promoted_features, expected_features, coefficients, (feature_index["char_overlap"],)), 10),
            "component_match_delta": round(feature_delta(promoted_features, expected_features, coefficients, (feature_index["component_present"],)), 10),
            "mechanism_match_delta": round(feature_delta(promoted_features, expected_features, coefficients, (feature_index["mechanism_present"],)), 10),
            "dominant_feature": dominant,
            "secondary_feature": secondary,
            "likely_failure_mode": likely_failure_mode(
                dominant_category, expected_support, promoted_support,
                expected_family, promoted_family, relation,
            ),
        })
        row_candidate_features = features_by_row[index]
        final_rank_by_label = {
            str(classes[class_id]): position + 1
            for position, class_id in enumerate(final_order[index])
        }
        for candidate, values in row_candidate_features.items():
            if candidate == expected:
                role = "EXPECTED"
            elif candidate == promoted:
                role = "PROMOTED_WRONG"
            else:
                role = "OTHER"
            for position, name in enumerate(classifier.feature_names):
                value = float(values[position])
                coefficient = float(coefficients[position])
                contribution_rows.append({
                    "observation_id": str(source.row_id),
                    "candidate_label": candidate,
                    "candidate_rank": int(final_rank_by_label[candidate]),
                    "is_expected": candidate == expected,
                    "candidate_role": role,
                    "feature_name": name,
                    "feature_value": round(value, 10),
                    "coefficient": round(coefficient, 10),
                    "contribution": round(value * coefficient, 10),
                })
    expulsions = pd.DataFrame(expulsion_rows).sort_values(
        ["positions_lost", "reranker_rank", "row_id"], ascending=[False, False, True]
    ).reset_index(drop=True)
    contributions = pd.DataFrame(contribution_rows).sort_values(
        ["observation_id", "candidate_rank", "feature_name"]
    ).reset_index(drop=True)

    family_rows = []
    test_family = test["technical_family"].value_counts().to_dict()
    rank45_family = Counter(rank45["expected_family"])
    expulsion_family = Counter(expulsions["expected_family"])
    for family in sorted(set(test_family) | set(rank45_family) | set(expulsion_family)):
        test_rows = int(test_family.get(family, 0))
        expulsion_count = int(expulsion_family.get(family, 0))
        family_rows.append({
            "segment_type": "FAMILY", "segment": family,
            "test_rows": test_rows, "rank4_rank5_cases": int(rank45_family.get(family, 0)),
            "expulsions": expulsion_count,
            "expulsion_rate": round(expulsion_count / test_rows, 8) if test_rows else 0.0,
            "expulsion_share": round(expulsion_count / len(expulsions), 8),
            "test_share": round(test_rows / len(test), 8),
            "representation_lift": round((expulsion_count / len(expulsions)) / (test_rows / len(test)), 8) if expulsion_count and test_rows else 0.0,
        })
    test_buckets = Counter(support_bucket(int(train_support.get(label, 0))) for label in labels)
    rank45_buckets = Counter(rank45["rarity_bucket"])
    expulsion_buckets = Counter(
        support_bucket(int(train_support.get(labels[int(index)], 0))) for index in expulsion_indices
    )
    for bucket in sorted(test_buckets, key=lambda value: SUPPORT_BUCKET_ORDER[value]):
        test_rows = int(test_buckets[bucket])
        expulsion_count = int(expulsion_buckets.get(bucket, 0))
        family_rows.append({
            "segment_type": "SUPPORT_BUCKET", "segment": bucket,
            "test_rows": test_rows, "rank4_rank5_cases": int(rank45_buckets.get(bucket, 0)),
            "expulsions": expulsion_count,
            "expulsion_rate": round(expulsion_count / test_rows, 8),
            "expulsion_share": round(expulsion_count / len(expulsions), 8),
            "test_share": round(test_rows / len(test), 8),
            "representation_lift": round((expulsion_count / len(expulsions)) / (test_rows / len(test)), 8) if expulsion_count else 0.0,
        })
    segments = pd.DataFrame(family_rows)

    delta_frame = pd.DataFrame(case_feature_deltas).T
    mean_delta = delta_frame.mean().sort_values(ascending=False)
    expected_contributions = contributions[contributions["candidate_role"] == "EXPECTED"].groupby("feature_name")["contribution"].mean()
    promoted_contributions = contributions[contributions["candidate_role"] == "PROMOTED_WRONG"].groupby("feature_name")["contribution"].mean()
    mean_contributions = [
        {
            "feature_name": name,
            "expected_mean_contribution": round(float(expected_contributions.get(name, 0.0)), 10),
            "promoted_wrong_mean_contribution": round(float(promoted_contributions.get(name, 0.0)), 10),
            "mean_delta_promoted_minus_expected": round(float(mean_delta.get(name, 0.0)), 10),
        }
        for name in classifier.feature_names
    ]
    dominant_categories: Counter[str] = Counter()
    for deltas in category_deltas_by_case.values():
        positive = [(category, value) for category, value in deltas.items() if value > 1e-12]
        dominant_categories[max(positive, key=lambda item: (item[1], item[0]))[0] if positive else "OTHER"] += 1

    category_means = {
        category: float(np.mean([values.get(category, 0.0) for values in category_deltas_by_case.values()]))
        for category in sorted(set(FEATURE_CATEGORY.values()))
    }
    category_positive = {
        category: int(sum(values.get(category, 0.0) > 0 for values in category_deltas_by_case.values()))
        for category in category_means
    }
    expulsion_expected_support = np.asarray([int(train_support.get(labels[int(index)], 0)) for index in expulsion_indices])
    rare_expulsions = int(np.sum(expulsion_expected_support <= 10))
    rare_test = int(sum(int(train_support.get(label, 0)) <= 10 for label in labels))
    common_expulsions = len(expulsions) - rare_expulsions
    common_test = len(test) - rare_test
    promoted_labels = expulsions["promoted_wrong_label"].astype(str)
    promoted_families = expulsions["promoted_wrong_family"].astype(str)
    generic_specific_count = 0
    cause_effect_count = 0
    for row in expulsions.itertuples(index=False):
        pair_relations = relation_map.get(pair_key(row.expected_label, row.promoted_wrong_label), set())
        generic_specific_count += int("GENERIC_SPECIFIC" in pair_relations)
        cause_effect_count += int("CAUSE_EFFECT" in pair_relations)
    evidence = {
        "family_overvaluation": {
            "conclusion": _evidence_conclusion(category_means["FAMILY"], category_positive["FAMILY"], len(expulsions)),
            "mean_weighted_delta": round(category_means["FAMILY"], 10),
            "positive_cases": category_positive["FAMILY"],
        },
        "support_overvaluation": {
            "conclusion": _evidence_conclusion(category_means["SUPPORT"], category_positive["SUPPORT"], len(expulsions)),
            "mean_weighted_delta": round(category_means["SUPPORT"], 10),
            "positive_cases": category_positive["SUPPORT"],
        },
        "centroid_overvaluation": {
            "conclusion": _evidence_conclusion(
                category_means["CENTROID"],
                int(sum(values.get("CENTROID", 0.0) > 0 for values in category_deltas_by_case.values())),
                len(expulsions),
            ),
            "mean_weighted_delta": round(category_means["CENTROID"], 10),
            "positive_cases": int(sum(
                values.get("CENTROID", 0.0) > 0
                for values in category_deltas_by_case.values()
            )),
        },
        "neighbor_overvaluation": {
            "conclusion": _evidence_conclusion(
                category_means["NEIGHBOR"],
                int(sum(values.get("NEIGHBOR", 0.0) > 0 for values in category_deltas_by_case.values())),
                len(expulsions),
            ),
            "mean_weighted_delta": round(category_means["NEIGHBOR"], 10),
            "positive_cases": int(sum(
                values.get("NEIGHBOR", 0.0) > 0
                for values in category_deltas_by_case.values()
            )),
        },
        "rare_class_penalty": {
            "conclusion": "SUPPORTED_IN_EXPULSION_SAMPLE" if rare_expulsions / rare_test > common_expulsions / common_test else "NOT_SUPPORTED",
            "rare_support_le_10": {"expulsions": rare_expulsions, "test_rows": rare_test, "rate": round(rare_expulsions / rare_test, 8)},
            "support_gt_10": {"expulsions": common_expulsions, "test_rows": common_test, "rate": round(common_expulsions / common_test, 8)},
        },
        "generic_class_promotion": {
            "count": int(promoted_labels.isin(GENERIC_CLASSES).sum()),
            "conclusion": (
                "SUPPORTED_IN_EXPULSION_SAMPLE"
                if int(promoted_labels.isin(GENERIC_CLASSES).sum()) >= math.ceil(len(expulsions) / 2)
                else "INCONCLUSIVE_SMALL_SAMPLE"
                if int(promoted_labels.isin(GENERIC_CLASSES).sum())
                else "NOT_OBSERVED"
            ),
        },
        "other_unknown_promotion": {
            "count": int(promoted_families.eq("OTHER_UNKNOWN").sum()),
            "conclusion": "SUPPORTED_IN_EXPULSION_SAMPLE" if int(promoted_families.eq("OTHER_UNKNOWN").sum()) >= math.ceil(len(expulsions) / 2) else "NOT_SUPPORTED",
        },
        "generic_specific_worsening": {"count": generic_specific_count, "conclusion": "OBSERVED_IN_EXPULSION_SAMPLE" if generic_specific_count else "NOT_OBSERVED"},
        "cause_effect_worsening": {"count": cause_effect_count, "conclusion": "OBSERVED_IN_EXPULSION_SAMPLE" if cause_effect_count else "NOT_OBSERVED"},
    }

    final_hits = int(np.sum(final_ranks <= 3))
    rank4_count = int(np.sum(final_ranks == 4))
    rank45_count = int(len(rank45_indices))
    overlap = len(set(int(value) for value in rank45_indices) & set(int(value) for value in expulsion_indices))
    combined = rank45_count + len(expulsion_indices) - overlap
    counterfactuals = {
        "restore_expulsions": {"additional_hits": 11, "top3_hit_rate": round((final_hits + 11) / len(test), 8)},
        "recover_rank_4": {"additional_hits": rank4_count, "top3_hit_rate": round((final_hits + rank4_count) / len(test), 8)},
        "recover_rank_4_and_5": {"additional_hits": rank45_count, "top3_hit_rate": round((final_hits + rank45_count) / len(test), 8)},
        "combined_non_overlapping": {"additional_hits": combined, "overlap": overlap, "top3_hit_rate": round((final_hits + combined) / len(test), 8)},
    }
    recovery_counts = {key: int(value) for key, value in Counter(rank45["recovery_class"]).items()}
    for key in (
        "EASY_RERANK_RECOVERY", "POSSIBLE_RERANK_RECOVERY", "LIKELY_DATA_PROBLEM",
        "LIKELY_TAXONOMY_PROBLEM", "LIKELY_REPRESENTATION_PROBLEM",
    ):
        recovery_counts.setdefault(key, 0)

    family_priority = segments[
        (segments["segment_type"] == "FAMILY") & segments["expulsions"].astype(int).gt(0)
    ].sort_values(["expulsions", "representation_lift", "segment"], ascending=[False, False, True])
    support_priority = segments[segments["segment_type"] == "SUPPORT_BUCKET"].sort_values(
        "representation_lift", ascending=False
    )
    summary = {
        "result": "PASS",
        "analysis_version": ANALYSIS_VERSION,
        "generated_at": GENERATED_AT,
        "scope": {
            "frozen_model": str(model_path), "test_rows": len(test),
            "no_training_performed": True, "no_fitting_performed": True,
            "no_rankings_changed": True,
        },
        "rank4_rank5_cases": len(rank45),
        "reranker_expulsions": len(expulsions),
        "recovery_classification": recovery_counts,
        "dominant_feature_categories": dict(sorted(dominant_categories.items())),
        "mean_feature_contributions": mean_contributions,
        "top_features_harming": [
            {"feature": name, "mean_weighted_delta": round(float(value), 10)}
            for name, value in mean_delta.items() if value > 0
        ],
        "top_features_helping": [
            {"feature": name, "mean_weighted_delta": round(float(value), 10)}
            for name, value in mean_delta.sort_values().items() if value < 0
        ],
        "families_most_affected": json.loads(family_priority.to_json(orient="records", force_ascii=False)),
        "support_buckets": json.loads(support_priority.to_json(orient="records", force_ascii=False)),
        "counterfactuals": counterfactuals,
        "reranker_diagnostic_evidence": evidence,
        "recommendations": {
            "A_feature_engineering": "Add explicit relative candidate-vs-boundary features and separate label-text similarity from TRAIN prototype similarity; validate on VALIDATION only.",
            "B_weighting": "Regularize or cap only feature groups with positive harmful deltas; do not globally remove family/support evidence from eleven cases alone.",
            "C_training_objective": "Evaluate a listwise or pairwise objective that penalizes pushing the true class across the Top-3 boundary.",
            "D_negative_sampling": "Emphasize hard negatives from ranks 2-5, same-family pairs, and reviewed generic-specific pairs.",
            "E_calibration": "Calibrate the Top-3 boundary margin on VALIDATION; current row-wise reranker scores are ranking scores, not probabilities.",
            "F_taxonomy": "Human-review strong taxonomy signals and pending pairs; do not merge concepts automatically.",
            "G_data_collection": "Collect real examples for low-support affected classes, prioritizing support buckets with elevated expulsion lift.",
        },
        "methodology": {
            "feature_contribution": "feature_value * real LogisticRegression coefficient",
            "feature_delta": "(promoted_wrong_value - expected_value) * real coefficient",
            "promoted_wrong_candidate": "highest-ranked candidate present in reranker Top-3 but absent from flat Top-3",
            "rank4_rank5_field_mapping": {
                "family_match": "reranker Top-1 family equals expected family",
                "component_match": "expected candidate component_present feature",
                "mechanism_match": "expected candidate mechanism_present feature",
                "label_token_overlap": "expected candidate token_overlap feature",
                "observation_label_overlap": "expected candidate char_overlap feature",
                "prototype_similarity": "expected candidate label_cosine feature",
            },
            "recovery_classification_precedence": [
                "EASY: flat Top-3 and reranker rank 4-5",
                "TAXONOMY: OTHER_UNKNOWN, negative separation, or generic-specific/cause-effect evidence",
                "DATA: TRAIN support <=3",
                "REPRESENTATION: flat rank >5",
                "POSSIBLE: remaining rank 4-5 cases",
            ],
        },
        "integrity": {
            "protected_hashes_before": hashes_before,
            "protected_hashes_after": {str(path): sha256_file(path) for path in protected},
            "protected_files_unchanged": False,
            "no_model_artifact_created": True,
        },
        "artifacts": list(OUTPUT_FILES),
    }
    summary["integrity"]["protected_files_unchanged"] = (
        summary["integrity"]["protected_hashes_before"]
        == summary["integrity"]["protected_hashes_after"]
    )
    if not summary["integrity"]["protected_files_unchanged"]:
        raise RuntimeError("Protected input changed during analysis")
    return {
        "rank45": rank45, "expulsions": expulsions,
        "contributions": contributions, "segments": segments, "summary": summary,
    }


def markdown_summary(summary: dict[str, Any]) -> str:
    recovery = summary["recovery_classification"]
    counter = summary["counterfactuals"]
    evidence = summary["reranker_diagnostic_evidence"]
    lines = [
        "# Ursus — diagnóstico das falhas do reranker v1.5",
        "",
        f"Resultado: **{summary['result']}**  ",
        f"Casos em rank 4–5: **{summary['rank4_rank5_cases']}**  ",
        f"Expulsões do Top-3: **{summary['reranker_expulsions']}**",
        "",
        "Nenhum modelo foi treinado ou alterado. As contribuições usam valores e coeficientes reais da LogisticRegression congelada.",
        "",
        "## Classificação dos 18 recuperáveis",
        "",
    ]
    lines.extend(f"- {name}: {count}" for name, count in recovery.items())
    lines.extend([
        "",
        "## Contrafactuais aritméticos",
        "",
        "| Cenário | Hits adicionais | Top-3 |",
        "|---|---:|---:|",
        f"| Restaurar expulsões | {counter['restore_expulsions']['additional_hits']} | {counter['restore_expulsions']['top3_hit_rate']:.4%} |",
        f"| Recuperar rank 4 | {counter['recover_rank_4']['additional_hits']} | {counter['recover_rank_4']['top3_hit_rate']:.4%} |",
        f"| Recuperar rank 4–5 | {counter['recover_rank_4_and_5']['additional_hits']} | {counter['recover_rank_4_and_5']['top3_hit_rate']:.4%} |",
        f"| Combinado sem sobreposição | {counter['combined_non_overlapping']['additional_hits']} | {counter['combined_non_overlapping']['top3_hit_rate']:.4%} |",
        "",
        "## Evidência sobre hipóteses",
        "",
    ])
    for name, values in evidence.items():
        lines.append(f"- {name}: **{values['conclusion']}**")
    lines.extend([
        "",
        "## Recomendações",
        "",
    ])
    lines.extend(f"- {name}: {text}" for name, text in summary["recommendations"].items())
    lines.extend([
        "",
        "As recomendações são hipóteses para futura validação em VALIDATION; não estimam ganho futuro e não foram implementadas.",
    ])
    return "\n".join(lines) + "\n"


def write_outputs(result: dict[str, Any], report_dir: Path) -> None:
    report_dir.mkdir(parents=True, exist_ok=True)
    write_csv(result["rank45"], report_dir / "ursus_rank4_rank5_diagnosis.csv")
    write_csv(result["expulsions"], report_dir / "ursus_reranker_expulsions.csv")
    write_csv(result["contributions"], report_dir / "ursus_reranker_feature_contributions.csv")
    write_csv(result["segments"], report_dir / "ursus_reranker_family_support_analysis.csv")
    (report_dir / "ursus_reranker_failure_summary.json").write_text(
        json.dumps(result["summary"], ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (report_dir / "ursus_reranker_failure_summary.md").write_text(
        markdown_summary(result["summary"]), encoding="utf-8"
    )


def run_analysis(args: argparse.Namespace) -> dict[str, Any]:
    result = analyze(
        Path(args.dataset).resolve(), Path(args.model).resolve(),
        Path(args.taxonomy_dir).resolve(), Path(args.separability).resolve(),
        Path(args.persistent_confusions).resolve(), Path(args.taxonomy_queue).resolve(),
        Path(args.label_noise).resolve(),
    )
    write_outputs(result, Path(args.report_dir).resolve())
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Diagnose frozen Ursus v1.5 reranker Top-3 boundary failures.")
    parser.add_argument("--dataset", default=DEFAULT_DATASET)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--taxonomy-dir", default=DEFAULT_TAXONOMY_DIR)
    parser.add_argument("--separability", default=DEFAULT_SEPARABILITY)
    parser.add_argument("--persistent-confusions", default=DEFAULT_PERSISTENT)
    parser.add_argument("--taxonomy-queue", default=DEFAULT_TAXONOMY_QUEUE)
    parser.add_argument("--label-noise", default=DEFAULT_LABEL_NOISE)
    parser.add_argument("--report-dir", default=DEFAULT_REPORT_DIR)
    args = parser.parse_args()
    result = run_analysis(args)
    print(json.dumps(result["summary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
