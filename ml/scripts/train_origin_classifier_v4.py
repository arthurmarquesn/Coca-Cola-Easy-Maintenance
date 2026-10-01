from __future__ import annotations

import argparse
import json
import math
import re
import unicodedata
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from sklearn.calibration import CalibratedClassifierCV
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    brier_score_loss,
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
# VERSÕES
# ============================================================

MODEL_VERSION = "failure_origin_classifier_v4_candidate"
DATASET_VERSION = "synthetic-v2+real-v1+real-v2"

RANDOM_SEED = 42
OUTER_FOLDS = 5

REAL_WEIGHTS = (1, 3, 5)
ALGORITHMS = (
    "LINEAR_SVC_CALIBRATED",
    "LOGISTIC_REGRESSION",
)
CLASS_WEIGHTS = (
    "NONE",
    "BALANCED",
)

TARGET_HIGH_CONFIDENCE_PRECISION = 0.95
MIN_HIGH_CONFIDENCE_ROWS = 40

VALID_LABELS = {
    "MANUTENCAO",
    "OPERACAO",
}


# ============================================================
# ARQUIVOS PADRÃO
# ============================================================

DEFAULT_SYNTHETIC = (
    "ml/data/origin/"
    "synthetic_origin_v2.csv"
)

DEFAULT_REAL_V1 = (
    "ml/data/origin/real/"
    "origin_real_validation_v1_revisado.csv"
)

DEFAULT_REAL_V2 = (
    "ml/data/origin/real/"
    "origin_real_holdout_v2_preenchido.csv"
)

DEFAULT_MODEL_OUTPUT = (
    "ml/models/"
    "failure_origin_classifier_v4_candidate.joblib"
)

DEFAULT_METRICS_OUTPUT = (
    "ml/reports/"
    "failure_origin_classifier_v4_metrics.json"
)

DEFAULT_SELECTION_OUTPUT = (
    "ml/reports/"
    "failure_origin_classifier_v4_selection.csv"
)

DEFAULT_OOF_OUTPUT = (
    "ml/data/origin/real/"
    "origin_real_oof_predictions_v4.csv"
)

DEFAULT_CONFLICT_OUTPUT = (
    "ml/reports/"
    "failure_origin_classifier_v4_conflicts.csv"
)


# ============================================================
# NORMALIZAÇÃO
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
        and
        math.isnan(
            value,
        )
    ):
        return ""

    return str(
        value,
    ).strip()


def strip_accents(
    value: str,
) -> str:

    normalized = (
        unicodedata.normalize(
            "NFKD",
            value,
        )
    )

    return "".join(
        character

        for character
        in normalized

        if not unicodedata.combining(
            character
        )
    )


def normalize_label(
    value: object,
) -> str:

    return (
        strip_accents(
            clean_string(
                value,
            )
        )
        .upper()
        .strip()
    )


def normalize_observation(
    value: object,
) -> str:

    text = (
        strip_accents(
            clean_string(
                value,
            )
        )
        .lower()
    )

    text = re.sub(
        r"[^\w\s]",
        " ",
        text,
        flags=re.UNICODE,
    )

    text = re.sub(
        r"\s+",
        " ",
        text,
    ).strip()

    return text


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
# LEITURA
# ============================================================

def load_synthetic(
    path: Path,
) -> pd.DataFrame:

    df = pd.read_csv(
        path,
        dtype=str,
    )

    required = {
        "observation",
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
            "Dataset sintético sem colunas: "
            f"{sorted(missing)}"
        )

    result = pd.DataFrame(
        {
            "event_id":
                "",

            "observation":
                df[
                    "observation"
                ]
                .fillna("")
                .map(
                    clean_string,
                ),

            "label":
                df[
                    "failure_origin"
                ]
                .map(
                    normalize_label,
                ),

            "source_dataset":
                "SYNTHETIC_V2",
        }
    )

    result[
        "observation_norm"
    ] = (
        result[
            "observation"
        ]
        .map(
            normalize_observation,
        )
    )

    result = result[
        (
            result[
                "observation_norm"
            ]
            !=
            ""
        )
        &
        result[
            "label"
        ]
        .isin(
            VALID_LABELS
        )
    ].copy()

    return result


