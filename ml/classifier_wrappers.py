from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Any, Sequence

import numpy as np
from scipy import sparse
from sklearn.preprocessing import normalize


def _decision_scores(classifier: Any, features: Any) -> np.ndarray:
    matrix, _ = _unwrap_features(features)
    scores = np.asarray(classifier.decision_function(matrix), dtype=float)
    if scores.ndim == 1:
        scores = np.column_stack([-scores, scores])
    return scores


@dataclass
class TextFeatureBatch:
    """Sparse features plus source text for label-aware candidate scoring."""

    matrix: Any
    texts: tuple[str, ...]


class TextPreservingVectorizer:
    """Keep the current API contract while retaining raw text for v1.5."""

    def __init__(self, base_vectorizer: Any) -> None:
        self.base_vectorizer = base_vectorizer

    def fit(self, raw_documents: Sequence[str], y: Any = None) -> "TextPreservingVectorizer":
        self.base_vectorizer.fit(raw_documents, y)
        return self

    def fit_transform(self, raw_documents: Sequence[str], y: Any = None) -> TextFeatureBatch:
        texts = tuple(str(value) for value in raw_documents)
        return TextFeatureBatch(
            self.base_vectorizer.fit_transform(texts, y),
            texts,
        )

    def transform(self, raw_documents: Sequence[str]) -> TextFeatureBatch:
        texts = tuple(str(value) for value in raw_documents)
        return TextFeatureBatch(self.base_vectorizer.transform(texts), texts)

    def get_feature_names_out(self) -> Any:
        return self.base_vectorizer.get_feature_names_out()


def _unwrap_features(features: Any) -> tuple[Any, tuple[str, ...] | None]:
    if isinstance(features, TextFeatureBatch):
        return features.matrix, features.texts
    return features, None


def _row_minmax(scores: np.ndarray) -> np.ndarray:
    minimum = scores.min(axis=1, keepdims=True)
    spread = scores.max(axis=1, keepdims=True) - minimum
    return np.divide(
        scores - minimum,
        spread,
        out=np.zeros_like(scores, dtype=float),
        where=spread > 0,
    )


def _normalize_text(value: str) -> str:
    text = unicodedata.normalize("NFKD", str(value))
    text = "".join(character for character in text if not unicodedata.combining(character))
    text = re.sub(r"[^A-Z0-9]+", " ", text.upper())
    return re.sub(r"\s+", " ", text).strip()


_LABEL_STOPWORDS = {"A", "AS", "O", "OS", "DE", "DA", "DAS", "DO", "DOS", "EM", "NA", "NO", "NAS", "NOS", "COM"}
_MECHANISMS = (
    "FALHA", "QUEBRA", "TRAVAMENTO", "ENROSCO", "DESARME", "VAZAMENTO",
    "ROMPIMENTO", "QUEDA", "DESALINHAMENTO", "DEFORMACAO", "AMASSAMENTO",
    "COLAPSO", "ENTUPIMENTO", "PATINAMENTO", "ESCAPE", "QUEIMA", "DESGASTE",
    "TREPIDADACAO", "VIBRACAO", "SOBREAQUECIMENTO", "CURTO", "OBSTRUCAO",
)


def parse_label_component_mechanism(label: str) -> tuple[str, str]:
    """Conservative deterministic label decomposition used only as features."""

    normalized = _normalize_text(label)
    tokens = normalized.split()
    mechanism = next((item for item in _MECHANISMS if item in tokens), "UNKNOWN")
    component_tokens = [
        token for token in tokens
        if token not in _LABEL_STOPWORDS and token != mechanism
    ]
    component = " ".join(component_tokens) if component_tokens else "UNKNOWN"
    return component, mechanism


class TopKFamilyGateClassifier:
    """Allow every class in the top-k predicted families, without large offsets."""

    def __init__(
        self,
        mode_classifier: Any,
        family_classifier: Any,
        class_to_family: dict[str, str],
        top_k_families: int,
    ) -> None:
        self.mode_classifier = mode_classifier
        self.family_classifier = family_classifier
        self.class_to_family = {str(key): str(value) for key, value in class_to_family.items()}
        self.top_k_families = int(top_k_families)
        self.classes_ = np.asarray(mode_classifier.classes_).astype(str)

    def decision_function(self, features: Any) -> np.ndarray:
        matrix, _ = _unwrap_features(features)
        flat = _row_minmax(_decision_scores(self.mode_classifier, matrix))
        family_scores = _decision_scores(self.family_classifier, matrix)
        family_classes = np.asarray(self.family_classifier.classes_).astype(str)
        limit = min(self.top_k_families, len(family_classes))
        family_order = np.argsort(family_scores, axis=1)[:, -limit:]
        result = np.full(flat.shape, -1.0, dtype=float)
        class_families = np.asarray(
            [self.class_to_family.get(label, "OTHER_UNKNOWN") for label in self.classes_]
        )
        for row_index, indices in enumerate(family_order):
            allowed = set(family_classes[indices])
            mask = np.asarray([family in allowed for family in class_families])
            result[row_index, mask] = flat[row_index, mask]
        return result

    def predict(self, features: Any) -> np.ndarray:
        scores = self.decision_function(features)
        return self.classes_[np.argmax(scores, axis=1)]


