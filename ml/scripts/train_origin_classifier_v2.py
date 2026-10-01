from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import unicodedata
from pathlib import Path
from typing import Any, Iterable

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


RANDOM_SEED = 20260919
MODEL_VERSION = "failure_origin_classifier_v2_eval"
DATASET_VERSION = "synthetic-origin-v2"
DEFAULT_DATASET = Path("ml/data/origin/synthetic_origin_v2.csv")
DEFAULT_MODEL = Path("ml/models/failure_origin_classifier_v2_eval.joblib")
DEFAULT_METRICS = Path("ml/models/failure_origin_classifier_v2_metrics.json")
DEFAULT_SPLIT = Path("ml/data/origin/origin_split_v2.csv")
DEFAULT_VALIDATION = Path("ml/data/origin/origin_validation_predictions_v2.csv")
DEFAULT_TEST = Path("ml/data/origin/origin_test_predictions_v2.csv")
DEFAULT_COMPONENT = Path("ml/data/origin/origin_component_holdout_v2.csv")
DEFAULT_HARD = Path("ml/data/origin/origin_hard_test_v2.csv")
CLASSES = ("MANUTENCAO", "OPERACAO")
POSITIVE_CLASS = "OPERACAO"
REQUIRED_COLUMNS = (
    "row_id", "scenario_id", "causal_family", "hard_negative_type", "observation", "equipment",
    "stop_type", "stop_key_1", "stop_subkey", "line", "failed_component_code", "failure_mode",
    "failure_origin",
)
FEATURE_SETS = {
    "A_OBSERVATION": ("observation",),
    "B_CONTEXT": ("observation", "equipment", "stop_key_1", "stop_subkey"),
    "C_FULL": (
        "observation", "equipment", "stop_key_1", "stop_subkey",
        "failed_component_code", "failure_mode",
    ),
}
COMPONENT_HOLDOUT = ("SENSOR", "VALVULA", "MOTOR", "ROLAMENTO")


def rounded(value: float | np.floating[Any]) -> float:
    return round(float(value), 6)


def stable_hash(value: str) -> int:
    return int(hashlib.sha256(f"{RANDOM_SEED}|{value}".encode()).hexdigest()[:16], 16)


def normalize(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value)).encode("ascii", "ignore").decode().upper()
    return re.sub(r"[^A-Z0-9]+", " ", text).strip()


def load_dataset(path: Path) -> pd.DataFrame:
    frame = pd.read_csv(path, dtype=str).fillna("")
    missing = set(REQUIRED_COLUMNS) - set(frame.columns)
    if missing:
        raise ValueError(f"Colunas ausentes: {sorted(missing)}")
    frame["row_id"] = pd.to_numeric(frame["row_id"], errors="raise").astype(int)
    for column in REQUIRED_COLUMNS[1:]:
        frame[column] = frame[column].astype(str).str.strip()
    frame["failure_origin"] = frame["failure_origin"].str.upper()
    if set(frame["failure_origin"]) != set(CLASSES):
        raise ValueError(f"Classes inesperadas: {sorted(frame['failure_origin'].unique())}")
    if frame["row_id"].duplicated().any():
        raise ValueError("row_id duplicado")
    if (frame["observation"] == "").any() or (frame["scenario_id"] == "").any():
        raise ValueError("Observação ou scenario_id vazio")
    return frame


