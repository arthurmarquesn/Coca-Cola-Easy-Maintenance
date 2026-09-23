from __future__ import annotations

import re
import unicodedata
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import joblib

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


CURRENT_FILE = Path(__file__).resolve()
ML_DIR = CURRENT_FILE.parents[1]

MODEL_PATH = (
    ML_DIR
    / "models"
    / "failure_classifier_v0.joblib"
)

model_package: dict[str, Any] | None = None


class PredictionRequest(BaseModel):
    observation: str = Field(
        min_length=1,
        max_length=5000,
    )

    equipment: str = Field(
        default="",
        max_length=500,
    )

    stop_key_1: str = Field(
        default="",
        max_length=500,
    )

    stop_subkey: str = Field(
        default="",
        max_length=500,
    )

    stop_type: str = Field(
        default="",
        max_length=500,
    )


class RankedPrediction(BaseModel):
    failed_component_code: str
    failure_mode: str
    confidence: float


class PredictionResponse(BaseModel):
    model_version: str
    failed_component_code: str
    failure_mode: str
    confidence: float
    top_predictions: list[RankedPrediction]


class BatchPredictionItem(PredictionRequest):
    event_id: int


class BatchPredictionRequest(BaseModel):
    items: list[BatchPredictionItem] = Field(
        min_length=1,
        max_length=500,
    )


class BatchPredictionResult(PredictionResponse):
    event_id: int


class BatchPredictionResponse(BaseModel):
    model_version: str

    items: list[
        BatchPredictionResult
    ]


def normalize(
    value: str,
) -> str:
    text = (
        value
        .strip()
        .lower()
    )

    text = unicodedata.normalize(
        "NFKD",
        text,
    )

    text = "".join(
        character
        for character in text
        if not unicodedata.combining(
            character
        )
    )

    text = re.sub(
        r"[^a-z0-9\s]",
        " ",
        text,
    )

    text = re.sub(
        r"\s+",
        " ",
        text,
    )

    return text.strip()


def build_text(
    request: PredictionRequest,
) -> str:
    fields = [
        (
            "obs",
            request.observation,
        ),
        (
            "eq",
            request.equipment,
        ),
        (
            "k1",
            request.stop_key_1,
        ),
        (
            "sk",
            request.stop_subkey,
        ),
        (
            "st",
            request.stop_type,
        ),
    ]

    parts: list[str] = []

    for prefix, value in fields:
        normalized = normalize(
            value
        )

        if normalized:
            parts.append(
                f"{prefix} {normalized}"
            )

    return " ".join(
        parts
    )


def load_model() -> None:
    global model_package

    if not MODEL_PATH.exists():
        raise RuntimeError(
            "Modelo ML não encontrado: "
            f"{MODEL_PATH}"
        )

    package = joblib.load(
        MODEL_PATH
    )

    required_keys = {
        "version",
        "model",
        "failure_mode_labels",
    }

    missing = (
        required_keys
        - set(
            package.keys()
        )
    )

    if missing:
        raise RuntimeError(
            "Pacote do Modelo ML inválido. "
            "Campos ausentes: "
            + ", ".join(
                sorted(
                    missing
                )
            )
        )

    model_package = package


@asynccontextmanager
async def lifespan(
    _app: FastAPI,
):
    load_model()

    yield


app = FastAPI(
    title=(
        "Easy Maintenance "
        "Modelo ML API"
    ),
    version="0.2.0",
    lifespan=lifespan,
)


def predict_many(
    requests: list[
        PredictionRequest
    ],
):
    if model_package is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "Modelo ML não carregado."
            ),
        )

    model = (
        model_package[
            "model"
        ]
    )

    labels: dict[
        str,
        str,
    ] = (
        model_package[
            "failure_mode_labels"
        ]
    )

    texts = [
        build_text(
            request
        )
        for request
        in requests
    ]

    if any(
        not text
        for text in texts
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Uma ou mais ocorrências "
                "não possuem dados válidos."
            ),
        )

    predictions = (
        model.predict(
            texts
        )
    )

    probabilities = (
        model.predict_proba(
            texts
        )
    )

    classes = (
        model
        .named_steps[
            "classifier"
        ]
        .classes_
    )

    results = []

    for (
        prediction,
        probability_row,
    ) in zip(
        predictions,
        probabilities,
    ):
        ranked = sorted(
            zip(
                classes,
                probability_row,
            ),
            key=lambda item:
                item[1],
            reverse=True,
        )

        predicted_code = str(
            prediction
        )

        top_predictions = [
            RankedPrediction(
                failed_component_code=
                    str(
                        component
                    ),

                failure_mode=
                    labels.get(
                        str(
                            component
                        ),
                        str(
                            component
                        ),
                    ),

                confidence=
                    float(
                        probability
                    ),
            )
            for (
                component,
                probability,
            )
            in ranked[:5]
        ]

        results.append(
            {
                "model_version":
                    str(
                        model_package[
                            "version"
                        ]
                    ),

                "failed_component_code":
                    predicted_code,

                "failure_mode":
                    labels.get(
                        predicted_code,
                        predicted_code,
                    ),

                "confidence":
                    float(
                        ranked[0][1]
                    ),

                "top_predictions":
                    top_predictions,
            }
        )

    return results


@app.get(
    "/health",
)
def health():
    if model_package is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "Modelo ML não carregado."
            ),
        )

    return {
        "status":
            "ok",

        "model_version":
            model_package[
                "version"
            ],
    }


@app.post(
    "/predict",
    response_model=
        PredictionResponse,
)
def predict(
    request:
        PredictionRequest,
):
    return predict_many(
        [
            request
        ]
    )[0]


@app.post(
    "/predict-batch",
    response_model=
        BatchPredictionResponse,
)
def predict_batch(
    request:
        BatchPredictionRequest,
):
    predictions = (
        predict_many(
            request.items
        )
    )

    results = [
        BatchPredictionResult(
            event_id=
                source.event_id,

            **prediction,
        )
        for (
            source,
            prediction,
        )
        in zip(
            request.items,
            predictions,
        )
    ]

    return BatchPredictionResponse(
        model_version=
            str(
                model_package[
                    "version"
                ]
            ),

        items=
            results,
    )