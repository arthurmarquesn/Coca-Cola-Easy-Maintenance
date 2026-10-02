from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from sklearn.calibration import CalibratedClassifierCV
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import (
    accuracy_score,
    brier_score_loss,
    classification_report,
    confusion_matrix,
    f1_score,
    log_loss,
    precision_recall_fscore_support,
    roc_auc_score,
)
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.pipeline import FeatureUnion, Pipeline
from sklearn.svm import LinearSVC


# ============================================================
# CONFIGURAÇÃO
# ============================================================

MODEL_VERSION = (
    "failure_origin_classifier_v1_eval"
)

DATASET_VERSION = (
    "synthetic-origin-v1"
)

DEFAULT_DATASET = (
    "ml/data/origin/"
    "synthetic_origin_v1.csv"
)

DEFAULT_MODEL_OUTPUT = (
    "ml/models/"
    "failure_origin_classifier_v1_eval.joblib"
)

DEFAULT_METRICS_OUTPUT = (
    "ml/models/"
    "failure_origin_classifier_v1_metrics.json"
)

DEFAULT_SPLIT_OUTPUT = (
    "ml/data/origin/"
    "origin_split_v1.csv"
)

DEFAULT_VALIDATION_OUTPUT = (
    "ml/data/origin/"
    "origin_validation_predictions_v1.csv"
)

DEFAULT_TEST_OUTPUT = (
    "ml/data/origin/"
    "origin_test_predictions_v1.csv"
)

RANDOM_SEED = 42

VALIDATION_RATIO = 0.18
TEST_RATIO = 0.18

TARGET_PRECISIONS = (
    0.90,
    0.95,
    0.97,
)

MIN_HIGH_CONFIDENCE_ROWS = 30


# ============================================================
# FEATURES
#
# IMPORTANTE:
#
# stop_type:
#   propositalmente NÃO utilizado na V1.
#
# line:
#   propositalmente NÃO utilizado na V1.
#
# Motivo:
# queremos evitar atalhos artificiais / leakage contextual.
# ============================================================

ACTIVE_FEATURES = (
    "observation",
    "equipment",
    "stop_key_1",
    "stop_subkey",
    "failed_component_code",
    "failure_mode",
)

EXCLUDED_FEATURES = (
    "stop_type",
    "line",
)


# ============================================================
# HELPERS
# ============================================================

def clean_string(
    value: object,
) -> str:
    if value is None:
        return ""

    if (
        isinstance(
            value,
            float,
        )
        and math.isnan(
            value,
        )
    ):
        return ""

    return str(
        value,
    ).strip()


def stable_hash(
    value: str,
) -> int:
    digest = hashlib.sha256(
        (
            f"{RANDOM_SEED}|"
            f"{value}"
        ).encode(
            "utf-8",
        )
    ).hexdigest()

    return int(
        digest[:16],
        16,
    )


def rounded(
    value: float,
    digits: int = 6,
) -> float:
    return round(
        float(
            value,
        ),
        digits,
    )


# ============================================================
# DATASET
# ============================================================

def load_dataset(
    path: Path,
) -> pd.DataFrame:

    df = pd.read_csv(
        path,
        dtype=str,
    )

    required = {
        "row_id",
        "scenario_id",
        "observation",
        "equipment",
        "stop_type",
        "stop_key_1",
        "stop_subkey",
        "line",
        "failed_component_code",
        "failure_mode",
        "failure_origin",
    }

    missing = (
        required
        -
        set(
            df.columns,
        )
    )

    if missing:
        raise ValueError(
            "Dataset incompleto. "
            f"Colunas ausentes: {sorted(missing)}"
        )

    text_columns = [
        "scenario_id",
        "observation",
        "equipment",
        "stop_type",
        "stop_key_1",
        "stop_subkey",
        "line",
        "failed_component_code",
        "failure_mode",
        "failure_origin",
    ]

    for column in text_columns:
        df[column] = (
            df[column]
            .fillna("")
            .map(
                clean_string,
            )
        )

    df[
        "failure_origin"
    ] = (
        df[
            "failure_origin"
        ]
        .str.upper()
        .str.strip()
    )

    allowed_classes = {
        "MANUTENCAO",
        "OPERACAO",
    }

    invalid_classes = (
        set(
            df[
                "failure_origin"
            ].unique()
        )
        -
        allowed_classes
    )

    if invalid_classes:
        raise ValueError(
            "Classes inesperadas: "
            f"{sorted(invalid_classes)}"
        )

    df[
        "row_id"
    ] = pd.to_numeric(
        df[
            "row_id"
        ],
        errors="coerce",
    )

    df = df[
        df[
            "row_id"
        ].notna()
        &
        (
            df[
                "scenario_id"
            ]
            !=
            ""
        )
        &
        (
            df[
                "observation"
            ]
            !=
            ""
        )
    ].copy()

    df[
        "row_id"
    ] = (
        df[
            "row_id"
        ]
        .astype(
            int,
        )
    )

    df.reset_index(
        drop=True,
        inplace=True,
    )

    return df


# ============================================================
# TEXTO ESTRUTURADO
# ============================================================

