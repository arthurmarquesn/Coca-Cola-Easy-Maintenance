from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from ml.scripts.analyze_ursus_reranker_failures import (
    DEFAULT_DATASET,
    DEFAULT_LABEL_NOISE,
    DEFAULT_MODEL,
    DEFAULT_PERSISTENT,
    DEFAULT_REPORT_DIR,
    DEFAULT_SEPARABILITY,
    DEFAULT_TAXONOMY_DIR,
    DEFAULT_TAXONOMY_QUEUE,
    OUTPUT_FILES,
    run_analysis,
)
from ml.scripts.analyze_ursus_suggestion_quality import sha256_file


ROOT = Path(__file__).resolve().parents[2]
REPORTS = ROOT / DEFAULT_REPORT_DIR
SCRIPT = ROOT / "ml" / "scripts" / "analyze_ursus_reranker_failures.py"
SUMMARY_PATH = REPORTS / "ursus_reranker_failure_summary.json"


def summary() -> dict:
    return json.loads(SUMMARY_PATH.read_text(encoding="utf-8"))


def test_no_fitting_or_model_creation() -> None:
    source = SCRIPT.read_text(encoding="utf-8")
    assert ".fit(" not in source
    assert ".fit_transform(" not in source
    assert "joblib.dump" not in source
    data = summary()
    assert data["scope"]["no_training_performed"] is True
    assert data["scope"]["no_fitting_performed"] is True
    assert data["integrity"]["no_model_artifact_created"] is True
    assert not (ROOT / "ml" / "models" / "failure_classifier_marilia_v1_6_candidate.joblib").exists()


def test_frozen_case_counts_and_boundaries() -> None:
    rank45 = pd.read_csv(REPORTS / "ursus_rank4_rank5_diagnosis.csv", dtype=str, keep_default_na=False)
    expulsions = pd.read_csv(REPORTS / "ursus_reranker_expulsions.csv", dtype=str, keep_default_na=False)
    assert len(rank45) == 18
    assert set(rank45["reranker_rank"].astype(int)) == {4, 5}
    assert len(expulsions) == 11
    assert expulsions["flat_rank"].astype(int).le(3).all()
    assert expulsions["reranker_rank"].astype(int).gt(3).all()
    assert expulsions["positions_lost"].astype(int).gt(0).all()


def test_contributions_use_real_logistic_regression_coefficients() -> None:
    frame = pd.read_csv(
        REPORTS / "ursus_reranker_feature_contributions.csv",
        dtype={"observation_id": str, "candidate_label": str, "feature_name": str},
    )
    package = joblib.load(ROOT / DEFAULT_MODEL)
    classifier = package["classifier"]
    coefficient_by_feature = {
        classifier.feature_names[int(feature_index)]: float(classifier.ranker.coef_[0][position])
        for position, feature_index in enumerate(classifier.feature_indices)
    }
    assert len(frame) == 11 * classifier.candidate_n * len(classifier.feature_names)
    for feature_name, group in frame.groupby("feature_name"):
        assert np.allclose(group["coefficient"].astype(float), coefficient_by_feature.get(feature_name, 0.0))
        assert np.allclose(
            group["contribution"].astype(float),
            group["feature_value"].astype(float) * group["coefficient"].astype(float),
            atol=1e-8,
        )
    assert frame.groupby("observation_id")["candidate_label"].nunique().eq(classifier.candidate_n).all()


def test_counterfactuals_are_frozen_arithmetic() -> None:
    data = summary()
    assert data["rank4_rank5_cases"] == 18
    assert data["reranker_expulsions"] == 11
    counter = data["counterfactuals"]
    assert counter["restore_expulsions"]["top3_hit_rate"] == round((628 + 11) / 698, 8)
    assert counter["recover_rank_4"]["top3_hit_rate"] == round((628 + 13) / 698, 8)
    assert counter["recover_rank_4_and_5"]["top3_hit_rate"] == round((628 + 18) / 698, 8)
    assert counter["combined_non_overlapping"]["overlap"] == 8
    assert counter["combined_non_overlapping"]["top3_hit_rate"] == round((628 + 21) / 698, 8)


def test_protected_inputs_are_unchanged_and_test_is_frozen() -> None:
    data = summary()
    assert data["scope"]["test_rows"] == 698
    assert data["integrity"]["protected_files_unchanged"] is True
    assert data["integrity"]["protected_hashes_before"] == data["integrity"]["protected_hashes_after"]


def test_outputs_are_deterministic(tmp_path: Path) -> None:
    protected = [
        ROOT / DEFAULT_DATASET,
        ROOT / DEFAULT_MODEL,
        ROOT / DEFAULT_TAXONOMY_DIR / "canonical_failure_modes.csv",
        ROOT / DEFAULT_TAXONOMY_DIR / "failure_mode_aliases.csv",
        ROOT / DEFAULT_TAXONOMY_DIR / "taxonomy_review_decisions.csv",
    ]
    before = {path: (path.stat().st_size, path.stat().st_mtime_ns, sha256_file(path)) for path in protected}
    args = argparse.Namespace(
        dataset=str(ROOT / DEFAULT_DATASET), model=str(ROOT / DEFAULT_MODEL),
        taxonomy_dir=str(ROOT / DEFAULT_TAXONOMY_DIR),
        separability=str(ROOT / DEFAULT_SEPARABILITY),
        persistent_confusions=str(ROOT / DEFAULT_PERSISTENT),
        taxonomy_queue=str(ROOT / DEFAULT_TAXONOMY_QUEUE),
        label_noise=str(ROOT / DEFAULT_LABEL_NOISE), report_dir=str(tmp_path),
    )
    run_analysis(args)
    for filename in OUTPUT_FILES:
        assert sha256_file(tmp_path / filename) == sha256_file(REPORTS / filename)
    after = {path: (path.stat().st_size, path.stat().st_mtime_ns, sha256_file(path)) for path in protected}
    assert after == before
    assert not list(tmp_path.glob("*.joblib"))
