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


MODEL_VERSION = "failure_origin_classifier_v3_candidate"
DATASET_VERSION = "synthetic-origin-v2+real-bootstrap-v1"

DEFAULT_SYNTHETIC_DATASET = "ml/data/origin/synthetic_origin_v2.csv"
DEFAULT_REAL_DATASET = (
    "ml/data/origin/real/origin_real_validation_v1_revisado.csv"
)
DEFAULT_MODEL_OUTPUT = (
    "ml/models/failure_origin_classifier_v3_candidate.joblib"
)
DEFAULT_METRICS_OUTPUT = (
    "ml/reports/failure_origin_classifier_v3_metrics.json"
)
DEFAULT_SPLIT_OUTPUT = (
    "ml/data/origin/real/origin_real_split_v3.csv"
)
DEFAULT_VALIDATION_OUTPUT = (
    "ml/data/origin/real/origin_real_validation_predictions_v3.csv"
)
DEFAULT_SELECTION_OUTPUT = (
    "ml/reports/failure_origin_classifier_v3_selection.csv"
)

RANDOM_SEED = 42
REAL_WEIGHTS = (1, 3, 5)
REAL_VALIDATION_FOLDS = 5

HIGH_CONFIDENCE_TARGET_PRECISION = 0.95
MIN_HIGH_CONFIDENCE_ROWS = 20

VALID_LABELS = {"MANUTENCAO", "OPERACAO"}