def build_model_text(
    row: pd.Series,
) -> str:

    return "\n".join(
        [
            (
                "[OBSERVACAO] "
                + clean_string(
                    row[
                        "observation"
                    ]
                )
            ),

            (
                "[EQUIPAMENTO] "
                + clean_string(
                    row[
                        "equipment"
                    ]
                )
            ),

            (
                "[CHAVE] "
                + clean_string(
                    row[
                        "stop_key_1"
                    ]
                )
            ),

            (
                "[SUBCHAVE] "
                + clean_string(
                    row[
                        "stop_subkey"
                    ]
                )
            ),

            (
                "[COMPONENTE] "
                + clean_string(
                    row[
                        "failed_component_code"
                    ]
                )
            ),

            (
                "[MODO_FALHA] "
                + clean_string(
                    row[
                        "failure_mode"
                    ]
                )
            ),
        ]
    )


def add_model_text(
    df: pd.DataFrame,
) -> pd.DataFrame:

    result = df.copy()

    result[
        "model_text"
    ] = result.apply(
        build_model_text,
        axis=1,
    )

    return result


# ============================================================
# VERIFICAÇÃO DE CENÁRIOS
# ============================================================

def validate_scenarios(
    df: pd.DataFrame,
) -> None:

    labels_per_scenario = (
        df.groupby(
            "scenario_id",
        )[
            "failure_origin"
        ]
        .nunique()
    )

    conflicting = (
        labels_per_scenario[
            labels_per_scenario
            > 1
        ]
    )

    if (
        not conflicting.empty
    ):
        raise RuntimeError(
            "Existem cenários com "
            "mais de uma origem:\n"
            f"{conflicting}"
        )

    scenario_sizes = (
        df.groupby(
            "scenario_id",
        )
        .size()
    )

    if (
        scenario_sizes.min()
        <= 0
    ):
        raise RuntimeError(
            "Existe cenário vazio."
        )


# ============================================================
# SPLIT POR CENÁRIO
#
# Nenhuma variação do mesmo cenário pode existir em:
#
# TRAIN + VALIDATION
# TRAIN + TEST
# VALIDATION + TEST
# ============================================================

def split_count(
    total: int,
) -> tuple[
    int,
    int,
]:
    if total < 6:
        raise RuntimeError(
            "Cada classe precisa possuir "
            "ao menos 6 cenários."
        )

    validation = max(
        1,
        int(
            round(
                total
                *
                VALIDATION_RATIO
            )
        ),
    )

    test = max(
        1,
        int(
            round(
                total
                *
                TEST_RATIO
            )
        ),
    )

    while (
        total
        -
        validation
        -
        test
        <
        4
    ):
        if (
            validation
            >=
            test
            and
            validation
            > 1
        ):
            validation -= 1

        elif (
            test > 1
        ):
            test -= 1

        else:
            break

    return (
        validation,
        test,
    )


def create_scenario_split(
    df: pd.DataFrame,
) -> pd.DataFrame:

    scenarios = (
        df.groupby(
            "scenario_id",
            as_index=False,
        )
        .agg(
            failure_origin=(
                "failure_origin",
                "first",
            ),

            row_count=(
                "row_id",
                "count",
            ),
        )
    )

    scenarios[
        "hash"
    ] = scenarios.apply(
        lambda row:
            stable_hash(
                (
                    str(
                        row[
                            "failure_origin"
                        ]
                    )
                    +
                    "|"
                    +
                    str(
                        row[
                            "scenario_id"
                        ]
                    )
                )
            ),
        axis=1,
    )

    scenarios[
        "split"
    ] = "TRAIN"

    for (
        origin,
        origin_rows,
    ) in scenarios.groupby(
        "failure_origin",
    ):

        ordered = (
            origin_rows
            .sort_values(
                [
                    "hash",
                    "scenario_id",
                ]
            )
        )

        total = len(
            ordered,
        )

        (
            validation_count,
            test_count,
        ) = split_count(
            total,
        )

        test_indices = (
            ordered
            .iloc[
                :test_count
            ]
            .index
        )

        validation_indices = (
            ordered
            .iloc[
                test_count:
                (
                    test_count
                    +
                    validation_count
                )
            ]
            .index
        )

        scenarios.loc[
            test_indices,
            "split",
        ] = "TEST"

        scenarios.loc[
            validation_indices,
            "split",
        ] = "VALIDATION"

    return scenarios


def apply_split(
    df: pd.DataFrame,
    scenarios: pd.DataFrame,
) -> pd.DataFrame:

    split_map = dict(
        zip(
            scenarios[
                "scenario_id"
            ],
            scenarios[
                "split"
            ],
        )
    )

    result = df.copy()

    result[
        "split"
    ] = (
        result[
            "scenario_id"
        ]
        .map(
            split_map,
        )
    )

    if (
        result[
            "split"
        ].isna().any()
    ):
        raise RuntimeError(
            "Existem registros sem split."
        )

    return result


def check_scenario_leakage(
    df: pd.DataFrame,
) -> dict[
    str,
    int,
]:

    train = set(
        df.loc[
            df[
                "split"
            ]
            ==
            "TRAIN",
            "scenario_id",
        ]
    )

    validation = set(
        df.loc[
            df[
                "split"
            ]
            ==
            "VALIDATION",
            "scenario_id",
        ]
    )

    test = set(
        df.loc[
            df[
                "split"
            ]
            ==
            "TEST",
            "scenario_id",
        ]
    )

    return {
        "train_validation":
            len(
                train
                &
                validation
            ),

        "train_test":
            len(
                train
                &
                test
            ),

        "validation_test":
            len(
                validation
                &
                test
            ),
    }


