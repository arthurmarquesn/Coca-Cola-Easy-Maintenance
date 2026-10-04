from __future__ import annotations

import inspect
from pathlib import Path

import numpy as np
import pytest

from ml import runtime as runtime_module
from ml.api import app
from ml.model_registry import V16_SUPPORT_CAP
from ml.runtime import UrsusRuntime, validate_labels_in_taxonomy


SMOKE_OBSERVATIONS = (
    "falha no sensor da esteira",
    "esteira escapou e parou a linha",
    "valvula de enchimento travada",
    "garrafas caindo no transporte",
    "motor desarmou durante a producao",
)


@pytest.fixture(scope="module")
def runtime_v16() -> UrsusRuntime:
    runtime = UrsusRuntime(environ={"URSUS_MODEL_VERSION": "v1.6"})
    runtime.initialize()
    return runtime


def _top3(output: runtime_module.ModelOutput) -> list[list[str]]:
    classes = np.asarray(output.loaded_model.package["classifier"].classes_).astype(str)
    return [
        [str(classes[index]) for index in np.argsort(row)[::-1][:3]]
        for row in output.scores
    ]


def test_v15_and_v16_load_and_labels_exist_in_taxonomy(
    runtime_v16: UrsusRuntime,
) -> None:
    assert runtime_v16.active_version == "v1.6"
    assert set(runtime_v16.models) == {"v1.5", "v1.6"}
    for loaded in runtime_v16.models.values():
        validate_labels_in_taxonomy(loaded)


def test_v16_top3_is_finite_unique_and_deterministic(
    runtime_v16: UrsusRuntime,
) -> None:
    first = runtime_v16.predict(SMOKE_OBSERVATIONS)
    second = runtime_v16.predict(SMOKE_OBSERVATIONS)
    assert first.output.loaded_model.spec.runtime_model_version == "ursus-v1.6"
    assert np.array_equal(first.output.scores, second.output.scores)
    assert np.isfinite(first.output.scores).all()
    for suggestions in _top3(first.output):
        assert len(suggestions) == 3
        assert len(set(suggestions)) == 3


def test_v16_applies_the_locked_log_support_cap(
    runtime_v16: UrsusRuntime,
) -> None:
    loaded = runtime_v16.models["v1.6"]
    vectorizer = loaded.package["vectorizer"]
    classifier = loaded.package["classifier"]
    batch = vectorizer.transform(list(SMOKE_OBSERVATIONS))
    matrix = batch.matrix
    flat_scores = np.asarray(classifier.base_classifier.decision_function(matrix))
    candidates = np.argsort(flat_scores, axis=1)[:, -classifier.candidate_n :][:, ::-1]
    features = classifier._candidate_features(
        matrix,
        batch.texts,
        flat_scores,
        candidates,
    )
    support_index = classifier.feature_names.index("log_class_support")
    assert float(features[:, support_index].max()) <= V16_SUPPORT_CAP
    assert classifier.experimental_feature_config.support_cap == V16_SUPPORT_CAP


def test_runtime_source_contains_no_fitting_path() -> None:
    source = inspect.getsource(runtime_module)
    assert ".fit(" not in source
    assert ".fit_transform(" not in source


def test_fastapi_contract_remains_compatible_and_human_review_is_required(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("URSUS_MODEL_VERSION", "v1.6")
    monkeypatch.setenv("URSUS_SHADOW_V16", "false")
    app.load_model()
    app.load_origin_model()
    result = app.predict(
        app.PredictionRequest(observation="falha no sensor da esteira")
    )
    required = {
        "model_version",
        "failed_component_code",
        "failure_mode",
        "confidence",
        "top_predictions",
        "decision_source",
        "decision_margin",
        "automation_threshold",
        "automation_status",
        "review_required",
        "confidence_type",
        "failure_origin",
        "failure_origin_confidence",
        "failure_origin_confidence_level",
        "failure_origin_model_version",
    }
    assert required <= set(result)
    assert result["model_version"] == "rules-v3+ml-ursus-v1.6"
    assert len(result["top_predictions"]) == 3
    assert result["review_required"] is True
    assert result["automation_status"] == "REVIEW_REQUIRED"
    assert all(np.isfinite(item["confidence"]) for item in result["top_predictions"])


def test_locked_artifact_and_config_are_not_written_by_runtime() -> None:
    source = inspect.getsource(runtime_module)
    protected = {
        Path("ml/models/ursus_reranker_v16_experimental_locked.joblib").name,
        Path("ml/reports/ursus_reranker_v16_locked_config.json").name,
    }
    assert all(name not in source for name in protected)
