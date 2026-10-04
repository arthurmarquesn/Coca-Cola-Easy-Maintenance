from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
from dataclasses import asdict
from pathlib import Path
from typing import Any, Iterable

import joblib
import numpy as np
import pandas as pd

from ml.experimental_reranker import (
    ALL_FEATURE_NAMES,
    BASE_FEATURE_NAMES,
    ExperimentalCandidateRerankerClassifier,
    ExperimentalFeatureConfig,
    transform_candidate_features,
)
from ml.scripts.analyze_ursus_suggestion_quality import (
    expected_ranks,
    ranked_indices,
    sha256_file,
    support_bucket,
)
from ml.scripts.train_failure_classifier_marilia_v1_5 import (
    FULL_FEATURE_INDICES,
    RANDOM_SEED,
    build_class_to_family,
    build_oof_ranker_data,
    decision_scores,
    train_ranker,
)


EXPERIMENT_VERSION = "ursus-reranker-v1.6-experimental"
CREATED_AT = "2026-10-04T00:00:00-03:00"
DEFAULT_DATASET = "ml/data/human/marilia/prepared/marilia_human_v2_canonical.csv"
DEFAULT_TAXONOMY = "ml/data/human/marilia/taxonomy/canonical_taxonomy_v2.csv"
DEFAULT_BASELINE_MODEL = "ml/models/failure_classifier_marilia_v1_5_candidate_eval.joblib"
DEFAULT_MODEL_OUTPUT = "ml/models/ursus_reranker_v16_experimental_locked.joblib"
DEFAULT_REPORT_DIR = "ml/reports"
DEFAULT_LOCK_CONFIG = "ml/reports/ursus_reranker_v16_locked_config.json"
DEFAULT_PROTECTED_MODELS = (
    "ml/models/failure_classifier_real_v1_2_eval.joblib",
    "ml/models/failure_classifier_marilia_v1_3_candidate.joblib",
    "ml/models/failure_classifier_marilia_v1_3_candidate_eval.joblib",
    "ml/models/failure_classifier_marilia_v1_4_candidate.joblib",
    "ml/models/failure_classifier_marilia_v1_4_candidate_eval.joblib",
    "ml/models/failure_classifier_marilia_v1_5_candidate.joblib",
    "ml/models/failure_classifier_marilia_v1_5_candidate_eval.joblib",
)
OUTPUT_FILES = (
    "ursus_reranker_v16_validation_candidates.csv",
    "ursus_reranker_v16_ablation.csv",
    "ursus_reranker_v16_movements.csv",
    "ursus_reranker_v16_segments.csv",
    "ursus_reranker_v16_validation_summary.json",
    "ursus_reranker_v16_validation_summary.md",
    "ursus_reranker_v16_locked_config.json",
)
PRIORITY_FAMILIES = {
    "LATA", "MANGUEIRA", "OTHER_UNKNOWN", "CARTAO", "ESTEIRA",
    "TRANSPORTE", "VALVULA",
}


