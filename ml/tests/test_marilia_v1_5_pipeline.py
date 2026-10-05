from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from scipy import sparse

from ml.classifier_wrappers import (
    SoftHierarchicalClassifier,
    TopKFamilyGateClassifier,
    parse_label_component_mechanism,
)
from ml.scripts.train_failure_classifier_marilia_v1_3 import stable_hash


ROOT = Path(__file__).resolve().parents[2]
DATASET = ROOT / "ml/data/human/marilia/prepared/marilia_human_v2_canonical.csv"
MODEL = ROOT / "ml/models/failure_classifier_marilia_v1_5_candidate.joblib"
METRICS = ROOT / "ml/reports/failure_classifier_marilia_v1_5_metrics.json"


class _ModeClassifier:
    classes_ = np.asarray(["FALHA DE SENSOR", "QUEBRA DE CORREIA", "VAZAMENTO EM VALVULA"])

    def decision_function(self, features):
        return np.tile(np.asarray([[0.7, 0.6, 0.1]]), (features.shape[0], 1))


class _FamilyClassifier:
    classes_ = np.asarray(["CORREIA", "SENSOR", "VALVULA"])

    def decision_function(self, features):
        return np.tile(np.asarray([[0.2, 0.9, 0.1]]), (features.shape[0], 1))


CLASS_TO_FAMILY = {
    "FALHA DE SENSOR": "SENSOR",
    "QUEBRA DE CORREIA": "CORREIA",
    "VAZAMENTO EM VALVULA": "VALVULA",
}


def test_soft_routing_is_deterministic_and_never_excludes_a_class() -> None:
    classifier = SoftHierarchicalClassifier(
        _ModeClassifier(), _FamilyClassifier(), CLASS_TO_FAMILY, alpha=0.7, beta=0.3
    )
    features = sparse.csr_matrix([[1.0, 0.0]])
    first = classifier.decision_function(features)
    second = classifier.decision_function(features)
    assert np.array_equal(first, second)
    assert first.shape == (1, 3)
    assert np.isfinite(first).all()
    assert (first >= 0.0).all()


def test_top_k_family_gate_uses_no_artificial_thousand_point_offset() -> None:
    classifier = TopKFamilyGateClassifier(
        _ModeClassifier(), _FamilyClassifier(), CLASS_TO_FAMILY, top_k_families=2
    )
    scores = classifier.decision_function(sparse.csr_matrix([[1.0, 0.0]]))
    assert scores.min() >= -1.0
    assert classifier.predict(sparse.csr_matrix([[1.0, 0.0]])).shape == (1,)


def test_label_parser_is_conservative() -> None:
    assert parse_label_component_mechanism("QUEBRA DE CORREIA") == ("CORREIA", "QUEBRA")
    assert parse_label_component_mechanism("FALHA DE SENSOR") == ("SENSOR", "FALHA")
    assert parse_label_component_mechanism("TEXTO SEM PADRAO") == ("TEXTO SEM PADRAO", "UNKNOWN")


def test_v13_split_is_preserved_without_group_leakage() -> None:
    dataset = pd.read_csv(DATASET, dtype=str).fillna("")
    assert dataset["split"].value_counts().to_dict() == {
        "TRAIN": 3072, "VALIDATION": 685, "TEST": 698
    }
    assert int(dataset.groupby("observation_norm")["split"].nunique().max()) == 1
    fold = dataset.loc[dataset["split"] == "TRAIN", "observation_norm"].map(
        lambda value: stable_hash(str(value), 42) % 5
    )
    groups = dataset.loc[dataset["split"] == "TRAIN", ["observation_norm"]].copy()
    groups["fold"] = fold.to_numpy()
    assert int(groups.groupby("observation_norm")["fold"].nunique().max()) == 1


def test_oof_audit_and_artifact_contract_when_generated() -> None:
    if not MODEL.exists() or not METRICS.exists():
        return
    metrics = json.loads(METRICS.read_text(encoding="utf-8-sig"))
    audit = metrics["evaluation_integrity"]["reranker_training"]
    assert audit["evaluated_oof_rows"] == 3072
    assert audit["self_row_excluded"] is True
    assert audit["validation_or_test_used"] is False
    package = joblib.load(MODEL)
    classifier = package["classifier"]
    features = package["vectorizer"].transform(["falha no sensor da esteira"])
    assert classifier.predict(features).shape == (1,)
    assert np.asarray(classifier.decision_function(features)).shape == (1, len(classifier.classes_))
    assert np.array_equal(np.asarray(package["classes"]).astype(str), np.asarray(classifier.classes_).astype(str))


if __name__ == "__main__":
    test_soft_routing_is_deterministic_and_never_excludes_a_class()
    test_top_k_family_gate_uses_no_artificial_thousand_point_offset()
    test_label_parser_is_conservative()
    test_v13_split_is_preserved_without_group_leakage()
    test_oof_audit_and_artifact_contract_when_generated()