def validate_dataset(frame: pd.DataFrame) -> dict[str, Any]:
    scenario_class_count = frame.groupby("scenario_id")["failure_origin"].nunique()
    family_class_count = frame.groupby("causal_family")["failure_origin"].nunique()
    if scenario_class_count.max() != 1:
        raise ValueError("Conflito de classe dentro de scenario_id")
    if family_class_count.max() != 1:
        raise ValueError("Conflito de classe dentro de causal_family")

    active_columns = sorted({column for columns in FEATURE_SETS.values() for column in columns})
    direct_leakage_rows: list[int] = []
    feature_labels: dict[str, str] = {}
    conflicts = 0
    for row in frame.itertuples(index=False):
        combined = " ".join(normalize(getattr(row, column)) for column in active_columns)
        if set(combined.split()) & set(CLASSES):
            direct_leakage_rows.append(int(row.row_id))
        key = " | ".join(normalize(getattr(row, column)) for column in active_columns)
        previous = feature_labels.get(key)
        if previous is not None and previous != row.failure_origin:
            conflicts += 1
        feature_labels[key] = row.failure_origin
    if direct_leakage_rows:
        raise ValueError(f"Target leakage literal nas linhas: {direct_leakage_rows[:10]}")
    if conflicts:
        raise ValueError(f"Features idênticas com labels conflitantes: {conflicts}")

    proxy_checks: dict[str, float] = {}
    for column in ("equipment", "stop_type", "stop_key_1", "stop_subkey", "line", "failed_component_code", "failure_mode"):
        dominance = frame.groupby(column)["failure_origin"].value_counts(normalize=True).groupby(level=0).max().max()
        proxy_checks[column] = rounded(dominance)
        if dominance > 0.70:
            raise ValueError(f"Proxy de target em {column}: dominância {dominance:.3f}")
    return {
        "rows": int(len(frame)),
        "scenarios": int(frame["scenario_id"].nunique()),
        "causal_families": int(frame["causal_family"].nunique()),
        "components": int(frame["failed_component_code"].nunique()),
        "class_distribution": {key: int(value) for key, value in frame["failure_origin"].value_counts().sort_index().items()},
        "direct_target_leakage": 0,
        "feature_label_conflicts": 0,
        "categorical_proxy_max_dominance": proxy_checks,
    }


def create_split(frame: pd.DataFrame) -> pd.DataFrame:
    scenarios = frame[["scenario_id", "causal_family", "failure_origin"]].drop_duplicates().copy()
    scenarios["split"] = "TRAIN"
    for (_, _), group in scenarios.groupby(["failure_origin", "causal_family"]):
        ordered = group.assign(hash=group["scenario_id"].map(stable_hash)).sort_values(["hash", "scenario_id"])
        if len(ordered) < 4:
            raise ValueError("Cada família precisa de ao menos quatro cenários")
        scenarios.loc[ordered.index[0], "split"] = "TEST"
        scenarios.loc[ordered.index[1], "split"] = "VALIDATION"
    result = frame.merge(scenarios[["scenario_id", "split"]], on="scenario_id", how="left", validate="many_to_one")
    return result


def split_audit(frame: pd.DataFrame) -> dict[str, Any]:
    scenario_sets = {
        split: set(group["scenario_id"]) for split, group in frame.groupby("split")
    }
    family_coverage = {
        split: int(group["causal_family"].nunique()) for split, group in frame.groupby("split")
    }
    overlaps = {
        "train_validation": len(scenario_sets["TRAIN"] & scenario_sets["VALIDATION"]),
        "train_test": len(scenario_sets["TRAIN"] & scenario_sets["TEST"]),
        "validation_test": len(scenario_sets["VALIDATION"] & scenario_sets["TEST"]),
    }
    return {
        "rows": {key: int(value) for key, value in frame["split"].value_counts().items()},
        "scenarios": {key: int(value) for key, value in frame.groupby("split")["scenario_id"].nunique().items()},
        "class_rows": {
            split: {key: int(value) for key, value in group["failure_origin"].value_counts().sort_index().items()}
            for split, group in frame.groupby("split")
        },
        "causal_family_coverage": family_coverage,
        "scenario_overlap": overlaps,
    }


def build_text(frame: pd.DataFrame, feature_columns: Iterable[str]) -> np.ndarray:
    columns = tuple(feature_columns)
    return frame.apply(
        lambda row: "\n".join(f"[{column.upper()}] {row[column]}" for column in columns), axis=1
    ).to_numpy(dtype=str)