def load_real(
    path: Path,
    source_name: str,
) -> pd.DataFrame:

    df = pd.read_csv(
        path,
        dtype=str,
    )

    required = {
        "event_id",
        "observation",
        "human_origin",
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
            f"{source_name} sem colunas: "
            f"{sorted(missing)}"
        )

    result = df.copy()

    result[
        "event_id"
    ] = (
        result[
            "event_id"
        ]
        .fillna("")
        .map(
            clean_string,
        )
    )

    result[
        "observation"
    ] = (
        result[
            "observation"
        ]
        .fillna("")
        .map(
            clean_string,
        )
    )

    result[
        "label"
    ] = (
        result[
            "human_origin"
        ]
        .map(
            normalize_label,
        )
    )

    invalid = sorted(
        set(
            result[
                "label"
            ].unique()
        )
        -
        VALID_LABELS
    )

    if invalid:
        raise ValueError(
            f"{source_name} possui labels inválidos: "
            f"{invalid}"
        )

    result[
        "source_dataset"
    ] = source_name

    result[
        "observation_norm"
    ] = (
        result[
            "observation"
        ]
        .map(
            normalize_observation,
        )
    )

    result = result[
        result[
            "observation_norm"
        ]
        !=
        ""
    ].copy()

    return result


# ============================================================
# CONFLITOS / DUPLICATAS
# ============================================================

def remove_real_conflicts_and_duplicates(
    real: pd.DataFrame,
) -> tuple[
    pd.DataFrame,
    pd.DataFrame,
    int,
]:

    label_counts = (
        real.groupby(
            "observation_norm"
        )[
            "label"
        ]
        .nunique()
    )

    conflict_groups = set(
        label_counts[
            label_counts > 1
        ].index
    )

    conflicts = real[
        real[
            "observation_norm"
        ]
        .isin(
            conflict_groups
        )
    ].copy()

    clean = real[
        ~real[
            "observation_norm"
        ]
        .isin(
            conflict_groups
        )
    ].copy()

    before = len(
        clean
    )

    clean = (
        clean
        .sort_values(
            [
                "source_dataset",
                "event_id",
            ]
        )
        .drop_duplicates(
            subset=[
                "observation_norm",
            ],
            keep="first",
        )
        .reset_index(
            drop=True,
        )
    )

    duplicates_removed = (
        before
        -
        len(
            clean
        )
    )

    return (
        clean,
        conflicts,
        duplicates_removed,
    )


def remove_synthetic_overlap(
    synthetic: pd.DataFrame,
    real: pd.DataFrame,
) -> tuple[
    pd.DataFrame,
    int,
]:

    real_norms = set(
        real[
            "observation_norm"
        ]
    )

    filtered = synthetic[
        ~synthetic[
            "observation_norm"
        ]
        .isin(
            real_norms
        )
    ].copy()

    removed = (
        len(
            synthetic
        )
        -
        len(
            filtered
        )
    )

    return (
        filtered,
        removed,
    )


def deduplicate_synthetic(
    synthetic: pd.DataFrame,
) -> tuple[
    pd.DataFrame,
    int,
]:

    before = len(
        synthetic
    )

    clean = (
        synthetic
        .drop_duplicates(
            subset=[
                "observation_norm",
                "label",
            ]
        )
        .reset_index(
            drop=True,
        )
    )

    return (
        clean,
        before
        -
        len(
            clean
        ),
    )


# ============================================================
# FEATURES
# ============================================================

def build_vectorizer() -> FeatureUnion:

    return FeatureUnion(
        [
            (
                "word",
                TfidfVectorizer(
                    analyzer="word",
                    ngram_range=(1, 3),
                    min_df=2,
                    max_df=0.995,
                    max_features=80000,
                    lowercase=True,
                    strip_accents="unicode",
                    sublinear_tf=True,
                ),
            ),

            (
                "char",
                TfidfVectorizer(
                    analyzer="char_wb",
                    ngram_range=(3, 5),
                    min_df=2,
                    max_df=0.999,
                    max_features=100000,
                    lowercase=True,
                    strip_accents="unicode",
                    sublinear_tf=True,
                ),
            ),
        ]
    )


# ============================================================
# MODELOS
# ============================================================

def normalize_class_weight(
    value: str,
):

    if (
        value
        ==
        "BALANCED"
    ):
        return "balanced"

    return None


def build_model(
    algorithm: str,
    class_weight_name: str,
):

    class_weight = (
        normalize_class_weight(
            class_weight_name,
        )
    )

    if (
        algorithm
        ==
        "LOGISTIC_REGRESSION"
    ):

        return Pipeline(
            [
                (
                    "features",
                    build_vectorizer(),
                ),

                (
                    "classifier",
                    LogisticRegression(
                        C=3.0,
                        class_weight=
                            class_weight,
                        solver="liblinear",
                        max_iter=5000,
                        random_state=
                            RANDOM_SEED,
                    ),
                ),
            ]
        )

    if (
        algorithm
        ==
        "LINEAR_SVC_CALIBRATED"
    ):

        base = Pipeline(
            [
                (
                    "features",
                    build_vectorizer(),
                ),

                (
                    "classifier",
                    LinearSVC(
                        C=1.2,
                        class_weight=
                            class_weight,
                        max_iter=15000,
                        random_state=
                            RANDOM_SEED,
                    ),
                ),
            ]
        )

        try:

            return CalibratedClassifierCV(
                estimator=base,
                method="sigmoid",
                cv=3,
            )

        except TypeError:

            return CalibratedClassifierCV(
                base_estimator=base,
                method="sigmoid",
                cv=3,
            )

    raise ValueError(
        f"Algoritmo inválido: {algorithm}"
    )


