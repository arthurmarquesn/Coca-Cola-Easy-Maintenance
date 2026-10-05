# FILE: ml/api/app.py

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Literal
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
import logging
=======

>>>>>>> origin/marques
=======

>>>>>>> origin/marques
=======

>>>>>>> origin/marques
import re
import unicodedata

import joblib
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from ml.rules import RULES_VERSION, classify_by_rule
from ml.runtime import UrsusRuntime, validate_labels_in_taxonomy

logger = logging.getLogger(__name__)

<<<<<<< HEAD
<<<<<<< HEAD

=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
CURRENT_FILE = Path(__file__).resolve()

ML_DIR = CURRENT_FILE.parents[1]

MODEL_PATH = (
    ML_DIR
    / "models"
    / "failure_classifier_real_v1_2_eval.joblib"
)

ORIGIN_MODEL_PATH = (
    ML_DIR
    / "models"
    / "failure_origin_classifier_v4_candidate.joblib"
)

DEFAULT_HIGH_CONFIDENCE_THRESHOLD = 0.72849883

ORIGIN_HIGH_CONFIDENCE_THRESHOLD = 0.90
ORIGIN_MEDIUM_CONFIDENCE_THRESHOLD = 0.75

ORIGIN_CLASSES = {
    "MANUTENCAO",
    "OPERACAO",
}

TOP_K = 3

NON_AUTOMATABLE_FAILURE_MODES = {
    "SEM MODO DE FALHA IDENTIFICADO",
}


model_package: dict[str, Any] | None = None
ursus_runtime: UrsusRuntime | None = None
origin_model_package: dict[str, Any] | None = None


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

    line: str = Field(
        default="",
        max_length=500,
    )


class RankedPrediction(BaseModel):
    failed_component_code: str
    failure_mode: str
    confidence: float
    decision_score: float | None = None


class PredictionResponse(BaseModel):
    model_version: str
    failed_component_code: str
    failure_mode: str
    confidence: float

    top_predictions: list[
        RankedPrediction
    ]

    decision_source: str

    decision_margin: float | None = None
    automation_threshold: float | None = None

    automation_status: str
    review_required: bool
    confidence_type: str

    failure_origin: Literal[
        "MANUTENCAO",
        "OPERACAO",
    ]

    failure_origin_confidence: float = Field(
        ge=0.0,
        le=1.0,
    )

    failure_origin_confidence_level: Literal[
        "LOW",
        "MEDIUM",
        "HIGH",
    ]

    failure_origin_model_version: str


class BatchPredictionItem(
    PredictionRequest
):
    event_id: int


class BatchPredictionRequest(BaseModel):
    items: list[
        BatchPredictionItem
    ] = Field(
        min_length=1,
        max_length=500,
    )


class BatchPredictionResult(
    PredictionResponse
):
    event_id: int


class BatchPredictionResponse(BaseModel):
    model_version: str

    items: list[
        BatchPredictionResult
    ]


class HealthResponse(BaseModel):
    status: str

    model_version: str
    rules_version: str
    classifier_version: str

    confidence_type: str
    high_confidence_threshold: float

    origin_model_version: str
    origin_confidence_type: str

    origin_high_confidence_threshold: float
    origin_medium_confidence_threshold: float

    requested_model_version: str
    active_model_version: str

    fallback_used: bool
    shadow_v16_enabled: bool

    artifact_sha256: str


def strip_accents(
    value: str,
) -> str:
    normalized = unicodedata.normalize(
        "NFD",
        value,
    )

    return "".join(
        character
        for character in normalized
        if unicodedata.category(
            character
        )
        != "Mn"
    )


def normalize_failure_mode_for_guardrail(
    value: str,
) -> str:
    normalized = strip_accents(
        value
    ).upper()

    normalized = re.sub(
        r"[^A-Z0-9]+",
        " ",
        normalized,
    )

    return re.sub(
        r"\s+",
        " ",
        normalized,
    ).strip()


