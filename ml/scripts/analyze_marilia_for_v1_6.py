from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
from collections import Counter, defaultdict
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Iterable

import joblib
import numpy as np
import pandas as pd
from scipy import sparse
from sklearn.metrics import accuracy_score, f1_score
from sklearn.preprocessing import normalize

from ml.classifier_wrappers import (
    LearnedCandidateRerankerClassifier,
    TextFeatureBatch,
    parse_label_component_mechanism,
)
from ml.scripts.prepare_marilia_dataset import normalize_observation
from ml.scripts.train_failure_classifier_marilia_v1_3 import (
    margins_from_scores,
    stable_hash,
    top_k_from_scores,
)
from ml.scripts.build_marilia_taxonomy_v2 import content_tokens


DEFAULT_DATASET = "ml/data/human/marilia/prepared/marilia_human_v2_canonical.csv"
DEFAULT_TAXONOMY = "ml/data/human/marilia/taxonomy/canonical_taxonomy_v2.csv"
DEFAULT_MODEL = "ml/models/failure_classifier_marilia_v1_5_candidate_eval.joblib"
DEFAULT_REPORT_DIR = "ml/reports"
TARGET_MINIMUM_SUPPORT = 10
TARGET_HEALTHY_SUPPORT = 20
PRIORITY_FAMILIES = ("LATA", "ROTULO", "MANGUEIRA", "CARTAO", "OTHER_UNKNOWN")
SECONDARY_FAMILIES = ("ESTEIRA", "TRANSPORTE", "VALVULA", "FILME")
HUMAN_FIELDS = ("human_decision", "human_label", "human_comment", "reviewed_by", "reviewed_at")
MECHANISMS = {
    "FALHA", "QUEBRA", "TRAVAMENTO", "ENROSCO", "DESARME", "VAZAMENTO",
    "ROMPIMENTO", "QUEDA", "DESALINHAMENTO", "DEFORMACAO", "AMASSAMENTO",
    "COLAPSO", "ENTUPIMENTO", "PATINAMENTO", "ESCAPE", "QUEIMA", "DESGASTE",
    "VIBRACAO", "OBSTRUCAO", "SOBREAQUECIMENTO", "CURTO",
}
FOCUS_PAIRS = (
    ("ENROSCO DE ROTULOS", "FALHA DE ROTULAGEM"),
    ("FALHA DE ACUMULO NO TRANSPORTE", "FALHA DE SINCRONISMO"),
    ("ESCAPE DE ESTEIRA", "FALHA DE ESTEIRA"),
    ("FALHA DE ALIMENTACAO DE TAMPAS", "FALHA DE VIBRADOR"),
    ("FALHA DE ELO DE ESTEIRA", "QUEBRA DE ESTEIRA"),
    ("FALHA DE INSPECAO", "FALHA DE SENSOR"),
    ("FALHA ELETRONICA DA VALVULA", "FALHA DE VALVULA"),
    ("TRAVAMENTO DE ROBO", "FALHA DE ROBO"),
)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_csv(frame: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(path, index=False, encoding="utf-8-sig")


def decision_scores(classifier: Any, features: Any) -> np.ndarray:
    scores = np.asarray(classifier.decision_function(features), dtype=float)
    if scores.ndim == 1:
        scores = np.column_stack([-scores, scores])
    return scores


def minmax(values: pd.Series | np.ndarray, *, invert: bool = False) -> np.ndarray:
    array = np.asarray(values, dtype=float)
    finite = np.isfinite(array)
    output = np.zeros_like(array, dtype=float)
    if finite.any():
        low, high = float(array[finite].min()), float(array[finite].max())
        if high > low:
            output[finite] = (array[finite] - low) / (high - low)
        else:
            output[finite] = 1.0
    return 1.0 - output if invert else output


def rarity_bucket(support: int) -> str:
    if support == 1:
        return "SINGLETON"
    if support <= 3:
        return "VERY_RARE_2_3"
    if support <= 5:
        return "RARE_4_5"
    if support <= 10:
        return "LOW_SUPPORT_6_10"
    if support <= 20:
        return "MEDIUM_11_20"
    return "HEALTHY_GT20"


def normalize_text(value: str) -> str:
    return normalize_observation(value).upper()


def json_text(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def load_frozen_inputs(
    dataset_path: Path,
    taxonomy_path: Path,
    model_path: Path,
) -> tuple[pd.DataFrame, pd.DataFrame, dict[str, Any], Any, Any]:
    dataset = pd.read_csv(dataset_path, dtype=str).fillna("")
    taxonomy = pd.read_csv(taxonomy_path, dtype=str).fillna("")
    package = joblib.load(model_path)
    if len(dataset) != 4455 or dataset["classification_canonical"].nunique() != 421:
        raise RuntimeError("Unexpected canonical v2 dataset dimensions.")
    if dataset["technical_family"].nunique() != 71:
        raise RuntimeError("Unexpected technical family count.")
    if dataset.groupby("observation_norm")["split"].nunique().max() != 1:
        raise RuntimeError("Split leakage detected.")
    vectorizer = package["vectorizer"]
    classifier = package["classifier"]
    if not isinstance(classifier, LearnedCandidateRerankerClassifier):
        raise RuntimeError("Expected the frozen v1.5 learned reranker artifact.")
    return dataset, taxonomy, package, vectorizer, classifier


def frozen_inference(dataset: pd.DataFrame, vectorizer: Any, classifier: Any) -> dict[str, Any]:
    batch = vectorizer.transform(dataset["observation"].astype(str).tolist())
    if not isinstance(batch, TextFeatureBatch):
        raise RuntimeError("v1.5 vectorizer did not preserve source text.")
    matrix = batch.matrix
    scores = decision_scores(classifier, batch)
    classes = np.asarray(classifier.classes_).astype(str)
    ranked = np.argsort(scores, axis=1)[:, ::-1]
    top5 = [[str(classes[index]) for index in row[:5]] for row in ranked]
    predictions = classes[ranked[:, 0]]
    margins = margins_from_scores(scores)
    base_scores = decision_scores(classifier.base_classifier, matrix)
    base_classes = np.asarray(classifier.base_classifier.classes_).astype(str)
    flat_top1 = base_classes[np.argmax(base_scores, axis=1)]
    family_scores = decision_scores(classifier.family_classifier, matrix)
    family_classes = np.asarray(classifier.family_classifier.classes_).astype(str)
    family_top1 = family_classes[np.argmax(family_scores, axis=1)]
    normalized_matrix = normalize(matrix, norm="l2", axis=1, copy=True)
    prototype_similarity = normalized_matrix @ classifier.centroids.T
    if sparse.issparse(prototype_similarity):
        prototype_similarity = prototype_similarity.toarray()
    prototype_similarity = np.asarray(prototype_similarity, dtype=float)
    prototype_best_indices = np.argmax(prototype_similarity, axis=1)
    prototype_best_labels = classes[prototype_best_indices]
    return {
        "batch": batch, "matrix": matrix, "normalized_matrix": normalized_matrix,
        "scores": scores, "classes": classes, "ranked": ranked,
        "top5": top5, "predictions": predictions, "margins": margins,
        "flat_top1": flat_top1, "family_top1": family_top1,
        "prototype_similarity": prototype_similarity,
        "prototype_best_labels": prototype_best_labels,
        "prototype_best_similarity": prototype_similarity[np.arange(len(dataset)), prototype_best_indices],
    }


def class_separability(
    dataset: pd.DataFrame,
    inference: dict[str, Any],
    classifier: LearnedCandidateRerankerClassifier,
) -> pd.DataFrame:
    classes = inference["classes"]
    class_index = {label: index for index, label in enumerate(classes)}
    train_mask = dataset["split"].eq("TRAIN").to_numpy()
    train_labels = dataset.loc[train_mask, "classification_canonical"].astype(str).to_numpy()
    similarities = inference["prototype_similarity"][train_mask]
    centroid_similarity = np.asarray((classifier.centroids @ classifier.centroids.T).toarray(), dtype=float)
    np.fill_diagonal(centroid_similarity, -np.inf)
    rows = []
    for label in classes:
        index = class_index[label]
        label_rows = np.flatnonzero(train_labels == label)
        intra = float(similarities[label_rows, index].mean()) if len(label_rows) else 0.0
        nearest_index = int(np.argmax(centroid_similarity[index]))
        nearest_similarity = float(centroid_similarity[index, nearest_index])
        rows.append({
            "canonical_label": label,
            "family": classifier.class_to_family.get(label, "OTHER_UNKNOWN"),
            "train_support": int(len(label_rows)),
            "intra_class_similarity": round(intra, 8),
            "nearest_other_class": str(classes[nearest_index]),
            "nearest_other_class_similarity": round(nearest_similarity, 8),
            "separation_margin": round(intra - nearest_similarity, 8),
            "low_separability": bool(intra - nearest_similarity <= 0.10),
        })
    return pd.DataFrame(rows).sort_values(["separation_margin", "canonical_label"])


def canonical_mapping(taxonomy: pd.DataFrame) -> dict[str, str]:
    return dict(zip(taxonomy["original_label"].astype(str), taxonomy["suggested_canonical_label"].astype(str)))


def load_version_confusions(report_dir: Path, mapping: dict[str, str]) -> pd.DataFrame:
    frames = []
    for version in ("v1_3", "v1_4", "v1_5"):
        path = report_dir / f"failure_classifier_marilia_{version}_top_confusions.csv"
        frame = pd.read_csv(path, dtype=str).fillna("")
        count_column = "count"
        if version == "v1_3":
            frame["expected"] = frame["expected"].map(lambda value: mapping.get(value, value))
            frame["predicted"] = frame["predicted"].map(lambda value: mapping.get(value, value))
        grouped = frame.groupby(["expected", "predicted"], as_index=False)[count_column].apply(
            lambda values: sum(int(float(value)) for value in values)
        )
        grouped.rename(columns={count_column: f"{version}_count"}, inplace=True)
        frames.append(grouped)
    merged = frames[0]
    for frame in frames[1:]:
        merged = merged.merge(frame, on=["expected", "predicted"], how="outer")
    for version in ("v1_3", "v1_4", "v1_5"):
        merged[f"{version}_count"] = merged[f"{version}_count"].fillna(0).astype(int)
    return merged


def relation_lookup(review: pd.DataFrame) -> dict[tuple[str, str], str]:
    result: dict[tuple[str, str], str] = {}
    for row in review.itertuples(index=False):
        result[(str(row.original_label), str(row.suggested_canonical_label))] = str(row.relation_type)
        result[(str(row.suggested_canonical_label), str(row.original_label))] = str(row.relation_type)
    return result


def persistent_confusions(
    raw: pd.DataFrame,
    support: pd.Series,
    family_map: dict[str, str],
    centroids: Any,
    classes: np.ndarray,
    taxonomy_relations: dict[tuple[str, str], str],
) -> pd.DataFrame:
    class_index = {label: index for index, label in enumerate(classes)}
    rows = []
    max_count = max(1, int(raw[["v1_3_count", "v1_4_count", "v1_5_count"]].sum(axis=1).max()))
    for row in raw.itertuples(index=False):
        counts = [int(row.v1_3_count), int(row.v1_4_count), int(row.v1_5_count)]
        versions = sum(count > 0 for count in counts)
        total = sum(counts)
        expected, predicted = str(row.expected), str(row.predicted)
        lexical = SequenceMatcher(None, expected, predicted).ratio()
        prototype = 0.0
        if expected in class_index and predicted in class_index:
            prototype = float(
                centroids[class_index[expected]].multiply(centroids[class_index[predicted]]).sum()
            )
        semantic = max(lexical, prototype)
        expected_support, predicted_support = int(support.get(expected, 0)), int(support.get(predicted, 0))
        relation = taxonomy_relations.get((expected, predicted), "NO_RECORDED_RELATION")
        same_family = family_map.get(expected) == family_map.get(predicted)
        priority = 100 * (
            0.35 * versions / 3
            + 0.25 * math.log1p(total) / math.log1p(max_count)
            + 0.20 * semantic
            + 0.10 * float(min(expected_support, predicted_support) <= 10)
            + 0.10 * float(same_family)
        )
        if relation == "GENERIC_SPECIFIC":
            action = "GENERIC_SPECIFIC_REVIEW"
        elif versions >= 2 and semantic >= 0.70:
            action = "TAXONOMY_REVIEW"
        elif versions >= 2 and same_family:
            action = "LABEL_GUIDELINE_REVIEW"
        elif min(expected_support, predicted_support) <= 10:
            action = "COLLECT_MORE_DATA"
        elif semantic < 0.35 and not same_family:
            action = "KEEP_SEPARATE"
        else:
            action = "INSUFFICIENT_EVIDENCE"
        rows.append({
            "expected": expected, "predicted": predicted,
            "v1_3_count": counts[0], "v1_4_count": counts[1], "v1_5_count": counts[2],
            "versions_present": versions, "total_count": total,
            "same_family": same_family, "semantic_similarity": round(semantic, 8),
            "expected_support": expected_support, "predicted_support": predicted_support,
            "review_priority": round(priority, 4), "recommended_action": action,
        })
    return pd.DataFrame(rows).sort_values(
        ["review_priority", "versions_present", "total_count", "expected", "predicted"],
        ascending=[False, False, False, True, True],
    )


def textual_neighbor_evidence(dataset: pd.DataFrame, inference: dict[str, Any]) -> pd.DataFrame:
    normalized = inference["normalized_matrix"]
    train_positions = np.flatnonzero(dataset["split"].eq("TRAIN").to_numpy())
    train_features = normalized[train_positions]
    train_labels = dataset.iloc[train_positions]["classification_canonical"].astype(str).to_numpy()
    train_norms = dataset.iloc[train_positions]["observation_norm"].astype(str).to_numpy()
    rows = []
    batch_size = 192
    for start in range(0, len(dataset), batch_size):
        stop = min(len(dataset), start + batch_size)
        similarities = normalized[start:stop] @ train_features.T
        if sparse.issparse(similarities):
            similarities = similarities.toarray()
        similarities = np.asarray(similarities, dtype=float)
        for local, position in enumerate(range(start, stop)):
            same = train_norms == str(dataset.iloc[position]["observation_norm"])
            similarities[local, same] = -1.0
            limit = min(20, similarities.shape[1])
            indices = np.argpartition(similarities[local], -limit)[-limit:]
            indices = indices[np.argsort(similarities[local, indices])[::-1]]
            valid = indices[similarities[local, indices] >= 0.55]
            labels = train_labels[valid]
            counts = Counter(labels)
            majority, count = counts.most_common(1)[0] if counts else ("", 0)
            majority_sims = similarities[local, valid[labels == majority]] if count else np.asarray([])
            rows.append({
                "neighbor_majority_label": str(majority),
                "neighbor_majority_count": int(count),
                "neighbor_total_count": int(len(valid)),
                "neighbor_majority_fraction": round(count / len(valid), 8) if len(valid) else 0.0,
                "neighbor_majority_mean_similarity": round(float(majority_sims.mean()), 8) if len(majority_sims) else 0.0,
                "nearest_neighbor_similarity": round(float(similarities[local, indices[0]]), 8) if len(indices) else 0.0,
            })
    return pd.DataFrame(rows)


def possible_label_noise(
    dataset: pd.DataFrame,
    inference: dict[str, Any],
    neighbors: pd.DataFrame,
    total_support: pd.Series,
) -> tuple[pd.DataFrame, np.ndarray]:
    class_index = {label: index for index, label in enumerate(inference["classes"])}
    current = dataset["classification_canonical"].astype(str).to_numpy()
    current_indices = np.asarray([class_index[label] for label in current])
    current_similarity = inference["prototype_similarity"][np.arange(len(dataset)), current_indices]
    best = inference["prototype_best_labels"]
    best_similarity = inference["prototype_best_similarity"]
    top3 = np.asarray([values[:3] for values in inference["top5"]], dtype=object)
    flags = np.zeros(len(dataset), dtype=bool)
    reasons: list[str] = []
    for position in range(len(dataset)):
        majority = str(neighbors.iloc[position]["neighbor_majority_label"])
        strong = (
            majority
            and majority != current[position]
            and majority == best[position]
            and int(neighbors.iloc[position]["neighbor_majority_count"]) >= 3
            and float(neighbors.iloc[position]["neighbor_majority_fraction"]) >= 0.65
            and float(neighbors.iloc[position]["neighbor_majority_mean_similarity"]) >= 0.65
            and float(best_similarity[position] - current_similarity[position]) >= 0.12
            and majority in top3[position]
        )
        flags[position] = bool(strong)
        reasons.append(
            f"Neighbor majority={majority or 'NONE'}; count={int(neighbors.iloc[position]['neighbor_majority_count'])}; "
            f"fraction={float(neighbors.iloc[position]['neighbor_majority_fraction']):.3f}; "
            f"prototype best={best[position]} ({best_similarity[position]:.3f}) vs current={current[position]} ({current_similarity[position]:.3f})."
        )
    candidates = dataset.loc[flags, ["row_id", "observation", "observation_norm", "split", "classification_canonical", "technical_family"]].copy()
    candidates.rename(columns={"classification_canonical": "current_label", "technical_family": "family"}, inplace=True)
    indices = np.flatnonzero(flags)
    candidates["model_top1"] = inference["predictions"][indices]
    candidates["model_top3"] = [" | ".join(inference["top5"][index][:3]) for index in indices]
    candidates["model_margin"] = inference["margins"][indices]
    candidates["label_support"] = candidates["current_label"].map(total_support).astype(int)
    candidates["prototype_current_similarity"] = current_similarity[indices]
    candidates["prototype_best_label"] = best[indices]
    candidates["prototype_best_similarity"] = best_similarity[indices]
    for column in neighbors.columns:
        candidates[column] = neighbors.iloc[indices][column].to_numpy()
    candidates["flag"] = "POSSIBLE_HUMAN_LABEL_NOISE"
    candidates["requires_human_review"] = True
    candidates["reason"] = [reasons[index] for index in indices]
    candidates = candidates.sort_values(
        ["prototype_best_similarity", "neighbor_majority_fraction", "observation_norm"],
        ascending=[False, False, True],
    ).drop_duplicates("observation_norm", keep="first")
    return candidates, flags


def class_priority_inventory(
    dataset: pd.DataFrame,
    inference: dict[str, Any],
    separability: pd.DataFrame,
    persistent: pd.DataFrame,
    report_dir: Path,
    family_map: dict[str, str],
    noise_flags: np.ndarray,
) -> tuple[pd.DataFrame, dict[str, Any]]:
    train_support = dataset.loc[dataset["split"] == "TRAIN", "classification_canonical"].value_counts()
    validation_support = dataset.loc[dataset["split"] == "VALIDATION", "classification_canonical"].value_counts()
    test_support = dataset.loc[dataset["split"] == "TEST", "classification_canonical"].value_counts()
    total_support = dataset["classification_canonical"].value_counts()
    unique_obs = dataset.groupby("classification_canonical")["observation_norm"].nunique()
    class_report = pd.read_csv(report_dir / "failure_classifier_marilia_v1_5_classification_report.csv").set_index("class")
    top_confusions = pd.read_csv(report_dir / "failure_classifier_marilia_v1_5_top_confusions.csv")
    top_map: dict[str, tuple[str, int]] = {}
    for label, group in top_confusions.groupby("expected"):
        row = group.sort_values(["count", "predicted"], ascending=[False, True]).iloc[0]
        top_map[str(label)] = (str(row["predicted"]), int(row["count"]))
    predictions = inference["predictions"]
    expected = dataset["classification_canonical"].astype(str).to_numpy()
    train_accuracy = {}
    for label in inference["classes"]:
        mask = dataset["split"].eq("TRAIN").to_numpy() & (expected == label)
        train_accuracy[label] = float(np.mean(predictions[mask] == expected[mask])) if mask.any() else np.nan
    sep = separability.set_index("canonical_label")
    persistent_counts = persistent.groupby("expected")["total_count"].sum()
    persistent_versions = persistent.groupby("expected")["versions_present"].max()
    average_margin = pd.Series(inference["margins"]).groupby(pd.Series(expected)).mean()
    noise_count = pd.Series(expected[noise_flags]).value_counts()
    rows = []
    for label in inference["classes"]:
        metrics = class_report.loc[label]
        top_target, top_count = top_map.get(label, ("", 0))
        rows.append({
            "canonical_label": label, "family": family_map.get(label, "OTHER_UNKNOWN"),
            "train_support": int(train_support.get(label, 0)),
            "validation_support": int(validation_support.get(label, 0)),
            "test_support": int(test_support.get(label, 0)),
            "total_support": int(total_support.get(label, 0)),
            "unique_observations": int(unique_obs.get(label, 0)),
            "train_accuracy_if_available": train_accuracy[label],
            "test_accuracy_if_available": float(metrics["recall"]),
            "precision": float(metrics["precision"]), "recall": float(metrics["recall"]), "f1": float(metrics["f1"]),
            "top_confusion_target": top_target, "top_confusion_count": top_count,
            "rarity_bucket": rarity_bucket(int(total_support.get(label, 0))),
            "recommended_min_examples": TARGET_HEALTHY_SUPPORT if family_map.get(label) in PRIORITY_FAMILIES or float(metrics["f1"]) < 0.5 else TARGET_MINIMUM_SUPPORT,
            "examples_missing_to_target": 0,
            "missing_to_10": max(0, TARGET_MINIMUM_SUPPORT - int(total_support.get(label, 0))),
            "missing_to_20": max(0, TARGET_HEALTHY_SUPPORT - int(total_support.get(label, 0))),
            "separation_margin": float(sep.loc[label, "separation_margin"]),
            "persistent_confusion_count": int(persistent_counts.get(label, 0)),
            "persistent_versions": int(persistent_versions.get(label, 0)),
            "average_model_margin": float(average_margin.get(label, 0.0)),
            "possible_label_noise_count": int(noise_count.get(label, 0)),
        })
    frame = pd.DataFrame(rows)
    frame["examples_missing_to_target"] = (
        frame["recommended_min_examples"] - frame["total_support"]
    ).clip(lower=0).astype(int)
    frequency = minmax(np.log1p(frame["total_support"]))
    low_support = 1.0 - np.minimum(frame["total_support"].to_numpy() / 20.0, 1.0)
    error_rate = 1.0 - frame["recall"].fillna(0).to_numpy()
    confusion = minmax(np.log1p(frame["persistent_confusion_count"]))
    proximity = minmax(frame["separation_margin"], invert=True)
    macro_impact = 1.0 - frame["f1"].fillna(0).to_numpy()
    priority_family = frame["family"].isin(PRIORITY_FAMILIES).astype(float).to_numpy()
    low_margin = minmax(frame["average_model_margin"], invert=True)
    discrepancy = np.minimum(frame["possible_label_noise_count"].to_numpy(), 1)
    automation_opportunity = frequency * low_margin
    frame["review_priority"] = np.round(100 * (
        0.15 * frequency + 0.15 * low_support + 0.15 * error_rate
        + 0.10 * confusion + 0.10 * proximity + 0.10 * macro_impact
        + 0.10 * priority_family + 0.05 * low_margin + 0.05 * discrepancy
        + 0.05 * automation_opportunity
    ), 4)
    requested = [
        "canonical_label", "family", "train_support", "validation_support", "test_support",
        "total_support", "unique_observations", "train_accuracy_if_available",
        "test_accuracy_if_available", "precision", "recall", "f1", "top_confusion_target",
        "top_confusion_count", "rarity_bucket", "review_priority",
        "recommended_min_examples", "examples_missing_to_target",
        "missing_to_10", "missing_to_20", "separation_margin",
        "persistent_confusion_count", "persistent_versions", "average_model_margin",
        "possible_label_noise_count",
    ]
    frame = frame[requested].sort_values(["review_priority", "canonical_label"], ascending=[False, True])
    summary = {
        "priority_score_formula": {
            "operational_frequency_from_observed_total_support": 0.15,
            "low_support": 0.15, "test_error_rate_frozen_v1_5": 0.15,
            "persistent_confusion": 0.10, "semantic_proximity_inverse_separation": 0.10,
            "macro_f1_class_impact": 0.10, "priority_family": 0.10,
            "low_model_margin": 0.05, "possible_label_discrepancy": 0.05,
            "automation_opportunity_frequency_x_low_margin": 0.05,
        },
        "operational_criticality_weight": "ABSENT_FROM_DATASET_NOT_INVENTED",
    }
    return frame, summary


def priority_families_report(
    dataset: pd.DataFrame,
    inventory: pd.DataFrame,
    separability: pd.DataFrame,
    report_dir: Path,
) -> pd.DataFrame:
    errors = pd.read_csv(report_dir / "failure_classifier_marilia_v1_5_errors.csv", dtype=str).fillna("")
    sep = separability.set_index("canonical_label")
    rows = []
    for family in PRIORITY_FAMILIES:
        family_data = dataset[dataset["technical_family"] == family]
        labels = sorted(family_data["classification_canonical"].unique())
        family_test = family_data[family_data["split"] == "TEST"]
        family_errors = errors[errors["expected_family"] == family]
        correct = len(family_test) - len(family_errors)
        family_accuracy = correct / len(family_test) if len(family_test) else None
        for label in labels:
            item = inventory[inventory["canonical_label"] == label].iloc[0]
            examples = family_data[family_data["classification_canonical"] == label]["observation"].drop_duplicates().head(3).tolist()
            internal = family_errors[
                (family_errors["expected"] == label) & (family_errors["predicted_family"] == family)
            ]["predicted"].value_counts()
            nearest = str(sep.loc[label, "nearest_other_class"])
            tokens = set(content_tokens(label))
            generic = label.startswith("FALHA DE ") and len(tokens) <= 2
            issue_parts = []
            if int(item["total_support"]) <= 10: issue_parts.append("LOW_SUPPORT")
            if float(item["separation_margin"]) <= 0.10: issue_parts.append("LOW_SEPARABILITY")
            if generic: issue_parts.append("GENERIC_LABEL")
            if int(item["top_confusion_count"]) > 0: issue_parts.append("OBSERVED_CONFUSION")
            rows.append({
                "family": family, "class_label": label,
                "class_support": int(item["total_support"]), "train_support": int(item["train_support"]),
                "examples": " || ".join(examples), "class_test_accuracy": item["test_accuracy_if_available"],
                "class_f1": item["f1"], "family_test_rows": int(len(family_test)),
                "family_accuracy": family_accuracy,
                "family_macro_f1": float(f1_score(
                    family_test["classification_canonical"],
                    pd.concat([
                        family_test[["row_id"]].assign(predicted=family_test["classification_canonical"]).set_index("row_id")["predicted"],
                    ], axis=1).iloc[:, 0], average="macro", zero_division=0
                )) if False else None,
                "internal_confusion_targets": " | ".join(f"{target}:{count}" for target, count in internal.items()),
                "generic_class": generic, "specific_class": not generic,
                "nearest_semantic_class": nearest,
                "nearest_semantic_similarity": float(sep.loc[label, "nearest_other_class_similarity"]),
                "possible_inconsistency": bool(float(item["separation_margin"]) <= 0 and int(item["top_confusion_count"]) > 0),
                "definition_quality": "REQUIRES_SPECIALIST" if int(item["total_support"]) < 3 or generic else "DATA_SUPPORTED_BUT_REVIEW_RECOMMENDED",
                "main_problems": " | ".join(issue_parts) or "NO_STRONG_DATA_SIGNAL",
                "missing_to_10": int(item["missing_to_10"]), "missing_to_20": int(item["missing_to_20"]),
            })
    frame = pd.DataFrame(rows)
    family_metrics = pd.read_csv(report_dir / "failure_classifier_marilia_v1_5_family_analysis.csv").set_index("family")
    frame["family_macro_f1"] = frame["family"].map(family_metrics["macro_f1"])
    return frame.sort_values(["family", "class_support", "class_label"], ascending=[True, True, True])


def other_unknown_review(
    dataset: pd.DataFrame,
    inventory: pd.DataFrame,
    separability: pd.DataFrame,
) -> pd.DataFrame:
    known_families = sorted(set(dataset["technical_family"]) - {"OTHER_UNKNOWN"}, key=len, reverse=True)
    sep = separability.set_index("canonical_label")
    rows = []
    unknown = inventory[inventory["family"] == "OTHER_UNKNOWN"]
    for item in unknown.itertuples(index=False):
        label = str(item.canonical_label)
        component, mechanism = parse_label_component_mechanism(label)
        normalized_component = component.replace("_", " ")
        direct = next((family for family in known_families if family.replace("_", " ") in normalized_component), "")
        nearest = str(sep.loc[label, "nearest_other_class"])
        nearest_family = str(inventory.set_index("canonical_label").loc[nearest, "family"])
        nearest_similarity = float(sep.loc[label, "nearest_other_class_similarity"])
        if direct:
            candidate, confidence = direct, "HIGH"
            reason = f"Component tokens explicitly match existing family {direct}; analytical suggestion only."
        elif nearest_family != "OTHER_UNKNOWN" and nearest_similarity >= 0.45:
            candidate, confidence = nearest_family, "MEDIUM"
            reason = f"Nearest TRAIN centroid is {nearest} ({nearest_similarity:.3f}) in {nearest_family}."
        elif nearest_family != "OTHER_UNKNOWN" and nearest_similarity >= 0.25:
            candidate, confidence = nearest_family, "LOW"
            reason = f"Weak nearest-centroid evidence: {nearest} ({nearest_similarity:.3f})."
        else:
            candidate, confidence = "UNKNOWN", "INSUFFICIENT"
            reason = "No reliable component-token or TRAIN-centroid family evidence."
        examples = dataset[dataset["classification_canonical"] == label]["observation"].drop_duplicates().head(3)
        rows.append({
            "label": label, "support": int(item.total_support),
            "example_observations": " || ".join(examples), "candidate_family": candidate,
            "candidate_component": component, "candidate_mechanism": mechanism,
            "confidence": confidence, "requires_human_review": True, "reason": reason,
        })
    return pd.DataFrame(rows).sort_values(["support", "label"], ascending=[False, True])


def singleton_report(
    dataset: pd.DataFrame,
    inventory: pd.DataFrame,
    classifier: LearnedCandidateRerankerClassifier,
    classes: np.ndarray,
    noise_labels: set[str],
) -> pd.DataFrame:
    singletons = inventory[inventory["total_support"] == 1]
    class_index = {label: index for index, label in enumerate(classes)}
    centroid_similarity = np.asarray((classifier.centroids @ classifier.centroids.T).toarray(), dtype=float)
    np.fill_diagonal(centroid_similarity, -np.inf)
    rows = []
    for item in singletons.itertuples(index=False):
        label = str(item.canonical_label)
        source = dataset[dataset["classification_canonical"] == label].iloc[0]
        index = class_index[label]
        nearest_indices = np.argsort(centroid_similarity[index])[::-1][:3]
        nearest = [(str(classes[other]), float(centroid_similarity[index, other])) for other in nearest_indices]
        duplicate = any(
            similarity >= 0.85 or SequenceMatcher(None, label, other).ratio() >= 0.90
            for other, similarity in nearest
        )
        rows.append({
            "label": label, "observation": source["observation"], "family": source["technical_family"],
            "nearest_class_1": nearest[0][0], "similarity_1": nearest[0][1],
            "nearest_class_2": nearest[1][0], "similarity_2": nearest[1][1],
            "nearest_class_3": nearest[2][0], "similarity_3": nearest[2][1],
            "possible_duplicate_label": duplicate, "possible_label_noise": label in noise_labels,
            "recommended_action": "TAXONOMY_REVIEW" if duplicate else "COLLECT_NEW_REAL_CASES",
            "requires_human_review": True,
        })
    frame = pd.DataFrame(rows)
    if len(frame) != 147:
        raise RuntimeError(f"Expected 147 total-support singletons, found {len(frame)}")
    return frame.sort_values(["possible_duplicate_label", "family", "label"], ascending=[False, True, True])


def persistent_pair_maps(persistent: pd.DataFrame) -> tuple[dict[tuple[str, str], int], set[tuple[str, str]]]:
    counts = {(str(row.expected), str(row.predicted)): int(row.total_count) for row in persistent.itertuples(index=False)}
    recurring = {
        (str(row.expected), str(row.predicted))
        for row in persistent.itertuples(index=False) if int(row.versions_present) >= 2
    }
    return counts, recurring


def build_review_candidates(
    dataset: pd.DataFrame,
    inference: dict[str, Any],
    inventory: pd.DataFrame,
    noise_flags: np.ndarray,
    persistent: pd.DataFrame,
    seed: int,
) -> pd.DataFrame:
    total_support = dataset["classification_canonical"].value_counts()
    inventory_index = inventory.set_index("canonical_label")
    pair_counts, recurring = persistent_pair_maps(persistent)
    scores = inference["scores"]
    shifted = scores - scores.max(axis=1, keepdims=True)
    probabilities = np.exp(shifted[:, :])
    probabilities /= probabilities.sum(axis=1, keepdims=True)
    top_probabilities = np.take_along_axis(probabilities, inference["ranked"][:, :10], axis=1)
    entropy = -np.sum(top_probabilities * np.log(np.maximum(top_probabilities, 1e-12)), axis=1) / math.log(10)
    margin_scale = max(float(np.quantile(inference["margins"], 0.95)), 1e-9)
    uncertainty = 0.6 * (1.0 - np.minimum(inference["margins"] / margin_scale, 1.0)) + 0.4 * np.clip(entropy, 0.0, 1.0)
    prototype_rep = np.clip(inference["prototype_best_similarity"], 0.0, 1.0)
    rows = []
    for position, source in enumerate(dataset.itertuples(index=False)):
        current = str(source.classification_canonical)
        top = inference["top5"][position]
        pair_candidates = [(current, top[0]), (current, top[1])]
        persistent_count = max(pair_counts.get(pair, 0) for pair in pair_candidates)
        persistent_component = math.log1p(persistent_count) / math.log1p(max(pair_counts.values()) or 1)
        support = int(total_support[current])
        rarity = 1.0 - min(support / 20.0, 1.0)
        disagreements = [
            inference["flat_top1"][position] != inference["predictions"][position],
            inference["family_top1"][position] != str(source.technical_family),
            inference["prototype_best_labels"][position] != current,
        ]
        disagreement = float(np.mean(disagreements))
        persistent_description = ""
        for pair in pair_candidates:
            if pair in recurring:
                persistent_description = f"{pair[0]} -> {pair[1]} ({pair_counts[pair]})"
                break
        reasons = []
        if uncertainty[position] >= 0.65: reasons.append("HIGH_UNCERTAINTY")
        if rarity >= 0.70: reasons.append("RARE_CLASS")
        if persistent_count: reasons.append("PERSISTENT_CONFUSION")
        if disagreement >= 2 / 3: reasons.append("MODEL_PROTOTYPE_FAMILY_DISAGREEMENT")
        if noise_flags[position]: reasons.append("POSSIBLE_LABEL_NOISE")
        rows.append({
            "observation_norm": str(source.observation_norm), "observation": str(source.observation),
            "current_label": current, "family": str(source.technical_family),
            "train_support": int(inventory_index.loc[current, "train_support"]),
            "rarity_bucket": rarity_bucket(support),
            "top1": top[0], "top1_score": float(scores[position, inference["ranked"][position, 0]]),
            "top2": top[1], "top2_score": float(scores[position, inference["ranked"][position, 1]]),
            "top3": top[2], "top3_score": float(scores[position, inference["ranked"][position, 2]]),
            "margin_top1_top2": float(inference["margins"][position]),
            "prototype_best_label": str(inference["prototype_best_labels"][position]),
            "prototype_similarity": float(inference["prototype_best_similarity"][position]),
            "persistent_confusion": persistent_description,
            "possible_label_noise": bool(noise_flags[position]),
            "uncertainty_component": float(uncertainty[position]),
            "rarity_component": rarity, "persistent_component": persistent_component,
            "representativeness_component": float(prototype_rep[position]),
            "disagreement_component": disagreement,
            "review_reason": " | ".join(reasons) or "DIVERSITY_COVERAGE",
            "seed_tiebreak": stable_hash(str(source.observation_norm), seed),
        })
    frame = pd.DataFrame(rows)
    # One row per normalized observation; labels are already conflict-free.
    frame = frame.sort_values(["observation_norm", "seed_tiebreak"]).drop_duplicates("observation_norm", keep="first")
    return frame.reset_index(drop=True)


def diversified_queue(candidates: pd.DataFrame, top_n: int) -> pd.DataFrame:
    remaining = candidates.copy()
    selected_rows: list[pd.Series] = []
    class_counts: Counter[str] = Counter()
    family_counts: Counter[str] = Counter()
    count = min(top_n, len(remaining))
    for _ in range(count):
        class_diversity = remaining["current_label"].map(lambda value: 1.0 / (1.0 + class_counts[str(value)]))
        family_diversity = remaining["family"].map(lambda value: 1.0 / (1.0 + family_counts[str(value)]))
        diversity = 0.6 * class_diversity + 0.4 * family_diversity
        dynamic = (
            30 * remaining["uncertainty_component"]
            + 20 * remaining["rarity_component"]
            + 20 * remaining["persistent_component"]
            + 15 * remaining["representativeness_component"]
            + 10 * remaining["disagreement_component"]
            + 5 * diversity
        ).clip(0, 100)
        best_index = (
            remaining.assign(_score=dynamic)
            .sort_values(["_score", "seed_tiebreak", "observation_norm"], ascending=[False, True, True])
            .index[0]
        )
        row = remaining.loc[best_index].copy()
        row["active_learning_score"] = round(float(dynamic.loc[best_index]), 4)
        selected_rows.append(row)
        class_counts[str(row["current_label"])] += 1
        family_counts[str(row["family"])] += 1
        remaining = remaining.drop(index=best_index)
    queue = pd.DataFrame(selected_rows).reset_index(drop=True)
    queue.insert(0, "priority_rank", np.arange(1, len(queue) + 1))
    for field in HUMAN_FIELDS:
        queue[field] = ""
    columns = [
        "priority_rank", "active_learning_score", "observation", "current_label", "family",
        "train_support", "rarity_bucket", "top1", "top1_score", "top2", "top2_score",
        "top3", "top3_score", "margin_top1_top2", "prototype_best_label",
        "prototype_similarity", "persistent_confusion", "possible_label_noise", "review_reason",
        *HUMAN_FIELDS,
    ]
    return queue[columns]


def queue_coverage(queue: pd.DataFrame, sizes: Iterable[int]) -> pd.DataFrame:
    rows = []
    for size in sizes:
        subset = queue.head(size)
        counts = subset["family"].value_counts().sort_index().to_dict()
        rows.append({
            "queue": f"TOP{size}", "rows": int(len(subset)),
            "families_represented": int(subset["family"].nunique()),
            "classes_represented": int(subset["current_label"].nunique()),
            "singletons": int(subset["rarity_bucket"].eq("SINGLETON").sum()),
            "classes_le_3_rows": int(subset["rarity_bucket"].isin(["SINGLETON", "VERY_RARE_2_3"]).sum()),
            "classes_le_10_rows": int((~subset["rarity_bucket"].isin(["MEDIUM_11_20", "HEALTHY_GT20"])).sum()),
            "classes_le_3_represented": int(subset.loc[subset["rarity_bucket"].isin(["SINGLETON", "VERY_RARE_2_3"]), "current_label"].nunique()),
            "classes_le_10_represented": int(subset.loc[~subset["rarity_bucket"].isin(["MEDIUM_11_20", "HEALTHY_GT20"]), "current_label"].nunique()),
            "persistent_confusions_covered": int(subset.loc[subset["persistent_confusion"].ne(""), "persistent_confusion"].nunique()),
            "possible_label_noise_rows": int(subset["possible_label_noise"].astype(bool).sum()),
            "family_distribution": json_text({str(key): int(value) for key, value in counts.items()}),
        })
    return pd.DataFrame(rows)


def data_collection_plan(inventory: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for item in inventory[inventory["total_support"] < 20].itertuples(index=False):
        target = 20 if float(item.review_priority) >= 60 or str(item.family) in PRIORITY_FAMILIES else 10
        missing = max(0, target - int(item.total_support))
        why = []
        if int(item.total_support) <= 3: why.append("VERY_LOW_SUPPORT")
        if float(item.separation_margin) <= 0.10: why.append("LOW_SEPARABILITY")
        if int(item.persistent_confusion_count) > 0: why.append("PERSISTENT_CONFUSION")
        if str(item.family) in PRIORITY_FAMILIES: why.append("PRIORITY_FAMILY")
        if int(item.possible_label_noise_count) > 0: why.append("POSSIBLE_LABEL_NOISE")
        if int(item.possible_label_noise_count) > 0:
            strategy = "REVIEW_EXISTING_HISTORY"
        elif int(item.persistent_confusion_count) > 0 and float(item.separation_margin) <= 0.10:
            strategy = "REVIEW_LABEL_DEFINITION"
        elif str(item.family) == "OTHER_UNKNOWN":
            strategy = "FAMILY_REVIEW"
        elif int(item.total_support) <= 10:
            strategy = "COLLECT_NEW_REAL_CASES"
        else:
            strategy = "REVIEW_EXISTING_HISTORY"
        rows.append({
            "class": item.canonical_label, "family": item.family,
            "current_support": int(item.total_support), "target_support": target,
            "missing_examples": missing, "priority": float(item.review_priority),
            "why": " | ".join(why) or "BELOW_HEALTHY_SUPPORT",
            "recommended_collection_strategy": strategy,
        })
    return pd.DataFrame(rows).sort_values(["priority", "missing_examples", "class"], ascending=[False, False, True])


def taxonomy_review_queue(
    persistent: pd.DataFrame,
    separability: pd.DataFrame,
    inventory: pd.DataFrame,
    v15_taxonomy_review: pd.DataFrame,
) -> pd.DataFrame:
    support = inventory.set_index("canonical_label")["total_support"]
    margins = separability.set_index("canonical_label")["separation_margin"]
    pairs: dict[tuple[str, str], dict[str, Any]] = {}
    for row in persistent.itertuples(index=False):
        key = (str(row.expected), str(row.predicted))
        pairs[key] = {
            "relation": "PERSISTENT_CONFUSION", "confusion_count": int(row.total_count),
            "semantic_similarity": float(row.semantic_similarity),
            "recommended_action": str(row.recommended_action),
            "confidence": "HIGH" if int(row.versions_present) >= 2 else "MEDIUM",
        }
    for row in v15_taxonomy_review.itertuples(index=False):
        key = (str(row.expected), str(row.predicted))
        current = pairs.get(key, {})
        current.update({
            "relation": str(row.relation_type),
            "confusion_count": max(int(current.get("confusion_count", 0)), int(row.confusion_count)),
            "semantic_similarity": max(float(current.get("semantic_similarity", 0)), float(row.similarity_score)),
            "recommended_action": str(row.recommended_action),
            "confidence": "HIGH" if int(row.confusion_count) >= 2 else "MEDIUM",
        })
        pairs[key] = current
    rows = []
    for (left, right), data in pairs.items():
        rows.append({
            "label_a": left, "label_b": right, "relation": data["relation"],
            "support_a": int(support.get(left, 0)), "support_b": int(support.get(right, 0)),
            "confusion_count": int(data["confusion_count"]),
            "semantic_similarity": float(data["semantic_similarity"]),
            "separation_margin": float(min(margins.get(left, 0), margins.get(right, 0))),
            "recommended_action": data["recommended_action"], "confidence": data["confidence"],
            "human_decision": "", "human_canonical_label": "", "human_comment": "",
        })
    return pd.DataFrame(rows).sort_values(
        ["confusion_count", "semantic_similarity", "label_a", "label_b"],
        ascending=[False, False, True, True],
    )


def support_anomaly_analysis(inventory: pd.DataFrame, separability: pd.DataFrame) -> dict[str, Any]:
    joined = inventory.merge(
        separability[["canonical_label", "intra_class_similarity", "nearest_other_class_similarity"]],
        on="canonical_label", how="left",
    )
    result = {}
    for name, low, high in (("support_4_5", 4, 5), ("support_6_10", 6, 10)):
        group = joined[joined["train_support"].between(low, high)]
        result[name] = {
            "classes": int(len(group)),
            "mean_test_accuracy": round(float(group["test_accuracy_if_available"].mean()), 8),
            "mean_intra_similarity": round(float(group["intra_class_similarity"].mean()), 8),
            "mean_textual_diversity_proxy": round(float((1 - group["intra_class_similarity"]).mean()), 8),
            "mean_nearest_other_similarity": round(float(group["nearest_other_class_similarity"].mean()), 8),
            "mean_separation_margin": round(float(group["separation_margin"].mean()), 8),
            "generic_label_share": round(float(group["canonical_label"].map(lambda value: value.startswith("FALHA DE ") and len(content_tokens(value)) <= 2).mean()), 8),
            "families": int(group["family"].nunique()),
            "other_unknown_share": round(float(group["family"].eq("OTHER_UNKNOWN").mean()), 8),
            "persistent_confusion_classes": int((group["persistent_confusion_count"] > 0).sum()),
        }
    return result


def token_summary(observations: Iterable[str], limit: int = 8) -> list[str]:
    stop = {"DE", "DA", "DO", "DAS", "DOS", "E", "A", "O", "NA", "NO", "EM", "PARA", "COM", "FOI", "DO", "UMA", "UM"}
    counts: Counter[str] = Counter()
    for text in observations:
        counts.update(token for token in normalize_text(text).split() if len(token) >= 4 and token not in stop and not token.isdigit())
    return [token for token, _ in counts.most_common(limit)]


def write_labeling_guide(
    path: Path,
    dataset: pd.DataFrame,
    persistent: pd.DataFrame,
    anomaly: dict[str, Any],
    priority_formula: dict[str, Any],
) -> None:
    pairs = list(FOCUS_PAIRS)
    for row in persistent.head(25).itertuples(index=False):
        pair = (str(row.expected), str(row.predicted))
        if pair not in pairs and len(pairs) < 25:
            pairs.append(pair)
    lines = [
        "# Guia inicial de rotulagem — preparação Ursus v1.6", "",
        "> Este guia é inferido exclusivamente dos apontamentos existentes. Não substitui a definição de um especialista.", "",
        "## Fórmula de prioridade de classes", "",
        "`priority_score` usa frequência observada (15%), baixo suporte (15%), erro congelado v1.5 (15%), confusão persistente (10%), proximidade semântica (10%), impacto por F1 da classe (10%), família prioritária (10%), margem baixa (5%), possível discrepância (5%) e oportunidade de automação derivada de frequência × margem (5%).", "",
        "Não existe criticidade operacional no dataset; nenhum peso de criticidade foi inventado.", "",
        "## Fórmula de active learning", "",
        "`active_learning_score = 30% uncertainty + 20% rarity + 20% persistent_confusion + 15% representativeness + 10% disagreement + 5% diversity_adjustment`.", "",
        "## Anomalia de suporte 6–10", "", "```json", json.dumps(anomaly, ensure_ascii=False, indent=2), "```", "",
        "## Pares prioritários", "",
    ]
    for left, right in pairs:
        left_rows = dataset[dataset["classification_canonical"] == left]
        right_rows = dataset[dataset["classification_canonical"] == right]
        left_examples = left_rows["observation"].drop_duplicates().head(3).tolist()
        right_examples = right_rows["observation"].drop_duplicates().head(3).tolist()
        left_terms, right_terms = token_summary(left_rows["observation"]), token_summary(right_rows["observation"])
        left_unique = [term for term in left_terms if term not in right_terms]
        right_unique = [term for term in right_terms if term not in left_terms]
        enough = len(left_rows) >= 3 and len(right_rows) >= 3
        lines.extend([
            f"### {left} vs {right}", "",
            f"- Definição inferida de `{left}`: " + (f"observações frequentemente mencionam {', '.join(left_terms[:5])}." if enough and left_terms else "Definição requer especialista."),
            f"- Definição inferida de `{right}`: " + (f"observações frequentemente mencionam {', '.join(right_terms[:5])}." if enough and right_terms else "Definição requer especialista."),
            f"- Exemplos positivos `{left}`: " + (" | ".join(left_examples) if left_examples else "sem exemplos"),
            f"- Exemplos positivos `{right}`: " + (" | ".join(right_examples) if right_examples else "sem exemplos"),
            f"- Como diferenciar nos dados atuais: termos mais exclusivos de `{left}`: {', '.join(left_unique[:5]) or 'evidência insuficiente'}; de `{right}`: {', '.join(right_unique[:5]) or 'evidência insuficiente'}.",
            "- Casos ambíguos: revisar quando a observação descreve simultaneamente mecanismo, causa e efeito, ou quando não explicita qual deles é o modo principal.", "",
        ])
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare frozen Ursus v1.6 data diagnosis and active-learning queues without training.")
    parser.add_argument("--dataset", default=DEFAULT_DATASET)
    parser.add_argument("--taxonomy", default=DEFAULT_TAXONOMY)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--report-dir", default=DEFAULT_REPORT_DIR)
    parser.add_argument("--top-n", type=int, default=500)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    if args.top_n < 500:
        raise ValueError("--top-n must be at least 500 to produce TOP100/TOP250/TOP500.")

    dataset_path, taxonomy_path, model_path = Path(args.dataset).resolve(), Path(args.taxonomy).resolve(), Path(args.model).resolve()
    report_dir = Path(args.report_dir).resolve()
    report_dir.mkdir(parents=True, exist_ok=True)
    protected_hashes = {
        "dataset": sha256_file(dataset_path), "taxonomy": sha256_file(taxonomy_path), "model": sha256_file(model_path)
    }
    dataset, taxonomy, package, vectorizer, classifier = load_frozen_inputs(dataset_path, taxonomy_path, model_path)
    inference = frozen_inference(dataset, vectorizer, classifier)
    classes = inference["classes"]
    family_map = {label: classifier.class_to_family.get(label, "OTHER_UNKNOWN") for label in classes}
    total_support = dataset["classification_canonical"].value_counts()

    separability = class_separability(dataset, inference, classifier)
    mapping = canonical_mapping(taxonomy)
    raw_confusions = load_version_confusions(report_dir, mapping)
    taxonomy_candidates = pd.read_csv(report_dir / "failure_classifier_marilia_v1_4_taxonomy_candidates.csv", dtype=str).fillna("")
    persistent = persistent_confusions(
        raw_confusions, total_support, family_map, classifier.centroids, classes,
        relation_lookup(taxonomy_candidates),
    )
    neighbors = textual_neighbor_evidence(dataset, inference)
    noise, noise_flags = possible_label_noise(dataset, inference, neighbors, total_support)
    inventory, analysis_meta = class_priority_inventory(
        dataset, inference, separability, persistent, report_dir, family_map, noise_flags,
    )
    families = priority_families_report(dataset, inventory, separability, report_dir)
    other_unknown = other_unknown_review(dataset, inventory, separability)
    singleton = singleton_report(dataset, inventory, classifier, classes, set(noise["current_label"]) if not noise.empty else set())
    candidates = build_review_candidates(dataset, inference, inventory, noise_flags, persistent, args.seed)
    queue = diversified_queue(candidates, args.top_n)
    family_queues = {
        family: diversified_queue(candidates[candidates["family"] == family], 100)
        for family in PRIORITY_FAMILIES
    }
    coverage = queue_coverage(queue, (100, 250, 500))
    collection = data_collection_plan(inventory)
    v15_taxonomy = pd.read_csv(report_dir / "failure_classifier_marilia_v1_5_taxonomy_priority_review.csv", dtype=str).fillna("")
    taxonomy_queue = taxonomy_review_queue(persistent, separability, inventory, v15_taxonomy)
    anomaly = support_anomaly_analysis(inventory, separability)

    outputs = {
        "ursus_v1_6_class_inventory.csv": inventory,
        "ursus_v1_6_priority_families.csv": families,
        "ursus_v1_6_other_unknown_review.csv": other_unknown,
        "ursus_v1_6_persistent_confusions.csv": persistent,
        "ursus_v1_6_possible_label_noise.csv": noise,
        "ursus_v1_6_human_review_queue.csv": queue,
        "ursus_v1_6_human_review_top100.csv": queue.head(100),
        "ursus_v1_6_human_review_top250.csv": queue.head(250),
        "ursus_v1_6_human_review_top500.csv": queue.head(500),
        "ursus_v1_6_review_lata.csv": family_queues["LATA"],
        "ursus_v1_6_review_rotulo.csv": family_queues["ROTULO"],
        "ursus_v1_6_review_mangueira.csv": family_queues["MANGUEIRA"],
        "ursus_v1_6_review_cartao.csv": family_queues["CARTAO"],
        "ursus_v1_6_review_other_unknown.csv": family_queues["OTHER_UNKNOWN"],
        "ursus_v1_6_active_learning_coverage.csv": coverage,
        "ursus_v1_6_data_collection_plan.csv": collection,
        "ursus_v1_6_singleton_review.csv": singleton,
        "ursus_v1_6_class_separability.csv": separability,
        "ursus_v1_6_taxonomy_review_queue.csv": taxonomy_queue,
    }
    for name, frame in outputs.items():
        write_csv(frame, report_dir / name)
    guide_path = report_dir / "ursus_v1_6_labeling_guide.md"
    write_labeling_guide(guide_path, dataset, persistent, anomaly, analysis_meta["priority_score_formula"])

    support_counts = total_support
    summary = {
        "analysis_version": "ursus-v1.6-data-diagnosis-v1",
        "seed": args.seed, "top_n": args.top_n,
        "no_training_performed": True, "model_modified": False,
        "test_usage": "retrospective frozen v1.3/v1.4/v1.5 reports and frozen v1.5 inference only; no fitting or rule selection",
        "dataset": {"rows": int(len(dataset)), "classes": int(len(classes)), "families": int(dataset["technical_family"].nunique())},
        "support_total": {
            "singletons": int((support_counts == 1).sum()), "le_3": int((support_counts <= 3).sum()),
            "le_5": int((support_counts <= 5).sum()), "le_10": int((support_counts <= 10).sum()),
            "le_20": int((support_counts <= 20).sum()), "gt_20": int((support_counts > 20).sum()),
            "missing_to_10": int((TARGET_MINIMUM_SUPPORT - support_counts).clip(lower=0).sum()),
            "missing_to_20": int((TARGET_HEALTHY_SUPPORT - support_counts).clip(lower=0).sum()),
        },
        **analysis_meta,
        "active_learning_score_formula": {
            "uncertainty": 0.30, "rarity": 0.20, "persistent_confusion": 0.20,
            "representativeness": 0.15, "disagreement": 0.10, "dynamic_diversity_adjustment": 0.05,
        },
        "possible_label_noise_rows": int(len(noise)),
        "persistent_confusion_pairs": int((persistent["versions_present"] >= 2).sum()),
        "taxonomy_review_pairs": int(len(taxonomy_queue)),
        "other_unknown_classes": int(len(other_unknown)),
        "support_6_10_anomaly": anomaly,
        "queue_coverage": coverage.to_dict(orient="records"),
        "protected_hashes_before": protected_hashes,
    }
    after_hashes = {
        "dataset": sha256_file(dataset_path), "taxonomy": sha256_file(taxonomy_path), "model": sha256_file(model_path)
    }
    summary["protected_hashes_after"] = after_hashes
    summary["protected_files_unchanged"] = protected_hashes == after_hashes
    summary_path = report_dir / "ursus_v1_6_analysis_summary.json"
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