class SoftHierarchicalClassifier:
    """Blend normalized flat and family evidence without excluding classes."""

    def __init__(
        self,
        mode_classifier: Any,
        family_classifier: Any,
        class_to_family: dict[str, str],
        alpha: float,
        beta: float,
    ) -> None:
        self.mode_classifier = mode_classifier
        self.family_classifier = family_classifier
        self.class_to_family = {str(key): str(value) for key, value in class_to_family.items()}
        self.alpha = float(alpha)
        self.beta = float(beta)
        self.classes_ = np.asarray(mode_classifier.classes_).astype(str)

    def decision_function(self, features: Any) -> np.ndarray:
        matrix, _ = _unwrap_features(features)
        flat = _row_minmax(_decision_scores(self.mode_classifier, matrix))
        family = _row_minmax(_decision_scores(self.family_classifier, matrix))
        family_classes = np.asarray(self.family_classifier.classes_).astype(str)
        family_index = {label: index for index, label in enumerate(family_classes)}
        family_by_class = np.asarray(
            [family_index.get(self.class_to_family.get(label, "OTHER_UNKNOWN"), -1) for label in self.classes_]
        )
        expanded = np.zeros_like(flat)
        valid = family_by_class >= 0
        expanded[:, valid] = family[:, family_by_class[valid]]
        return self.alpha * flat + self.beta * expanded

    def predict(self, features: Any) -> np.ndarray:
        scores = self.decision_function(features)
        return self.classes_[np.argmax(scores, axis=1)]