def vectorizer() -> FeatureUnion:
    return FeatureUnion([
        ("word", TfidfVectorizer(
            analyzer="word", ngram_range=(1, 2), min_df=2, max_df=0.995,
            sublinear_tf=True, strip_accents="unicode", max_features=50000,
        )),
        ("char", TfidfVectorizer(
            analyzer="char_wb", ngram_range=(3, 5), min_df=2, max_df=0.999,
            sublinear_tf=True, strip_accents="unicode", max_features=70000,
        )),
    ])


def base_pipeline(algorithm: str) -> Pipeline:
    if algorithm == "linear_svc":
        classifier: Any = LinearSVC(C=1.0, class_weight="balanced", max_iter=15000, random_state=RANDOM_SEED)
    elif algorithm == "logistic_regression":
        classifier = LogisticRegression(
            C=2.0, class_weight="balanced", max_iter=3000, solver="liblinear", random_state=RANDOM_SEED,
        )
    else:
        raise ValueError(algorithm)
    return Pipeline([("features", vectorizer()), ("classifier", classifier)])


def calibration_splits(frame: pd.DataFrame) -> list[tuple[np.ndarray, np.ndarray]]:
    splitter = StratifiedGroupKFold(n_splits=4, shuffle=True, random_state=RANDOM_SEED)
    dummy_x = np.zeros(len(frame))
    y = frame["failure_origin"].to_numpy(dtype=str)
    groups = frame["scenario_id"].to_numpy(dtype=str)
    splits = list(splitter.split(dummy_x, y, groups))
    for fit_index, calibration_index in splits:
        if set(groups[fit_index]) & set(groups[calibration_index]):
            raise RuntimeError("Scenario leakage na calibração")
        if len(set(y[fit_index])) != 2 or len(set(y[calibration_index])) != 2:
            raise RuntimeError("Fold de calibração sem as duas classes")
    return splits


def fit_model(train: pd.DataFrame, feature_columns: tuple[str, ...], algorithm: str) -> CalibratedClassifierCV:
    model = CalibratedClassifierCV(
        estimator=base_pipeline(algorithm), method="sigmoid", cv=calibration_splits(train), n_jobs=-1,
    )
    model.fit(build_text(train, feature_columns), train["failure_origin"].to_numpy(dtype=str))
    return model