# ============================================================
# TF-IDF
# ============================================================

def build_vectorizer() -> FeatureUnion:

    word = (
        TfidfVectorizer(
            analyzer="word",

            ngram_range=(
                1,
                2,
            ),

            min_df=2,

            max_df=0.98,

            sublinear_tf=True,

            strip_accents="unicode",

            lowercase=True,

            max_features=60000,
        )
    )

    char = (
        TfidfVectorizer(
            analyzer="char_wb",

            ngram_range=(
                3,
                5,
            ),

            min_df=2,

            max_df=0.995,

            sublinear_tf=True,

            strip_accents="unicode",

            lowercase=True,

            max_features=90000,
        )
    )

    return FeatureUnion(
        [
            (
                "word",
                word,
            ),

            (
                "char",
                char,
            ),
        ]
    )


# ============================================================
# MODELO BASE
# ============================================================

def build_base_pipeline() -> Pipeline:

    return Pipeline(
        [
            (
                "features",
                build_vectorizer(),
            ),

            (
                "classifier",
                LinearSVC(
                    C=1.2,

                    class_weight="balanced",

                    max_iter=15000,

                    random_state=
                        RANDOM_SEED,
                ),
            ),
        ]
    )


# ============================================================
# CALIBRAÇÃO
#
# CV feita por scenario_id.
#
# Isso significa que variações do mesmo cenário
# nunca são usadas simultaneamente para treinar e calibrar
# o mesmo fold.
# ============================================================

def build_calibration_splits(
    train:
        pd.DataFrame,
) -> list[
    tuple[
        np.ndarray,
        np.ndarray,
    ]
]:

    scenario_count = (
        train[
            "scenario_id"
        ]
        .nunique()
    )

    n_splits = min(
        5,
        scenario_count,
    )

    if (
        n_splits < 3
    ):
        raise RuntimeError(
            "Poucos cenários para "
            "calibração segura."
        )

    splitter = (
        StratifiedGroupKFold(
            n_splits=n_splits,

            shuffle=True,

            random_state=
                RANDOM_SEED,
        )
    )

    X = (
        train[
            "model_text"
        ]
        .to_numpy(
            dtype=str,
        )
    )

    y = (
        train[
            "failure_origin"
        ]
        .to_numpy(
            dtype=str,
        )
    )

    groups = (
        train[
            "scenario_id"
        ]
        .to_numpy(
            dtype=str,
        )
    )

    splits = list(
        splitter.split(
            X,
            y,
            groups,
        )
    )

    for (
        train_index,
        calibration_index,
    ) in splits:

        train_groups = set(
            groups[
                train_index
            ]
        )

        calibration_groups = set(
            groups[
                calibration_index
            ]
        )

        overlap = (
            train_groups
            &
            calibration_groups
        )

        if overlap:
            raise RuntimeError(
                "Leakage interno na "
                "calibração: "
                f"{sorted(overlap)}"
            )

    return splits


def build_calibrated_model(
    train:
        pd.DataFrame,
) -> CalibratedClassifierCV:

    calibration_splits = (
        build_calibration_splits(
            train,
        )
    )

    estimator = (
        build_base_pipeline()
    )

    try:
        return (
            CalibratedClassifierCV(
                estimator=estimator,

                method="sigmoid",

                cv=
                    calibration_splits,
            )
        )

    except TypeError:
        # Compatibilidade com sklearn antigo.
        return (
            CalibratedClassifierCV(
                base_estimator=
                    estimator,

                method="sigmoid",

                cv=
                    calibration_splits,
            )
        )


# ============================================================
# PREDIÇÃO
# ============================================================

def predict_dataset(
    model:
        CalibratedClassifierCV,

    df:
        pd.DataFrame,
) -> tuple[
    np.ndarray,
    np.ndarray,
    np.ndarray,
]:

    texts = (
        df[
            "model_text"
        ]
        .to_numpy(
            dtype=str,
        )
    )

    predictions = (
        model.predict(
            texts,
        )
    )

    probabilities = (
        model.predict_proba(
            texts,
        )
    )

    confidence = (
        probabilities.max(
            axis=1,
        )
    )

    return (
        predictions,
        probabilities,
        confidence,
    )


# ============================================================
# MÉTRICAS
# ============================================================

def per_class_metrics(
    true_labels:
        np.ndarray,

    predictions:
        np.ndarray,
) -> dict[
    str,
    dict[
        str,
        float | int,
    ],
]:

    labels = [
        "MANUTENCAO",
        "OPERACAO",
    ]

    (
        precision,
        recall,
        f1,
        support,
    ) = (
        precision_recall_fscore_support(
            true_labels,
            predictions,

            labels=labels,

            zero_division=0,
        )
    )

    result: dict[
        str,
        dict[
            str,
            float | int,
        ],
    ] = {}

    for (
        index,
        label,
    ) in enumerate(
        labels,
    ):
        result[
            label
        ] = {
            "precision":
                rounded(
                    precision[
                        index
                    ]
                ),

            "recall":
                rounded(
                    recall[
                        index
                    ]
                ),

            "f1":
                rounded(
                    f1[
                        index
                    ]
                ),

            "support":
                int(
                    support[
                        index
                    ]
                ),
        }

    return result


