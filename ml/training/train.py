from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path

import joblib
import pandas as pd

from sklearn.feature_extraction.text import (
    TfidfVectorizer,
)

from sklearn.linear_model import (
    LogisticRegression,
)

from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
)

from sklearn.model_selection import (
    StratifiedGroupKFold,
)

from sklearn.pipeline import (
    FeatureUnion,
    Pipeline,
)


# ============================================================
# PATHS
# ============================================================

CURRENT_FILE = Path(
    __file__
).resolve()

ML_DIR = CURRENT_FILE.parents[1]

DATA_DIR = (
    ML_DIR
    / "data"
)

MODELS_DIR = (
    ML_DIR
    / "models"
)

DATASET_PATH = (
    DATA_DIR
    / "synthetic_training.csv"
)

MODEL_PATH = (
    MODELS_DIR
    / "failure_classifier_v0.joblib"
)

METRICS_PATH = (
    MODELS_DIR
    / "failure_classifier_v0_metrics.json"
)

PREDICTIONS_PATH = (
    DATA_DIR
    / "synthetic_holdout_predictions.csv"
)


# ============================================================
# CONFIGURAÇÃO
# ============================================================

RANDOM_STATE = 42

N_SPLITS = 5


# ============================================================
# LABELS DO FRONT-END
# ============================================================

FAILURE_MODE_LABELS = {
    "SENSOR":
        "Falha de sensor",

    "ROLAMENTO":
        "Falha de rolamento",

    "BOMBA":
        "Falha de bomba",

    "CORREIA":
        "Falha de correia",

    "CORRENTE":
        "Falha de corrente",

    "VALVULA":
        "Falha de válvula",

    "MOTOR":
        "Falha de motor",

    "INVERSOR":
        "Falha de inversor",

    "REDUTOR":
        "Falha de redutor",

    "ENGRENAGEM":
        "Falha de engrenagem",

    "ACOPLAMENTO":
        "Falha de acoplamento",

    "CILINDRO":
        "Falha de cilindro",

    "ATUADOR":
        "Falha de atuador",

    "REJEITOR":
        "Falha de rejeitor",

    "SERVO":
        "Falha de servo",

    "CLP":
        "Falha de CLP",

    "IHM":
        "Falha de IHM",

    "CABO":
        "Falha de cabo",

    "MANGUEIRA":
        "Falha de mangueira",

    "BOCAL":
        "Falha de bocal",

    "GARRA":
        "Falha de garra",

    "ESTRELA":
        "Falha de estrela",

    "TRANSPORTADOR":
        "Falha de transportador",

    "DOSADOR":
        "Falha de dosador",

    "ALIMENTADOR":
        "Falha de alimentador",
}


# ============================================================
# DATASET
# ============================================================

def load_dataset() -> pd.DataFrame:
    if not DATASET_PATH.exists():
        raise FileNotFoundError(
            "Dataset não encontrado: "
            f"{DATASET_PATH}"
        )

    dataframe = pd.read_csv(
        DATASET_PATH,
        encoding="utf-8-sig",
    )

    required_columns = {
        "observation",
        "text",
        "failed_component_code",
        "failure_mode",
    }

    missing_columns = (
        required_columns
        - set(
            dataframe.columns
        )
    )

    if missing_columns:
        raise RuntimeError(
            "Dataset não contém as "
            "colunas necessárias: "
            + ", ".join(
                sorted(
                    missing_columns
                )
            )
        )

    dataframe = (
        dataframe
        .dropna(
            subset=[
                "text",
                "failed_component_code",
            ]
        )
        .copy()
    )

    dataframe["text"] = (
        dataframe["text"]
        .astype(str)
        .str.strip()
    )

    dataframe[
        "failed_component_code"
    ] = (
        dataframe[
            "failed_component_code"
        ]
        .astype(str)
        .str.strip()
    )

    dataframe[
        "observation_group"
    ] = (
        dataframe[
            "observation"
        ]
        .fillna("")
        .astype(str)
        .str.lower()
        .str.strip()
        .str.replace(
            r"\s+",
            " ",
            regex=True,
        )
    )

    dataframe = (
        dataframe[
            dataframe["text"]
            != ""
        ]
        .copy()
    )

    return dataframe


# ============================================================
# PIPELINE
#
# Palavra:
# "bomba carbonato"
#
# Caracteres:
# ajuda em:
#
# bomba / bba
# garrafa / gfa
# transportador / transp
# ============================================================

