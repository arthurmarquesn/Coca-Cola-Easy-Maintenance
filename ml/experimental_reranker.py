"""Experimental reranker components; not part of the active Ursus runtime."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np

from ml.classifier_wrappers import LearnedCandidateRerankerClassifier


BASE_FEATURE_NAMES = tuple(LearnedCandidateRerankerClassifier.feature_names)
RELATIVE_FEATURE_NAMES = (
    "flat_minus_rank3_score",
    "flat_minus_rank4_score",
    "normalized_minus_rank3_score",
    "family_minus_rank3_score",
    "support_minus_rank3_score",
    "flat_rank",
    "flat_top3_indicator",
    "flat_top3_margin_to_rank4",
)
ALL_FEATURE_NAMES = BASE_FEATURE_NAMES + RELATIVE_FEATURE_NAMES


@dataclass(frozen=True)
class ExperimentalFeatureConfig:
    family_cap: float | None = None
    support_cap: float | None = None
    include_relative_top3: bool = False


def transform_candidate_features(
    features: np.ndarray,
    candidate_n: int,
    config: ExperimentalFeatureConfig,
) -> np.ndarray:
    """Apply TRAIN-derived caps and optionally append flat-relative features."""

    transformed = np.asarray(features, dtype=float).copy()
    family_index = BASE_FEATURE_NAMES.index("family_score")
    support_index = BASE_FEATURE_NAMES.index("log_class_support")
    if config.family_cap is not None:
        transformed[:, family_index] = np.minimum(
            transformed[:, family_index], float(config.family_cap)
        )
    if config.support_cap is not None:
        transformed[:, support_index] = np.minimum(
            transformed[:, support_index], float(config.support_cap)
        )
    if not config.include_relative_top3:
        return transformed
    if len(transformed) % candidate_n:
        raise ValueError("Candidate feature rows are not divisible by candidate_n")

    grouped = transformed.reshape(-1, candidate_n, transformed.shape[1])
    flat = grouped[:, :, BASE_FEATURE_NAMES.index("flat_score")]
    normalized = grouped[:, :, BASE_FEATURE_NAMES.index("normalized_flat_score")]
    family = grouped[:, :, family_index]
    support = grouped[:, :, support_index]
    rank3 = min(2, candidate_n - 1)
    rank4 = min(3, candidate_n - 1)
    ranks = np.broadcast_to(
        np.arange(1, candidate_n + 1, dtype=float), flat.shape
    )
    top3 = (ranks <= 3).astype(float)
    boundary_margin = np.maximum(flat[:, rank3] - flat[:, rank4], 0.0)
    relative = np.stack(
        [
            flat - flat[:, [rank3]],
            flat - flat[:, [rank4]],
            normalized - normalized[:, [rank3]],
            family - family[:, [rank3]],
            support - support[:, [rank3]],
            ranks,
            top3,
            top3 * boundary_margin[:, None],
        ],
        axis=2,
    )
    return np.column_stack(
        [transformed, relative.reshape(-1, len(RELATIVE_FEATURE_NAMES))]
    )


class ExperimentalCandidateRerankerClassifier(LearnedCandidateRerankerClassifier):
    """Frozen v1.5 candidate scorer with experimental feature transforms."""

    feature_names = ALL_FEATURE_NAMES

    def __init__(
        self,
        *args: Any,
        experimental_feature_config: ExperimentalFeatureConfig,
        **kwargs: Any,
    ) -> None:
        super().__init__(*args, **kwargs)
        self.experimental_feature_config = experimental_feature_config

    def _candidate_features(
        self,
        matrix: Any,
        texts: tuple[str, ...] | None,
        flat_scores: np.ndarray,
        candidate_indices: np.ndarray,
    ) -> np.ndarray:
        base = super()._candidate_features(
            matrix, texts, flat_scores, candidate_indices
        )
        return transform_candidate_features(
            base,
            candidate_indices.shape[1],
            self.experimental_feature_config,
        )