def clean_string(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and math.isnan(value):
        return ""
    return str(value).strip()


def strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(
        ch
        for ch in normalized
        if not unicodedata.combining(ch)
    )


def normalize_label(value: object) -> str:
    return strip_accents(clean_string(value)).upper().strip()


def normalize_observation(value: object) -> str:
    text = strip_accents(clean_string(value)).lower()
    text = re.sub(r"[^\w\s]", " ", text, flags=re.UNICODE)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def rounded(value: float, digits: int = 6) -> float:
    return round(float(value), digits)


def load_synthetic(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, dtype=str)

    required = {"observation", "failure_origin"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(
            f"Dataset sintético sem colunas: {sorted(missing)}"
        )

    result = pd.DataFrame(
        {
            "event_id": "",
            "observation": df["observation"].fillna("").map(clean_string),
            "label": df["failure_origin"].map(normalize_label),
            "source": "SYNTHETIC",
        }
    )

    result["observation_norm"] = result["observation"].map(
        normalize_observation
    )

    return result[
        (result["observation_norm"] != "")
        & result["label"].isin(VALID_LABELS)
    ].copy()


def load_real(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, dtype=str)

    required = {"event_id", "observation", "human_origin"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(
            f"Dataset real sem colunas: {sorted(missing)}"
        )

    result = df.copy()
    result["event_id"] = result["event_id"].fillna("").map(clean_string)
    result["observation"] = (
        result["observation"].fillna("").map(clean_string)
    )
    result["label"] = result["human_origin"].map(normalize_label)
    result["source"] = "REAL"
    result["observation_norm"] = result["observation"].map(
        normalize_observation
    )

    invalid = sorted(set(result["label"].unique()) - VALID_LABELS)
    if invalid:
        raise ValueError(
            "O V3 exige somente MANUTENCAO/OPERACAO. "
            f"Encontrados: {invalid}"
        )

    return result[
        result["observation_norm"] != ""
    ].copy()


def remove_conflicts_and_duplicates(
    df: pd.DataFrame,
    dataset_name: str,
) -> tuple[pd.DataFrame, pd.DataFrame, int]:
    label_counts = df.groupby("observation_norm")["label"].nunique()
    conflict_groups = set(label_counts[label_counts > 1].index)

    conflicts = df[
        df["observation_norm"].isin(conflict_groups)
    ].copy()

    clean = df[
        ~df["observation_norm"].isin(conflict_groups)
    ].copy()

    before_dedup = len(clean)

    clean = (
        clean.sort_values(["observation_norm", "event_id"])
        .drop_duplicates(subset=["observation_norm"], keep="first")
        .reset_index(drop=True)
    )

    duplicates_removed = before_dedup - len(clean)

    print(
        f"{dataset_name}: {len(df)} brutas | "
        f"{len(conflicts)} conflitantes | "
        f"{duplicates_removed} duplicatas removidas | "
        f"{len(clean)} observações únicas"
    )

    return clean, conflicts, duplicates_removed


def split_real_dataset(
    real: pd.DataFrame,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    X = real["observation"].to_numpy(dtype=str)
    y = real["label"].to_numpy(dtype=str)
    groups = real["observation_norm"].to_numpy(dtype=str)

    splitter = StratifiedGroupKFold(
        n_splits=REAL_VALIDATION_FOLDS,
        shuffle=True,
        random_state=RANDOM_SEED,
    )

    train_idx, validation_idx = next(
        splitter.split(X, y, groups)
    )

    train = real.iloc[train_idx].copy().reset_index(drop=True)
    validation = (
        real.iloc[validation_idx].copy().reset_index(drop=True)
    )

    overlap = set(train["observation_norm"]) & set(
        validation["observation_norm"]
    )
    if overlap:
        raise RuntimeError(
            "Leakage entre REAL TRAIN e REAL VALIDATION."
        )

    if set(train["label"].unique()) != VALID_LABELS:
        raise RuntimeError("REAL TRAIN não contém as duas classes.")

    if set(validation["label"].unique()) != VALID_LABELS:
        raise RuntimeError(
            "REAL VALIDATION não contém as duas classes."
        )

    return train, validation


def build_vectorizer() -> FeatureUnion:
    return FeatureUnion(
        [
            (
                "word",
                TfidfVectorizer(
                    analyzer="word",
                    ngram_range=(1, 2),
                    min_df=2,
                    max_df=0.995,
                    max_features=60000,
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
                    max_features=90000,
                    lowercase=True,
                    strip_accents="unicode",
                    sublinear_tf=True,
                ),
            ),
        ]
    )


def build_base_pipeline() -> Pipeline:
    return Pipeline(
        [
            ("features", build_vectorizer()),
            (
                "classifier",
                LinearSVC(
                    C=1.2,
                    class_weight="balanced",
                    max_iter=15000,
                    random_state=RANDOM_SEED,
                ),
            ),
        ]
    )


def build_weighted_training(
    synthetic: pd.DataFrame,
    real: pd.DataFrame,
    real_weight: int,
) -> pd.DataFrame:
    if real_weight < 1:
        raise ValueError("real_weight precisa ser >= 1.")

    pieces = [synthetic.copy()]
    pieces.extend(real.copy() for _ in range(real_weight))
    return pd.concat(pieces, ignore_index=True)


def build_calibration_splits(
    train: pd.DataFrame,
) -> list[tuple[np.ndarray, np.ndarray]]:
    groups_per_class = (
        train.groupby("label")["observation_norm"].nunique()
    )
    n_splits = min(5, int(groups_per_class.min()))

    if n_splits < 3:
        raise RuntimeError(
            "Poucos grupos independentes para calibração."
        )

    X = train["observation"].to_numpy(dtype=str)
    y = train["label"].to_numpy(dtype=str)
    groups = train["observation_norm"].to_numpy(dtype=str)

    splitter = StratifiedGroupKFold(
        n_splits=n_splits,
        shuffle=True,
        random_state=RANDOM_SEED,
    )

    splits = list(splitter.split(X, y, groups))

    for train_idx, calibration_idx in splits:
        if set(groups[train_idx]) & set(groups[calibration_idx]):
            raise RuntimeError(
                "Leakage interno nos folds de calibração."
            )

    return splits


def build_calibrated_model(
    train: pd.DataFrame,
) -> CalibratedClassifierCV:
    base = build_base_pipeline()
    splits = build_calibration_splits(train)

    try:
        return CalibratedClassifierCV(
            estimator=base,
            method="sigmoid",
            cv=splits,
        )
    except TypeError:
        return CalibratedClassifierCV(
            base_estimator=base,
            method="sigmoid",
            cv=splits,
        )


def predict_dataset(
    model: CalibratedClassifierCV,
    df: pd.DataFrame,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    X = df["observation"].to_numpy(dtype=str)
    predictions = model.predict(X)
    probabilities = model.predict_proba(X)
    confidence = probabilities.max(axis=1)
    return predictions, probabilities, confidence


def calculate_metrics(
    model: CalibratedClassifierCV,
    y_true: np.ndarray,
    y_pred: np.ndarray,
    probabilities: np.ndarray,
) -> dict[str, Any]:
    labels = ["MANUTENCAO", "OPERACAO"]

    precision, recall, f1, support = (
        precision_recall_fscore_support(
            y_true,
            y_pred,
            labels=labels,
            zero_division=0,
        )
    )

    classes = [str(value) for value in model.classes_]
    operation_index = classes.index("OPERACAO")

    y_operation = (y_true == "OPERACAO").astype(int)
    operation_probability = probabilities[:, operation_index]

    matrix = confusion_matrix(
        y_true,
        y_pred,
        labels=labels,
    )

    return {
        "accuracy": rounded(accuracy_score(y_true, y_pred)),
        "macro_f1": rounded(
            f1_score(
                y_true,
                y_pred,
                average="macro",
                zero_division=0,
            )
        ),
        "weighted_f1": rounded(
            f1_score(
                y_true,
                y_pred,
                average="weighted",
                zero_division=0,
            )
        ),
        "roc_auc": rounded(
            roc_auc_score(
                y_operation,
                operation_probability,
            )
        ),
        "brier_score": rounded(
            brier_score_loss(
                y_operation,
                operation_probability,
            )
        ),
        "log_loss": rounded(
            log_loss(
                y_true,
                probabilities,
                labels=classes,
            )
        ),
        "per_class": {
            "MANUTENCAO": {
                "precision": rounded(precision[0]),
                "recall": rounded(recall[0]),
                "f1": rounded(f1[0]),
                "support": int(support[0]),
            },
            "OPERACAO": {
                "precision": rounded(precision[1]),
                "recall": rounded(recall[1]),
                "f1": rounded(f1[1]),
                "support": int(support[1]),
            },
        },
        "confusion_matrix": {
            "labels": labels,
            "matrix": matrix.tolist(),
        },
    }


def choose_high_confidence_threshold(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    confidence: np.ndarray,
) -> dict[str, Any]:
    curve: list[dict[str, Any]] = []

    for threshold in np.arange(0.50, 1.00, 0.01):
        threshold = float(round(threshold, 2))
        mask = confidence >= threshold
        selected = int(mask.sum())

        if selected < MIN_HIGH_CONFIDENCE_ROWS:
            continue

        precision = float(
            accuracy_score(
                y_true[mask],
                y_pred[mask],
            )
        )

        curve.append(
            {
                "threshold": threshold,
                "selected": selected,
                "coverage": rounded(selected / len(y_true)),
                "precision": rounded(precision),
            }
        )

    accepted = [
        row
        for row in curve
        if row["precision"]
        >= HIGH_CONFIDENCE_TARGET_PRECISION
    ]

    if not accepted:
        return {
            "enabled": False,
            "threshold": 1.01,
            "target_precision":
                HIGH_CONFIDENCE_TARGET_PRECISION,
            "minimum_rows": MIN_HIGH_CONFIDENCE_ROWS,
            "selected": 0,
            "coverage": 0.0,
            "precision": None,
            "curve": curve,
        }

    best = max(
        accepted,
        key=lambda row: (
            row["coverage"],
            row["precision"],
        ),
    )

    return {
        "enabled": True,
        "threshold": best["threshold"],
        "target_precision":
            HIGH_CONFIDENCE_TARGET_PRECISION,
        "minimum_rows": MIN_HIGH_CONFIDENCE_ROWS,
        "selected": best["selected"],
        "coverage": best["coverage"],
        "precision": best["precision"],
        "curve": curve,
    }


def selection_key(
    metrics: dict[str, Any],
) -> tuple[float, float, float, float, float]:
    man = metrics["per_class"]["MANUTENCAO"]
    op = metrics["per_class"]["OPERACAO"]

    return (
        float(metrics["macro_f1"]),
        min(float(man["f1"]), float(op["f1"])),
        min(
            float(man["precision"]),
            float(op["precision"]),
        ),
        float(metrics["accuracy"]),
        -float(metrics["brier_score"]),
    )


def build_prediction_dataframe(
    validation: pd.DataFrame,
    model: CalibratedClassifierCV,
    predictions: np.ndarray,
    probabilities: np.ndarray,
    confidence: np.ndarray,
    threshold_info: dict[str, Any],
) -> pd.DataFrame:
    result = validation.copy()

    classes = [str(value) for value in model.classes_]
    man_idx = classes.index("MANUTENCAO")
    op_idx = classes.index("OPERACAO")

    result["model_prediction"] = predictions
    result["model_confidence"] = confidence
    result["prob_manutencao"] = probabilities[:, man_idx]
    result["prob_operacao"] = probabilities[:, op_idx]
    result["correct"] = (
        result["label"].to_numpy(dtype=str)
        == predictions
    )

    threshold = float(threshold_info["threshold"])
    result["high_confidence"] = confidence >= threshold

    return result


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Treina o classificador de origem V3 "
            "com sintético + bootstrap real."
        )
    )

    parser.add_argument(
        "--synthetic",
        default=DEFAULT_SYNTHETIC_DATASET,
    )
    parser.add_argument(
        "--real",
        default=DEFAULT_REAL_DATASET,
    )
    parser.add_argument(
        "--model-output",
        default=DEFAULT_MODEL_OUTPUT,
    )
    parser.add_argument(
        "--metrics-output",
        default=DEFAULT_METRICS_OUTPUT,
    )
    parser.add_argument(
        "--split-output",
        default=DEFAULT_SPLIT_OUTPUT,
    )
    parser.add_argument(
        "--validation-output",
        default=DEFAULT_VALIDATION_OUTPUT,
    )
    parser.add_argument(
        "--selection-output",
        default=DEFAULT_SELECTION_OUTPUT,
    )

    args = parser.parse_args()

    synthetic_path = Path(args.synthetic).resolve()
    real_path = Path(args.real).resolve()
    model_path = Path(args.model_output).resolve()
    metrics_path = Path(args.metrics_output).resolve()
    split_path = Path(args.split_output).resolve()
    validation_path = Path(args.validation_output).resolve()
    selection_path = Path(args.selection_output).resolve()

    for required_path in (synthetic_path, real_path):
        if not required_path.exists():
            raise FileNotFoundError(required_path)

    for output_path in (
        model_path,
        metrics_path,
        split_path,
        validation_path,
        selection_path,
    ):
        output_path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

    print("=" * 78)
    print("EASY MAINTENANCE - FAILURE ORIGIN CLASSIFIER V3")
    print("=" * 78)
    print(f"Sintético: {synthetic_path}")
    print(f"Real:      {real_path}")
    print()

    synthetic_raw = load_synthetic(synthetic_path)
    real_raw = load_real(real_path)

    synthetic, synthetic_conflicts, synthetic_duplicates = (
        remove_conflicts_and_duplicates(
            synthetic_raw,
            "SYNTHETIC",
        )
    )

    real, real_conflicts, real_duplicates = (
        remove_conflicts_and_duplicates(
            real_raw,
            "REAL",
        )
    )

    if len(real) < 100:
        raise RuntimeError(
            "Poucos exemplos reais únicos para V3."
        )

    real_train, real_validation = split_real_dataset(real)

    real_train["split"] = "TRAIN"
    real_validation["split"] = "VALIDATION"

    pd.concat(
        [real_train, real_validation],
        ignore_index=True,
    ).to_csv(
        split_path,
        index=False,
        encoding="utf-8-sig",
    )

    print("SPLIT REAL:")
    print(f"  TRAIN:      {len(real_train)}")
    print(f"  VALIDATION: {len(real_validation)}")
    print()
    print("TRAIN:")
    print(real_train["label"].value_counts().to_string())
    print()
    print("VALIDATION:")
    print(real_validation["label"].value_counts().to_string())

    all_selection_real_norm = set(
        real_train["observation_norm"]
    ) | set(
        real_validation["observation_norm"]
    )

    synthetic_for_selection = synthetic[
        ~synthetic["observation_norm"].isin(
            all_selection_real_norm
        )
    ].copy()

    removed_overlap = len(synthetic) - len(
        synthetic_for_selection
    )

    print()
    print(
        "Overlap sintético/real removido: "
        f"{removed_overlap}"
    )

    candidates: list[dict[str, Any]] = []
    candidate_models: dict[
        int,
        CalibratedClassifierCV,
    ] = {}
    candidate_outputs: dict[
        int,
        tuple[
            np.ndarray,
            np.ndarray,
            np.ndarray,
        ],
    ] = {}

    y_validation = real_validation[
        "label"
    ].to_numpy(dtype=str)

    print()
    print("=" * 78)
    print("SELEÇÃO POR VALIDAÇÃO REAL")
    print("=" * 78)

    for real_weight in REAL_WEIGHTS:
        print()
        print(
            f"Treinando candidato REAL x{real_weight}..."
        )

        train = build_weighted_training(
            synthetic_for_selection,
            real_train,
            real_weight,
        )

        model = build_calibrated_model(train)

        model.fit(
            train["observation"].to_numpy(dtype=str),
            train["label"].to_numpy(dtype=str),
        )

        (
            predictions,
            probabilities,
            confidence,
        ) = predict_dataset(
            model,
            real_validation,
        )

        metrics = calculate_metrics(
            model,
            y_validation,
            predictions,
            probabilities,
        )

        threshold_info = (
            choose_high_confidence_threshold(
                y_validation,
                predictions,
                confidence,
            )
        )

        candidates.append(
            {
                "real_weight": real_weight,
                "training_rows": int(len(train)),
                "synthetic_unique_rows": int(
                    len(synthetic_for_selection)
                ),
                "real_train_unique_rows": int(
                    len(real_train)
                ),
                "metrics": metrics,
                "high_confidence": threshold_info,
            }
        )

        candidate_models[real_weight] = model
        candidate_outputs[real_weight] = (
            predictions,
            probabilities,
            confidence,
        )

        print(
            f"  Accuracy:        "
            f"{metrics['accuracy']:.4f}"
        )
        print(
            f"  Macro F1:        "
            f"{metrics['macro_f1']:.4f}"
        )
        print(
            "  MANUT precision: "
            f"{metrics['per_class']['MANUTENCAO']['precision']:.4f}"
        )
        print(
            "  OPER precision:  "
            f"{metrics['per_class']['OPERACAO']['precision']:.4f}"
        )
        print(
            f"  Brier:           "
            f"{metrics['brier_score']:.4f}"
        )
        print(
            "  HIGH habilitado: "
            f"{threshold_info['enabled']}"
        )

    selected = max(
        candidates,
        key=lambda item: selection_key(
            item["metrics"]
        ),
    )

    selected_weight = int(
        selected["real_weight"]
    )
    selected_model = candidate_models[
        selected_weight
    ]

    (
        selected_predictions,
        selected_probabilities,
        selected_confidence,
    ) = candidate_outputs[
        selected_weight
    ]

    selected_threshold = selected[
        "high_confidence"
    ]

    print()
    print("=" * 78)
    print(
        f"SELECIONADO: REAL x{selected_weight}"
    )
    print("=" * 78)

    selection_rows = []

    for candidate in candidates:
        metrics = candidate["metrics"]
        high = candidate["high_confidence"]

        selection_rows.append(
            {
                "real_weight":
                    candidate["real_weight"],
                "accuracy":
                    metrics["accuracy"],
                "macro_f1":
                    metrics["macro_f1"],
                "maintenance_precision":
                    metrics["per_class"][
                        "MANUTENCAO"
                    ]["precision"],
                "maintenance_recall":
                    metrics["per_class"][
                        "MANUTENCAO"
                    ]["recall"],
                "operation_precision":
                    metrics["per_class"][
                        "OPERACAO"
                    ]["precision"],
                "operation_recall":
                    metrics["per_class"][
                        "OPERACAO"
                    ]["recall"],
                "brier_score":
                    metrics["brier_score"],
                "log_loss":
                    metrics["log_loss"],
                "high_enabled":
                    high["enabled"],
                "high_threshold":
                    high["threshold"],
                "high_coverage":
                    high["coverage"],
                "high_precision":
                    high["precision"],
                "selected":
                    candidate["real_weight"]
                    == selected_weight,
            }
        )

    pd.DataFrame(
        selection_rows
    ).to_csv(
        selection_path,
        index=False,
        encoding="utf-8-sig",
    )

    validation_df = build_prediction_dataframe(
        real_validation,
        selected_model,
        selected_predictions,
        selected_probabilities,
        selected_confidence,
        selected_threshold,
    )

    validation_df.to_csv(
        validation_path,
        index=False,
        encoding="utf-8-sig",
    )

    all_real_norm = set(real["observation_norm"])

    synthetic_for_final = synthetic[
        ~synthetic["observation_norm"].isin(
            all_real_norm
        )
    ].copy()

    final_train = build_weighted_training(
        synthetic_for_final,
        real,
        selected_weight,
    )

    final_model = build_calibrated_model(final_train)

    final_model.fit(
        final_train["observation"].to_numpy(dtype=str),
        final_train["label"].to_numpy(dtype=str),
    )

    artifact = {
        "model_version": MODEL_VERSION,
        "dataset_version": DATASET_VERSION,
        "purpose":
            "candidate_external_holdout_required",
        "algorithm":
            "TFIDF_WORD_CHAR_LINEAR_SVC_SIGMOID_CALIBRATION",
        "feature_set":
            "A_observation_only",
        "features": ["observation"],
        "classes": [
            str(value)
            for value
            in final_model.classes_
        ],
        "model": final_model,
        "confidence_type":
            "calibrated_probability_sigmoid",
        "high_confidence_enabled":
            bool(selected_threshold["enabled"]),
        "high_confidence_threshold":
            float(selected_threshold["threshold"]),
        "high_confidence_target_precision":
            HIGH_CONFIDENCE_TARGET_PRECISION,
        "selected_real_weight":
            selected_weight,
        "random_seed":
            RANDOM_SEED,
        "real_label_note":
            (
                "Bootstrap real revisado. "
                "Exige holdout real externo antes de produção."
            ),
    }

    joblib.dump(
        artifact,
        model_path,
    )

    metrics_payload = {
        "model_version": MODEL_VERSION,
        "dataset_version": DATASET_VERSION,
        "warning":
            (
                "Os registros reais foram usados na "
                "seleção/treino V3 e não são mais teste final. "
                "Use um novo holdout real."
            ),
        "datasets": {
            "synthetic_raw_rows":
                int(len(synthetic_raw)),
            "synthetic_unique_rows":
                int(len(synthetic)),
            "synthetic_conflict_rows":
                int(len(synthetic_conflicts)),
            "synthetic_duplicates_removed":
                int(synthetic_duplicates),
            "real_raw_rows":
                int(len(real_raw)),
            "real_unique_rows":
                int(len(real)),
            "real_conflict_rows":
                int(len(real_conflicts)),
            "real_duplicates_removed":
                int(real_duplicates),
            "real_train_rows":
                int(len(real_train)),
            "real_validation_rows":
                int(len(real_validation)),
            "synthetic_overlap_removed_for_selection":
                int(removed_overlap),
        },
        "candidate_selection": candidates,
        "selected_real_weight":
            selected_weight,
        "selected_validation_metrics":
            selected["metrics"],
        "selected_high_confidence":
            selected_threshold,
        "final_training": {
            "synthetic_unique_rows":
                int(len(synthetic_for_final)),
            "real_unique_rows":
                int(len(real)),
            "weighted_training_rows":
                int(len(final_train)),
        },
        "next_step":
            (
                "Avaliar o candidato V3 em novo "
                "holdout real nunca usado no treino."
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

    metrics = selected["metrics"]
    matrix = metrics[
        "confusion_matrix"
    ]["matrix"]

    print()
    print("VALIDAÇÃO REAL DO CANDIDATO SELECIONADO:")
    print(
        f"  Accuracy:       "
        f"{metrics['accuracy']:.4f}"
    )
    print(
        f"  Macro F1:       "
        f"{metrics['macro_f1']:.4f}"
    )
    print(
        f"  Weighted F1:    "
        f"{metrics['weighted_f1']:.4f}"
    )
    print(
        f"  ROC-AUC:        "
        f"{metrics['roc_auc']:.4f}"
    )
    print(
        f"  Brier:          "
        f"{metrics['brier_score']:.4f}"
    )
    print(
        f"  Log loss:       "
        f"{metrics['log_loss']:.4f}"
    )

    print()
    print("MANUTENCAO:")
    print(
        "  Precision: "
        f"{metrics['per_class']['MANUTENCAO']['precision']:.4f}"
    )
    print(
        "  Recall:    "
        f"{metrics['per_class']['MANUTENCAO']['recall']:.4f}"
    )
    print(
        "  F1:        "
        f"{metrics['per_class']['MANUTENCAO']['f1']:.4f}"
    )

    print()
    print("OPERACAO:")
    print(
        "  Precision: "
        f"{metrics['per_class']['OPERACAO']['precision']:.4f}"
    )
    print(
        "  Recall:    "
        f"{metrics['per_class']['OPERACAO']['recall']:.4f}"
    )
    print(
        "  F1:        "
        f"{metrics['per_class']['OPERACAO']['f1']:.4f}"
    )

    print()
    print("MATRIZ DE CONFUSÃO:")
    print("                  PRED MANUT.  PRED OPER.")
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
    print("ALTA CONFIANÇA:")
    print(
        "  Habilitada: "
        f"{selected_threshold['enabled']}"
    )
    print(
        "  Threshold:  "
        f"{selected_threshold['threshold']}"
    )
    print(
        "  Coverage:   "
        f"{selected_threshold['coverage']}"
    )
    print(
        "  Precision:  "
        f"{selected_threshold['precision']}"
    )

    print()
    print("ARTEFATOS:")
    print(f"  Modelo:     {model_path}")
    print(f"  Métricas:   {metrics_path}")
    print(f"  Split:      {split_path}")
    print(f"  Validation: {validation_path}")
    print(f"  Seleção:    {selection_path}")

    print()
    print("IMPORTANTE:")
    print(
        "Este V3 é CANDIDATO. "
        "Os dados reais usados aqui agora fazem parte do treino."
    )
    print(
        "O próximo teste deve usar eventos reais totalmente novos."
    )
    print("=" * 78)


if __name__ == "__main__":
    main()