# ============================================================
# PESO DOS DADOS REAIS
# ============================================================

def build_weighted_training(
    synthetic: pd.DataFrame,
    real_train: pd.DataFrame,
    real_weight: int,
) -> pd.DataFrame:

    pieces = [
        synthetic.copy()
    ]

    for _ in range(
        real_weight
    ):
        pieces.append(
            real_train.copy()
        )

    result = pd.concat(
        pieces,
        ignore_index=True,
    )

    return result


# ============================================================
# MÉTRICAS
# ============================================================

def calculate_metrics(
    model,
    y_true: np.ndarray,
    y_pred: np.ndarray,
    probabilities: np.ndarray,
) -> dict[
    str,
    Any,
]:

    labels = [
        "MANUTENCAO",
        "OPERACAO",
    ]

    classes = [
        str(
            value
        )
        for value
        in model.classes_
    ]

    if set(
        classes
    ) != set(
        labels
    ):
        raise RuntimeError(
            "Classes inesperadas: "
            f"{classes}"
        )

    (
        precision,
        recall,
        f1,
        support,
    ) = (
        precision_recall_fscore_support(
            y_true,
            y_pred,
            labels=labels,
            zero_division=0,
        )
    )

    operation_index = (
        classes.index(
            "OPERACAO"
        )
    )

    y_operation = (
        y_true
        ==
        "OPERACAO"
    ).astype(
        int
    )

    operation_probability = (
        probabilities[
            :,
            operation_index
        ]
    )

    matrix = confusion_matrix(
        y_true,
        y_pred,
        labels=labels,
    )

    predicted_counts = {
        label:
            int(
                np.sum(
                    y_pred
                    ==
                    label
                )
            )

        for label
        in labels
    }

    actual_counts = {
        label:
            int(
                np.sum(
                    y_true
                    ==
                    label
                )
            )

        for label
        in labels
    }

    return {
        "accuracy":
            rounded(
                accuracy_score(
                    y_true,
                    y_pred,
                )
            ),

        "macro_f1":
            rounded(
                f1_score(
                    y_true,
                    y_pred,
                    average="macro",
                    zero_division=0,
                )
            ),

        "weighted_f1":
            rounded(
                f1_score(
                    y_true,
                    y_pred,
                    average="weighted",
                    zero_division=0,
                )
            ),

        "roc_auc":
            rounded(
                roc_auc_score(
                    y_operation,
                    operation_probability,
                )
            ),

        "brier_score":
            rounded(
                brier_score_loss(
                    y_operation,
                    operation_probability,
                )
            ),

        "log_loss":
            rounded(
                log_loss(
                    y_true,
                    probabilities,
                    labels=classes,
                )
            ),

        "per_class": {
            "MANUTENCAO": {
                "precision":
                    rounded(
                        precision[
                            0
                        ]
                    ),

                "recall":
                    rounded(
                        recall[
                            0
                        ]
                    ),

                "f1":
                    rounded(
                        f1[
                            0
                        ]
                    ),

                "support":
                    int(
                        support[
                            0
                        ]
                    ),
            },

            "OPERACAO": {
                "precision":
                    rounded(
                        precision[
                            1
                        ]
                    ),

                "recall":
                    rounded(
                        recall[
                            1
                        ]
                    ),

                "f1":
                    rounded(
                        f1[
                            1
                        ]
                    ),

                "support":
                    int(
                        support[
                            1
                        ]
                    ),
            },
        },

        "actual_counts":
            actual_counts,

        "predicted_counts":
            predicted_counts,

        "confusion_matrix": {
            "labels":
                labels,

            "matrix":
                matrix.tolist(),
        },
    }


# ============================================================
# HIGH CONFIDENCE
# ============================================================

