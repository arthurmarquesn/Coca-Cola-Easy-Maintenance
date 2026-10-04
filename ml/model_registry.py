"""Approved local model registry for the Ursus inference runtime.

This module owns the only mapping between a runtime version and a model
artifact. It deliberately performs no training and never writes artifacts.
"""

from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
import json
import os
from pathlib import Path
from typing import Any, Mapping

import joblib
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MODEL_VERSION = "v1.5"
MODEL_VERSION_ENV = "URSUS_MODEL_VERSION"
V16_SUPPORT_CAP = 2.8903717579


class ModelRegistryError(RuntimeError):
    """Base error for registry selection, integrity, or compatibility."""


class ModelIntegrityError(ModelRegistryError):
    """Raised when an approved artifact no longer matches its locked hash."""


class ModelCompatibilityError(ModelRegistryError):
    """Raised when an artifact cannot satisfy the inference contract."""


@dataclass(frozen=True)
class ModelSpec:
    version: str
    runtime_model_version: str
    status: str
    artifact_path: Path
    artifact_sha256: str
    config_path: Path | None = None
    config_sha256: str | None = None


@dataclass(frozen=True)
class LoadedModel:
    spec: ModelSpec
    package: Mapping[str, Any]
    artifact_sha256: str
    config_sha256: str | None
    load_seconds: float


MODEL_REGISTRY: dict[str, ModelSpec] = {
    "v1.5": ModelSpec(
        version="v1.5",
        runtime_model_version="ursus-v1.5",
        status="STABLE",
        artifact_path=(
            ROOT / "ml" / "models" / "failure_classifier_marilia_v1_5_candidate.joblib"
        ),
        artifact_sha256=(
            "471e78f81124969c22e86ac6c6edf8fa7b71164e7b0bc51bcba5dcc26d91f11b"
        ),
    ),
    "v1.6": ModelSpec(
        version="v1.6",
        runtime_model_version="ursus-v1.6",
        status="APPROVED_FOR_RUNTIME",
        artifact_path=(
            ROOT / "ml" / "models" / "ursus_reranker_v16_experimental_locked.joblib"
        ),
        artifact_sha256=(
            "58f4010bae724e29b7eae34b0bd370b608db3f706f5b7fe9e8a501eb3664b85b"
        ),
        config_path=(
            ROOT / "ml" / "reports" / "ursus_reranker_v16_locked_config.json"
        ),
        config_sha256=(
            "fd20bc5ed7e8fb8842b31d7393230c9ba7955ee85c5d88e674553e238f95852e"
        ),
    ),
}