def predict(model: CalibratedClassifierCV, frame: pd.DataFrame, feature_columns: tuple[str, ...]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    probabilities = model.predict_proba(build_text(frame, feature_columns))
    predictions = model.classes_[np.argmax(probabilities, axis=1)]
    positive_index = list(model.classes_).index(POSITIVE_CLASS)
    return predictions, probabilities[:, positive_index], probabilities.max(axis=1)


def grouped_accuracy(frame: pd.DataFrame, group_column: str) -> dict[str, float]:
    return {
        str(key): rounded(group["correct"].mean())
        for key, group in frame.groupby(group_column, sort=True)
    }


def reliability_bins(y_binary: np.ndarray, probability: np.ndarray) -> list[dict[str, Any]]:
    bins: list[dict[str, Any]] = []
    for lower in np.linspace(0.0, 0.9, 10):
        upper = lower + 0.1
        mask = (probability >= lower) & (probability < upper if upper < 1.0 else probability <= upper)
        if mask.any():
            bins.append({
                "lower": rounded(lower), "upper": rounded(upper), "count": int(mask.sum()),
                "mean_probability_operacao": rounded(probability[mask].mean()),
                "observed_operacao_rate": rounded(y_binary[mask].mean()),
            })
    return bins


def calculate_metrics(frame: pd.DataFrame, predictions: np.ndarray, probability_operacao: np.ndarray, confidence: np.ndarray) -> dict[str, Any]:
    y = frame["failure_origin"].to_numpy(dtype=str)
    y_binary = (y == POSITIVE_CLASS).astype(int)
    precision, recall, f1, support = precision_recall_fscore_support(y, predictions, labels=list(CLASSES), zero_division=0)
    evaluated = frame.copy()
    evaluated["prediction"] = predictions
    evaluated["correct"] = predictions == y
    per_class = {
        label: {
            "precision": rounded(precision[index]), "recall": rounded(recall[index]),
            "f1": rounded(f1[index]), "support": int(support[index]),
        }
        for index, label in enumerate(CLASSES)
    }
    matrix = confusion_matrix(y, predictions, labels=list(CLASSES))
    return {
        "rows": int(len(frame)),
        "accuracy": rounded(accuracy_score(y, predictions)),
        "macro_f1": rounded(f1_score(y, predictions, average="macro")),
        "weighted_f1": rounded(f1_score(y, predictions, average="weighted")),
        "per_class": per_class,
        "confusion_matrix": {"labels": list(CLASSES), "values": matrix.astype(int).tolist()},
        "roc_auc": rounded(roc_auc_score(y_binary, probability_operacao)),
        "brier_score": rounded(brier_score_loss(y_binary, probability_operacao)),
        "log_loss": rounded(log_loss(y_binary, probability_operacao, labels=[0, 1])),
        "mean_confidence": rounded(confidence.mean()),
        "accuracy_by_scenario_id": grouped_accuracy(evaluated, "scenario_id"),
        "accuracy_by_causal_family": grouped_accuracy(evaluated, "causal_family"),
        "accuracy_by_component": grouped_accuracy(evaluated, "failed_component_code"),
        "accuracy_by_hard_negative_type": grouped_accuracy(evaluated, "hard_negative_type"),
        "reliability_bins": reliability_bins(y_binary, probability_operacao),
    }


def prediction_frame(frame: pd.DataFrame, predictions: np.ndarray, probability_operacao: np.ndarray, confidence: np.ndarray, threshold: float | None) -> pd.DataFrame:
    result = frame.copy()
    result["prediction"] = predictions
    result["correct"] = predictions == result["failure_origin"].to_numpy(dtype=str)
    result["prob_operacao"] = probability_operacao
    result["prob_manutencao"] = 1.0 - probability_operacao
    result["confidence"] = confidence
    result["high_confidence"] = False if threshold is None else confidence >= threshold
    return result


def select_high_confidence_threshold(frame: pd.DataFrame) -> dict[str, Any]:
    candidates: list[dict[str, Any]] = []
    # Confidence must be materially stronger than the decision boundary.
    # Starting at 0.75 prevents "high confidence" from meaning merely > 0.5.
    for threshold in np.arange(0.75, 0.991, 0.005):
        selected = frame[frame["confidence"] >= threshold]
        if len(selected) < 30:
            continue
        candidates.append({
            "threshold": rounded(threshold), "rows": int(len(selected)),
            "coverage": rounded(len(selected) / len(frame)), "precision": rounded(selected["correct"].mean()),
        })
    passing = [candidate for candidate in candidates if candidate["precision"] >= 0.95]
    selected = max(passing, key=lambda item: (item["coverage"], -item["threshold"])) if passing else None
    return {"selected": selected, "curve": candidates}


def evaluate_high_confidence(frame: pd.DataFrame, threshold: float | None) -> dict[str, Any]:
    if threshold is None:
        return {"threshold": None, "rows": 0, "coverage": 0.0, "precision": None}
    selected = frame[frame["confidence"] >= threshold]
    return {
        "threshold": rounded(threshold), "rows": int(len(selected)),
        "coverage": rounded(len(selected) / len(frame)),
        "precision": None if selected.empty else rounded(selected["correct"].mean()),
    }


def acceptance(metrics: dict[str, Any], high_confidence: dict[str, Any]) -> dict[str, Any]:
    checks = {
        "accuracy_gte_0_92": metrics["accuracy"] >= 0.92,
        "macro_f1_gte_0_90": metrics["macro_f1"] >= 0.90,
        "precision_manutencao_gte_0_90": metrics["per_class"]["MANUTENCAO"]["precision"] >= 0.90,
        "precision_operacao_gte_0_90": metrics["per_class"]["OPERACAO"]["precision"] >= 0.90,
        "high_confidence_precision_gte_0_95": (
            high_confidence["precision"] is not None and high_confidence["precision"] >= 0.95
        ),
    }
    return {"checks": checks, "passed": all(checks.values())}


def save_predictions(path: Path, frame: pd.DataFrame) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    frame.drop(columns=["model_text"], errors="ignore").to_csv(path, index=False, encoding="utf-8-sig")


def main() -> None:
    parser = argparse.ArgumentParser(description="Treina e avalia classificador de origem V2.")
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--model-output", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--metrics-output", type=Path, default=DEFAULT_METRICS)
    args = parser.parse_args()

    frame = load_dataset(args.dataset)
    dataset_audit = validate_dataset(frame)
    split = create_split(frame)
    audit = split_audit(split)
    if any(audit["scenario_overlap"].values()):
        raise RuntimeError(f"Scenario leakage: {audit['scenario_overlap']}")
    split.to_csv(DEFAULT_SPLIT, index=False, encoding="utf-8-sig")
    train = split[split["split"] == "TRAIN"].reset_index(drop=True)
    validation = split[split["split"] == "VALIDATION"].reset_index(drop=True)
    test = split[split["split"] == "TEST"].reset_index(drop=True)

    candidate_results: list[dict[str, Any]] = []
    candidate_models: dict[tuple[str, str], CalibratedClassifierCV] = {}
    for feature_name, feature_columns in FEATURE_SETS.items():
        for algorithm in ("linear_svc", "logistic_regression"):
            model = fit_model(train, feature_columns, algorithm)
            predictions, probability, confidence = predict(model, validation, feature_columns)
            metrics = calculate_metrics(validation, predictions, probability, confidence)
            candidate_results.append({
                "feature_set": feature_name, "features": list(feature_columns),
                "algorithm": algorithm, "calibration": "sigmoid", "validation": metrics,
            })
            candidate_models[(feature_name, algorithm)] = model

    ranked = sorted(
        candidate_results,
        key=lambda item: (
            -item["validation"]["macro_f1"], -item["validation"]["accuracy"],
            item["validation"]["brier_score"], item["feature_set"], item["algorithm"],
        ),
    )
    selected_result = ranked[0]
    selected_feature_name = selected_result["feature_set"]
    selected_algorithm = selected_result["algorithm"]
    selected_features = FEATURE_SETS[selected_feature_name]
    selected_model = candidate_models[(selected_feature_name, selected_algorithm)]

    val_predictions, val_probability, val_confidence = predict(selected_model, validation, selected_features)
    validation_predictions = prediction_frame(validation, val_predictions, val_probability, val_confidence, None)
    threshold_selection = select_high_confidence_threshold(validation_predictions)
    threshold = None if threshold_selection["selected"] is None else float(threshold_selection["selected"]["threshold"])
    validation_predictions["high_confidence"] = False if threshold is None else validation_predictions["confidence"] >= threshold

    # Test is accessed only after all candidate selection and threshold selection are frozen.
    test_predictions_raw, test_probability, test_confidence = predict(selected_model, test, selected_features)
    test_metrics = calculate_metrics(test, test_predictions_raw, test_probability, test_confidence)
    test_predictions = prediction_frame(test, test_predictions_raw, test_probability, test_confidence, threshold)
    high_confidence_test = evaluate_high_confidence(test_predictions, threshold)

    component_test = frame[frame["failed_component_code"].isin(COMPONENT_HOLDOUT)].reset_index(drop=True)
    component_train = frame[~frame["failed_component_code"].isin(COMPONENT_HOLDOUT)].reset_index(drop=True)
    component_model = fit_model(component_train, selected_features, selected_algorithm)
    component_pred, component_probability, component_confidence = predict(component_model, component_test, selected_features)
    component_metrics = calculate_metrics(component_test, component_pred, component_probability, component_confidence)
    component_predictions = prediction_frame(
        component_test.assign(split="COMPONENT_HOLDOUT"), component_pred,
        component_probability, component_confidence, threshold,
    )
    component_overlap = sorted(set(component_train["failed_component_code"]) & set(component_test["failed_component_code"]))
    if component_overlap:
        raise RuntimeError(f"Component leakage: {component_overlap}")

    hard_predictions = test_predictions[test_predictions["hard_negative_type"] != ""].copy()
    hard_metrics = calculate_metrics(
        hard_predictions,
        hard_predictions["prediction"].to_numpy(dtype=str),
        hard_predictions["prob_operacao"].to_numpy(dtype=float),
        hard_predictions["confidence"].to_numpy(dtype=float),
    )

    ablation_summary: dict[str, Any] = {}
    for feature_name in FEATURE_SETS:
        feature_candidates = [item for item in candidate_results if item["feature_set"] == feature_name]
        best = sorted(feature_candidates, key=lambda item: (-item["validation"]["macro_f1"], item["validation"]["brier_score"], item["algorithm"]))[0]
        ablation_summary[feature_name] = {
            "best_algorithm": best["algorithm"], "features": best["features"], "validation": best["validation"],
        }

    report = {
        "model_version": MODEL_VERSION,
        "dataset_version": DATASET_VERSION,
        "random_seed": RANDOM_SEED,
        "dataset_audit": dataset_audit,
        "split_strategy": {
            "description": (
                "Holdout determinístico por scenario_id, estratificado por origem e causal_family: "
                "2 cenários TRAIN, 1 VALIDATION e 1 TEST por família. Todas as famílias aparecem nos "
                "três splits; nenhuma variação do mesmo cenário cruza splits."
            ),
            **audit,
        },
        "validation_candidates": candidate_results,
        "ablation_summary": ablation_summary,
        "selection": {
            "selected_without_test": True, "feature_set": selected_feature_name,
            "features": list(selected_features), "algorithm": selected_algorithm, "calibration": "sigmoid",
            "selection_order": ["macro_f1 desc", "accuracy desc", "brier_score asc"],
        },
        "high_confidence_threshold_selection_on_validation": threshold_selection,
        "final_test": test_metrics,
        "high_confidence_test": high_confidence_test,
        "component_holdout": {
            "held_out_components": list(COMPONENT_HOLDOUT), "component_overlap": component_overlap,
            "train_rows": int(len(component_train)), "test_rows": int(len(component_test)), "metrics": component_metrics,
        },
        "hard_negative_test": {
            "description": "Subset do TEST formado por pares com o mesmo sintoma superficial e cláusulas causais opostas.",
            "metrics": hard_metrics,
        },
        "acceptance": acceptance(test_metrics, high_confidence_test),
        "production_status": "APROVADO_SOMENTE_EM_SINTETICO" if acceptance(test_metrics, high_confidence_test)["passed"] else "REPROVADO_EM_SINTETICO",
        "real_data_required": True,
    }

    args.model_output.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({
        "model": selected_model, "model_version": MODEL_VERSION, "dataset_version": DATASET_VERSION,
        "feature_set": selected_feature_name, "features": selected_features,
        "algorithm": selected_algorithm, "classes": tuple(selected_model.classes_),
        "high_confidence_threshold": threshold,
    }, args.model_output)
    args.metrics_output.parent.mkdir(parents=True, exist_ok=True)
    args.metrics_output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    save_predictions(DEFAULT_VALIDATION, validation_predictions)
    save_predictions(DEFAULT_TEST, test_predictions)
    save_predictions(DEFAULT_COMPONENT, component_predictions)
    save_predictions(DEFAULT_HARD, hard_predictions)

    print("=" * 78)
    print("EASY MAINTENANCE - CLASSIFICADOR DE ORIGEM V2")
    print("=" * 78)
    print(json.dumps({
        "dataset_audit": dataset_audit, "split": audit, "selection": report["selection"],
        "ablation_validation": {
            name: {
                "algorithm": value["best_algorithm"], "accuracy": value["validation"]["accuracy"],
                "macro_f1": value["validation"]["macro_f1"], "brier": value["validation"]["brier_score"],
            } for name, value in ablation_summary.items()
        },
        "final_test": test_metrics, "component_holdout": component_metrics,
        "hard_negative_test": hard_metrics, "high_confidence_test": high_confidence_test,
        "acceptance": report["acceptance"], "production_status": report["production_status"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