def choose_high_confidence_threshold(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    confidence: np.ndarray,
) -> dict[
    str,
    Any,
]:

    curve = []

    for threshold in (
        np.arange(
            0.50,
            1.00,
            0.01,
        )
    ):

        threshold = float(
            round(
                threshold,
                2,
            )
        )

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

        precision = float(
            accuracy_score(
                y_true[
                    mask
                ],
                y_pred[
                    mask
                ],
            )
        )

        curve.append(
            {
                "threshold":
                    threshold,

                "selected":
                    selected,

                "coverage":
                    rounded(
                        selected
                        /
                        len(
                            y_true
                        )
                    ),

                "precision":
                    rounded(
                        precision
                    ),
            }
        )

    accepted = [
        row

        for row
        in curve

        if (
            row[
                "precision"
            ]
            >=
            TARGET_HIGH_CONFIDENCE_PRECISION
        )
    ]

    if not accepted:

        return {
            "enabled":
                False,

            "threshold":
                1.01,

            "target_precision":
                TARGET_HIGH_CONFIDENCE_PRECISION,

            "minimum_rows":
                MIN_HIGH_CONFIDENCE_ROWS,

            "selected":
                0,

            "coverage":
                0.0,

            "precision":
                None,

            "curve":
                curve,
        }

    best = max(
        accepted,
        key=lambda row: (
            row[
                "coverage"
            ],
            row[
                "precision"
            ],
        ),
    )

    return {
        "enabled":
            True,

        "threshold":
            best[
                "threshold"
            ],

        "target_precision":
            TARGET_HIGH_CONFIDENCE_PRECISION,

        "minimum_rows":
            MIN_HIGH_CONFIDENCE_ROWS,

        "selected":
            best[
                "selected"
            ],

        "coverage":
            best[
                "coverage"
            ],

        "precision":
            best[
                "precision"
            ],

        "curve":
            curve,
    }


# ============================================================
# SELEÇÃO
# ============================================================

def candidate_selection_key(
    candidate: dict[
        str,
        Any,
    ],
) -> tuple[
    float,
    float,
    float,
    float,
    float,
    float,
]:

    metrics = (
        candidate[
            "oof_metrics"
        ]
    )

    maintenance = (
        metrics[
            "per_class"
        ][
            "MANUTENCAO"
        ]
    )

    operation = (
        metrics[
            "per_class"
        ][
            "OPERACAO"
        ]
    )

    return (
        float(
            metrics[
                "macro_f1"
            ]
        ),

        float(
            candidate[
                "worst_fold_macro_f1"
            ]
        ),

        min(
            float(
                maintenance[
                    "f1"
                ]
            ),
            float(
                operation[
                    "f1"
                ]
            ),
        ),

        min(
            float(
                maintenance[
                    "precision"
                ]
            ),
            float(
                operation[
                    "precision"
                ]
            ),
        ),

        float(
            metrics[
                "accuracy"
            ]
        ),

        -float(
            metrics[
                "brier_score"
            ]
        ),
    )


# ============================================================
# MAIN
# ============================================================

