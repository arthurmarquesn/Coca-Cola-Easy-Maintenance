from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from ml.scripts.analyze_marilia_for_v1_6 import (
    HUMAN_FIELDS,
    diversified_queue,
)
from ml.scripts.prepare_marilia_dataset import normalize_observation


ROOT = Path(__file__).resolve().parents[2]
REPORTS = ROOT / "ml/reports"
DATASET = ROOT / "ml/data/human/marilia/prepared/marilia_human_v2_canonical.csv"
SCRIPT = ROOT / "ml/scripts/analyze_marilia_for_v1_6.py"
SUMMARY = REPORTS / "ursus_v1_6_analysis_summary.json"


def read_csv(name: str) -> pd.DataFrame:
    return pd.read_csv(REPORTS / name, dtype=str, keep_default_na=False)


def test_analysis_performs_no_fitting_and_preserves_protected_files() -> None:
    source = SCRIPT.read_text(encoding="utf-8")
    assert ".fit(" not in source
    assert ".fit_transform(" not in source
    summary = json.loads(SUMMARY.read_text(encoding="utf-8-sig"))
    assert summary["no_training_performed"] is True
    assert summary["protected_files_unchanged"] is True
    assert summary["protected_hashes_before"] == summary["protected_hashes_after"]
    assert not (ROOT / "ml/models/failure_classifier_marilia_v1_6_candidate.joblib").exists()


def test_inventory_and_singletons_are_complete() -> None:
    inventory = read_csv("ursus_v1_6_class_inventory.csv")
    singleton = read_csv("ursus_v1_6_singleton_review.csv")
    assert len(inventory) == 421
    assert inventory["canonical_label"].nunique() == 421
    assert len(singleton) == 147
    assert singleton["label"].nunique() == 147
    assert singleton["requires_human_review"].eq("True").all()


def test_review_queue_has_unique_observations_valid_scores_and_blank_human_fields() -> None:
    queue = read_csv("ursus_v1_6_human_review_top500.csv")
    normalized = queue["observation"].map(normalize_observation)
    assert normalized.nunique() == len(queue) == 500
    scores = queue["active_learning_score"].astype(float)
    assert scores.between(0.0, 100.0, inclusive="both").all()
    assert queue["priority_rank"].astype(int).tolist() == list(range(1, 501))
    for field in HUMAN_FIELDS:
        assert queue[field].eq("").all()


def test_taxonomy_human_fields_are_blank_and_labels_are_not_rewritten() -> None:
    taxonomy = read_csv("ursus_v1_6_taxonomy_review_queue.csv")
    assert taxonomy["human_decision"].eq("").all()
    assert taxonomy["human_canonical_label"].eq("").all()
    assert taxonomy["human_comment"].eq("").all()
    dataset_labels = set(pd.read_csv(DATASET, dtype=str)["classification_canonical"])
    queue_labels = set(read_csv("ursus_v1_6_human_review_queue.csv")["current_label"])
    assert queue_labels <= dataset_labels


def test_ordering_is_deterministic_and_seed_is_recorded() -> None:
    summary = json.loads(SUMMARY.read_text(encoding="utf-8-sig"))
    assert summary["seed"] == 42
    candidates = pd.DataFrame([
        {
            "observation_norm": f"obs-{index}", "observation": f"obs {index}",
            "current_label": f"CLASS-{index % 2}", "family": f"FAMILY-{index % 3}",
            "train_support": 1, "rarity_bucket": "SINGLETON",
            "top1": "A", "top1_score": 1.0, "top2": "B", "top2_score": 0.5,
            "top3": "C", "top3_score": 0.2, "margin_top1_top2": 0.5,
            "prototype_best_label": "A", "prototype_similarity": 0.7,
            "persistent_confusion": "", "possible_label_noise": False,
            "uncertainty_component": 0.5, "rarity_component": 0.9,
            "persistent_component": 0.0, "representativeness_component": 0.7,
            "disagreement_component": 0.3, "review_reason": "TEST",
            "seed_tiebreak": index,
        }
        for index in range(12)
    ])
    first = diversified_queue(candidates, 10)
    second = diversified_queue(candidates, 10)
    pd.testing.assert_frame_equal(first, second)


def test_all_required_outputs_exist() -> None:
    required = {
        "ursus_v1_6_class_inventory.csv",
        "ursus_v1_6_priority_families.csv",
        "ursus_v1_6_other_unknown_review.csv",
        "ursus_v1_6_persistent_confusions.csv",
        "ursus_v1_6_possible_label_noise.csv",
        "ursus_v1_6_human_review_queue.csv",
        "ursus_v1_6_human_review_top100.csv",
        "ursus_v1_6_human_review_top250.csv",
        "ursus_v1_6_human_review_top500.csv",
        "ursus_v1_6_review_lata.csv",
        "ursus_v1_6_review_rotulo.csv",
        "ursus_v1_6_review_mangueira.csv",
        "ursus_v1_6_review_cartao.csv",
        "ursus_v1_6_review_other_unknown.csv",
        "ursus_v1_6_data_collection_plan.csv",
        "ursus_v1_6_labeling_guide.md",
        "ursus_v1_6_singleton_review.csv",
        "ursus_v1_6_class_separability.csv",
        "ursus_v1_6_taxonomy_review_queue.csv",
    }
    for name in required:
        path = REPORTS / name
        assert path.exists() and path.stat().st_size > 0, name


if __name__ == "__main__":
    test_analysis_performs_no_fitting_and_preserves_protected_files()
    test_inventory_and_singletons_are_complete()
    test_review_queue_has_unique_observations_valid_scores_and_blank_human_fields()
    test_taxonomy_human_fields_are_blank_and_labels_are_not_rewritten()
    test_ordering_is_deterministic_and_seed_is_recorded()
    test_all_required_outputs_exist()