def is_non_automatable_failure_mode(
    failure_mode: str,
) -> bool:
    normalized = (
        normalize_failure_mode_for_guardrail(
            failure_mode
        )
    )

    return (
        normalized
        in
        NON_AUTOMATABLE_FAILURE_MODES
    )


def failure_mode_code(
    failure_mode: str,
) -> str:
    normalized = strip_accents(
        failure_mode
    ).upper()

    normalized = re.sub(
        r"[^A-Z0-9]+",
        "_",
        normalized,
    )

    normalized = re.sub(
        r"_+",
        "_",
        normalized,
    ).strip("_")

    return (
        normalized
        or
        "NAO_IDENTIFICADO"
    )


def get_model_version() -> str:
    if (
        model_package is None
        or
        ursus_runtime is None
    ):
        return "unknown"

    return str(
        model_package.get(
            "model_version",
            model_package.get(
                "version",
                "failure_classifier_real_v1_2_eval",
            ),
        )
    )


def get_classifier_version() -> str:
    return (
        f"{RULES_VERSION}"
        f"+ml-{get_model_version()}"
    )


def get_origin_model_version() -> str:
    if origin_model_package is None:
        return (
            "failure_origin_classifier_"
            "v4_candidate"
        )

    return str(
        origin_model_package.get(
            "model_version",
            (
                "failure_origin_classifier_"
                "v4_candidate"
            ),
        )
    )


def get_origin_confidence_type() -> str:
    if origin_model_package is None:
        return "calibrated_probability"

    return str(
        origin_model_package.get(
            "confidence_type",
            "calibrated_probability",
        )
    )


def get_vectorizer() -> Any:
    if model_package is None:
        raise RuntimeError(
            "Modelo ML não carregado."
        )

    vectorizer = (
        model_package.get(
            "vectorizer"
        )
    )

    if vectorizer is None:
        raise RuntimeError(
            "O artefato não contém "
            "'vectorizer'."
        )

    return vectorizer


def get_classifier() -> Any:
    if model_package is None:
        raise RuntimeError(
            "Modelo ML não carregado."
        )

    classifier = (
        model_package.get(
            "classifier"
        )
    )

    if classifier is None:
        raise RuntimeError(
            "O artefato não contém "
            "'classifier'."
        )

    return classifier


def get_origin_model() -> Any:
    if origin_model_package is None:
        raise RuntimeError(
            "Modelo de origem não carregado."
        )

    model = (
        origin_model_package.get(
            "model"
        )
    )

    if model is None:
        raise RuntimeError(
            "O artefato de origem não contém "
            "'model'."
        )

    return model


def get_high_confidence_threshold() -> float:
    if model_package is None:
        return (
            DEFAULT_HIGH_CONFIDENCE_THRESHOLD
        )

    thresholds = (
        model_package.get(
            "automation_thresholds"
        )
    )

    if isinstance(
        thresholds,
        dict,
    ):
        threshold_97 = (
            thresholds.get(
                "97"
            )
        )

        if isinstance(
            threshold_97,
            dict,
        ):
            try:
                value = float(
                    threshold_97.get(
                        "threshold"
                    )
                )

                if np.isfinite(
                    value
                ):
                    return value

            except (
                TypeError,
                ValueError,
            ):
                pass

    for key in (
        "high_confidence_threshold",
        "automation_threshold",
        "threshold",
    ):
        try:
            value = float(
                model_package.get(
                    key
                )
            )

            if np.isfinite(
                value
            ):
                return value

        except (
            TypeError,
            ValueError,
        ):
            pass

    return (
        DEFAULT_HIGH_CONFIDENCE_THRESHOLD
    )


def display_failure_mode(
    normalized_label: str,
) -> str:
    if model_package is None:
        return normalized_label

    label_map = (
        model_package.get(
            "display_label_map"
        )
    )

    if isinstance(
        label_map,
        dict,
    ):
        value = (
            label_map.get(
                normalized_label
            )
        )

        if value is not None:
            return str(
                value
            )

    return normalized_label