def build_pipeline() -> Pipeline:

    features = FeatureUnion(
        [
            (
                "word_tfidf",

                TfidfVectorizer(
                    analyzer="word",

                    ngram_range=(
                        1,
                        2,
                    ),

                    min_df=2,

                    max_df=0.98,

                    sublinear_tf=True,

                    strip_accents=
                        "unicode",
                ),
            ),

            (
                "char_tfidf",

                TfidfVectorizer(
                    analyzer=
                        "char_wb",

                    ngram_range=(
                        3,
                        5,
                    ),

                    min_df=2,

                    sublinear_tf=True,

                    strip_accents=
                        "unicode",
                ),
            ),
        ]
    )

    classifier = (
        LogisticRegression(
            max_iter=2500,

            C=4.0,

            class_weight=
                "balanced",

            random_state=
                RANDOM_STATE,
        )
    )

    return Pipeline(
        [
            (
                "features",
                features,
            ),

            (
                "classifier",
                classifier,
            ),
        ]
    )


# ============================================================
# SPLIT SEM VAZAMENTO
#
# Não queremos:
#
# TREINO:
# "sensor nao detecta garrafa"
#
# TESTE:
# "sensor nao detecta garrafa"
#
# mesmo que tenham equipamentos/contextos diferentes.
#
# Por isso agrupamos pela observação.
# ============================================================

def create_holdout_split(
    dataframe: pd.DataFrame,
):
    X = dataframe[
        "text"
    ]

    y = dataframe[
        "failed_component_code"
    ]

    groups = dataframe[
        "observation_group"
    ]

    splitter = (
        StratifiedGroupKFold(
            n_splits=
                N_SPLITS,

            shuffle=True,

            random_state=
                RANDOM_STATE,
        )
    )

    train_indexes, test_indexes = (
        next(
            splitter.split(
                X,
                y,
                groups,
            )
        )
    )

    train_df = (
        dataframe
        .iloc[
            train_indexes
        ]
        .copy()
    )

    test_df = (
        dataframe
        .iloc[
            test_indexes
        ]
        .copy()
    )

    return (
        train_df,
        test_df,
    )


# ============================================================
# TOP ERROS
# ============================================================

def print_errors(
    test_df: pd.DataFrame,
) -> None:

    errors = (
        test_df[
            test_df[
                "failed_component_code"
            ]
            !=
            test_df[
                "predicted_component_code"
            ]
        ]
        .copy()
    )

    print()

    print(
        "=" * 78
    )

    print(
        "EXEMPLOS DE ERROS DO MODELO"
    )

    print(
        "=" * 78
    )

    if errors.empty:
        print(
            "Nenhum erro neste holdout sintético."
        )

        return

    columns = [
        "observation",
        "failure_mode",
        "predicted_failure_mode",
        "confidence",
    ]

    print(
        errors[
            columns
        ]
        .head(20)
        .to_string(
            index=False,
        )
    )


# ============================================================
# MAIN
# ============================================================

