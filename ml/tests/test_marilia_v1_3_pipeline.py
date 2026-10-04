from __future__ import annotations

import pandas as pd

from ml.scripts.prepare_marilia_dataset import (
    build_conflicts,
    normalize_classification,
    normalize_observation,
)
from ml.scripts.train_failure_classifier_marilia_v1_3 import (
    create_group_split,
    verify_split,
)


def test_normalization_is_deterministic_and_preserves_numbers() -> None:
    assert normalize_observation("  Falha, no MOTOR 24V!  ") == (
        "falha no motor 24v"
    )
    assert normalize_classification(" Falha  elétrica / motor ") == (
        "FALHA ELETRICA MOTOR"
    )


def test_conflicts_are_reported_without_arbitrary_resolution() -> None:
    dataset = pd.DataFrame(
        {
            "row_id": [2, 3, 4],
            "observation": ["Falha A", "falha a", "Falha B"],
            "observation_norm": ["falha a", "falha a", "falha b"],
            "classification_original": ["Classe 1", "Classe 2", "Classe 1"],
            "classification_norm": ["CLASSE 1", "CLASSE 2", "CLASSE 1"],
        }
    )
    conflicts, keys = build_conflicts(dataset)
    assert keys == {"falha a"}
    assert len(conflicts) == 1
    assert conflicts.iloc[0]["row_ids"] == "2 | 3"


def test_group_split_has_no_leakage_and_keeps_all_classes_in_train() -> None:
    rows = []
    row_id = 1
    for class_index, group_count in enumerate((1, 2, 3, 8)):
        for group_index in range(group_count):
            observation = f"observacao {class_index} {group_index}"
            for duplicate in range(2):
                rows.append(
                    {
                        "row_id": row_id,
                        "observation": observation,
                        "observation_norm": observation,
                        "classification_original": f"Classe {class_index}",
                        "classification_norm": f"CLASSE {class_index}",
                    }
                )
                row_id += 1
    split = create_group_split(pd.DataFrame(rows), seed=42)
    audit = verify_split(split)
    assert audit["leakage"] == {
        "train_validation": 0,
        "train_test": 0,
        "validation_test": 0,
    }
    assert audit["classes_in_train"] == 4