def _load_legacy_model() -> None:
    global model_package

    if not MODEL_PATH.exists():
        raise RuntimeError(
            "Modelo ML real v1.2 "
            "não encontrado: "
            f"{MODEL_PATH}"
        )

    package = joblib.load(
        MODEL_PATH
    )

    if not isinstance(
        package,
        dict,
    ):
        raise RuntimeError(
            "O artefato do modelo "
            "real v1.2 não é válido."
        )

    vectorizer = (
        package.get(
            "vectorizer"
        )
    )

    classifier = (
        package.get(
            "classifier"
        )
    )

    if vectorizer is None:
        raise RuntimeError(
            "Artefato incompatível: "
            "campo 'vectorizer' ausente."
        )

    if classifier is None:
        raise RuntimeError(
            "Artefato incompatível: "
            "campo 'classifier' ausente."
        )

    if not hasattr(
        vectorizer,
        "transform",
    ):
        raise RuntimeError(
            "Vectorizer incompatível: "
            "transform() ausente."
        )

    if not hasattr(
        classifier,
        "predict",
    ):
        raise RuntimeError(
            "Classificador incompatível: "
            "predict() ausente."
        )

    if not hasattr(
        classifier,
        "decision_function",
    ):
        raise RuntimeError(
            "Classificador incompatível: "
            "decision_function() ausente."
        )

    if not hasattr(
        classifier,
        "classes_",
    ):
        raise RuntimeError(
            "Classificador incompatível: "
            "classes_ ausente."
        )

    saved_classes = (
        package.get(
            "classes"
        )
    )

    if saved_classes is not None:
        package_classes = (
            np.asarray(
                saved_classes
            )
            .astype(
                str
            )
        )

        classifier_classes = (
            np.asarray(
                classifier.classes_
            )
            .astype(
                str
            )
        )

        if (
            package_classes.shape
            !=
            classifier_classes.shape
            or
            not np.array_equal(
                package_classes,
                classifier_classes,
            )
        ):
            raise RuntimeError(
                "As classes salvas no artefato "
                "não coincidem com "
                "classifier.classes_."
            )

    model_package = package


def load_model() -> None:
    global model_package
    global ursus_runtime

    runtime = UrsusRuntime()

    runtime.initialize()

    for loaded_model in runtime.models.values():
        validate_labels_in_taxonomy(
            loaded_model
        )

    package = dict(
        runtime.compatibility_package
    )

    active = (
        runtime.active_model
    )

    package.update(
        {
            "vectorizer":
                active.package[
                    "vectorizer"
                ],

            "classifier":
                active.package[
                    "classifier"
                ],

            "classes":
                active.package[
                    "classes"
                ],

            "model_version":
                active.spec.runtime_model_version,

            "confidence_type":
                "ursus_ranking_score_not_probability",
        }
    )

    ursus_runtime = runtime
    model_package = package


def validate_origin_classes(
    classes: Any,
    source: str,
) -> np.ndarray:
    try:
        normalized_classes = (
            np.asarray(
                classes
            )
            .astype(
                str
            )
        )

    except (
        TypeError,
        ValueError,
    ) as error:
        raise RuntimeError(
            "Classes inválidas no "
            f"{source} do modelo de origem."
        ) from error

    if (
        normalized_classes.ndim
        !=
        1
        or
        normalized_classes.size
        !=
        len(
            ORIGIN_CLASSES
        )
        or
        set(
            normalized_classes.tolist()
        )
        !=
        ORIGIN_CLASSES
    ):
        raise RuntimeError(
            "O modelo de origem deve conter "
            "exatamente as classes "
            "MANUTENCAO e OPERACAO em "
            f"{source}."
        )

    return normalized_classes


