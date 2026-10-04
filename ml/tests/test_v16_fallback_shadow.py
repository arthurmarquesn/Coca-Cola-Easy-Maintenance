from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import numpy as np

from ml.model_registry import LoadedModel, ModelSpec
from ml.runtime import SHADOW_ENV, UrsusRuntime


class FakeVectorizer:
    def transform(self, texts: list[str]) -> np.ndarray:
        return np.arange(len(texts), dtype=float).reshape(-1, 1)

    def fit(self, *_args: Any, **_kwargs: Any) -> None:
        raise AssertionError("fit must never run in the inference runtime")


class FakeClassifier:
    classes_ = np.asarray(["A", "B", "C", "D"])

    def __init__(self, scores: list[float] | None = None, error: Exception | None = None):
        self.scores = np.asarray(scores or [4.0, 3.0, 2.0, 1.0], dtype=float)
        self.error = error

    def decision_function(self, features: np.ndarray) -> np.ndarray:
        if self.error is not None:
            raise self.error
        return np.tile(self.scores, (len(features), 1))

    def fit(self, *_args: Any, **_kwargs: Any) -> None:
        raise AssertionError("fit must never run in the inference runtime")


def fake_loaded(version: str, classifier: FakeClassifier) -> LoadedModel:
    spec = ModelSpec(
        version=version,
        runtime_model_version=f"ursus-{version}",
        status="TEST",
        artifact_path=Path(f"{version}.joblib"),
        artifact_sha256=version,
    )
    package = {
        "vectorizer": FakeVectorizer(),
        "classifier": classifier,
        "classes": classifier.classes_,
    }
    return LoadedModel(spec, package, version, None, 0.01)


def test_v16_inference_error_falls_back_to_v15() -> None:
    models = {
        "v1.5": fake_loaded("v1.5", FakeClassifier()),
        "v1.6": fake_loaded("v1.6", FakeClassifier(error=RuntimeError("feature error"))),
    }
    runtime = UrsusRuntime(
        environ={"URSUS_MODEL_VERSION": "v1.6"},
        loader=models.__getitem__,
    )
    runtime.initialize()
    result = runtime.predict(["observacao protegida"])
    assert result.fallback_used is True
    assert result.output.loaded_model.spec.version == "v1.5"
    assert result.fallback_reason == "feature error"


def test_invalid_v16_output_falls_back_to_v15() -> None:
    models = {
        "v1.5": fake_loaded("v1.5", FakeClassifier()),
        "v1.6": fake_loaded("v1.6", FakeClassifier(scores=[np.nan, 3, 2, 1])),
    }
    runtime = UrsusRuntime(
        environ={"URSUS_MODEL_VERSION": "v1.6"},
        loader=models.__getitem__,
    )
    runtime.initialize()
    assert runtime.predict(["x"]).output.loaded_model.spec.version == "v1.5"


def test_v16_load_error_aborts_activation_and_starts_v15() -> None:
    v15 = fake_loaded("v1.5", FakeClassifier())

    def loader(version: str) -> LoadedModel:
        if version == "v1.6":
            raise RuntimeError("hash mismatch")
        return v15

    runtime = UrsusRuntime(environ={"URSUS_MODEL_VERSION": "v1.6"}, loader=loader)
    runtime.initialize()
    assert runtime.active_version == "v1.5"
    assert runtime.startup_fallback_used is True
    assert runtime.predict(["x"]).output.loaded_model.spec.version == "v1.5"


def test_shadow_runs_v16_but_returns_v15_and_logs_differences(caplog: Any) -> None:
    models = {
        "v1.5": fake_loaded("v1.5", FakeClassifier([4, 3, 2, 1])),
        "v1.6": fake_loaded("v1.6", FakeClassifier([1, 4, 3, 2])),
    }
    runtime = UrsusRuntime(
        environ={"URSUS_MODEL_VERSION": "v1.5", SHADOW_ENV: "true"},
        loader=models.__getitem__,
    )
    runtime.initialize()
    secret_observation = "texto que nao deve aparecer no log"
    with caplog.at_level(logging.INFO, logger="ursus.runtime"):
        result = runtime.predict([secret_observation])
    assert result.output.loaded_model.spec.version == "v1.5"
    shadow_records = [
        json.loads(record.message)
        for record in caplog.records
        if '"event": "shadow_comparison"' in record.message
    ]
    assert len(shadow_records) == 1
    assert shadow_records[0]["top1_changed"] is True
    assert shadow_records[0]["overlap_top3"] == 2
    assert secret_observation not in caplog.text


def test_explicit_v15_is_logical_rollback_without_code_change() -> None:
    v15 = fake_loaded("v1.5", FakeClassifier())
    runtime = UrsusRuntime(
        environ={"URSUS_MODEL_VERSION": "v1.5"},
        loader=lambda _version: v15,
    )
    runtime.initialize()
    assert runtime.requested_version == "v1.5"
    assert runtime.active_version == "v1.5"
    assert runtime.startup_fallback_used is False