class LearnedCandidateRerankerClassifier:
    """TRAIN-only learned reranking over the flat classifier's top-N classes."""

    feature_names = (
        "flat_score", "normalized_flat_score", "family_score",
        "centroid_similarity", "max_neighbor_similarity",
        "mean_top3_neighbor_similarity", "log_class_support", "top1_gap",
        "token_overlap", "root_overlap", "char_overlap", "label_cosine",
        "component_present", "mechanism_present",
    )

    def __init__(
        self,
        base_classifier: Any,
        family_classifier: Any,
        class_to_family: dict[str, str],
        centroids: Any,
        label_features: Any,
        exemplars: Any,
        exemplar_labels: Sequence[str],
        class_support: dict[str, int],
        ranker: Any,
        candidate_n: int,
        feature_indices: Sequence[int] | None = None,
    ) -> None:
        self.base_classifier = base_classifier
        self.family_classifier = family_classifier
        self.class_to_family = {str(key): str(value) for key, value in class_to_family.items()}
        self.centroids = normalize(centroids, norm="l2", axis=1, copy=True)
        self.label_features = normalize(label_features, norm="l2", axis=1, copy=True)
        self.exemplars = normalize(exemplars, norm="l2", axis=1, copy=True)
        self.exemplar_labels = np.asarray(exemplar_labels).astype(str)
        self.class_support = {str(key): int(value) for key, value in class_support.items()}
        self.ranker = ranker
        self.candidate_n = int(candidate_n)
        self.feature_indices = tuple(feature_indices) if feature_indices is not None else tuple(range(len(self.feature_names)))
        self.classes_ = np.asarray(base_classifier.classes_).astype(str)
        self._class_index = {label: index for index, label in enumerate(self.classes_)}
        self._exemplar_indices = {
            label: np.flatnonzero(self.exemplar_labels == label) for label in self.classes_
        }
        self._label_parts = {
            label: parse_label_component_mechanism(label) for label in self.classes_
        }

    def _candidate_features(
        self,
        matrix: Any,
        texts: tuple[str, ...] | None,
        flat_scores: np.ndarray,
        candidate_indices: np.ndarray,
    ) -> np.ndarray:
        normalized_matrix = normalize(matrix, norm="l2", axis=1, copy=True)
        normalized_flat = _row_minmax(flat_scores)
        family_scores = _row_minmax(_decision_scores(self.family_classifier, matrix))
        family_classes = np.asarray(self.family_classifier.classes_).astype(str)
        family_index = {label: index for index, label in enumerate(family_classes)}
        centroid_sim = normalized_matrix @ self.centroids.T
        label_sim = normalized_matrix @ self.label_features.T
        if sparse.issparse(centroid_sim):
            centroid_sim = centroid_sim.toarray()
        if sparse.issparse(label_sim):
            label_sim = label_sim.toarray()
        centroid_sim = np.asarray(centroid_sim, dtype=float)
        label_sim = np.asarray(label_sim, dtype=float)
        rows: list[list[float]] = []
        for row_index, candidates in enumerate(candidate_indices):
            normalized_text = _normalize_text(texts[row_index]) if texts is not None else ""
            text_tokens = set(normalized_text.split())
            text_roots = {token[:4] for token in text_tokens if len(token) >= 4}
            text_chars = {normalized_text[index:index + 3] for index in range(max(0, len(normalized_text) - 2))}
            top_score = float(flat_scores[row_index, candidates[0]])
            for class_index in candidates:
                label = str(self.classes_[class_index])
                label_norm = _normalize_text(label)
                label_tokens = set(label_norm.split()) - _LABEL_STOPWORDS
                label_roots = {token[:4] for token in label_tokens if len(token) >= 4}
                label_chars = {label_norm[index:index + 3] for index in range(max(0, len(label_norm) - 2))}
                exemplar_indices = self._exemplar_indices.get(label, np.asarray([], dtype=int))
                if len(exemplar_indices):
                    sims = normalized_matrix[row_index] @ self.exemplars[exemplar_indices].T
                    if sparse.issparse(sims):
                        sims = sims.toarray()
                    values = np.sort(np.asarray(sims, dtype=float).ravel())[::-1]
                    maximum = float(values[0])
                    mean_top3 = float(values[:3].mean())
                else:
                    maximum = mean_top3 = 0.0
                family = self.class_to_family.get(label, "OTHER_UNKNOWN")
                family_value = float(family_scores[row_index, family_index[family]]) if family in family_index else 0.0
                component, mechanism = self._label_parts[label]
                token_union = text_tokens | label_tokens
                root_union = text_roots | label_roots
                char_union = text_chars | label_chars
                rows.append([
                    float(flat_scores[row_index, class_index]),
                    float(normalized_flat[row_index, class_index]),
                    family_value,
                    float(centroid_sim[row_index, class_index]),
                    maximum,
                    mean_top3,
                    float(np.log1p(self.class_support.get(label, 0))),
                    top_score - float(flat_scores[row_index, class_index]),
                    len(text_tokens & label_tokens) / len(token_union) if token_union else 0.0,
                    len(text_roots & label_roots) / len(root_union) if root_union else 0.0,
                    len(text_chars & label_chars) / len(char_union) if char_union else 0.0,
                    float(label_sim[row_index, class_index]),
                    float(component != "UNKNOWN" and component in normalized_text),
                    float(mechanism != "UNKNOWN" and mechanism in text_tokens),
                ])
        return np.asarray(rows, dtype=float)

    def decision_function(self, features: Any) -> np.ndarray:
        matrix, texts = _unwrap_features(features)
        flat_scores = _decision_scores(self.base_classifier, matrix)
        normalized_flat = _row_minmax(flat_scores)
        limit = min(self.candidate_n, flat_scores.shape[1])
        candidate_indices = np.argsort(flat_scores, axis=1)[:, -limit:][:, ::-1]
        candidate_features = self._candidate_features(matrix, texts, flat_scores, candidate_indices)
        learned = np.asarray(
            self.ranker.decision_function(candidate_features[:, self.feature_indices]),
            dtype=float,
        ).reshape(-1)
        # Candidate scores are normalized row-wise. Non-candidates preserve the
        # flat order below zero, so top-5 remains useful when N is only three.
        result = -1.0 + normalized_flat
        offset = 0
        for row_index, candidates in enumerate(candidate_indices):
            values = learned[offset:offset + len(candidates)]
            minimum = float(values.min())
            spread = float(values.max() - minimum)
            scaled = (values - minimum) / spread if spread > 0 else np.ones_like(values)
            result[row_index, candidates] = scaled
            offset += len(candidates)
        return result

    def predict(self, features: Any) -> np.ndarray:
        scores = self.decision_function(features)
        return self.classes_[np.argmax(scores, axis=1)]