def load_origin_model() -> None:
    global origin_model_package

    if not ORIGIN_MODEL_PATH.exists():
        raise RuntimeError(
            "Modelo de origem V4 "
            "não encontrado: "
            f"{ORIGIN_MODEL_PATH}"
        )

    package = joblib.load(
        ORIGIN_MODEL_PATH
    )

    if not isinstance(
        package,
        dict,
    ):
        raise RuntimeError(
            "O artefato do modelo de "
            "origem V4 não é válido."
        )

    model = (
        package.get(
            "model"
        )
    )

    if model is None:
        raise RuntimeError(
            "Artefato de origem incompatível: "
            "campo 'model' ausente."
        )

    if not callable(
        getattr(
            model,
            "predict",
            None,
        )
    ):
        raise RuntimeError(
            "Modelo de origem incompatível: "
            "predict() ausente."
        )

    if not callable(
        getattr(
            model,
            "predict_proba",
            None,
        )
    ):
        raise RuntimeError(
            "Modelo de origem incompatível: "
            "predict_proba() ausente."
        )

    validate_origin_classes(
        package.get(
            "classes"
        ),
        "package['classes']",
    )

    if not hasattr(
        model,
        "classes_",
    ):
        raise RuntimeError(
            "Modelo de origem incompatível: "
            "classes_ ausente."
        )

    validate_origin_classes(
        model.classes_,
        "model.classes_",
    )

    origin_model_package = package


@asynccontextmanager
async def lifespan(
    _app: FastAPI,
):
    load_model()
    load_origin_model()

    yield


app = FastAPI(
    title=(
        "Easy Maintenance "
        "Classification API"
    ),
    version="0.7.0",
    lifespan=lifespan,
)


def request_to_event(
    request: PredictionRequest,
) -> dict[str, str]:
    return {
        "observation":
            request.observation,

        "equipment":
            request.equipment,

        "stop_key_1":
            request.stop_key_1,

        "stop_subkey":
            request.stop_subkey,

        "stop_type":
            request.stop_type,

        "line":
            request.line,
    }


def validate_request(
    request: PredictionRequest,
) -> None:
    if not (
        request
        .observation
        .strip()
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "A ocorrência não possui "
                "uma observação válida."
            ),
        )


def decision_scores(
    classifier: Any,
    features: Any,
) -> np.ndarray:
    scores = np.asarray(
        classifier
        .decision_function(
            features
        ),
        dtype=float,
    )

    if scores.ndim == 1:
        scores = np.column_stack(
            [
                -scores,
                scores,
            ]
        )

    return scores


def decision_margins(
    scores: np.ndarray,
) -> np.ndarray:
    ordered = np.sort(
        scores,
        axis=1,
    )

    if (
        ordered.shape[
            1
        ]
        <
        2
    ):
        return np.full(
            ordered.shape[
                0
            ],
            np.inf,
        )

    return (
        ordered[
            :,
            -1
        ]
        -
        ordered[
            :,
            -2
        ]
    )


def ranking_scores_from_decision(
    scores: np.ndarray,
) -> np.ndarray:
    shifted = (
        scores
        -
        np.max(
            scores,
            axis=1,
            keepdims=True,
        )
    )

    exp_scores = np.exp(
        shifted
    )

    denominator = np.sum(
        exp_scores,
        axis=1,
        keepdims=True,
    )

    denominator = np.where(
        denominator
        <=
        0,
        1.0,
        denominator,
    )

    return (
        exp_scores
        /
        denominator
    )