def main() -> None:

    print()

    print(
        "=" * 78
    )

    print(
        "EASY MAINTENANCE - TREINAMENTO DO MODELO ML v0"
    )

    print(
        "=" * 78
    )

    # ========================================================
    # DATASET
    # ========================================================

    dataframe = (
        load_dataset()
    )

    print(
        f"Dataset: "
        f"{DATASET_PATH}"
    )

    print(
        f"Registros: "
        f"{len(dataframe)}"
    )

    print(
        f"Classes: "
        f"{dataframe['failed_component_code'].nunique()}"
    )

    print()

    # ========================================================
    # SPLIT
    # ========================================================

    (
        train_df,
        test_df,
    ) = (
        create_holdout_split(
            dataframe
        )
    )

    print(
        f"Treino: "
        f"{len(train_df)}"
    )

    print(
        f"Holdout: "
        f"{len(test_df)}"
    )

    print()

    train_groups = set(
        train_df[
            "observation_group"
        ]
    )

    test_groups = set(
        test_df[
            "observation_group"
        ]
    )

    leakage = (
        train_groups
        .intersection(
            test_groups
        )
    )

    print(
        "Observações repetidas "
        "entre treino e teste: "
        f"{len(leakage)}"
    )

    if leakage:
        raise RuntimeError(
            "Foi detectado vazamento "
            "entre treino e teste."
        )

    # ========================================================
    # TREINO DE AVALIAÇÃO
    # ========================================================

    print()

    print(
        "Treinando modelo de avaliação..."
    )

    evaluation_model = (
        build_pipeline()
    )

    evaluation_model.fit(
        train_df["text"],

        train_df[
            "failed_component_code"
        ],
    )

    # ========================================================
    # PREDIÇÃO HOLDOUT
    # ========================================================

    predictions = (
        evaluation_model.predict(
            test_df["text"]
        )
    )

    probabilities = (
        evaluation_model
        .predict_proba(
            test_df["text"]
        )
    )

    confidence = (
        probabilities.max(
            axis=1
        )
    )

    test_df[
        "predicted_component_code"
    ] = predictions

    test_df[
        "confidence"
    ] = confidence

    test_df[
        "predicted_failure_mode"
    ] = [
        FAILURE_MODE_LABELS.get(
            prediction,
            prediction,
        )
        for prediction
        in predictions
    ]

    # ========================================================
    # MÉTRICAS
    # ========================================================

    y_true = (
        test_df[
            "failed_component_code"
        ]
    )

    y_pred = (
        test_df[
            "predicted_component_code"
        ]
    )

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
        )
    )

    weighted_f1 = (
        f1_score(
            y_true,
            y_pred,
            average="weighted",
        )
    )

    print()

    print(
        "=" * 78
    )

    print(
        "RESULTADOS NO HOLDOUT SINTÉTICO"
    )

    print(
        "=" * 78
    )

    print(
        f"Accuracy:     "
        f"{accuracy:.4f} "
        f"({accuracy * 100:.2f}%)"
    )

    print(
        f"Macro F1:     "
        f"{macro_f1:.4f}"
    )

    print(
        f"Weighted F1:  "
        f"{weighted_f1:.4f}"
    )

    print()

    print(
        "IMPORTANTE:"
    )

    print(
        "Essas métricas medem apenas "
        "generalização dentro do dataset "
        "sintético."
    )

    print(
        "Elas NÃO representam ainda a "
        "performance real na fábrica."
    )

    # ========================================================
    # CLASSIFICATION REPORT
    # ========================================================

    print()

    print(
        classification_report(
            y_true,
            y_pred,
            zero_division=0,
        )
    )

    # ========================================================
    # CONFUSION MATRIX
    # ========================================================

    labels = sorted(
        dataframe[
            "failed_component_code"
        ]
        .unique()
        .tolist()
    )

    matrix = (
        confusion_matrix(
            y_true,
            y_pred,
            labels=labels,
        )
    )

    confusion_dataframe = (
        pd.DataFrame(
            matrix,
            index=labels,
            columns=labels,
        )
    )

    print()

    print(
        "=" * 78
    )

    print(
        "MATRIZ DE CONFUSÃO"
    )

    print(
        "=" * 78
    )

    print(
        confusion_dataframe
        .to_string()
    )

    # ========================================================
    # ERROS
    # ========================================================

    print_errors(
        test_df
    )

    # ========================================================
    # SALVA HOLDOUT
    # ========================================================

    test_df.to_csv(
        PREDICTIONS_PATH,
        index=False,
        encoding="utf-8-sig",
    )

    # ========================================================
    # TREINO FINAL
    #
    # Depois da avaliação, treinamos novamente usando
    # todo o dataset sintético.
    # ========================================================

    print()

    print(
        "=" * 78
    )

    print(
        "TREINANDO MODELO FINAL v0"
    )

    print(
        "=" * 78
    )

    final_model = (
        build_pipeline()
    )

    final_model.fit(
        dataframe["text"],

        dataframe[
            "failed_component_code"
        ],
    )

    # ========================================================
    # METADADOS
    # ========================================================

    model_package = {
        "version":
            "failure-classifier-v0",

        "created_at":
            datetime.now()
            .isoformat(),

        "target":
            "failed_component_code",

        "failure_mode_labels":
            FAILURE_MODE_LABELS,

        "classes":
            list(
                final_model
                .named_steps[
                    "classifier"
                ]
                .classes_
            ),

        "training_rows":
            len(
                dataframe
            ),

        "training_source":
            "SYNTHETIC_TEMPLATE",

        "model":
            final_model,
    }

    MODELS_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    joblib.dump(
        model_package,
        MODEL_PATH,
    )

    # ========================================================
    # MÉTRICAS JSON
    # ========================================================

    metrics = {
        "version":
            "failure-classifier-v0",

        "dataset":
            str(
                DATASET_PATH
            ),

        "training_rows":
            len(
                dataframe
            ),

        "holdout_rows":
            len(
                test_df
            ),

        "number_of_classes":
            int(
                dataframe[
                    "failed_component_code"
                ]
                .nunique()
            ),

        "accuracy":
            float(
                accuracy
            ),

        "macro_f1":
            float(
                macro_f1
            ),

        "weighted_f1":
            float(
                weighted_f1
            ),

        "evaluation_scope":
            "synthetic_holdout",

        "real_world_validated":
            False,
    }

    with METRICS_PATH.open(
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
    # FINAL
    # ========================================================

    print()

    print(
        "=" * 78
    )

    print(
        "MODELO ML v0 GERADO"
    )

    print(
        "=" * 78
    )

    print(
        f"Modelo:"
    )

    print(
        MODEL_PATH
    )

    print()

    print(
        "Métricas:"
    )

    print(
        METRICS_PATH
    )

    print()

    print(
        "Predições do holdout:"
    )

    print(
        PREDICTIONS_PATH
    )

    print()

    print(
        "Status: ainda NÃO validado "
        "com dados reais."
    )

    print(
        "=" * 78
    )


if __name__ == "__main__":
    main()