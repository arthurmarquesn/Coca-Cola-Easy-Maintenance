"""Safe, reversible Ursus v1.5/v1.6 inference runtime."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timezone
from hashlib import sha256
import json
import logging
import os
from pathlib import Path
from time import perf_counter
from typing import Any, Callable, Mapping, Sequence

import numpy as np

from ml.model_registry import (
    LoadedModel,
    ModelRegistryError,
    load_model,
    selected_version,
)


LOGGER = logging.getLogger("ursus.runtime")
SHADOW_ENV = "URSUS_SHADOW_V16"
TOP_K = 3


class InferenceContractError(RuntimeError):
    """Raised when a model returns an unsafe or malformed result."""


@dataclass(frozen=True)
class ModelOutput:
    loaded_model: LoadedModel
    scores: np.ndarray
    predictions: np.ndarray
    latency_seconds: float


@dataclass(frozen=True)
class RuntimePrediction:
    output: ModelOutput
    requested_version: str
    fallback_used: bool
    fallback_reason: str | None = None


def env_flag(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def observation_hash(text: str) -> str:
    return sha256(text.strip().encode("utf-8")).hexdigest()[:16]


def _event(kind: str, **fields: Any) -> None:
    payload = {
        "event": kind,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        **fields,
    }
    LOGGER.info(json.dumps(payload, ensure_ascii=False, sort_keys=True))


class UrsusRuntime:
    """Loads approved models and keeps v1.6 activation reversible."""

    def __init__(
        self,
        environ: Mapping[str, str] | None = None,
        loader: Callable[[str], LoadedModel] = load_model,
    ) -> None:
        self.environ = dict(os.environ if environ is None else environ)
        self.loader = loader
        self.requested_version = selected_version(self.environ)
        self.active_version = self.requested_version
        self.shadow_enabled = env_flag(self.environ.get(SHADOW_ENV))
        self.startup_fallback_used = False
        self.startup_fallback_reason: str | None = None
        self.models: dict[str, LoadedModel] = {}

    def initialize(self) -> None:
        """Load v1.5 first so every v1.6 failure has a ready fallback."""

        self.models["v1.5"] = self.loader("v1.5")
        needs_v16 = self.requested_version == "v1.6" or self.shadow_enabled
        if needs_v16:
            try:
                self.models["v1.6"] = self.loader("v1.6")
            except Exception as error:
                if self.requested_version == "v1.6":
                    self.active_version = "v1.5"
                    self.startup_fallback_used = True
                    self.startup_fallback_reason = str(error)
                self.shadow_enabled = False
                _event(
                    "model_load_failure",
                    requested_version="v1.6",
                    fallback_used=self.requested_version == "v1.6",
                    error_type=type(error).__name__,
                    error=str(error),
                )

        _event(
            "runtime_initialized",
            requested_version=self.requested_version,
            active_version=self.active_version,
            shadow_enabled=self.shadow_enabled,
            fallback_used=self.startup_fallback_used,
        )

    @property
    def active_model(self) -> LoadedModel:
        try:
            return self.models[self.active_version]
        except KeyError as error:
            raise ModelRegistryError("Ursus runtime has not been initialized.") from error

    @property
    def compatibility_package(self) -> Mapping[str, Any]:
        return self.models["v1.5"].package

    def _infer(self, version: str, texts: Sequence[str]) -> ModelOutput:
        loaded = self.models[version]
        vectorizer = loaded.package["vectorizer"]
        classifier = loaded.package["classifier"]
        started = perf_counter()
        features = vectorizer.transform(list(texts))
        scores = np.asarray(classifier.decision_function(features), dtype=float)
        latency = perf_counter() - started
        if scores.ndim == 1:
            scores = np.column_stack((-scores, scores))

        classes = np.asarray(classifier.classes_).astype(str)
        expected_shape = (len(texts), len(classes))
        if scores.shape != expected_shape:
            raise InferenceContractError(
                f"{version} score shape {scores.shape} differs from {expected_shape}."
            )
        if not np.isfinite(scores).all():
            raise InferenceContractError(f"{version} produced a non-finite score.")
        predictions = classes[np.argmax(scores, axis=1)]
        if len(set(classes.tolist())) != len(classes):
            raise InferenceContractError(f"{version} classifier contains duplicate labels.")
        return ModelOutput(loaded, scores, predictions, latency)

    def _log_predictions(
        self,
        texts: Sequence[str],
        output: ModelOutput,
        fallback_used: bool,
        success: bool = True,
        error: str | None = None,
    ) -> None:
        classes = np.asarray(output.loaded_model.package["classifier"].classes_).astype(str)
        for index, text in enumerate(texts):
            ranked = np.argsort(output.scores[index])[::-1][:TOP_K]
            labels = [str(classes[position]) for position in ranked]
            _event(
                "inference",
                model_version=output.loaded_model.spec.runtime_model_version,
                observation_hash=observation_hash(text),
                latency_ms=round(output.latency_seconds * 1000.0, 3),
                success=success,
                fallback_used=fallback_used,
                suggestion_count=len(labels),
                top1_label=labels[0] if labels else None,
                top3_labels=labels,
                error=error,
            )

    def _log_shadow(
        self,
        texts: Sequence[str],
        primary: ModelOutput,
        shadow: ModelOutput | None,
        error: Exception | None,
    ) -> None:
        primary_classes = np.asarray(
            primary.loaded_model.package["classifier"].classes_
        ).astype(str)
        if shadow is None:
            for text in texts:
                _event(
                    "shadow_comparison",
                    observation_hash=observation_hash(text),
                    primary_version="ursus-v1.5",
                    shadow_version="ursus-v1.6",
                    success=False,
                    error_type=type(error).__name__ if error else "unknown",
                    error=str(error) if error else "unknown shadow error",
                )
            return

        shadow_classes = np.asarray(
            shadow.loaded_model.package["classifier"].classes_
        ).astype(str)
        for index, text in enumerate(texts):
            primary_top = [
                str(primary_classes[position])
                for position in np.argsort(primary.scores[index])[::-1][:TOP_K]
            ]
            shadow_top = [
                str(shadow_classes[position])
                for position in np.argsort(shadow.scores[index])[::-1][:TOP_K]
            ]
            _event(
                "shadow_comparison",
                observation_hash=observation_hash(text),
                primary_version="ursus-v1.5",
                shadow_version="ursus-v1.6",
                success=True,
                overlap_top3=len(set(primary_top) & set(shadow_top)),
                top1_changed=primary_top[0] != shadow_top[0],
                entered_top3=sorted(set(shadow_top) - set(primary_top)),
                exited_top3=sorted(set(primary_top) - set(shadow_top)),
                primary_latency_ms=round(primary.latency_seconds * 1000.0, 3),
                shadow_latency_ms=round(shadow.latency_seconds * 1000.0, 3),
            )

    def predict(self, texts: Sequence[str]) -> RuntimePrediction:
        clean_texts = tuple(str(text).strip() for text in texts)
        if not clean_texts or any(not text for text in clean_texts):
            raise InferenceContractError("Inference requires non-empty observations.")

        if self.active_version == "v1.5" and self.shadow_enabled:
            shadow_error: Exception | None = None
            shadow: ModelOutput | None = None
            with ThreadPoolExecutor(max_workers=2, thread_name_prefix="ursus-shadow") as pool:
                primary_future = pool.submit(self._infer, "v1.5", clean_texts)
                shadow_future = pool.submit(self._infer, "v1.6", clean_texts)
                primary = primary_future.result()
                try:
                    shadow = shadow_future.result()
                except Exception as error:
                    shadow_error = error
            self._log_predictions(clean_texts, primary, fallback_used=False)
            self._log_shadow(clean_texts, primary, shadow, shadow_error)
            return RuntimePrediction(primary, self.requested_version, False)

        try:
            output = self._infer(self.active_version, clean_texts)
            fallback_used = self.startup_fallback_used
            self._log_predictions(clean_texts, output, fallback_used=fallback_used)
            return RuntimePrediction(
                output,
                self.requested_version,
                fallback_used,
                self.startup_fallback_reason if fallback_used else None,
            )
        except Exception as error:
            if self.active_version != "v1.6":
                raise
            _event(
                "inference_failure",
                model_version="ursus-v1.6",
                success=False,
                fallback_used=True,
                error_type=type(error).__name__,
                error=str(error),
            )
            fallback = self._infer("v1.5", clean_texts)
            self._log_predictions(
                clean_texts,
                fallback,
                fallback_used=True,
                error=f"v1.6 {type(error).__name__}: {error}",
            )
            return RuntimePrediction(fallback, self.requested_version, True, str(error))


def validate_labels_in_taxonomy(
    loaded: LoadedModel,
    taxonomy_path: Path | None = None,
) -> None:
    import csv

    path = taxonomy_path or (
        Path(__file__).resolve().parent / "taxonomy" / "canonical_failure_modes.csv"
    )
    with path.open("r", encoding="utf-8-sig", newline="") as source:
        valid = {row["canonical_label"] for row in csv.DictReader(source)}
    classes = {
        str(value) for value in loaded.package["classifier"].classes_
    }
    missing = sorted(classes - valid)
    if missing:
        raise InferenceContractError(
            f"{loaded.spec.version} contains {len(missing)} labels outside the taxonomy."
        )