def predict_ml_many(
    requests: list[
        PredictionRequest
    ],
) -> list[
    dict[str, Any]
]:
    if (
        model_package is None
        or
        ursus_runtime is None
    ):
        raise HTTPException(
            status_code=503,
            detail=(
                "Modelo ML "
                "não carregado."
            ),
        )

    if not requests:
        return []

    texts: list[str] = []

    for request in requests:
        validate_request(
            request
        )

        observation = (
            request
            .observation
            .strip()
        )

        texts.append(
            observation
        )

    runtime_prediction = (
        ursus_runtime.predict(
            texts
        )
    )

    loaded_model = (
        runtime_prediction
        .output
        .loaded_model
    )

    classifier = (
        loaded_model
        .package[
            "classifier"
        ]
    )

    classes = (
        np.asarray(
            classifier.classes_
        )
        .astype(
            str
        )
    )

    predictions = (
        runtime_prediction
        .output
        .predictions
    )

    scores = (
        runtime_prediction
        .output
        .scores
    )

    margins = (
        decision_margins(
            scores
        )
    )

    ranking_scores = (
        ranking_scores_from_decision(
            scores
        )
    )

    threshold = (
        get_high_confidence_threshold()
    )

    results: list[
        dict[str, Any]
    ] = []

    for (
        row_index,
        predicted_norm,
    ) in enumerate(
        predictions
    ):
        predicted_display = (
            display_failure_mode(
                str(
                    predicted_norm
                )
            )
        )

        ranked_indices = (
            np.argsort(
                scores[
                    row_index
                ]
            )[
                ::-1
            ]
        )

        top_predictions: list[
            dict[str, Any]
        ] = []

        for class_index in (
            ranked_indices[
                :TOP_K
            ]
        ):
            class_norm = str(
                classes[
                    class_index
                ]
            )

            class_display = (
                display_failure_mode(
                    class_norm
                )
            )

            top_predictions.append(
                {
                    "failed_component_code":
                        failure_mode_code(
                            class_display
                        ),

                    "failure_mode":
                        class_display,

                    "confidence":
                        float(
                            ranking_scores[
                                row_index,
                                class_index,
                            ]
                        ),

                    "decision_score":
                        float(
                            scores[
                                row_index,
                                class_index,
                            ]
                        ),
                }
            )

        margin = float(
            margins[
                row_index
            ]
        )

        top_index = int(
            ranked_indices[
                0
            ]
        )

        legacy_confidence = float(
            ranking_scores[
                row_index,
                top_index,
            ]
        )

        results.append(
            {
                "model_version":
                    (
                        f"{RULES_VERSION}"
                        f"+ml-"
                        f"{loaded_model.spec.runtime_model_version}"
                    ),

                "failed_component_code":
                    failure_mode_code(
                        predicted_display
                    ),

                "failure_mode":
                    predicted_display,

                "confidence":
                    legacy_confidence,

                "top_predictions":
                    top_predictions,

                "decision_source":
                    "ML",

                "decision_margin":
                    margin,

                "automation_threshold":
                    threshold,

                "automation_status":
                    "REVIEW_REQUIRED",

                "review_required":
                    True,

                "confidence_type":
                    "ranking_score_not_probability",
            }
        )

    return results