def sha256_file(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalize_version(value: str | None) -> str:
    normalized = (value or DEFAULT_MODEL_VERSION).strip().lower()
    aliases = {
        "1.5": "v1.5",
        "ursus-v1.5": "v1.5",
        "1.6": "v1.6",
        "ursus-v1.6": "v1.6",
    }
    normalized = aliases.get(normalized, normalized)
    if normalized not in MODEL_REGISTRY:
        allowed = ", ".join(sorted(MODEL_REGISTRY))
        raise ModelRegistryError(
            f"Unsupported {MODEL_VERSION_ENV}={value!r}; allowed versions: {allowed}."
        )
    return normalized


def selected_version(environ: Mapping[str, str] | None = None) -> str:
    source = os.environ if environ is None else environ
    return normalize_version(source.get(MODEL_VERSION_ENV))


def get_model_spec(version: str) -> ModelSpec:
    return MODEL_REGISTRY[normalize_version(version)]


def verify_integrity(spec: ModelSpec) -> tuple[str, str | None]:
    if not spec.artifact_path.is_file():
        raise ModelIntegrityError(f"Approved artifact not found: {spec.artifact_path}")

    artifact_hash = sha256_file(spec.artifact_path)
    if artifact_hash != spec.artifact_sha256:
        raise ModelIntegrityError(
            "Artifact integrity check failed for "
            f"{spec.version}: expected {spec.artifact_sha256}, got {artifact_hash}."
        )

    config_hash: str | None = None
    if spec.config_path is not None:
        if not spec.config_path.is_file():
            raise ModelIntegrityError(f"Locked config not found: {spec.config_path}")
        config_hash = sha256_file(spec.config_path)
        if config_hash != spec.config_sha256:
            raise ModelIntegrityError(
                "Locked config integrity check failed for "
                f"{spec.version}: expected {spec.config_sha256}, got {config_hash}."
            )

    return artifact_hash, config_hash


def _validate_common_package(package: Any, spec: ModelSpec) -> Mapping[str, Any]:
    if not isinstance(package, dict):
        raise ModelCompatibilityError(f"{spec.version} artifact is not a dictionary.")

    vectorizer = package.get("vectorizer")
    classifier = package.get("classifier")
    if not callable(getattr(vectorizer, "transform", None)):
        raise ModelCompatibilityError(f"{spec.version} vectorizer has no transform().")
    if not callable(getattr(classifier, "decision_function", None)):
        raise ModelCompatibilityError(
            f"{spec.version} classifier has no decision_function()."
        )
    if not hasattr(classifier, "classes_"):
        raise ModelCompatibilityError(f"{spec.version} classifier has no classes_ field.")

    classes = np.asarray(classifier.classes_).astype(str)
    saved_classes = np.asarray(package.get("classes", classes)).astype(str)
    if classes.ndim != 1 or not len(classes) or not np.array_equal(classes, saved_classes):
        raise ModelCompatibilityError(
            f"{spec.version} saved classes do not match classifier.classes_."
        )
    return package


def _validate_v16_lock(package: Mapping[str, Any], spec: ModelSpec) -> None:
    assert spec.config_path is not None
    locked = json.loads(spec.config_path.read_text(encoding="utf-8"))
    expected = locked.get("winner_parameters")
    embedded = package.get("locked_config")
    if embedded != expected:
        raise ModelCompatibilityError(
            "The v1.6 embedded configuration differs from the locked config."
        )
    if locked.get("model_sha256") != spec.artifact_sha256:
        raise ModelIntegrityError("The v1.6 locked config references another artifact hash.")
    if locked.get("winner") != "SUPPORT_CAPPED":
        raise ModelCompatibilityError("The approved v1.6 winner is not SUPPORT_CAPPED.")

    classifier = package["classifier"]
    feature_config = getattr(classifier, "experimental_feature_config", None)
    actual_cap = getattr(feature_config, "support_cap", None)
    if actual_cap != V16_SUPPORT_CAP:
        raise ModelCompatibilityError(
            f"v1.6 log_class_support cap must be exactly {V16_SUPPORT_CAP}; got {actual_cap}."
        )
    expected_features = tuple(expected.get("features", []))
    feature_names = tuple(getattr(classifier, "feature_names", ()))
    feature_indices = tuple(getattr(classifier, "feature_indices", ()))
    selected_features = tuple(feature_names[index] for index in feature_indices)
    if selected_features != expected_features:
        raise ModelCompatibilityError("v1.6 runtime feature order differs from the lock.")
    if int(getattr(classifier, "candidate_n", 0)) != int(expected["candidate_n"]):
        raise ModelCompatibilityError("v1.6 candidate_n differs from the lock.")


def load_model(version: str) -> LoadedModel:
    """Verify and load an approved immutable artifact without fitting."""

    from time import perf_counter

    spec = get_model_spec(version)
    artifact_hash, config_hash = verify_integrity(spec)
    started = perf_counter()
    package = _validate_common_package(joblib.load(spec.artifact_path), spec)
    elapsed = perf_counter() - started
    if spec.version == "v1.6":
        _validate_v16_lock(package, spec)
    return LoadedModel(spec, package, artifact_hash, config_hash, elapsed)


def registry_metadata() -> dict[str, dict[str, Any]]:
    return {
        version: {
            "runtime_model_version": spec.runtime_model_version,
            "status": spec.status,
            "artifact": str(spec.artifact_path),
            "artifact_sha256": spec.artifact_sha256,
            "config": str(spec.config_path) if spec.config_path else None,
            "config_sha256": spec.config_sha256,
        }
        for version, spec in MODEL_REGISTRY.items()
    }
