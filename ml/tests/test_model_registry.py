from __future__ import annotations

from dataclasses import replace
from pathlib import Path

import pytest

from ml.model_registry import (
    MODEL_REGISTRY,
    V16_SUPPORT_CAP,
    ModelIntegrityError,
    ModelRegistryError,
    load_model,
    selected_version,
    verify_integrity,
)


def test_registry_contains_only_runtime_approved_versions() -> None:
    assert set(MODEL_REGISTRY) == {"v1.5", "v1.6"}
    assert MODEL_REGISTRY["v1.5"].status == "STABLE"
    assert MODEL_REGISTRY["v1.6"].status == "APPROVED_FOR_RUNTIME"
    assert "experimental_locked" in MODEL_REGISTRY["v1.6"].artifact_path.name


def test_environment_selection_defaults_to_v15_and_supports_rollback() -> None:
    assert selected_version({}) == "v1.5"
    assert selected_version({"URSUS_MODEL_VERSION": "v1.6"}) == "v1.6"
    assert selected_version({"URSUS_MODEL_VERSION": "ursus-v1.5"}) == "v1.5"


def test_unknown_or_unapproved_version_is_rejected() -> None:
    with pytest.raises(ModelRegistryError, match="allowed versions"):
        selected_version({"URSUS_MODEL_VERSION": "experimental-latest"})


def test_hash_check_rejects_tampered_artifact(tmp_path: Path) -> None:
    artifact = tmp_path / "model.joblib"
    artifact.write_bytes(b"not-the-approved-model")
    spec = replace(
        MODEL_REGISTRY["v1.5"],
        artifact_path=artifact,
        artifact_sha256="0" * 64,
    )
    with pytest.raises(ModelIntegrityError, match="integrity check failed"):
        verify_integrity(spec)


@pytest.mark.parametrize("version", ["v1.5", "v1.6"])
def test_approved_artifacts_load_without_modification(version: str) -> None:
    loaded = load_model(version)
    assert loaded.artifact_sha256 == MODEL_REGISTRY[version].artifact_sha256
    assert loaded.package["vectorizer"] is not None
    assert loaded.package["classifier"] is not None


def test_v16_locked_support_cap_is_exact() -> None:
    loaded = load_model("v1.6")
    config = loaded.package["classifier"].experimental_feature_config
    assert config.support_cap == V16_SUPPORT_CAP
    assert config.family_cap is None
    assert config.include_relative_top3 is False