def predict_origin_many(
    requests: list[
        PredictionRequest
    ],
) -> list[
    dict[str, Any]
]:
    if origin_model_package is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "Modelo de origem "
                "não carregado."
            ),
        )

    if not requests:
        return []

    model = (
        get_origin_model()
    )

    texts: list[str] = []

    for request in requests:
        validate_request(
            request
        )

        texts.append(
            request
            .observation
            .strip()
        )

    try:
        predictions = (
            np.asarray(
                model.predict(
                    texts
                )
            )
            .astype(
                str
            )
        )

        probabilities = np.asarray(
            model.predict_proba(
                texts
            ),
            dtype=float,
        )

    except Exception as error:
        # O detalhe fica no log; a resposta chega ao navegador
        # pelas rotas do Next.
        logger.exception(
            "Falha interna na inferência do modelo de origem"
        )
        raise HTTPException(
            status_code=500,
            detail=(
                "Falha interna na inferência "
                "do modelo de origem."
            ),
        ) from error

    try:
        classes = (
            validate_origin_classes(
                model.classes_,
                "model.classes_",
            )
        )

    except RuntimeError as error:
        raise HTTPException(
            status_code=500,
            detail=str(
                error
            ),
        ) from error

    request_count = len(
        requests
    )

    if (
        predictions.ndim
        !=
        1
        or
        predictions.shape[
            0
        ]
        !=
        request_count
    ):
        raise HTTPException(
            status_code=500,
            detail=(
                "Quantidade ou formato de "
                "predições de origem incompatível "
                "com os requests."
            ),
        )

    expected_probability_shape = (
        request_count,
        classes.size,
    )

    if (
        probabilities.ndim
        !=
        2
        or
        probabilities.shape
        !=
        expected_probability_shape
    ):
        raise HTTPException(
            status_code=500,
            detail=(
                "Shape de predict_proba do modelo "
                "de origem inválido: esperado "
                f"{expected_probability_shape}, "
                f"recebido {probabilities.shape}."
            ),
        )

    if not np.all(
        np.isfinite(
            probabilities
        )
    ):
        raise HTTPException(
            status_code=500,
            detail=(
                "O modelo de origem retornou "
                "probabilidades com NaN ou infinito."
            ),
        )

    if np.any(
        (
            probabilities
            <
            0.0
        )
        |
        (
            probabilities
            >
            1.0
        )
    ):
        raise HTTPException(
            status_code=500,
            detail=(
                "O modelo de origem retornou "
                "probabilidade fora do intervalo "
                "de 0 a 1."
            ),
        )

    class_indexes = {
        class_name:
            index

        for (
            index,
            class_name,
        )
        in enumerate(
            classes.tolist()
        )
    }

    results: list[
        dict[str, Any]
    ] = []

    for (
        row_index,
        prediction,
    ) in enumerate(
        predictions
    ):
        failure_origin = str(
            prediction
        )

        if (
            failure_origin
            not in
            ORIGIN_CLASSES
        ):
            raise HTTPException(
                status_code=500,
                detail=(
                    "O modelo de origem retornou "
                    "classe inesperada: "
                    f"{failure_origin}."
                ),
            )

        probability_row = (
            probabilities[
                row_index
            ]
        )

        predicted_probability = float(
            probability_row[
                class_indexes[
                    failure_origin
                ]
            ]
        )

        confidence = float(
            np.max(
                probability_row
            )
        )

        if not np.isclose(
            predicted_probability,
            confidence,
        ):
            raise HTTPException(
                status_code=500,
                detail=(
                    "A classe prevista pelo modelo "
                    "de origem não corresponde à "
                    "maior probabilidade."
                ),
            )

        if (
            confidence
            >=
            ORIGIN_HIGH_CONFIDENCE_THRESHOLD
        ):
            confidence_level = (
                "HIGH"
            )

        elif (
            confidence
            >=
            ORIGIN_MEDIUM_CONFIDENCE_THRESHOLD
        ):
            confidence_level = (
                "MEDIUM"
            )

        else:
            confidence_level = (
                "LOW"
            )

        results.append(
            {
                "failure_origin":
                    failure_origin,

                "failure_origin_confidence":
                    confidence,

                "failure_origin_confidence_level":
                    confidence_level,

                "failure_origin_model_version":
                    get_origin_model_version(),
            }
        )

    if (
        len(
            results
        )
        !=
        request_count
    ):
        raise HTTPException(
            status_code=500,
            detail=(
                "Quantidade de resultados de "
                "origem incompatível com os "
                "requests."
            ),
        )

    return results


