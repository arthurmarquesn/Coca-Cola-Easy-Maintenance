from __future__ import annotations

import numpy as np
from scipy import sparse

from ml.classifier_wrappers import PrototypeRerankerClassifier
from ml.scripts.build_marilia_taxonomy_v2 import SAFE_MAPPINGS, derive_family


class _FakeClassifier:
    classes_ = np.asarray(["A", "B", "C", "D"])

    def decision_function(self, _features):
        return np.asarray([[0.4, 0.3, 0.2, -1.0]])


def test_safe_taxonomy_does_not_merge_generic_specific_pair() -> None:
    assert SAFE_MAPPINGS["QUEBRA DA ESTEIRA"][0] == "QUEBRA DE ESTEIRA"
    assert "FALHA DE ENCHIMENTO" not in SAFE_MAPPINGS
    assert "FALHA DE VALVULA DE ENCHIMENTO" not in SAFE_MAPPINGS


def test_family_derivation_is_conservative() -> None:
    assert derive_family("FALHA DE SENSOR") == "SENSOR"
    assert derive_family("QUEBRA DE CORREIA") == "CORREIA"
    assert derive_family("TEXTO SEM COMPONENTE CONFIAVEL") == "OTHER_UNKNOWN"


def test_reranker_never_promotes_a_class_outside_base_top3() -> None:
    centroids = sparse.csr_matrix(
        [
            [0.0, 1.0],
            [1.0, 0.0],
            [0.5, 0.5],
            [0.0, 1.0],
        ]
    )
    classifier = PrototypeRerankerClassifier(
        _FakeClassifier(), centroids, alpha=1.0, top_k=3
    )
    scores = classifier.decision_function(sparse.csr_matrix([[0.0, 1.0]]))
    assert scores.shape == (1, 4)
    assert scores[0, 3] < -1e8
    assert classifier.predict(sparse.csr_matrix([[0.0, 1.0]])).shape == (1,)