def calculate_metrics(
    model:
        CalibratedClassifierCV,

    true_labels:
        np.ndarray,

    predictions:
        np.ndarray,

    probabilities:
        np.ndarray,
) -> dict[
    str,
    Any,
]:

    class_names = [
        str(
            item,
        )
        for item
        in model.classes_
    ]

    operation_index = (
        class_names.index(
            "OPERACAO"
        )
    )

    operation_probability = (
        probabilities[
            :,
            operation_index
        ]
    )

    y_operation = (
        true_labels
        ==
        "OPERACAO"
    ).astype(
        int,
    )

    matrix = (
        confusion_matrix(
            true_labels,
            predictions,

            labels=[
                "MANUTENCAO",
                "OPERACAO",
            ],
        )
    )

    return {
        "accuracy":
            rounded(
                accuracy_score(
                    true_labels,
                    predictions,
                )
            ),

        "macro_f1":
            rounded(
                f1_score(
                    true_labels,
                    predictions,

                    average="macro",

                    zero_division=0,
                )
            ),

        "weighted_f1":
            rounded(
                f1_score(
                    true_labels,
                    predictions,

                    average="weighted",

                    zero_division=0,
                )
            ),

        "roc_auc_operacao":
            rounded(
                roc_auc_score(
                    y_operation,
                    operation_probability,
                )
            ),

        "brier_score_operacao":
            rounded(
                brier_score_loss(
                    y_operation,
                    operation_probability,
                )
            ),

        "log_loss":
            rounded(
                log_loss(
                    true_labels,
                    probabilities,

                    labels=
                        class_names,
                )
            ),

        "per_class":
            per_class_metrics(
                true_labels,
                predictions,
            ),

        "confusion_matrix": {
            "labels": [
                "MANUTENCAO",
                "OPERACAO",
            ],

            "matrix":
                matrix.tolist(),
        },
    }


# ============================================================
# MÉTRICAS POR CENÁRIO
#
# Isso é muito importante para dataset sintético.
#
# 80 variações do mesmo cenário não devem ser interpretadas
# como 80 problemas totalmente independentes.
# ============================================================

def calculate_scenario_metrics(
    df:
        pd.DataFrame,

    predictions:
        np.ndarray,

    confidence:
        np.ndarray,
) -> dict[
    str,
    Any,
]:

    frame = df[
        [
            "scenario_id",
            "failure_origin",
        ]
    ].copy()

    frame[
        "prediction"
    ] = (
        predictions
    )

    frame[
        "confidence"
    ] = (
        confidence
    )

    rows: list[
        dict[
            str,
            Any,
        ]
    ] = []

    for (
        scenario_id,
        group,
    ) in frame.groupby(
        "scenario_id",
    ):

        real_label = (
            str(
                group[
                    "failure_origin"
                ]
                .iloc[
                    0
                ]
            )
        )

        prediction_counts = (
            group[
                "prediction"
            ]
            .value_counts()
        )

        predicted_label = (
            str(
                prediction_counts
                .index[
                    0
                ]
            )
        )

        scenario_accuracy = (
            float(
                (
                    group[
                        "prediction"
                    ]
                    ==
                    real_label
                )
                .mean()
            )
        )

        rows.append(
            {
                "scenario_id":
                    str(
                        scenario_id,
                    ),

                "real":
                    real_label,

                "prediction":
                    predicted_label,

                "row_accuracy":
                    rounded(
                        scenario_accuracy,
                    ),

                "mean_confidence":
                    rounded(
                        float(
                            group[
                                "confidence"
                            ]
                            .mean()
                        )
                    ),

                "correct":
                    (
                        predicted_label
                        ==
                        real_label
                    ),
            }
        )

    scenario_frame = (
        pd.DataFrame(
            rows,
        )
    )

    return {
        "scenarios":
            int(
                len(
                    scenario_frame,
                )
            ),

        "scenario_accuracy":
            rounded(
                float(
                    scenario_frame[
                        "correct"
                    ]
                    .mean()
                )
            ),

        "mean_row_accuracy_per_scenario":
            rounded(
                float(
                    scenario_frame[
                        "row_accuracy"
                    ]
                    .mean()
                )
            ),

        "details":
            rows,
    }


# ============================================================
# THRESHOLD DE ALTA CONFIANÇA
#
# O modelo SEMPRE classifica.
#
# Este threshold serve somente para dizer:
#
# ALTA CONFIANÇA
# MÉDIA
# BAIXA
#
# Não cria fila de revisão.
# ============================================================

def build_confidence_curve(
    true_labels:
        np.ndarray,

    predictions:
        np.ndarray,

    confidence:
        np.ndarray,
) -> list[
    dict[
        str,
        float | int,
    ]
]:

    total = len(
        true_labels,
    )

    thresholds = (
        np.sort(
            np.unique(
                np.round(
                    confidence,
                    6,
                )
            )
        )[
            ::-1
        ]
    )

    rows: list[
        dict[
            str,
            float | int,
        ]
    ] = []

    for threshold in thresholds:

        mask = (
            confidence
            >=
            threshold
        )

        selected = int(
            mask.sum()
        )

        if (
            selected
            <
            MIN_HIGH_CONFIDENCE_ROWS
        ):
            continue

        precision = (
            accuracy_score(
                true_labels[
                    mask
                ],
                predictions[
                    mask
                ],
            )
        )

        rows.append(
            {
                "threshold":
                    rounded(
                        threshold,
                    ),

                "selected":
                    selected,

                "total":
                    total,

                "coverage":
                    rounded(
                        selected
                        /
                        total
                    ),

                "precision":
                    rounded(
                        precision,
                    ),
            }
        )

    return rows


