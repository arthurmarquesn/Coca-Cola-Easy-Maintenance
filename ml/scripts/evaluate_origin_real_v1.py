from __future__ import annotations

import argparse
import json
import math
import unicodedata
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

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


# ============================================================
# CONFIGURAÇÃO
# ============================================================

DEFAULT_DATASET = (
    "ml/data/origin/real/"
    "origin_real_validation_v1.csv"
)

DEFAULT_MODEL = (
    "ml/models/"
    "failure_origin_classifier_v2_eval.joblib"
)

DEFAULT_PREDICTIONS_OUTPUT = (
    "ml/data/origin/real/"
    "origin_real_predictions_v1.csv"
)

DEFAULT_METRICS_OUTPUT = (
    "ml/reports/"
    "origin_real_validation_v1_metrics.json"
)

VALID_LABELS = {
    "MANUTENCAO",
    "OPERACAO",
}

INCONCLUSIVE_LABEL = (
    "INCONCLUSIVO"
)

THRESHOLDS = (
    0.75,
    0.80,
    0.85,
    0.90,
    0.95,
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
        and
        math.isnan(
            value,
        )
    ):
        return ""

    return str(
        value,
    ).strip()


def normalize_label(
    value: object,
) -> str:

    text = clean_string(
        value,
    )

    text = (
        unicodedata.normalize(
            "NFKD",
            text,
        )
    )

    text = "".join(
        character
        for character
        in text
        if not unicodedata.combining(
            character
        )
    )

    text = (
        text
        .upper()
        .strip()
    )

    aliases = {
        "MANUTENÇÃO":
            "MANUTENCAO",

        "MANUTENCAO":
            "MANUTENCAO",

        "OPERAÇÃO":
            "OPERACAO",

        "OPERACAO":
            "OPERACAO",

        "INCONCLUSIVO":
            "INCONCLUSIVO",

        "INDETERMINADO":
            "INCONCLUSIVO",

        "INDEFINIDO":
            "INCONCLUSIVO",
    }

    return aliases.get(
        text,
        text,
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
# CARREGAR MODELO
# ============================================================

def load_model(
    path: Path,
):

    artifact = (
        joblib.load(
            path,
        )
    )

    if not isinstance(
        artifact,
        dict,
    ):
        raise RuntimeError(
            "Era esperado um pacote dict "
            "no arquivo joblib."
        )

    model = (
        artifact.get(
            "model"
        )
    )

    if model is None:
        raise RuntimeError(
            "O artefato não contém 'model'."
        )

    if not hasattr(
        model,
        "predict",
    ):
        raise RuntimeError(
            "Modelo sem predict()."
        )

    if not hasattr(
        model,
        "predict_proba",
    ):
        raise RuntimeError(
            "Modelo sem predict_proba()."
        )

    classes = [
        str(
            value
        )
        for value
        in model.classes_
    ]

    if set(
        classes
    ) != VALID_LABELS:
        raise RuntimeError(
            "Classes inesperadas: "
            f"{classes}"
        )

    return (
        artifact,
        model,
        classes,
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
            "CSV sem as colunas necessárias: "
            f"{sorted(missing)}"
        )

    df[
        "observation"
    ] = (
        df[
            "observation"
        ]
        .fillna("")
        .map(
            clean_string,
        )
    )

    df[
        "human_origin"
    ] = (
        df[
            "human_origin"
        ]
        .map(
            normalize_label,
        )
    )

    df = df[
        df[
            "observation"
        ]
        !=
        ""
    ].copy()

    allowed = (
        VALID_LABELS
        |
        {
            INCONCLUSIVE_LABEL,
            "",
        }
    )

    invalid = sorted(
        set(
            df[
                "human_origin"
            ].unique()
        )
        -
        allowed
    )

    if invalid:
        raise ValueError(
            "Labels inválidos encontrados: "
            f"{invalid}"
        )

    return df


# ============================================================
# THRESHOLD
# ============================================================

def evaluate_threshold(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    confidence: np.ndarray,
    threshold: float,
) -> dict[str, Any]:

    mask = (
        confidence
        >=
        threshold
    )

    selected = int(
        mask.sum()
    )

    total = int(
        len(
            y_true
        )
    )

    if selected == 0:

        precision = None

    else:

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

    return {
        "threshold":
            threshold,

        "selected":
            selected,

        "total":
            total,

        "coverage":
            rounded(
                selected
                /
                total
                if total > 0
                else 0.0
            ),

        "precision":
            (
                rounded(
                    precision,
                )
                if precision
                is not None
                else None
            ),
    }


# ============================================================
# MAIN
# ============================================================

def main() -> None:

    parser = (
        argparse.ArgumentParser(
            description=(
                "Avalia o classificador de origem "
                "em apontamentos reais."
            )
        )
    )

    parser.add_argument(
        "--dataset",
        default=
            DEFAULT_DATASET,
    )

    parser.add_argument(
        "--model",
        default=
            DEFAULT_MODEL,
    )

    parser.add_argument(
        "--predictions-output",
        default=
            DEFAULT_PREDICTIONS_OUTPUT,
    )

    parser.add_argument(
        "--metrics-output",
        default=
            DEFAULT_METRICS_OUTPUT,
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
            args.model
        )
        .resolve()
    )

    prediction_path = (
        Path(
            args.predictions_output
        )
        .resolve()
    )

    metrics_path = (
        Path(
            args.metrics_output
        )
        .resolve()
    )

    prediction_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    metrics_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    if not dataset_path.exists():
        raise FileNotFoundError(
            dataset_path
        )

    if not model_path.exists():
        raise FileNotFoundError(
            model_path
        )

    (
        artifact,
        model,
        classes,
    ) = load_model(
        model_path,
    )

    df = load_dataset(
        dataset_path,
    )

    # ========================================================
    # ROTULAGEM
    # ========================================================

    labeled = df[
        df[
            "human_origin"
        ].isin(
            VALID_LABELS
        )
    ].copy()

    inconclusive = df[
        df[
            "human_origin"
        ]
        ==
        INCONCLUSIVE_LABEL
    ].copy()

    unlabeled = df[
        df[
            "human_origin"
        ]
        ==
        ""
    ].copy()

    print(
        "=" * 78
    )

    print(
        "EASY MAINTENANCE - VALIDAÇÃO REAL DE ORIGEM"
    )

    print(
        "=" * 78
    )

    print()

    print(
        f"Total no arquivo:      {len(df)}"
    )

    print(
        f"Rotulados conclusivos: {len(labeled)}"
    )

    print(
        f"Inconclusivos:         {len(inconclusive)}"
    )

    print(
        f"Sem rótulo:            {len(unlabeled)}"
    )

    if len(
        labeled
    ) < 50:

        raise RuntimeError(
            "Poucos registros conclusivos. "
            "Rotule pelo menos 50 antes "
            "de avaliar."
        )

    print()

    print(
        "DISTRIBUIÇÃO DO GABARITO:"
    )

    print(
        labeled[
            "human_origin"
        ]
        .value_counts()
        .to_string()
    )

    # ========================================================
    # PREDIZER TODOS
    # ========================================================

    texts = (
        df[
            "observation"
        ]
        .to_numpy(
            dtype=str,
        )
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

    confidence = (
        probabilities.max(
            axis=1,
        )
    )

    class_indexes = {
        class_name:
            index

        for (
            index,
            class_name,
        ) in enumerate(
            classes
        )
    }

    df[
        "model_prediction"
    ] = predictions

    df[
        "model_confidence"
    ] = confidence

    df[
        "prob_manutencao"
    ] = (
        probabilities[
            :,
            class_indexes[
                "MANUTENCAO"
            ]
        ]
    )

    df[
        "prob_operacao"
    ] = (
        probabilities[
            :,
            class_indexes[
                "OPERACAO"
            ]
        ]
    )

    df[
        "model_correct"
    ] = np.where(
        df[
            "human_origin"
        ].isin(
            VALID_LABELS
        ),

        (
            df[
                "human_origin"
            ]
            ==
            df[
                "model_prediction"
            ]
        ),

        pd.NA,
    )

    df.to_csv(
        prediction_path,

        index=False,

        encoding=
            "utf-8-sig",
    )

    # ========================================================
    # SOMENTE CASOS CONCLUSIVOS
    # ========================================================

    conclusive_mask = (
        df[
            "human_origin"
        ].isin(
            VALID_LABELS
        )
        .to_numpy()
    )

    y_true = (
        df.loc[
            conclusive_mask,
            "human_origin",
        ]
        .to_numpy(
            dtype=str,
        )
    )

    y_pred = (
        predictions[
            conclusive_mask
        ]
    )

    y_probability = (
        probabilities[
            conclusive_mask
        ]
    )

    y_confidence = (
        confidence[
            conclusive_mask
        ]
    )

    # ========================================================
    # MÉTRICAS
    # ========================================================

    accuracy = (
        accuracy_score(
            y_true,
            y_pred,
        )
    )

    macro_f1 = (
        f1_score(
            y_true,
            y_pred,

            average="macro",

            zero_division=0,
        )
    )

    weighted_f1 = (
        f1_score(
            y_true,
            y_pred,

            average="weighted",

            zero_division=0,
        )
    )

    (
        precisions,
        recalls,
        f1_values,
        supports,
    ) = (
        precision_recall_fscore_support(
            y_true,
            y_pred,

            labels=[
                "MANUTENCAO",
                "OPERACAO",
            ],

            zero_division=0,
        )
    )

    operation_index = (
        class_indexes[
            "OPERACAO"
        ]
    )

    y_operation = (
        y_true
        ==
        "OPERACAO"
    ).astype(
        int
    )

    probability_operation = (
        y_probability[
            :,
            operation_index
        ]
    )

    roc_auc = (
        roc_auc_score(
            y_operation,
            probability_operation,
        )
    )

    brier = (
        brier_score_loss(
            y_operation,
            probability_operation,
        )
    )

    loss = (
        log_loss(
            y_true,
            y_probability,

            labels=classes,
        )
    )

    matrix = (
        confusion_matrix(
            y_true,
            y_pred,

            labels=[
                "MANUTENCAO",
                "OPERACAO",
            ],
        )
    )

    # ========================================================
    # THRESHOLDS
    # ========================================================

    threshold_results = {
        str(
            threshold
        ):
            evaluate_threshold(
                y_true,
                y_pred,
                y_confidence,
                threshold,
            )

        for threshold
        in THRESHOLDS
    }

    # ========================================================
    # INCONCLUSIVOS
    # ========================================================

    inconclusive_stats: dict[
        str,
        Any,
    ] = {
        "count":
            0,
    }

    if not inconclusive.empty:

        inconclusive_mask = (
            df[
                "human_origin"
            ]
            ==
            INCONCLUSIVE_LABEL
        ).to_numpy()

        inc_confidence = (
            confidence[
                inconclusive_mask
            ]
        )

        inconclusive_stats = {
            "count":
                int(
                    len(
                        inc_confidence
                    )
                ),

            "mean_confidence":
                rounded(
                    np.mean(
                        inc_confidence
                    )
                ),

            "high_075":
                int(
                    (
                        inc_confidence
                        >=
                        0.75
                    ).sum()
                ),

            "high_085":
                int(
                    (
                        inc_confidence
                        >=
                        0.85
                    ).sum()
                ),

            "high_090":
                int(
                    (
                        inc_confidence
                        >=
                        0.90
                    ).sum()
                ),
        }

    # ========================================================
    # RESULTADO
    # ========================================================

    per_class = {
        "MANUTENCAO": {
            "precision":
                rounded(
                    precisions[
                        0
                    ]
                ),

            "recall":
                rounded(
                    recalls[
                        0
                    ]
                ),

            "f1":
                rounded(
                    f1_values[
                        0
                    ]
                ),

            "support":
                int(
                    supports[
                        0
                    ]
                ),
        },

        "OPERACAO": {
            "precision":
                rounded(
                    precisions[
                        1
                    ]
                ),

            "recall":
                rounded(
                    recalls[
                        1
                    ]
                ),

            "f1":
                rounded(
                    f1_values[
                        1
                    ]
                ),

            "support":
                int(
                    supports[
                        1
                    ]
                ),
        },
    }

    metrics = {
        "model_version":
            artifact.get(
                "model_version"
            ),

        "dataset":
            str(
                dataset_path
            ),

        "rows": {
            "total":
                int(
                    len(
                        df
                    )
                ),

            "conclusive":
                int(
                    len(
                        labeled
                    )
                ),

            "inconclusive":
                int(
                    len(
                        inconclusive
                    )
                ),

            "unlabeled":
                int(
                    len(
                        unlabeled
                    )
                ),
        },

        "accuracy":
            rounded(
                accuracy
            ),

        "macro_f1":
            rounded(
                macro_f1
            ),

        "weighted_f1":
            rounded(
                weighted_f1
            ),

        "roc_auc":
            rounded(
                roc_auc
            ),

        "brier_score":
            rounded(
                brier
            ),

        "log_loss":
            rounded(
                loss
            ),

        "per_class":
            per_class,

        "confusion_matrix": {
            "labels": [
                "MANUTENCAO",
                "OPERACAO",
            ],

            "matrix":
                matrix.tolist(),
        },

        "thresholds":
            threshold_results,

        "inconclusive":
            inconclusive_stats,

        "classification_report":
            classification_report(
                y_true,
                y_pred,

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
        "=" * 78
    )

    print(
        "RESULTADO REAL"
    )

    print(
        "=" * 78
    )

    print()

    print(
        f"Accuracy:     {accuracy:.4f}"
    )

    print(
        f"Macro F1:     {macro_f1:.4f}"
    )

    print(
        f"Weighted F1:  {weighted_f1:.4f}"
    )

    print(
        f"ROC-AUC:      {roc_auc:.4f}"
    )

    print(
        f"Brier score:  {brier:.4f}"
    )

    print(
        f"Log loss:     {loss:.4f}"
    )

    print()

    print(
        "POR CLASSE:"
    )

    for label in (
        "MANUTENCAO",
        "OPERACAO",
    ):

        values = (
            per_class[
                label
            ]
        )

        print()

        print(
            f"  {label}"
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

        print(
            "    Support:   "
            f"{values['support']}"
        )

    print()

    print(
        "MATRIZ DE CONFUSÃO:"
    )

    print(
        "                  PRED MANUT.  PRED OPER."
    )

    print(
        "  REAL MANUT.    "
        f"{matrix[0][0]:>10}  "
        f"{matrix[0][1]:>10}"
    )

    print(
        "  REAL OPER.     "
        f"{matrix[1][0]:>10}  "
        f"{matrix[1][1]:>10}"
    )

    print()

    print(
        "FAIXAS DE CONFIANÇA:"
    )

    for threshold in (
        THRESHOLDS
    ):

        result = (
            threshold_results[
                str(
                    threshold
                )
            ]
        )

        print(
            f"  >= {threshold:.2f} | "
            f"coverage={result['coverage']:.4f} | "
            f"precision={result['precision']}"
        )

    if (
        inconclusive_stats[
            "count"
        ]
        >
        0
    ):

        print()

        print(
            "INCONCLUSIVOS:"
        )

        print(
            "  Quantidade:        "
            f"{inconclusive_stats['count']}"
        )

        print(
            "  Confiança média:   "
            f"{inconclusive_stats['mean_confidence']:.4f}"
        )

        print(
            "  >= 0.75:           "
            f"{inconclusive_stats['high_075']}"
        )

        print(
            "  >= 0.85:           "
            f"{inconclusive_stats['high_085']}"
        )

        print(
            "  >= 0.90:           "
            f"{inconclusive_stats['high_090']}"
        )

    print()

    print(
        "Arquivos:"
    )

    print(
        f"  Predictions: {prediction_path}"
    )

    print(
        f"  Metrics:     {metrics_path}"
    )

    print(
        "=" * 78
    )


if __name__ == "__main__":
    main()