def main() -> None:

    parser = argparse.ArgumentParser(
        description=(
            "Treina V4 do classificador de origem "
            "com 5-fold CV real."
        )
    )

    parser.add_argument(
        "--synthetic",
        default=
            DEFAULT_SYNTHETIC,
    )

    parser.add_argument(
        "--real-v1",
        default=
            DEFAULT_REAL_V1,
    )

    parser.add_argument(
        "--real-v2",
        default=
            DEFAULT_REAL_V2,
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
        "--selection-output",
        default=
            DEFAULT_SELECTION_OUTPUT,
    )

    parser.add_argument(
        "--oof-output",
        default=
            DEFAULT_OOF_OUTPUT,
    )

    parser.add_argument(
        "--conflict-output",
        default=
            DEFAULT_CONFLICT_OUTPUT,
    )

    args = (
        parser.parse_args()
    )

    synthetic_path = (
        Path(
            args.synthetic
        ).resolve()
    )

    real_v1_path = (
        Path(
            args.real_v1
        ).resolve()
    )

    real_v2_path = (
        Path(
            args.real_v2
        ).resolve()
    )

    model_path = (
        Path(
            args.model_output
        ).resolve()
    )

    metrics_path = (
        Path(
            args.metrics_output
        ).resolve()
    )

    selection_path = (
        Path(
            args.selection_output
        ).resolve()
    )

    oof_path = (
        Path(
            args.oof_output
        ).resolve()
    )

    conflict_path = (
        Path(
            args.conflict_output
        ).resolve()
    )

    for path in (
        synthetic_path,
        real_v1_path,
        real_v2_path,
    ):

        if not path.exists():
            raise FileNotFoundError(
                path
            )

    for path in (
        model_path,
        metrics_path,
        selection_path,
        oof_path,
        conflict_path,
    ):

        path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

    print(
        "=" * 78
    )

    print(
        "EASY MAINTENANCE - FAILURE ORIGIN CLASSIFIER V4"
    )

    print(
        "=" * 78
    )

    print()

    synthetic = load_synthetic(
        synthetic_path
    )

    synthetic, synthetic_duplicates = (
        deduplicate_synthetic(
            synthetic
        )
    )

    real_v1 = load_real(
        real_v1_path,
        "REAL_V1",
    )

    real_v2 = load_real(
        real_v2_path,
        "REAL_V2",
    )

    real_raw = pd.concat(
        [
            real_v1,
            real_v2,
        ],
        ignore_index=True,
    )

    (
        real,
        conflicts,
        real_duplicates,
    ) = (
        remove_real_conflicts_and_duplicates(
            real_raw
        )
    )

    conflicts.to_csv(
        conflict_path,
        index=False,
        encoding="utf-8-sig",
    )

    (
        synthetic,
        synthetic_overlap_removed,
    ) = (
        remove_synthetic_overlap(
            synthetic,
            real,
        )
    )

    print(
        f"SYNTHETIC único: {len(synthetic)}"
    )

    print(
        "SYNTHETIC duplicatas removidas: "
        f"{synthetic_duplicates}"
    )

    print(
        "SYNTHETIC overlap com real removido: "
        f"{synthetic_overlap_removed}"
    )

    print()

    print(
        f"REAL bruto: {len(real_raw)}"
    )

    print(
        f"REAL conflitos: {len(conflicts)}"
    )

    print(
        "REAL duplicatas removidas: "
        f"{real_duplicates}"
    )

    print(
        f"REAL único utilizável: {len(real)}"
    )

    print()

    print(
        "DISTRIBUIÇÃO REAL:"
    )

    print(
        real[
            "label"
        ]
        .value_counts()
        .to_string()
    )

    if (
        len(
            real
        )
        <
        300
    ):

        raise RuntimeError(
            "Poucos exemplos reais para V4."
        )

    # --------------------------------------------------------
    # OUTER CV REAL
    # --------------------------------------------------------

    X_real = (
        real[
            "observation"
        ]
        .to_numpy(
            dtype=str,
        )
    )

    y_real = (
        real[
            "label"
        ]
        .to_numpy(
            dtype=str,
        )
    )

    groups_real = (
        real[
            "observation_norm"
        ]
        .to_numpy(
            dtype=str,
        )
    )

    splitter = (
        StratifiedGroupKFold(
            n_splits=
                OUTER_FOLDS,

            shuffle=True,

            random_state=
                RANDOM_SEED,
        )
    )

    folds = list(
        splitter.split(
            X_real,
            y_real,
            groups_real,
        )
    )

    print()

    print(
        "=" * 78
    )

    print(
        "5-FOLD CROSS-VALIDATION REAL"
    )

    print(
        "=" * 78
    )

    candidates: list[
        dict[
            str,
            Any,
        ]
    ] = []

    candidate_oof: dict[
        str,
        dict[
            str,
            Any,
        ]
    ] = {}

    for algorithm in (
        ALGORITHMS
    ):

        for real_weight in (
            REAL_WEIGHTS
        ):

            for class_weight_name in (
                CLASS_WEIGHTS
            ):

                candidate_name = (
                    f"{algorithm}"
                    f"__RW{real_weight}"
                    f"__CW{class_weight_name}"
                )

                print()
                print(
                    candidate_name
                )

                oof_predictions = np.empty(
                    len(
                        real
                    ),
                    dtype=object,
                )

                oof_probabilities = np.zeros(
                    (
                        len(
                            real
                        ),
                        2,
                    ),
                    dtype=float,
                )

                oof_confidence = np.zeros(
                    len(
                        real
                    ),
                    dtype=float,
                )

                fold_metrics = []

                classes_reference = None

                for (
                    fold_index,
                    (
                        train_index,
                        validation_index,
                    ),
                ) in enumerate(
                    folds,
                    start=1,
                ):

                    real_train = (
                        real.iloc[
                            train_index
                        ]
                        .copy()
                    )

                    real_validation = (
                        real.iloc[
                            validation_index
                        ]
                        .copy()
                    )

                    train_groups = set(
                        real_train[
                            "observation_norm"
                        ]
                    )

                    validation_groups = set(
                        real_validation[
                            "observation_norm"
                        ]
                    )

                    if (
                        train_groups
                        &
                        validation_groups
                    ):

                        raise RuntimeError(
                            "Leakage REAL entre folds."
                        )

                    train = (
                        build_weighted_training(
                            synthetic,
                            real_train,
                            real_weight,
                        )
                    )

                    model = build_model(
                        algorithm,
                        class_weight_name,
                    )

                    model.fit(
                        train[
                            "observation"
                        ]
                        .to_numpy(
                            dtype=str,
                        ),

                        train[
                            "label"
                        ]
                        .to_numpy(
                            dtype=str,
                        ),
                    )

                    predictions = model.predict(
                        real_validation[
                            "observation"
                        ]
                        .to_numpy(
                            dtype=str,
                        )
                    )

                    probabilities = (
                        model.predict_proba(
                            real_validation[
                                "observation"
                            ]
                            .to_numpy(
                                dtype=str,
                            )
                        )
                    )

                    classes = [
                        str(
                            value
                        )
                        for value
                        in model.classes_
                    ]

                    if (
                        classes_reference
                        is None
                    ):
                        classes_reference = (
                            classes
                        )

                    if (
                        classes
                        !=
                        classes_reference
                    ):
                        raise RuntimeError(
                            "Ordem de classes mudou "
                            "entre folds."
                        )

                    confidence = (
                        probabilities.max(
                            axis=1,
                        )
                    )

                    oof_predictions[
                        validation_index
                    ] = predictions

                    oof_probabilities[
                        validation_index,
                        :
                    ] = probabilities

                    oof_confidence[
                        validation_index
                    ] = confidence

                    metrics = (
                        calculate_metrics(
                            model,
                            real_validation[
                                "label"
                            ]
                            .to_numpy(
                                dtype=str,
                            ),
                            predictions,
                            probabilities,
                        )
                    )

                    fold_metrics.append(
                        {
                            "fold":
                                fold_index,

                            "rows":
                                int(
                                    len(
                                        validation_index
                                    )
                                ),

                            "metrics":
                                metrics,
                        }
                    )

                    print(
                        f"  Fold {fold_index}: "
                        f"acc={metrics['accuracy']:.4f} "
                        f"macroF1={metrics['macro_f1']:.4f}"
                    )

                if (
                    np.any(
                        pd.isna(
                            oof_predictions
                        )
                    )
                ):
                    raise RuntimeError(
                        "OOF incompleto."
                    )

                # Reconstruímos um objeto leve somente
                # para a ordem de classes esperada.
                class DummyModel:
                    pass

                dummy = DummyModel()
                dummy.classes_ = np.array(
                    classes_reference
                )

                oof_metrics = (
                    calculate_metrics(
                        dummy,
                        y_real,
                        oof_predictions.astype(
                            str
                        ),
                        oof_probabilities,
                    )
                )

                high_confidence = (
                    choose_high_confidence_threshold(
                        y_real,
                        oof_predictions.astype(
                            str
                        ),
                        oof_confidence,
                    )
                )

                worst_fold_macro_f1 = min(
                    float(
                        item[
                            "metrics"
                        ][
                            "macro_f1"
                        ]
                    )
                    for item
                    in fold_metrics
                )

                mean_fold_macro_f1 = float(
                    np.mean(
                        [
                            item[
                                "metrics"
                            ][
                                "macro_f1"
                            ]
                            for item
                            in fold_metrics
                        ]
                    )
                )

                candidate = {
                    "name":
                        candidate_name,

                    "algorithm":
                        algorithm,

                    "real_weight":
                        real_weight,

                    "class_weight":
                        class_weight_name,

                    "oof_metrics":
                        oof_metrics,

                    "mean_fold_macro_f1":
                        rounded(
                            mean_fold_macro_f1
                        ),

                    "worst_fold_macro_f1":
                        rounded(
                            worst_fold_macro_f1
                        ),

                    "high_confidence":
                        high_confidence,

                    "folds":
                        fold_metrics,
                }

                candidates.append(
                    candidate
                )

                candidate_oof[
                    candidate_name
                ] = {
                    "predictions":
                        oof_predictions.astype(
                            str
                        ),

                    "probabilities":
                        oof_probabilities,

                    "confidence":
                        oof_confidence,

                    "classes":
                        classes_reference,
                }

                print(
                    "  OOF:"
                )

                print(
                    "    Accuracy:  "
                    f"{oof_metrics['accuracy']:.4f}"
                )

                print(
                    "    Macro F1:  "
                    f"{oof_metrics['macro_f1']:.4f}"
                )

                print(
                    "    Worst F1:  "
                    f"{worst_fold_macro_f1:.4f}"
                )

                print(
                    "    MANUT P/R: "
                    f"{oof_metrics['per_class']['MANUTENCAO']['precision']:.4f}"
                    "/"
                    f"{oof_metrics['per_class']['MANUTENCAO']['recall']:.4f}"
                )

                print(
                    "    OPER P/R:  "
                    f"{oof_metrics['per_class']['OPERACAO']['precision']:.4f}"
                    "/"
                    f"{oof_metrics['per_class']['OPERACAO']['recall']:.4f}"
                )

                print(
                    "    Brier:     "
                    f"{oof_metrics['brier_score']:.4f}"
                )

    # --------------------------------------------------------
    # SELEÇÃO
    # --------------------------------------------------------

    selected = max(
        candidates,
        key=
            candidate_selection_key,
    )

    selected_name = (
        selected[
            "name"
        ]
    )

    selected_oof = (
        candidate_oof[
            selected_name
        ]
    )

    print()
    print(
        "=" * 78
    )
    print(
        "CANDIDATO V4 SELECIONADO"
    )
    print(
        "=" * 78
    )

    print(
        selected_name
    )

    selected_metrics = (
        selected[
            "oof_metrics"
        ]
    )

    print()
    print(
        f"OOF Accuracy:      "
        f"{selected_metrics['accuracy']:.4f}"
    )

    print(
        f"OOF Macro F1:      "
        f"{selected_metrics['macro_f1']:.4f}"
    )

    print(
        f"Worst-fold F1:     "
        f"{selected['worst_fold_macro_f1']:.4f}"
    )

    print(
        f"OOF ROC-AUC:       "
        f"{selected_metrics['roc_auc']:.4f}"
    )

    print(
        f"OOF Brier:         "
        f"{selected_metrics['brier_score']:.4f}"
    )

    print()

    print(
        "MANUTENCAO:"
    )

    print(
        "  Precision: "
        f"{selected_metrics['per_class']['MANUTENCAO']['precision']:.4f}"
    )

    print(
        "  Recall:    "
        f"{selected_metrics['per_class']['MANUTENCAO']['recall']:.4f}"
    )

    print(
        "  F1:        "
        f"{selected_metrics['per_class']['MANUTENCAO']['f1']:.4f}"
    )

    print()

    print(
        "OPERACAO:"
    )

    print(
        "  Precision: "
        f"{selected_metrics['per_class']['OPERACAO']['precision']:.4f}"
    )

    print(
        "  Recall:    "
        f"{selected_metrics['per_class']['OPERACAO']['recall']:.4f}"
    )

    print(
        "  F1:        "
        f"{selected_metrics['per_class']['OPERACAO']['f1']:.4f}"
    )

    # --------------------------------------------------------
    # OOF CSV
    # --------------------------------------------------------

    classes = (
        selected_oof[
            "classes"
        ]
    )

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

    oof_df = (
        real.copy()
    )

    oof_df[
        "model_prediction"
    ] = (
        selected_oof[
            "predictions"
        ]
    )

    oof_df[
        "model_confidence"
    ] = (
        selected_oof[
            "confidence"
        ]
    )

    oof_df[
        "prob_manutencao"
    ] = (
        selected_oof[
            "probabilities"
        ][
            :,
            maintenance_index,
        ]
    )

    oof_df[
        "prob_operacao"
    ] = (
        selected_oof[
            "probabilities"
        ][
            :,
            operation_index,
        ]
    )

    oof_df[
        "model_correct"
    ] = (
        oof_df[
            "label"
        ]
        ==
        oof_df[
            "model_prediction"
        ]
    )

    oof_df.to_csv(
        oof_path,
        index=False,
        encoding="utf-8-sig",
    )

    # --------------------------------------------------------
    # SELECTION CSV
    # --------------------------------------------------------

    selection_rows = []

    for candidate in candidates:

        metrics = (
            candidate[
                "oof_metrics"
            ]
        )

        high = (
            candidate[
                "high_confidence"
            ]
        )

        selection_rows.append(
            {
                "candidate":
                    candidate[
                        "name"
                    ],

                "algorithm":
                    candidate[
                        "algorithm"
                    ],

                "real_weight":
                    candidate[
                        "real_weight"
                    ],

                "class_weight":
                    candidate[
                        "class_weight"
                    ],

                "accuracy":
                    metrics[
                        "accuracy"
                    ],

                "macro_f1":
                    metrics[
                        "macro_f1"
                    ],

                "mean_fold_macro_f1":
                    candidate[
                        "mean_fold_macro_f1"
                    ],

                "worst_fold_macro_f1":
                    candidate[
                        "worst_fold_macro_f1"
                    ],

                "maintenance_precision":
                    metrics[
                        "per_class"
                    ][
                        "MANUTENCAO"
                    ][
                        "precision"
                    ],

                "maintenance_recall":
                    metrics[
                        "per_class"
                    ][
                        "MANUTENCAO"
                    ][
                        "recall"
                    ],

                "operation_precision":
                    metrics[
                        "per_class"
                    ][
                        "OPERACAO"
                    ][
                        "precision"
                    ],

                "operation_recall":
                    metrics[
                        "per_class"
                    ][
                        "OPERACAO"
                    ][
                        "recall"
                    ],

                "brier":
                    metrics[
                        "brier_score"
                    ],

                "high_enabled":
                    high[
                        "enabled"
                    ],

                "high_threshold":
                    high[
                        "threshold"
                    ],

                "high_coverage":
                    high[
                        "coverage"
                    ],

                "high_precision":
                    high[
                        "precision"
                    ],

                "selected":
                    candidate[
                        "name"
                    ]
                    ==
                    selected_name,
            }
        )

    (
        pd.DataFrame(
            selection_rows
        )
        .sort_values(
            [
                "selected",
                "macro_f1",
                "worst_fold_macro_f1",
            ],
            ascending=[
                False,
                False,
                False,
            ],
        )
        .to_csv(
            selection_path,
            index=False,
            encoding="utf-8-sig",
        )
    )

    # --------------------------------------------------------
    # FINAL FIT
    # --------------------------------------------------------

    final_train = (
        build_weighted_training(
            synthetic,
            real,
            int(
                selected[
                    "real_weight"
                ]
            ),
        )
    )

    final_model = build_model(
        str(
            selected[
                "algorithm"
            ]
        ),
        str(
            selected[
                "class_weight"
            ]
        ),
    )

    final_model.fit(
        final_train[
            "observation"
        ]
        .to_numpy(
            dtype=str,
        ),

        final_train[
            "label"
        ]
        .to_numpy(
            dtype=str,
        ),
    )

    high = (
        selected[
            "high_confidence"
        ]
    )

    artifact = {
        "model_version":
            MODEL_VERSION,

        "dataset_version":
            DATASET_VERSION,

        "purpose":
            "candidate_external_holdout_required",

        "algorithm":
            selected[
                "algorithm"
            ],

        "feature_set":
            "observation_word_1_3_char_3_5",

        "features": [
            "observation",
        ],

        "classes": [
            str(
                value
            )
            for value
            in final_model.classes_
        ],

        "model":
            final_model,

        "selected_real_weight":
            int(
                selected[
                    "real_weight"
                ]
            ),

        "selected_class_weight":
            selected[
                "class_weight"
            ],

        "confidence_type":
            "calibrated_probability",

        "high_confidence_enabled":
            bool(
                high[
                    "enabled"
                ]
            ),

        "high_confidence_threshold":
            float(
                high[
                    "threshold"
                ]
            ),

        "high_confidence_target_precision":
            TARGET_HIGH_CONFIDENCE_PRECISION,

        "validation_strategy":
            "5_fold_stratified_group_cv_real_oof",

        "random_seed":
            RANDOM_SEED,

        "warning":
            (
                "V1 e V2 reais foram usados "
                "no desenvolvimento/treino V4. "
                "É obrigatório testar em novo "
                "holdout externo."
            ),
    }

    joblib.dump(
        artifact,
        model_path,
    )

    # --------------------------------------------------------
    # METRICS JSON
    # --------------------------------------------------------

    metrics_payload = {
        "model_version":
            MODEL_VERSION,

        "dataset_version":
            DATASET_VERSION,

        "real_rows_raw":
            int(
                len(
                    real_raw
                )
            ),

        "real_rows_unique":
            int(
                len(
                    real
                )
            ),

        "real_conflict_rows":
            int(
                len(
                    conflicts
                )
            ),

        "real_duplicates_removed":
            int(
                real_duplicates
            ),

        "synthetic_rows_used":
            int(
                len(
                    synthetic
                )
            ),

        "synthetic_overlap_removed":
            int(
                synthetic_overlap_removed
            ),

        "candidate_count":
            int(
                len(
                    candidates
                )
            ),

        "selected_candidate":
            selected,

        "all_candidates":
            candidates,

        "final_training_rows_weighted":
            int(
                len(
                    final_train
                )
            ),

        "next_step":
            (
                "Extrair novo holdout real V3 "
                "sem qualquer evento utilizado "
                "em V1 ou V2 e avaliar antes "
                "da integração."
            ),
    }

    with metrics_path.open(
        "w",
        encoding="utf-8",
    ) as file:

        json.dump(
            metrics_payload,
            file,
            ensure_ascii=False,
            indent=2,
        )

    print()
    print(
        "ALTA CONFIANÇA OOF:"
    )

    print(
        "  Enabled:   "
        f"{high['enabled']}"
    )

    print(
        "  Threshold: "
        f"{high['threshold']}"
    )

    print(
        "  Coverage:  "
        f"{high['coverage']}"
    )

    print(
        "  Precision: "
        f"{high['precision']}"
    )

    print()
    print(
        "ARTEFATOS:"
    )

    print(
        f"  Modelo:    {model_path}"
    )

    print(
        f"  Métricas:  {metrics_path}"
    )

    print(
        f"  Seleção:   {selection_path}"
    )

    print(
        f"  OOF:       {oof_path}"
    )

    print(
        f"  Conflitos: {conflict_path}"
    )

    print()
    print(
        "IMPORTANTE:"
    )

    print(
        "Este V4 ainda é candidato."
    )

    print(
        "Não integre no FastAPI antes "
        "de validar em novo holdout externo."
    )

    print(
        "=" * 78
    )


if __name__ == "__main__":
    main()