def select_thresholds(
    curve: list[
        dict[
            str,
            float | int,
        ]
    ],
) -> dict[
    str,
    dict[
        str,
        float | int,
    ]
    | None,
]:

    result: dict[
        str,
        dict[
            str,
            float | int,
        ]
        | None,
    ] = {}

    for target in (
        TARGET_PRECISIONS
    ):

        candidates = [
            row
            for row
            in curve

            if (
                float(
                    row[
                        "precision"
                    ]
                )
                >=
                target
            )
        ]

        key = str(
            int(
                target
                *
                100
            )
        )

        if (
            not candidates
        ):
            result[
                key
            ] = None

            continue

        # Maior cobertura possível.
        result[
            key
        ] = dict(
            max(
                candidates,

                key=lambda row: (
                    int(
                        row[
                            "selected"
                        ]
                    ),

                    float(
                        row[
                            "precision"
                        ]
                    ),
                ),
            )
        )

    return result


def evaluate_threshold(
    true_labels:
        np.ndarray,

    predictions:
        np.ndarray,

    confidence:
        np.ndarray,

    threshold:
        float,
) -> dict[
    str,
    float | int | None,
]:

    mask = (
        confidence
        >=
        threshold
    )

    selected = int(
        mask.sum()
    )

    total = len(
        true_labels,
    )

    if (
        selected
        ==
        0
    ):
        precision = None

    else:
        precision = (
            accuracy_score(
                true_labels[
                    mask
                ],
                predictions[
                    mask
                ],
            )
        )

    return {
        "threshold":
            rounded(
                threshold,
            ),

        "selected":
            selected,

        "total":
            total,

        "coverage":
            rounded(
                selected
                /
                total
            ),

        "precision":
            (
                rounded(
                    precision,
                )
                if (
                    precision
                    is not None
                )
                else
                None
            ),
    }


# ============================================================
# CSV DE PREDIÇÕES
# ============================================================

def prediction_dataframe(
    df:
        pd.DataFrame,

    model:
        CalibratedClassifierCV,

    predictions:
        np.ndarray,

    probabilities:
        np.ndarray,

    confidence:
        np.ndarray,

    high_confidence_threshold:
        float,
) -> pd.DataFrame:

    result = df[
        [
            "row_id",
            "scenario_id",
            "observation",
            "equipment",
            "stop_type",
            "stop_key_1",
            "stop_subkey",
            "line",
            "failed_component_code",
            "failure_mode",
            "failure_origin",
            "split",
        ]
    ].copy()

    classes = [
        str(
            value,
        )
        for value
        in model.classes_
    ]

    maintenance_index = (
        classes.index(
            "MANUTENCAO"
        )
    )

    operation_index = (
        classes.index(
            "OPERACAO"
        )
    )

    result[
        "prediction"
    ] = predictions

    result[
        "correct"
    ] = (
        result[
            "failure_origin"
        ].to_numpy(
            dtype=str,
        )
        ==
        predictions
    )

    result[
        "prob_manutencao"
    ] = probabilities[
        :,
        maintenance_index
    ]

    result[
        "prob_operacao"
    ] = probabilities[
        :,
        operation_index
    ]

    result[
        "confidence"
    ] = confidence

    result[
        "confidence_level"
    ] = [
        (
            "HIGH"
            if value
            >=
            high_confidence_threshold

            else
            (
                "MEDIUM"
                if value
                >=
                0.75

                else
                "LOW"
            )
        )

        for value
        in confidence
    ]

    return result


# ============================================================
# ACEITE
# ============================================================

def acceptance_report(
    test_metrics:
        dict[
            str,
            Any,
        ],

    high_confidence_test:
        dict[
            str,
            float | int | None,
        ],
) -> dict[
    str,
    Any,
]:

    accuracy = float(
        test_metrics[
            "accuracy"
        ]
    )

    macro_f1 = float(
        test_metrics[
            "macro_f1"
        ]
    )

    maintenance_precision = float(
        test_metrics[
            "per_class"
        ][
            "MANUTENCAO"
        ][
            "precision"
        ]
    )

    operation_precision = float(
        test_metrics[
            "per_class"
        ][
            "OPERACAO"
        ][
            "precision"
        ]
    )

    high_precision_raw = (
        high_confidence_test.get(
            "precision"
        )
    )

    high_precision = (
        float(
            high_precision_raw
        )
        if (
            high_precision_raw
            is not None
        )
        else
        0.0
    )

    checks = {
        "accuracy_gte_0_92":
            accuracy
            >=
            0.92,

        "macro_f1_gte_0_90":
            macro_f1
            >=
            0.90,

        "maintenance_precision_gte_0_90":
            maintenance_precision
            >=
            0.90,

        "operation_precision_gte_0_90":
            operation_precision
            >=
            0.90,

        "high_confidence_precision_gte_0_95":
            high_precision
            >=
            0.95,
    }

    return {
        "passed":
            all(
                checks.values()
            ),

        "checks":
            checks,

        "note":
            (
                "Este aceite vale somente "
                "para o holdout sintético. "
                "Produção depende de teste real."
            ),
    }


