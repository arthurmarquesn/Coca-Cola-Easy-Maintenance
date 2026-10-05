# FILE: ml/tests/test_v16_activation_policy.py

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import HTTPException

from ml.api import app


def build_origin_result() -> dict[str, Any]:
    return {
        "failure_origin": "MANUTENCAO",
        "failure_origin_confidence": 0.95,
        "failure_origin_confidence_level": "HIGH",
        "failure_origin_model_version":
            "failure_origin_classifier_v4_candidate",
    }


def build_prediction_result(
    model_version: str,
    decision_source: str = "ML",
) -> dict[str, Any]:
    return {
        "model_version":
            model_version,

        "failed_component_code":
            "TESTE",

        "failure_mode":
            "FALHA DE TESTE",

        "confidence":
            0.80,

        "top_predictions": [
            {
                "failed_component_code":
                    "TESTE",

                "failure_mode":
                    "FALHA DE TESTE",

                "confidence":
                    0.80,

                "decision_score":
                    1.0,
            },
        ],

        "decision_source":
            decision_source,

        "decision_margin":
            0.50 if decision_source == "ML" else None,

        "automation_threshold":
            0.70 if decision_source == "ML" else None,

        "automation_status":
            "REVIEW_REQUIRED",

        "review_required":
            True,

        "confidence_type":
            (
                "ranking_score_not_probability"
                if decision_source == "ML"
                else
                "rule_confidence"
            ),

        **build_origin_result(),
    }


def test_rule_prediction_requires_human_review(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_rule = SimpleNamespace(
        failed_component_code=
            "RECRAVADORA",

        failure_mode=
            "AMASSAMENTO DE LATAS",

        confidence=
            1.0,
    )

    monkeypatch.setattr(
        app,
        "model_package",
        {
            "model_version":
                "ursus-v1.6",
        },
    )

    monkeypatch.setattr(
        app,
        "classify_by_rule",
        lambda _event:
            fake_rule,
    )

    monkeypatch.setattr(
        app,
        "predict_origin_many",
        lambda requests: [
            build_origin_result()
            for _ in requests
        ],
    )

    monkeypatch.setattr(
        app,
        "get_classifier_version",
        lambda:
            "rules-v3+ml-ursus-v1.6",
    )

    request = app.PredictionRequest(
        observation=(
            "INVESTIGAÇÃO NA RECRAVADORA "
            "AMASSANDO LATAS"
        ),
    )

    result = app.predict_many(
        [
            request,
        ]
    )[0]

    assert (
        result["decision_source"]
        ==
        "RULE"
    )

    assert (
        result["automation_status"]
        ==
        "REVIEW_REQUIRED"
    )

    assert (
        result["review_required"]
        is True
    )


def test_ml_v16_requires_human_review(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeSpec:
        version = "v1.6"
        runtime_model_version = "ursus-v1.6"

    class FakeClassifier:
        classes_ = [
            "FALHA A",
            "FALHA B",
            "FALHA C",
        ]

    class FakeLoadedModel:
        spec = FakeSpec()

        package = {
            "classifier":
                FakeClassifier(),
        }

    class FakeOutput:
        loaded_model = FakeLoadedModel()

        predictions = [
            "FALHA A",
        ]

        scores = __import__(
            "numpy"
        ).array(
            [
                [
                    3.0,
                    2.0,
                    1.0,
                ]
            ],
            dtype=float,
        )

    class FakeRuntimePrediction:
        output = FakeOutput()

    class FakeRuntime:
        def predict(
            self,
            _texts: list[str],
        ) -> FakeRuntimePrediction:
            return FakeRuntimePrediction()

    monkeypatch.setattr(
        app,
        "model_package",
        {
            "model_version":
                "ursus-v1.6",
        },
    )

    monkeypatch.setattr(
        app,
        "ursus_runtime",
        FakeRuntime(),
    )

    monkeypatch.setattr(
        app,
        "display_failure_mode",
        lambda value:
            value,
    )

    request = app.PredictionRequest(
        observation=
            "falha no sensor da esteira",
    )

    result = app.predict_ml_many(
        [
            request,
        ]
    )[0]

    assert (
        result["decision_source"]
        ==
        "ML"
    )

    assert (
        result["automation_status"]
        ==
        "REVIEW_REQUIRED"
    )

    assert (
        result["review_required"]
        is True
    )


def test_predict_batch_uses_effective_runtime_version(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    effective_version = (
        "rules-v3+ml-ursus-v1.5"
    )

    monkeypatch.setattr(
        app,
        "predict_many",
        lambda _requests: [
            build_prediction_result(
                effective_version
            )
        ],
    )

    request = (
        app.BatchPredictionRequest(
            items=[
                app.BatchPredictionItem(
                    event_id=1,
                    observation=(
                        "falha no sensor "
                        "da esteira"
                    ),
                ),
            ],
        )
    )

    response = app.predict_batch(
        request
    )

    assert (
        response.model_version
        ==
        effective_version
    )

    assert (
        response.items[
            0
        ].model_version
        ==
        effective_version
    )


def test_predict_batch_rejects_mixed_versions(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        app,
        "predict_many",
        lambda _requests: [
            build_prediction_result(
                "rules-v3+ml-ursus-v1.5"
            ),
            build_prediction_result(
                "rules-v3+ml-ursus-v1.6"
            ),
        ],
    )

    request = (
        app.BatchPredictionRequest(
            items=[
                app.BatchPredictionItem(
                    event_id=1,
                    observation=
                        "evento 1",
                ),
                app.BatchPredictionItem(
                    event_id=2,
                    observation=
                        "evento 2",
                ),
            ],
        )
    )

    with pytest.raises(
        HTTPException,
    ) as captured:
        app.predict_batch(
            request
        )

    assert (
        captured.value.status_code
        ==
        500
    )

    assert (
        "mais de uma versão efetiva"
        in str(
            captured.value.detail
        )
    )


def test_prediction_contract_never_allows_automatic_confirmation() -> None:
    rule = build_prediction_result(
        "rules-v3+ml-ursus-v1.6",
        decision_source="RULE",
    )

    ml = build_prediction_result(
        "rules-v3+ml-ursus-v1.6",
        decision_source="ML",
    )

    for result in (
        rule,
        ml,
    ):
        assert (
            result["automation_status"]
            ==
            "REVIEW_REQUIRED"
        )

        assert (
            result["review_required"]
            is True
        )