class CanonicalRemapClassifier:
    """Collapse an existing classifier's labels into a reviewed taxonomy."""

    def __init__(self, base_classifier: Any, label_map: dict[str, str]) -> None:
        self.base_classifier = base_classifier
        self.label_map = {str(key): str(value) for key, value in label_map.items()}
        self.classes_ = np.asarray(
            sorted(
                {
                    self.label_map.get(str(label), str(label))
                    for label in base_classifier.classes_
                }
            ),
            dtype=str,
        )
        self._canonical_index = {
            label: index for index, label in enumerate(self.classes_)
        }

    def decision_function(self, features: Any) -> np.ndarray:
        base_scores = _decision_scores(self.base_classifier, features)
        collapsed = np.full(
            (base_scores.shape[0], len(self.classes_)),
            -1e9,
            dtype=float,
        )
        for source_index, source_label in enumerate(self.base_classifier.classes_):
            canonical = self.label_map.get(str(source_label), str(source_label))
            target_index = self._canonical_index[canonical]
            collapsed[:, target_index] = np.maximum(
                collapsed[:, target_index], base_scores[:, source_index]
            )
        return collapsed

    def predict(self, features: Any) -> np.ndarray:
        scores = self.decision_function(features)
        return self.classes_[np.argmax(scores, axis=1)]


class PrototypeRerankerClassifier:
    """Rerank only the LinearSVC top-k with TRAIN-only class centroids."""

    def __init__(
        self,
        base_classifier: Any,
        centroids: Any,
        alpha: float,
        top_k: int = 3,
    ) -> None:
        self.base_classifier = base_classifier
        self.centroids = normalize(centroids, norm="l2", axis=1, copy=True)
        self.alpha = float(alpha)
        self.top_k = int(top_k)
        self.classes_ = np.asarray(base_classifier.classes_).astype(str)

    def decision_function(self, features: Any) -> np.ndarray:
        base_scores = _decision_scores(self.base_classifier, features)
        limit = min(self.top_k, base_scores.shape[1])
        candidate_indices = np.argsort(base_scores, axis=1)[:, -limit:]
        normalized_features = normalize(features, norm="l2", axis=1, copy=True)
        similarities = normalized_features @ self.centroids.T
        if sparse.issparse(similarities):
            similarities = similarities.toarray()
        similarities = np.asarray(similarities, dtype=float)

        result = np.full(base_scores.shape, -1e9, dtype=float)
        for row_index, indices in enumerate(candidate_indices):
            candidate_base = base_scores[row_index, indices]
            minimum = float(candidate_base.min())
            spread = float(candidate_base.max() - minimum)
            if spread > 0:
                scaled_base = (candidate_base - minimum) / spread
            else:
                scaled_base = np.ones_like(candidate_base)
            combined = (
                (1.0 - self.alpha) * scaled_base
                + self.alpha * similarities[row_index, indices]
            )
            result[row_index, indices] = combined
        return result

    def predict(self, features: Any) -> np.ndarray:
        scores = self.decision_function(features)
        return self.classes_[np.argmax(scores, axis=1)]


class HierarchicalGateClassifier:
    """Predict a technical family, then select a mode inside that family."""

    def __init__(
        self,
        mode_classifier: Any,
        family_classifier: Any,
        class_to_family: dict[str, str],
    ) -> None:
        self.mode_classifier = mode_classifier
        self.family_classifier = family_classifier
        self.class_to_family = {
            str(key): str(value) for key, value in class_to_family.items()
        }
        self.classes_ = np.asarray(mode_classifier.classes_).astype(str)

    def decision_function(self, features: Any) -> np.ndarray:
        mode_scores = _decision_scores(self.mode_classifier, features)
        predicted_families = np.asarray(
            self.family_classifier.predict(features)
        ).astype(str)
        # Preserve the flat ordering outside the selected family for a stable
        # top-3 fallback, while keeping the family gate strict for top-1.
        result = mode_scores - 1000.0
        for row_index, family in enumerate(predicted_families):
            indices = [
                index
                for index, label in enumerate(self.classes_)
                if self.class_to_family.get(label, "OTHER_UNKNOWN") == family
            ]
            if not indices:
                result[row_index] = mode_scores[row_index]
                continue
            result[row_index, indices] = mode_scores[row_index, indices]
        return result

    def predict(self, features: Any) -> np.ndarray:
        scores = self.decision_function(features)
        return self.classes_[np.argmax(scores, axis=1)]