def load_split_rows(path: Path, allowed_splits: set[str]) -> pd.DataFrame:
    """Materialize only explicitly allowed splits from the shared CSV."""

    rows: list[dict[str, str]] = []
    with path.open("r", encoding="utf-8-sig", newline="") as source:
        for row in csv.DictReader(source):
            if row.get("split") in allowed_splits:
                rows.append(row)
    frame = pd.DataFrame(rows)
    if set(frame["split"].unique()) - allowed_splits:
        raise RuntimeError("A disallowed split was materialized")
    return frame


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def write_csv(frame: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(path, index=False, encoding="utf-8-sig")


def json_ready(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): json_ready(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_ready(item) for item in value]
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        return float(value)
    if isinstance(value, np.ndarray):
        return value.tolist()
    return value


def rank_metrics(ranks: np.ndarray) -> dict[str, float]:
    return {
        "top1": round(float(np.mean(ranks <= 1)), 8),
        "top2": round(float(np.mean(ranks <= 2)), 8),
        "top3": round(float(np.mean(ranks <= 3)), 8),
        "top5": round(float(np.mean(ranks <= 5)), 8),
        "top10": round(float(np.mean(ranks <= 10)), 8),
        "mrr": round(float(np.mean(1.0 / ranks)), 8),
    }


def evaluate_ranking(
    classifier: Any,
    features: Any,
    labels: np.ndarray,
    flat_ranks: np.ndarray,
) -> dict[str, Any]:
    scores = decision_scores(classifier, features)
    classes = np.asarray(classifier.classes_).astype(str)
    order = ranked_indices(scores)
    ranks = expected_ranks(order, classes, labels)
    metrics = rank_metrics(ranks)
    brought = int(np.sum((flat_ranks > 3) & (ranks <= 3)))
    expelled = int(np.sum((flat_ranks <= 3) & (ranks > 3)))
    movement = flat_ranks - ranks
    return {
        "metrics": metrics,
        "ranks": ranks,
        "scores": scores,
        "order": order,
        "brought_into_top3": brought,
        "expelled_from_top3": expelled,
        "net_top3_gain": brought - expelled,
        "average_rank_movement": round(float(np.mean(movement)), 8),
        "positive_movements": int(np.sum(movement > 0)),
        "negative_movements": int(np.sum(movement < 0)),
        "neutral_movements": int(np.sum(movement == 0)),
    }


def build_experimental_classifier(
    baseline: Any,
    ranker: Any,
    feature_indices: tuple[int, ...],
    config: ExperimentalFeatureConfig,
) -> ExperimentalCandidateRerankerClassifier:
    return ExperimentalCandidateRerankerClassifier(
        baseline.base_classifier,
        baseline.family_classifier,
        baseline.class_to_family,
        baseline.centroids,
        baseline.label_features,
        baseline.exemplars,
        baseline.exemplar_labels,
        baseline.class_support,
        ranker,
        baseline.candidate_n,
        feature_indices,
        experimental_feature_config=config,
    )


def train_candidate(
    name: str,
    oof_features: np.ndarray,
    oof_targets: np.ndarray,
    oof_ranks: np.ndarray,
    baseline: Any,
    config: ExperimentalFeatureConfig,
    c_value: float,
    feature_indices: tuple[int, ...],
    seed: int,
) -> tuple[Any, dict[str, Any]]:
    transformed = transform_candidate_features(
        oof_features, baseline.candidate_n, config
    )
    ranker = train_ranker(
        transformed, oof_targets, oof_ranks,
        baseline.candidate_n, c_value, feature_indices, seed,
    )
    classifier = build_experimental_classifier(
        baseline, ranker, feature_indices, config
    )
    parameters = {
        "name": name,
        "C": c_value,
        "candidate_n": baseline.candidate_n,
        "features": [ALL_FEATURE_NAMES[index] for index in feature_indices],
        "feature_config": asdict(config),
        "ranker": "LogisticRegression",
        "training": "5_fold_OOF_TRAIN_only",
    }
    return classifier, parameters


def candidate_row(
    name: str,
    result: dict[str, Any],
    parameters: dict[str, Any],
    complexity_rank: int,
) -> dict[str, Any]:
    return {
        "candidate": name,
        "validation_top1": result["metrics"]["top1"],
        "validation_top2": result["metrics"]["top2"],
        "validation_top3": result["metrics"]["top3"],
        "validation_top5": result["metrics"]["top5"],
        "validation_top10": result["metrics"]["top10"],
        "validation_mrr": result["metrics"]["mrr"],
        "brought_into_top3": result["brought_into_top3"],
        "expelled_from_top3": result["expelled_from_top3"],
        "net_top3_gain": result["net_top3_gain"],
        "average_rank_movement": result["average_rank_movement"],
        "positive_movements": result["positive_movements"],
        "negative_movements": result["negative_movements"],
        "neutral_movements": result["neutral_movements"],
        "complexity_rank": complexity_rank,
        "parameters": json.dumps(parameters, ensure_ascii=False, sort_keys=True),
    }


def selection_key(row: dict[str, Any]) -> tuple[float, ...]:
    """VALIDATION-only selection: Recall@3, expulsions, MRR, Top-1, complexity."""

    return (
        float(row["validation_top3"]),
        -float(row["expelled_from_top3"]),
        float(row["validation_mrr"]),
        float(row["validation_top1"]),
        -float(row["complexity_rank"]),
    )


def segment_rows(
    candidate: str,
    ranks: np.ndarray,
    validation: pd.DataFrame,
    train_support: dict[str, int],
    class_to_family: dict[str, str],
) -> list[dict[str, Any]]:
    frame = pd.DataFrame({
        "label": validation["classification_canonical"].astype(str).to_numpy(),
        "rank": ranks,
    })
    frame["family"] = frame["label"].map(class_to_family).fillna("OTHER_UNKNOWN")
    frame["support_bucket"] = frame["label"].map(
        lambda label: support_bucket(int(train_support.get(label, 0)))
    )
    frame["known_group"] = np.where(frame["family"] == "OTHER_UNKNOWN", "OTHER_UNKNOWN", "KNOWN")
    output: list[dict[str, Any]] = []
    for segment_type, column in (
        ("TRAIN_SUPPORT", "support_bucket"),
        ("FAMILY", "family"),
        ("KNOWN_VS_OTHER_UNKNOWN", "known_group"),
    ):
        for segment, group in frame.groupby(column, sort=True):
            metrics = rank_metrics(group["rank"].to_numpy(dtype=int))
            output.append({
                "candidate": candidate,
                "segment_type": segment_type,
                "segment": segment,
                "rows": int(len(group)),
                "recall_at_3": metrics["top3"],
                "recall_at_5": metrics["top5"],
                "mrr": metrics["mrr"],
                "priority_family": segment in PRIORITY_FAMILIES,
            })
    return output


def protected_hashes(
    dataset_path: Path,
    taxonomy_path: Path,
    baseline_model_path: Path,
    taxonomy_dir: Path,
) -> dict[str, str]:
    paths = [
        dataset_path, taxonomy_path, baseline_model_path,
        taxonomy_dir / "canonical_failure_modes.csv",
        taxonomy_dir / "failure_mode_aliases.csv",
        taxonomy_dir / "taxonomy_review_decisions.csv",
    ]
    for name in DEFAULT_PROTECTED_MODELS:
        path = Path(name).resolve()
        if path.exists() and path not in paths:
            paths.append(path)
    return {str(path): sha256_file(path) for path in paths}


def feature_importance(classifier: Any) -> list[dict[str, Any]]:
    coefficients = np.asarray(classifier.ranker.coef_[0], dtype=float)
    rows = []
    for position, feature_index in enumerate(classifier.feature_indices):
        rows.append({
            "feature": ALL_FEATURE_NAMES[int(feature_index)],
            "coefficient": round(float(coefficients[position]), 10),
            "absolute_coefficient": round(abs(float(coefficients[position])), 10),
        })
    return sorted(rows, key=lambda row: (-row["absolute_coefficient"], row["feature"]))


def markdown_summary(summary: dict[str, Any]) -> str:
    baseline = summary["validation_baseline"]
    winner = summary["validation_winner"]
    final = summary["final_test"]
    lines = [
        "# Ursus reranker v1.6 — experimento controlado",
        "",
        f"Resultado do protocolo: **{summary['result']}**  ",
        "Uso de TEST para seleção: **FALSE**  ",
        f"Vencedor em VALIDATION: **{winner['candidate']}**",
        "",
        "## VALIDATION",
        "",
        "| Modelo | Top-1 | Top-3 | Top-5 | MRR | Expulsões |",
        "|---|---:|---:|---:|---:|---:|",
        f"| Baseline v1.5 | {baseline['validation_top1']:.4%} | {baseline['validation_top3']:.4%} | {baseline['validation_top5']:.4%} | {baseline['validation_mrr']:.6f} | {baseline['expelled_from_top3']} |",
        f"| Vencedor | {winner['validation_top1']:.4%} | {winner['validation_top3']:.4%} | {winner['validation_top5']:.4%} | {winner['validation_mrr']:.6f} | {winner['expelled_from_top3']} |",
        "",
        "## TEST final — uma única avaliação após lock",
        "",
        f"Top-1: **{final['top1']:.4%}**  ",
        f"Top-3: **{final['top3']:.4%}**  ",
        f"Top-5: **{final['top5']:.4%}**  ",
        f"MRR: **{final['mrr']:.6f}**  ",
        f"Expulsões: **{final['expelled_from_top3']}**  ",
        f"Meta Top-3 > 90%: **{summary['target_top3_gt_90']}**",
        "",
        "O artefato permanece experimental e não foi ativado em produção.",
    ]
    return "\n".join(lines) + "\n"


def run_experiment(args: argparse.Namespace) -> dict[str, Any]:
    dataset_path = Path(args.dataset).resolve()
    taxonomy_path = Path(args.taxonomy).resolve()
    baseline_model_path = Path(args.baseline_model).resolve()
    taxonomy_dir = Path(args.taxonomy_dir).resolve()
    report_dir = Path(args.report_dir).resolve()
    model_output = Path(args.model_output).resolve()
    lock_config_path = Path(args.lock_config).resolve()
    if model_output.exists() or lock_config_path.exists():
        raise RuntimeError(
            "Experimental lock target already exists; refusing to rerun or overwrite the locked protocol"
        )
    report_dir.mkdir(parents=True, exist_ok=True)
    model_output.parent.mkdir(parents=True, exist_ok=True)
    protected_before = protected_hashes(
        dataset_path, taxonomy_path, baseline_model_path, taxonomy_dir
    )
    protocol_events: list[str] = []

    development = load_split_rows(dataset_path, {"TRAIN", "VALIDATION"})
    protocol_events.append("DEVELOPMENT_SPLITS_MATERIALIZED_WITHOUT_TEST")
    train = development[development["split"] == "TRAIN"].copy().reset_index(drop=True)
    validation = development[development["split"] == "VALIDATION"].copy().reset_index(drop=True)
    if len(train) != 3072 or len(validation) != 685 or "TEST" in set(development["split"]):
        raise RuntimeError("Development split integrity failed")
    if train.groupby("observation_norm")["split"].nunique().max() != 1:
        raise RuntimeError("TRAIN observation group leakage detected")
    if set(train["observation_norm"]) & set(validation["observation_norm"]):
        raise RuntimeError("TRAIN/VALIDATION observation leakage detected")

    taxonomy = pd.read_csv(taxonomy_path, dtype=str).fillna("")
    class_to_family = build_class_to_family(taxonomy)
    baseline_package = joblib.load(baseline_model_path)
    baseline_classifier = baseline_package["classifier"]
    vectorizer = baseline_package["vectorizer"]
    validation_features = vectorizer.transform(validation["observation"].astype(str))
    validation_labels = validation["classification_canonical"].astype(str).to_numpy()
    flat_scores = decision_scores(
        baseline_classifier.base_classifier, validation_features.matrix
    )
    flat_order = ranked_indices(flat_scores)
    flat_ranks = expected_ranks(
        flat_order,
        np.asarray(baseline_classifier.classes_).astype(str),
        validation_labels,
    )
    flat_metrics = rank_metrics(flat_ranks)

    oof_features, oof_targets, oof_ranks, oof_audit = build_oof_ranker_data(
        train, class_to_family, int(args.seed)
    )
    protocol_events.append("OOF_TRAIN_ONLY_FEATURES_BUILT")
    if oof_audit["validation_or_test_used"] or oof_audit["evaluated_oof_rows"] != len(train):
        raise RuntimeError("OOF audit failed")
    family_index = BASE_FEATURE_NAMES.index("family_score")
    support_index = BASE_FEATURE_NAMES.index("log_class_support")
    family_cap = round(float(np.quantile(oof_features[:, family_index], 0.75)), 10)
    support_cap = round(float(np.quantile(oof_features[:, support_index], 0.75)), 10)
    none_config = ExperimentalFeatureConfig()
    family_config = ExperimentalFeatureConfig(family_cap=family_cap)
    support_config = ExperimentalFeatureConfig(support_cap=support_cap)
    both_config = ExperimentalFeatureConfig(family_cap=family_cap, support_cap=support_cap)
    relative_config = ExperimentalFeatureConfig(include_relative_top3=True)

    candidate_objects: dict[str, Any] = {"BASELINE_V15": baseline_classifier}
    candidate_parameters: dict[str, dict[str, Any]] = {
        "BASELINE_V15": {
            "source": str(baseline_model_path), "C": 0.1,
            "candidate_n": 10, "features": list(BASE_FEATURE_NAMES),
            "training": "existing_v1.5_5_fold_OOF_TRAIN_only",
        }
    }
    complexity = {"BASELINE_V15": 1}
    specifications = [
        ("FAMILY_CAPPED", family_config, 0.1, tuple(FULL_FEATURE_INDICES), 2),
        ("SUPPORT_CAPPED", support_config, 0.1, tuple(FULL_FEATURE_INDICES), 2),
        ("FAMILY_SUPPORT_CAPPED", both_config, 0.1, tuple(FULL_FEATURE_INDICES), 2),
        ("FAMILY_SUPPORT_REGULARIZED", none_config, 0.03, tuple(FULL_FEATURE_INDICES), 2),
        ("RELATIVE_TOP3_FEATURES", relative_config, 0.1, tuple(range(len(ALL_FEATURE_NAMES))), 3),
        (
            "FLAT_TOP3_PROTECTED", relative_config, 0.1,
            tuple(list(FULL_FEATURE_INDICES) + [
                ALL_FEATURE_NAMES.index("flat_rank"),
                ALL_FEATURE_NAMES.index("flat_top3_indicator"),
                ALL_FEATURE_NAMES.index("flat_top3_margin_to_rank4"),
            ]),
            3,
        ),
    ]
    for name, config, c_value, indices, complexity_rank in specifications:
        classifier, parameters = train_candidate(
            name, oof_features, oof_targets, oof_ranks,
            baseline_classifier, config, c_value, indices, int(args.seed),
        )
        candidate_objects[name] = classifier
        candidate_parameters[name] = parameters
        complexity[name] = complexity_rank
    protocol_events.append("EXPERIMENTAL_RANKERS_TRAINED_FROM_OOF_TRAIN_ONLY")

    candidate_results: dict[str, dict[str, Any]] = {}
    rows: list[dict[str, Any]] = []
    movement_rows: list[dict[str, Any]] = []
    segment_output: list[dict[str, Any]] = []
    train_support = {
        str(key): int(value)
        for key, value in train["classification_canonical"].value_counts().items()
    }
    for name, classifier in candidate_objects.items():
        result = evaluate_ranking(
            classifier, validation_features, validation_labels, flat_ranks
        )
        candidate_results[name] = result
        row = candidate_row(
            name, result, candidate_parameters[name], complexity[name]
        )
        rows.append(row)
        movement_rows.append({
            "candidate": name,
            "split": "VALIDATION",
            "flat_top3_hits": int(np.sum(flat_ranks <= 3)),
            "reranker_top3_hits": int(np.sum(result["ranks"] <= 3)),
            "brought_into_top3": result["brought_into_top3"],
            "expelled_from_top3": result["expelled_from_top3"],
            "net_top3_gain": result["net_top3_gain"],
            "average_rank_movement": result["average_rank_movement"],
            "positive_movements": result["positive_movements"],
            "negative_movements": result["negative_movements"],
            "neutral_movements": result["neutral_movements"],
        })
        segment_output.extend(segment_rows(
            name, result["ranks"], validation, train_support, class_to_family
        ))
    protocol_events.append("VALIDATION_CANDIDATES_EVALUATED")

    baseline_row = next(row for row in rows if row["candidate"] == "BASELINE_V15")
    baseline_expected = baseline_package["metrics_summary"]["validation"]
    if not math.isclose(baseline_row["validation_top1"], float(baseline_expected["accuracy"]), abs_tol=1e-8):
        raise RuntimeError("Baseline Top-1 reproduction failed")
    if not math.isclose(baseline_row["validation_top3"], float(baseline_expected["top3_accuracy"]), abs_tol=1e-8):
        raise RuntimeError("Baseline Top-3 reproduction failed")
    if not math.isclose(baseline_row["validation_top5"], float(baseline_expected["top5_accuracy"]), abs_tol=1e-8):
        raise RuntimeError("Baseline Top-5 reproduction failed")

    top1_floor = float(baseline_row["validation_top1"]) - 0.02
    eligible_rows = [row for row in rows if float(row["validation_top1"]) >= top1_floor]
    if not eligible_rows:
        raise RuntimeError("Every candidate violated the Top-1 guardrail")
    winner_row = max(eligible_rows, key=selection_key)
    winner_name = str(winner_row["candidate"])
    winner_classifier = candidate_objects[winner_name]
    for row in rows:
        row["top1_guardrail_floor"] = round(top1_floor, 8)
        row["eligible_top1_guardrail"] = float(row["validation_top1"]) >= top1_floor
        row["selected"] = row["candidate"] == winner_name
    protocol_events.append("WINNER_SELECTED_ON_VALIDATION_ONLY")

    ablation_specs = {
        "WITHOUT_FAMILY_SCORE": tuple(index for index in FULL_FEATURE_INDICES if index != family_index),
        "WITHOUT_LOG_CLASS_SUPPORT": tuple(index for index in FULL_FEATURE_INDICES if index != support_index),
        "WITHOUT_FAMILY_AND_SUPPORT": tuple(index for index in FULL_FEATURE_INDICES if index not in {family_index, support_index}),
        "FLAT_ONLY": tuple(BASE_FEATURE_NAMES.index(name) for name in ("flat_score", "normalized_flat_score", "top1_gap")),
        "FLAT_PLUS_SEMANTICS": tuple(BASE_FEATURE_NAMES.index(name) for name in (
            "flat_score", "normalized_flat_score", "top1_gap", "centroid_similarity",
            "max_neighbor_similarity", "mean_top3_neighbor_similarity", "token_overlap",
            "root_overlap", "char_overlap", "label_cosine", "component_present", "mechanism_present",
        )),
        "FLAT_PLUS_FAMILY": tuple(BASE_FEATURE_NAMES.index(name) for name in (
            "flat_score", "normalized_flat_score", "top1_gap", "family_score",
        )),
        "FLAT_PLUS_SUPPORT": tuple(BASE_FEATURE_NAMES.index(name) for name in (
            "flat_score", "normalized_flat_score", "top1_gap", "log_class_support",
        )),
    }
    ablation_rows = []
    for name, indices in ablation_specs.items():
        classifier, parameters = train_candidate(
            name, oof_features, oof_targets, oof_ranks,
            baseline_classifier, none_config, 0.1, indices, int(args.seed),
        )
        result = evaluate_ranking(
            classifier, validation_features, validation_labels, flat_ranks
        )
        row = candidate_row(name, result, parameters, 2)
        ablation_rows.append(row)
    protocol_events.append("VALIDATION_ABLATIONS_COMPLETED")

    candidate_frame = pd.DataFrame(rows)
    ablation_frame = pd.DataFrame(ablation_rows)
    movements_frame = pd.DataFrame(movement_rows)
    segments_frame = pd.DataFrame(segment_output)
    write_csv(candidate_frame, report_dir / "ursus_reranker_v16_validation_candidates.csv")
    write_csv(ablation_frame, report_dir / "ursus_reranker_v16_ablation.csv")
    write_csv(movements_frame, report_dir / "ursus_reranker_v16_movements.csv")
    write_csv(segments_frame, report_dir / "ursus_reranker_v16_segments.csv")

    locked_package = {
        "experiment_version": EXPERIMENT_VERSION,
        "status": "experimental_locked_not_active",
        "purpose": "validation_selected_single_final_test_evaluation",
        "vectorizer": vectorizer,
        "classifier": winner_classifier,
        "classes": np.asarray(winner_classifier.classes_).astype(str),
        "locked_config": candidate_parameters[winner_name],
        "validation_metrics": {
            key: value for key, value in winner_row.items()
            if key.startswith("validation_") or key in {
                "brought_into_top3", "expelled_from_top3", "net_top3_gain"
            }
        },
        "selection_protocol": {
            "selected_on": "VALIDATION_only",
            "primary": "Recall@3",
            "tie_breakers": ["fewer_top3_expulsions", "higher_MRR", "higher_Top1", "lower_complexity"],
            "top1_guardrail": top1_floor,
            "test_used_for_selection": False,
        },
        "oof_audit": oof_audit,
        "random_seed": int(args.seed),
    }
    joblib.dump(locked_package, model_output)
    artifact_hash_before_test = sha256_file(model_output)
    locked_config = {
        "experiment_version": EXPERIMENT_VERSION,
        "status": "locked_before_test_not_active",
        "created_at": CREATED_AT,
        "winner": winner_name,
        "winner_parameters": candidate_parameters[winner_name],
        "winner_validation": json_ready(winner_row),
        "selection_key": ["validation_recall_at_3", "fewer_expulsions", "MRR", "Top1", "complexity"],
        "test_used_for_selection": False,
        "test_evaluations_at_lock_time": 0,
        "model_artifact": str(model_output),
        "model_sha256": artifact_hash_before_test,
        "development_source_sha256": sha256_file(dataset_path),
        "oof_audit": oof_audit,
    }
    lock_text = json.dumps(json_ready(locked_config), ensure_ascii=False, indent=2)
    lock_config_path.parent.mkdir(parents=True, exist_ok=True)
    lock_config_path.write_text(lock_text, encoding="utf-8")
    lock_config_hash = sha256_file(lock_config_path)
    protocol_events.append("WINNER_CONFIG_AND_MODEL_LOCKED_BEFORE_TEST")

    locked = joblib.load(model_output)
    frozen_test = load_split_rows(dataset_path, {"TEST"})
    protocol_events.append("TEST_MATERIALIZED_AFTER_LOCK")
    if len(frozen_test) != 698 or set(frozen_test["split"]) != {"TEST"}:
        raise RuntimeError("Frozen TEST integrity failed")
    test_features = locked["vectorizer"].transform(
        frozen_test["observation"].astype(str)
    )
    test_labels = frozen_test["classification_canonical"].astype(str).to_numpy()
    test_flat_scores = decision_scores(
        locked["classifier"].base_classifier, test_features.matrix
    )
    test_flat_ranks = expected_ranks(
        ranked_indices(test_flat_scores),
        np.asarray(locked["classifier"].classes_).astype(str),
        test_labels,
    )
    final_test_result = evaluate_ranking(
        locked["classifier"], test_features, test_labels, test_flat_ranks
    )
    protocol_events.append("TEST_EVALUATED_EXACTLY_ONCE")
    artifact_hash_after_test = sha256_file(model_output)
    config_hash_after_test = sha256_file(lock_config_path)
    if artifact_hash_after_test != artifact_hash_before_test or config_hash_after_test != lock_config_hash:
        raise RuntimeError("Locked model/config changed after TEST evaluation")

    protected_after = protected_hashes(
        dataset_path, taxonomy_path, baseline_model_path, taxonomy_dir
    )
    winner_importance = feature_importance(winner_classifier)
    baseline_result = candidate_results["BASELINE_V15"]
    selected_result = candidate_results[winner_name]
    summary = {
        "result": "PASS",
        "experiment_version": EXPERIMENT_VERSION,
        "created_at": CREATED_AT,
        "product_principle": "TOP-3 suggestions require mandatory human validation",
        "validation_baseline": json_ready(baseline_row),
        "validation_winner": json_ready(winner_row),
        "winner_configuration": candidate_parameters[winner_name],
        "flat_validation": flat_metrics,
        "ablation_findings": json.loads(ablation_frame.to_json(orient="records", force_ascii=False)),
        "winner_feature_importance": winner_importance,
        "validation_support_segments": json.loads(
            segments_frame[
                (segments_frame["candidate"] == winner_name)
                & (segments_frame["segment_type"] == "TRAIN_SUPPORT")
            ].to_json(orient="records", force_ascii=False)
        ),
        "validation_family_segments": json.loads(
            segments_frame[
                (segments_frame["candidate"] == winner_name)
                & (segments_frame["segment_type"] == "FAMILY")
            ].to_json(orient="records", force_ascii=False)
        ),
        "validation_known_vs_other_unknown": json.loads(
            segments_frame[
                (segments_frame["candidate"] == winner_name)
                & (segments_frame["segment_type"] == "KNOWN_VS_OTHER_UNKNOWN")
            ].to_json(orient="records", force_ascii=False)
        ),
        "final_test": {
            **final_test_result["metrics"],
            "flat_top3": rank_metrics(test_flat_ranks)["top3"],
            "brought_into_top3": final_test_result["brought_into_top3"],
            "expelled_from_top3": final_test_result["expelled_from_top3"],
            "net_top3_gain": final_test_result["net_top3_gain"],
            "test_rows": len(frozen_test),
        },
        "target_top3_gt_90": "PASS" if final_test_result["metrics"]["top3"] > 0.90 else "FAIL",
        "protocol_integrity": {
            "test_used_for_selection": False,
            "test_materialized_after_winner_lock": True,
            "test_evaluations": 1,
            "candidate_selection_splits": ["TRAIN", "VALIDATION"],
            "oof_audit": oof_audit,
            "zero_train_validation_group_leakage": True,
            "model_locked_before_test": True,
            "model_sha256_before_test": artifact_hash_before_test,
            "model_sha256_after_test": artifact_hash_after_test,
            "lock_config_sha256_before_test": lock_config_hash,
            "lock_config_sha256_after_test": config_hash_after_test,
            "protected_hashes_before": protected_before,
            "protected_hashes_after": protected_after,
            "protected_files_unchanged": protected_before == protected_after,
            "protocol_events": protocol_events,
            "no_production_activation": True,
            "existing_joblibs_overwritten": False,
        },
        "artifacts": {
            "experimental_model": str(model_output),
            "locked_config": str(lock_config_path),
            "reports": list(OUTPUT_FILES[:-1]),
        },
    }
    if not summary["protocol_integrity"]["protected_files_unchanged"]:
        raise RuntimeError("A protected dataset, taxonomy, or v1.2-v1.5 model changed")
    summary_path = report_dir / "ursus_reranker_v16_validation_summary.json"
    summary_path.write_text(
        json.dumps(json_ready(summary), ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (report_dir / "ursus_reranker_v16_validation_summary.md").write_text(
        markdown_summary(summary), encoding="utf-8"
    )
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the controlled Ursus v1.6 experimental reranker protocol.")
    parser.add_argument("--dataset", default=DEFAULT_DATASET)
    parser.add_argument("--taxonomy", default=DEFAULT_TAXONOMY)
    parser.add_argument("--baseline-model", default=DEFAULT_BASELINE_MODEL)
    parser.add_argument("--taxonomy-dir", default="ml/taxonomy")
    parser.add_argument("--model-output", default=DEFAULT_MODEL_OUTPUT)
    parser.add_argument("--lock-config", default=DEFAULT_LOCK_CONFIG)
    parser.add_argument("--report-dir", default=DEFAULT_REPORT_DIR)
    parser.add_argument("--seed", type=int, default=RANDOM_SEED)
    args = parser.parse_args()
    summary = run_experiment(args)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