# ============================================================
# MAIN
# ============================================================

def main() -> None:

    parser = (
        argparse.ArgumentParser(
            description=(
                "Treina o classificador "
                "MANUTENCAO x OPERACAO."
            )
        )
    )

    parser.add_argument(
        "--dataset",
        default=
            DEFAULT_DATASET,
    )

    parser.add_argument(
        "--model-output",
        default=
            DEFAULT_MODEL_OUTPUT,
    )

    parser.add_argument(
        "--metrics-output",
        default=
            DEFAULT_METRICS_OUTPUT,
    )

    parser.add_argument(
        "--split-output",
        default=
            DEFAULT_SPLIT_OUTPUT,
    )

    parser.add_argument(
        "--validation-output",
        default=
            DEFAULT_VALIDATION_OUTPUT,
    )

    parser.add_argument(
        "--test-output",
        default=
            DEFAULT_TEST_OUTPUT,
    )

    args = (
        parser.parse_args()
    )

    dataset_path = (
        Path(
            args.dataset
        )
        .resolve()
    )

    model_path = (
        Path(
            args.model_output
        )
        .resolve()
    )

    metrics_path = (
        Path(
            args.metrics_output
        )
        .resolve()
    )

    split_path = (
        Path(
            args.split_output
        )
        .resolve()
    )

    validation_output_path = (
        Path(
            args.validation_output
        )
        .resolve()
    )

    test_output_path = (
        Path(
            args.test_output
        )
        .resolve()
    )

    if (
        not dataset_path.exists()
    ):
        raise FileNotFoundError(
            "Dataset não encontrado: "
            f"{dataset_path}"
        )

    for path in [
        model_path,
        metrics_path,
        split_path,
        validation_output_path,
        test_output_path,
    ]:
        path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

    print(
        "="
        *
        78
    )

    print(
        "EASY MAINTENANCE - FAILURE ORIGIN CLASSIFIER V1"
    )

    print(
        "="
        *
        78
    )

    print()

    print(
        f"Dataset: {dataset_path}"
    )

    # ========================================================
    # DATASET
    # ========================================================

    dataset = (
        load_dataset(
            dataset_path,
        )
    )

    validate_scenarios(
        dataset,
    )

    dataset = (
        add_model_text(
            dataset,
        )
    )

    # ========================================================
    # SPLIT
    # ========================================================

    scenario_split = (
        create_scenario_split(
            dataset,
        )
    )

    dataset = (
        apply_split(
            dataset,
            scenario_split,
        )
    )

    leakage = (
        check_scenario_leakage(
            dataset,
        )
    )

    if any(
        value > 0

        for value
        in leakage.values()
    ):
        raise RuntimeError(
            "Scenario leakage "
            f"detectado: {leakage}"
        )

    train = dataset[
        dataset[
            "split"
        ]
        ==
        "TRAIN"
    ].copy()

    validation = dataset[
        dataset[
            "split"
        ]
        ==
        "VALIDATION"
    ].copy()

    test = dataset[
        dataset[
            "split"
        ]
        ==
        "TEST"
    ].copy()

    if (
        train.empty
        or
        validation.empty
        or
        test.empty
    ):
        raise RuntimeError(
            "TRAIN, VALIDATION ou TEST vazio."
        )

    split_columns = [
        "row_id",
        "scenario_id",
        "failure_origin",
        "split",
        "observation",
        "equipment",
        "stop_type",
        "stop_key_1",
        "stop_subkey",
        "line",
        "failed_component_code",
        "failure_mode",
    ]

    dataset[
        split_columns
    ].to_csv(
        split_path,

        index=False,

        encoding=
            "utf-8-sig",
    )

    # ========================================================
    # DISTRIBUIÇÃO
    # ========================================================

    print()

    print(
        "SPLIT POR CENÁRIO:"
    )

    for split_name in (
        "TRAIN",
        "VALIDATION",
        "TEST",
    ):

        part = dataset[
            dataset[
                "split"
            ]
            ==
            split_name
        ]

        print(
            f"  {split_name:<11}"
            f"{len(part):>5} registros | "
            f"{part['scenario_id'].nunique():>2} cenários"
        )

        distribution = (
            part[
                "failure_origin"
            ]
            .value_counts()
        )

        for origin in (
            "MANUTENCAO",
            "OPERACAO",
        ):
            print(
                f"      {origin:<12}"
                f"{int(distribution.get(origin, 0)):>5}"
            )

    print()

    print(
        "Scenario leakage: 0"
    )

    print()

    print(
        "Features utilizadas:"
    )

    for feature in (
        ACTIVE_FEATURES
    ):
        print(
            f"  + {feature}"
        )

    print()

    print(
        "Features excluídas da V1:"
    )

    for feature in (
        EXCLUDED_FEATURES
    ):
        print(
            f"  - {feature}"
        )

    # ========================================================
    # MODELO
    # ========================================================

    print()

    print(
        "Treinando LinearSVC + "
        "calibração sigmoid por cenário..."
    )

    model = (
        build_calibrated_model(
            train,
        )
    )

    train_texts = (
        train[
            "model_text"
        ]
        .to_numpy(
            dtype=str,
        )
    )

    train_labels = (
        train[
            "failure_origin"
        ]
        .to_numpy(
            dtype=str,
        )
    )

    model.fit(
        train_texts,
        train_labels,
    )

    # ========================================================
    # VALIDATION
    # ========================================================

    validation_labels = (
        validation[
            "failure_origin"
        ]
        .to_numpy(
            dtype=str,
        )
    )

    (
        validation_predictions,
        validation_probabilities,
        validation_confidence,
    ) = predict_dataset(
        model,
        validation,
    )

    validation_metrics = (
        calculate_metrics(
            model,
            validation_labels,
            validation_predictions,
            validation_probabilities,
        )
    )

    validation_scenarios = (
        calculate_scenario_metrics(
            validation,
            validation_predictions,
            validation_confidence,
        )
    )

    confidence_curve = (
        build_confidence_curve(
            validation_labels,
            validation_predictions,
            validation_confidence,
        )
    )

    selected_thresholds = (
        select_thresholds(
            confidence_curve,
        )
    )

    # Preferimos threshold calibrado para 95%.
    threshold_95 = (
        selected_thresholds.get(
            "95"
        )
    )

    threshold_90 = (
        selected_thresholds.get(
            "90"
        )
    )

    if (
        threshold_95
        is not None
    ):
        high_confidence_threshold = float(
            threshold_95[
                "threshold"
            ]
        )

        selected_target = 0.95

    elif (
        threshold_90
        is not None
    ):
        high_confidence_threshold = float(
            threshold_90[
                "threshold"
            ]
        )

        selected_target = 0.90

    else:
        high_confidence_threshold = 0.90

        selected_target = None

    # ========================================================
    # TEST FINAL
    # ========================================================

    test_labels = (
        test[
            "failure_origin"
        ]
        .to_numpy(
            dtype=str,
        )
    )

    (
        test_predictions,
        test_probabilities,
        test_confidence,
    ) = predict_dataset(
        model,
        test,
    )

    test_metrics = (
        calculate_metrics(
            model,
            test_labels,
            test_predictions,
            test_probabilities,
        )
    )

    test_scenarios = (
        calculate_scenario_metrics(
            test,
            test_predictions,
            test_confidence,
        )
    )

    high_confidence_test = (
        evaluate_threshold(
            test_labels,
            test_predictions,
            test_confidence,
            high_confidence_threshold,
        )
    )

    acceptance = (
        acceptance_report(
            test_metrics,
            high_confidence_test,
        )
    )

    # ========================================================
    # CSV VALIDATION
    # ========================================================

    validation_df = (
        prediction_dataframe(
            validation,
            model,
            validation_predictions,
            validation_probabilities,
            validation_confidence,
            high_confidence_threshold,
        )
    )

    validation_df.to_csv(
        validation_output_path,

        index=False,

        encoding=
            "utf-8-sig",
    )

    # ========================================================
    # CSV TEST
    # ========================================================

    test_df = (
        prediction_dataframe(
            test,
            model,
            test_predictions,
            test_probabilities,
            test_confidence,
            high_confidence_threshold,
        )
    )

    test_df.to_csv(
        test_output_path,

        index=False,

        encoding=
            "utf-8-sig",
    )

    # ========================================================
    # ARTEFATO
    #
    # MODELO DE AVALIAÇÃO.
    #
    # Ainda NÃO deve substituir produção.
    # ========================================================

    artifact = {
        "model_version":
            MODEL_VERSION,

        "dataset_version":
            DATASET_VERSION,

        "purpose":
            "evaluation",

        "target":
            "failure_origin",

        "classes":
            [
                str(
                    value,
                )
                for value
                in model.classes_
            ],

        "active_features":
            list(
                ACTIVE_FEATURES
            ),

        "excluded_features":
            list(
                EXCLUDED_FEATURES
            ),

        "model":
            model,

        "confidence_type":
            "calibrated_probability_sigmoid",

        "high_confidence_threshold":
            high_confidence_threshold,

        "selected_precision_target":
            selected_target,

        "thresholds":
            selected_thresholds,

        "split_strategy":
            (
                "scenario_grouped_"
                "train_validation_test"
            ),

        "random_seed":
            RANDOM_SEED,
    }

    joblib.dump(
        artifact,
        model_path,
    )

    # ========================================================
    # JSON MÉTRICAS
    # ========================================================

    metrics = {
        "model_version":
            MODEL_VERSION,

        "dataset_version":
            DATASET_VERSION,

        "algorithm":
            (
                "TFIDF_WORD_CHAR_"
                "LINEAR_SVC_"
                "SIGMOID_CALIBRATION"
            ),

        "active_features":
            list(
                ACTIVE_FEATURES
            ),

        "excluded_features":
            list(
                EXCLUDED_FEATURES
            ),

        "split": {
            "total_rows":
                int(
                    len(
                        dataset,
                    )
                ),

            "total_scenarios":
                int(
                    dataset[
                        "scenario_id"
                    ].nunique()
                ),

            "train_rows":
                int(
                    len(
                        train,
                    )
                ),

            "validation_rows":
                int(
                    len(
                        validation,
                    )
                ),

            "test_rows":
                int(
                    len(
                        test,
                    )
                ),

            "train_scenarios":
                int(
                    train[
                        "scenario_id"
                    ].nunique()
                ),

            "validation_scenarios":
                int(
                    validation[
                        "scenario_id"
                    ].nunique()
                ),

            "test_scenarios":
                int(
                    test[
                        "scenario_id"
                    ].nunique()
                ),

            "scenario_leakage":
                leakage,
        },

        "validation": {
            "row_level":
                validation_metrics,

            "scenario_level":
                validation_scenarios,
        },

        "confidence": {
            "type":
                "calibrated_probability_sigmoid",

            "target_precision_thresholds":
                selected_thresholds,

            "selected_high_confidence_threshold":
                rounded(
                    high_confidence_threshold,
                ),

            "selected_precision_target":
                selected_target,
        },

        "test": {
            "row_level":
                test_metrics,

            "scenario_level":
                test_scenarios,

            "high_confidence":
                high_confidence_test,
        },

        "acceptance":
            acceptance,

        "classification_report_test":
            classification_report(
                test_labels,
                test_predictions,

                labels=[
                    "MANUTENCAO",
                    "OPERACAO",
                ],

                output_dict=True,

                zero_division=0,
            ),
    }

    with metrics_path.open(
        "w",
        encoding="utf-8",
    ) as file:

        json.dump(
            metrics,
            file,

            ensure_ascii=False,

            indent=2,
        )

    # ========================================================
    # TERMINAL
    # ========================================================

    print()

    print(
        "="
        *
        78
    )

    print(
        "RESULTADOS - FAILURE ORIGIN CLASSIFIER V1"
    )

    print(
        "="
        *
        78
    )

    print()

    print(
        "VALIDATION:"
    )

    print(
        "  Accuracy:       "
        f"{validation_metrics['accuracy']:.4f}"
    )

    print(
        "  Macro F1:       "
        f"{validation_metrics['macro_f1']:.4f}"
    )

    print(
        "  ROC-AUC:        "
        f"{validation_metrics['roc_auc_operacao']:.4f}"
    )

    print(
        "  Brier score:    "
        f"{validation_metrics['brier_score_operacao']:.4f}"
    )

    print()

    print(
        "TEST FINAL:"
    )

    print(
        "  Accuracy:       "
        f"{test_metrics['accuracy']:.4f}"
    )

    print(
        "  Macro F1:       "
        f"{test_metrics['macro_f1']:.4f}"
    )

    print(
        "  Weighted F1:    "
        f"{test_metrics['weighted_f1']:.4f}"
    )

    print(
        "  ROC-AUC:        "
        f"{test_metrics['roc_auc_operacao']:.4f}"
    )

    print(
        "  Brier score:    "
        f"{test_metrics['brier_score_operacao']:.4f}"
    )

    print(
        "  Log loss:       "
        f"{test_metrics['log_loss']:.4f}"
    )

    print()

    print(
        "POR CLASSE:"
    )

    for origin in (
        "MANUTENCAO",
        "OPERACAO",
    ):

        values = (
            test_metrics[
                "per_class"
            ][
                origin
            ]
        )

        print(
            f"  {origin}"
        )

        print(
            "    Precision: "
            f"{values['precision']:.4f}"
        )

        print(
            "    Recall:    "
            f"{values['recall']:.4f}"
        )

        print(
            "    F1:        "
            f"{values['f1']:.4f}"
        )

    print()

    print(
        "MATRIZ DE CONFUSÃO:"
    )

    matrix = (
        test_metrics[
            "confusion_matrix"
        ][
            "matrix"
        ]
    )

    print(
        "                  PRED MANUT.   PRED OPER."
    )

    print(
        "  REAL MANUT.    "
        f"{matrix[0][0]:>10}   "
        f"{matrix[0][1]:>10}"
    )

    print(
        "  REAL OPER.     "
        f"{matrix[1][0]:>10}   "
        f"{matrix[1][1]:>10}"
    )

    print()

    print(
        "CENÁRIOS NO TEST:"
    )

    print(
        "  Cenários:      "
        f"{test_scenarios['scenarios']}"
    )

    print(
        "  Accuracy:      "
        f"{test_scenarios['scenario_accuracy']:.4f}"
    )

    print()

    print(
        "ALTA CONFIANÇA:"
    )

    print(
        "  Threshold:     "
        f"{high_confidence_threshold:.4f}"
    )

    print(
        "  Cobertura:      "
        f"{float(high_confidence_test['coverage']):.4f}"
    )

    print(
        "  Precisão:       "
        f"{high_confidence_test['precision']}"
    )

    print()

    print(
        "ACEITE SINTÉTICO:"
    )

    for (
        check,
        passed,
    ) in (
        acceptance[
            "checks"
        ].items()
    ):

        print(
            f"  {'OK' if passed else 'FALHOU':<7}"
            f" {check}"
        )

    print()

    print(
        "Resultado geral: "
        + (
            "APROVADO"
            if acceptance[
                "passed"
            ]
            else
            "NÃO APROVADO"
        )
    )

    print()

    print(
        "IMPORTANTE:"
    )

    print(
        "Aprovação sintética NÃO significa "
        "aprovação para produção."
    )

    print(
        "O próximo estágio exige dados reais "
        "de fábrica não usados no treinamento."
    )

    print()

    print(
        "Artefatos:"
    )

    print(
        f"  Modelo:      {model_path}"
    )

    print(
        f"  Métricas:    {metrics_path}"
    )

    print(
        f"  Split:       {split_path}"
    )

    print(
        "  Validation:  "
        f"{validation_output_path}"
    )

    print(
        f"  Test:        {test_output_path}"
    )

    print(
        "="
        *
        78
    )


if __name__ == "__main__":
    main()