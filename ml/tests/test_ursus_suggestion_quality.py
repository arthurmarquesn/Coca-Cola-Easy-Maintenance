from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

from ml.scripts.analyze_ursus_suggestion_quality import (
    DEFAULT_DATASET,
    DEFAULT_INVENTORY,
    DEFAULT_LABEL_NOISE,
    DEFAULT_MODEL,
    DEFAULT_PERSISTENT,
    DEFAULT_SEPARABILITY,
    DEFAULT_TAXONOMY_DIR,
    DEFAULT_TAXONOMY_QUEUE,
    DEFAULT_V15_METRICS,
    OUTPUT_FILES,
    ranking_metrics,
    run_analysis,
    sha256_file,
)


ROOT = Path(__file__).resolve().parents[2]
REPORTS = ROOT / "ml" / "reports"
SUMMARY_PATH = REPORTS / "ursus_suggestion_quality_summary.json"
SCRIPT = ROOT / "ml" / "scripts" / "analyze_ursus_suggestion_quality.py"


def summary() -> dict:
    return json.loads(SUMMARY_PATH.read_text(encoding="utf-8"))


def test_analysis_is_read_only_and_performs_no_fitting() -> None:
    source = SCRIPT.read_text(encoding="utf-8")
    assert ".fit(" not in source
    assert ".fit_transform(" not in source
    assert "joblib.dump" not in source

    data = summary()
    assert data["result"] == "PASS"
    assert data["scope"]["decision_support_only"] is True
    assert data["scope"]["no_automation_readiness_assessment"] is True
    assert data["scope"]["no_training_performed"] is True
    assert data["scope"]["test_used_for_frozen_analysis_only"] is True
    assert data["integrity"]["protected_files_unchanged"] is True
    assert data["integrity"]["protected_hashes_before"] == data["integrity"]["protected_hashes_after"]


def test_recall_at_k_and_mrr_formulas() -> None:
    ranks = np.asarray([1, 2, 3, 4, 10, 11])
    metrics = ranking_metrics(ranks)
    assert metrics["recall_at_1"] == round(1 / 6, 8)
    assert metrics["recall_at_2"] == round(2 / 6, 8)
    assert metrics["recall_at_3"] == round(3 / 6, 8)
    assert metrics["recall_at_5"] == round(4 / 6, 8)
    assert metrics["recall_at_10"] == round(5 / 6, 8)
    assert metrics["mrr"] == round(float(np.mean(1.0 / ranks)), 8)


def test_global_rank_metrics_are_monotonic_and_reproduce_v15() -> None:
    metrics = summary()["global"]
    assert metrics["rows"] == 698
    assert metrics["recall_at_5"] >= metrics["recall_at_3"] >= metrics["recall_at_2"] >= metrics["recall_at_1"]
    assert metrics["recall_at_10"] >= metrics["recall_at_5"]
    assert metrics["recall_at_1"] == 0.75501433
    assert metrics["recall_at_3"] == 0.89971347
    assert metrics["recall_at_5"] == 0.92550143
    assert metrics["mrr"] == 0.82838973


def test_every_test_row_and_every_top3_miss_is_represented() -> None:
    rows = pd.read_csv(REPORTS / "ursus_suggestion_quality_test_rows.csv", dtype=str, keep_default_na=False)
    misses = pd.read_csv(REPORTS / "ursus_top3_misses.csv", dtype=str, keep_default_na=False)
    data = summary()
    assert len(rows) == rows["row_id"].nunique() == data["global"]["rows"] == 698
    assert len(misses) == data["top3_misses"] == 70
    assert misses["expected_rank"].astype(int).gt(3).all()
    assert sum(data["rank_distribution_of_top3_misses"].values()) == len(misses)
    assert data["top5_recoverable_to_top3"] == int(misses["expected_rank"].astype(int).le(5).sum()) == 18


def test_legacy_review_subset_and_goal_distances_are_exact_counts() -> None:
    data = summary()
    review = data["legacy_review_cohort"]
    assert review["rows"] == 610
    assert review["recall_at_3"] == 0.8852459
    assert review["top3_misses"] == 70
    assert data["distance_to_targets"]["90"]["additional_hits_needed"] == 1
    assert data["distance_to_targets"]["92"]["additional_hits_needed"] == 15
    assert data["distance_to_targets"]["95"]["additional_hits_needed"] == 36


def test_required_reports_and_no_model_artifact() -> None:
    for filename in OUTPUT_FILES:
        assert (REPORTS / filename).is_file()
    assert not (ROOT / "ml" / "models" / "failure_classifier_marilia_v1_6_candidate.joblib").exists()
    assert not list(REPORTS.glob("ursus_suggestion_quality*.joblib"))


def test_outputs_are_deterministic_without_mutating_inputs(tmp_path: Path) -> None:
    protected = [
        ROOT / DEFAULT_DATASET,
        ROOT / DEFAULT_MODEL,
        ROOT / DEFAULT_TAXONOMY_DIR / "canonical_failure_modes.csv",
        ROOT / DEFAULT_TAXONOMY_DIR / "failure_mode_aliases.csv",
        ROOT / DEFAULT_TAXONOMY_DIR / "taxonomy_review_decisions.csv",
    ]
    before = {path: (path.stat().st_size, path.stat().st_mtime_ns, sha256_file(path)) for path in protected}
    args = argparse.Namespace(
        dataset=str(ROOT / DEFAULT_DATASET),
        model=str(ROOT / DEFAULT_MODEL),
        taxonomy_dir=str(ROOT / DEFAULT_TAXONOMY_DIR),
        inventory=str(ROOT / DEFAULT_INVENTORY),
        separability=str(ROOT / DEFAULT_SEPARABILITY),
        persistent_confusions=str(ROOT / DEFAULT_PERSISTENT),
        label_noise=str(ROOT / DEFAULT_LABEL_NOISE),
        taxonomy_queue=str(ROOT / DEFAULT_TAXONOMY_QUEUE),
        v15_metrics=str(ROOT / DEFAULT_V15_METRICS),
        report_dir=str(tmp_path),
    )
    run_analysis(args)
    for filename in OUTPUT_FILES:
        assert sha256_file(tmp_path / filename) == sha256_file(REPORTS / filename)
    after = {path: (path.stat().st_size, path.stat().st_mtime_ns, sha256_file(path)) for path in protected}
    assert after == before
    assert not list(tmp_path.glob("*.joblib"))
