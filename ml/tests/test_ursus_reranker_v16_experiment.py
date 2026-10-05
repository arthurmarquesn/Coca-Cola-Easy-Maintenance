from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from ml.experimental_reranker import (
    ALL_FEATURE_NAMES,
    BASE_FEATURE_NAMES,
    ExperimentalFeatureConfig,
    transform_candidate_features,
)
from ml.scripts.analyze_ursus_suggestion_quality import sha256_file
from ml.scripts.experiment_ursus_reranker_v16 import OUTPUT_FILES, selection_key


ROOT = Path(__file__).resolve().parents[2]
REPORTS = ROOT / "ml" / "reports"
MODELS = ROOT / "ml" / "models"
SUMMARY_PATH = REPORTS / "ursus_reranker_v16_validation_summary.json"
LOCK_PATH = REPORTS / "ursus_reranker_v16_locked_config.json"
MODEL_PATH = MODELS / "ursus_reranker_v16_experimental_locked.joblib"
SCRIPT = ROOT / "ml" / "scripts" / "experiment_ursus_reranker_v16.py"


def summary() -> dict:
    return json.loads(SUMMARY_PATH.read_text(encoding="utf-8"))


def test_selection_uses_only_train_and_validation_before_test_lock() -> None:
    integrity = summary()["protocol_integrity"]
    assert integrity["test_used_for_selection"] is False
    assert integrity["candidate_selection_splits"] == ["TRAIN", "VALIDATION"]
    assert integrity["test_materialized_after_winner_lock"] is True
    assert integrity["test_evaluations"] == 1
    events = integrity["protocol_events"]
    assert events.index("WINNER_SELECTED_ON_VALIDATION_ONLY") < events.index("WINNER_CONFIG_AND_MODEL_LOCKED_BEFORE_TEST")
    assert events.index("WINNER_CONFIG_AND_MODEL_LOCKED_BEFORE_TEST") < events.index("TEST_MATERIALIZED_AFTER_LOCK")
    assert events.index("TEST_MATERIALIZED_AFTER_LOCK") < events.index("TEST_EVALUATED_EXACTLY_ONCE")


def test_oof_is_train_only_grouped_and_leak_free() -> None:
    integrity = summary()["protocol_integrity"]
    audit = integrity["oof_audit"]
    assert audit["folds"] == 5
    assert audit["train_rows"] == audit["evaluated_oof_rows"] == 3072
    assert audit["candidate_rows"] == 30720
    assert audit["grouping"] == "deterministic_hash_by_observation_norm"
    assert audit["self_row_excluded"] is True
    assert audit["validation_or_test_used"] is False
    assert integrity["zero_train_validation_group_leakage"] is True


def test_validation_baseline_reproduces_v15_and_winner_is_validation_selected() -> None:
    data = summary()
    baseline = data["validation_baseline"]
    winner = data["validation_winner"]
    assert baseline["candidate"] == "BASELINE_V15"
    assert baseline["validation_top1"] == 0.74160584
    assert baseline["validation_top3"] == 0.89781022
    assert baseline["validation_top5"] == 0.91824818
    assert winner["candidate"] == "SUPPORT_CAPPED"
    assert winner["validation_top3"] == 0.90072993

    candidates = pd.read_csv(REPORTS / "ursus_reranker_v16_validation_candidates.csv")
    eligible = candidates[candidates["eligible_top1_guardrail"]]
    rows = eligible.to_dict(orient="records")
    selected = max(rows, key=selection_key)
    assert selected["candidate"] == winner["candidate"]
    assert candidates["selected"].sum() == 1


def test_locked_config_precedes_single_final_test_and_target_passes() -> None:
    data = summary()
    lock = json.loads(LOCK_PATH.read_text(encoding="utf-8"))
    package = joblib.load(MODEL_PATH)
    assert lock["status"] == "locked_before_test_not_active"
    assert lock["test_used_for_selection"] is False
    assert lock["test_evaluations_at_lock_time"] == 0
    assert package["status"] == "experimental_locked_not_active"
    assert package["selection_protocol"]["test_used_for_selection"] is False
    assert data["final_test"]["test_rows"] == 698
    assert data["final_test"]["top3"] == 0.90401146
    assert data["target_top3_gt_90"] == "PASS"


def test_artifact_and_protected_inputs_remain_unchanged() -> None:
    integrity = summary()["protocol_integrity"]
    assert integrity["protected_files_unchanged"] is True
    assert integrity["protected_hashes_before"] == integrity["protected_hashes_after"]
    assert integrity["model_sha256_before_test"] == integrity["model_sha256_after_test"] == sha256_file(MODEL_PATH)
    assert integrity["lock_config_sha256_before_test"] == integrity["lock_config_sha256_after_test"] == sha256_file(LOCK_PATH)
    assert integrity["existing_joblibs_overwritten"] is False
    assert integrity["no_production_activation"] is True
    assert not (MODELS / "failure_classifier_marilia_v1_6_candidate.joblib").exists()


def test_feature_transform_is_deterministic_and_relative_features_are_train_constructible() -> None:
    base = np.arange(4 * 10 * len(BASE_FEATURE_NAMES), dtype=float).reshape(40, len(BASE_FEATURE_NAMES)) / 100.0
    config = ExperimentalFeatureConfig(
        family_cap=0.75, support_cap=2.5, include_relative_top3=True
    )
    first = transform_candidate_features(base, 10, config)
    second = transform_candidate_features(base, 10, config)
    assert np.array_equal(first, second)
    assert first.shape == (40, len(ALL_FEATURE_NAMES))
    top3_indicator = first[:, ALL_FEATURE_NAMES.index("flat_top3_indicator")].reshape(4, 10)
    assert np.array_equal(top3_indicator[:, :3], np.ones((4, 3)))
    assert np.array_equal(top3_indicator[:, 3:], np.zeros((4, 7)))


def test_reports_candidates_ablations_and_segments_are_complete() -> None:
    for filename in OUTPUT_FILES:
        assert (REPORTS / filename).is_file()
    candidates = pd.read_csv(REPORTS / "ursus_reranker_v16_validation_candidates.csv")
    ablation = pd.read_csv(REPORTS / "ursus_reranker_v16_ablation.csv")
    segments = pd.read_csv(REPORTS / "ursus_reranker_v16_segments.csv")
    assert len(candidates) == 7
    assert len(ablation) == 7
    assert set(candidates["candidate"]) >= {
        "BASELINE_V15", "FAMILY_CAPPED", "SUPPORT_CAPPED",
        "FAMILY_SUPPORT_CAPPED", "FAMILY_SUPPORT_REGULARIZED",
        "RELATIVE_TOP3_FEATURES", "FLAT_TOP3_PROTECTED",
    }
    assert set(segments["segment_type"]) == {
        "TRAIN_SUPPORT", "FAMILY", "KNOWN_VS_OTHER_UNKNOWN"
    }


def test_locked_joblib_overwrite_guard_runs_before_training() -> None:
    source = SCRIPT.read_text(encoding="utf-8")
    guard = source.index("refusing to rerun or overwrite the locked protocol")
    development = source.index("development = load_split_rows")
    assert guard < development