def predict_many(
    requests: list[
        PredictionRequest
    ],
) -> list[
    dict[str, Any]
]:
    if model_package is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "Modelo ML "
                "não carregado."
            ),
        )

    if not requests:
        return []

    results: list[
        dict[str, Any] | None
    ] = [
        None
        for _
        in requests
    ]

    ml_requests: list[
        PredictionRequest
    ] = []

    ml_indexes: list[int] = []

    for (
        index,
        request,
    ) in enumerate(
        requests
    ):
        validate_request(
            request
        )

        event = (
            request_to_event(
                request
            )
        )

        rule_prediction = (
            classify_by_rule(
                event
            )
        )

        if (
            rule_prediction
            is not None
        ):
            rule_confidence = float(
                rule_prediction
                .confidence
            )

            results[
                index
            ] = {
                "model_version":
                    get_classifier_version(),

                "failed_component_code":
                    (
                        rule_prediction
                        .failed_component_code
                    ),

                "failure_mode":
                    (
                        rule_prediction
                        .failure_mode
                    ),

                "confidence":
                    rule_confidence,

                "top_predictions": [
                    {
                        "failed_component_code":
                            (
                                rule_prediction
                                .failed_component_code
                            ),

                        "failure_mode":
                            (
                                rule_prediction
                                .failure_mode
                            ),

                        "confidence":
                            rule_confidence,

                        "decision_score":
                            None,
                    }
                ],

                "decision_source":
                    "RULE",

                "decision_margin":
                    None,

                "automation_threshold":
                    None,

                "automation_status":
                    "REVIEW_REQUIRED",

                "review_required":
                    True,

                "confidence_type":
                    "rule_confidence",
            }

            continue

        ml_indexes.append(
            index
        )

        ml_requests.append(
            request
        )

    if ml_requests:
        ml_results = (
            predict_ml_many(
                ml_requests
            )
        )

        for (
            original_index,
            ml_result,
        ) in zip(
            ml_indexes,
            ml_results,
        ):
            results[
                original_index
            ] = (
                ml_result
            )

        effective_version = str(
            ml_results[
                0
            ][
                "model_version"
            ]
        )

        for result in results:
            if (
                result is not None
                and
                result.get(
                    "decision_source"
                )
                ==
                "RULE"
            ):
                result[
                    "model_version"
                ] = (
                    effective_version
                )

    completed_results: list[
        dict[str, Any]
    ] = []

    for result in results:
        if result is None:
            raise HTTPException(
                status_code=500,
                detail=(
                    "Falha interna ao "
                    "montar a classificação."
                ),
            )

        completed_results.append(
            result
        )

    origin_results = (
        predict_origin_many(
            requests
        )
    )

    if (
        len(
            origin_results
        )
        !=
        len(
            completed_results
        )
    ):
        raise HTTPException(
            status_code=500,
            detail=(
                "Quantidade de resultados de "
                "origem incompatível com os "
                "resultados de componente/modo."
            ),
        )

    for (
        result,
        origin,
    ) in zip(
        completed_results,
        origin_results,
    ):
        result.update(
            origin
        )

    return completed_results


@app.get(
    "/health",
    response_model=
        HealthResponse,
)
def health():
    if (
        model_package is None
        or
        origin_model_package is None
        or
        ursus_runtime is None
    ):
        raise HTTPException(
            status_code=503,
            detail=(
                "Modelos de classificação "
                "não carregados."
            ),
        )

    return {
        "status":
            "ok",

        "model_version":
            get_model_version(),

        "rules_version":
            RULES_VERSION,

        "classifier_version":
            get_classifier_version(),

        "confidence_type":
            str(
                model_package.get(
                    "confidence_type",
                    "ranking_score_not_probability",
                )
            ),

        "high_confidence_threshold":
            get_high_confidence_threshold(),

        "origin_model_version":
            get_origin_model_version(),

        "origin_confidence_type":
            get_origin_confidence_type(),

        "origin_high_confidence_threshold":
            ORIGIN_HIGH_CONFIDENCE_THRESHOLD,

        "origin_medium_confidence_threshold":
            ORIGIN_MEDIUM_CONFIDENCE_THRESHOLD,

        "requested_model_version":
            ursus_runtime.requested_version,

        "active_model_version":
            ursus_runtime.active_version,

        "fallback_used":
            ursus_runtime.startup_fallback_used,

        "shadow_v16_enabled":
            ursus_runtime.shadow_enabled,

        "artifact_sha256":
            (
                ursus_runtime
                .active_model
                .artifact_sha256
            ),
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

    effective_versions = {
        str(
            prediction[
                "model_version"
            ]
        )

        for prediction
        in predictions
    }

    if (
        len(
            effective_versions
        )
        !=
        1
    ):
        raise HTTPException(
            status_code=500,
            detail=(
                "O lote retornou mais de uma "
                "versão efetiva de classificação, "
                "o que viola o contrato de "
                "auditoria do Ursus."
            ),
        )

    effective_model_version = (
        next(
            iter(
                effective_versions
            )
        )
    )

    return BatchPredictionResponse(
        model_version=
            effective_model_version,

        items=
            results,
    )