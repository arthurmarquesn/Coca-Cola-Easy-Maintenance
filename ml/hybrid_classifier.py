from __future__ import annotations

from collections.abc import Callable, Mapping
from typing import Any

from ml.rules import (
    RULES_VERSION,
    classify_by_rule,
    rule_debug_payload,
)


MlPredictor = Callable[
    [Mapping[str, Any]],
    Mapping[str, Any],
]


def classify_event(
    event: Mapping[str, Any],
    ml_predictor: MlPredictor,
) -> dict[str, Any]:
    """
    Classificador híbrido.

    Ordem:
    1. Regra semântica explícita de alta confiança.
    2. Modelo ML atual como fallback.

    A assinatura do `ml_predictor` é propositalmente genérica
    para não acoplar este módulo ao scikit-learn/joblib nem
    ao FastAPI.
    """

    rule_prediction = (
        classify_by_rule(
            event,
        )
    )

    if (
        rule_prediction
        is not None
    ):
        return {
            "failed_component_code":
                rule_prediction.failed_component_code,

            "failure_mode":
                rule_prediction.failure_mode,

            "confidence":
                rule_prediction.confidence,

            "top_predictions": [
                {
                    "failed_component_code":
                        rule_prediction.failed_component_code,

                    "failure_mode":
                        rule_prediction.failure_mode,

                    "confidence":
                        rule_prediction.confidence,
                },
            ],

            "decision_source":
                "RULE",

            "rule_id":
                rule_prediction.rule_id,

            "rules_version":
                RULES_VERSION,

            "debug":
                rule_debug_payload(
                    rule_prediction,
                ),
        }

    ml_result = dict(
        ml_predictor(
            event,
        ),
    )

    ml_result.setdefault(
        "decision_source",
        "ML",
    )

    ml_result.setdefault(
        "rules_version",
        RULES_VERSION,
    )

    return ml_result