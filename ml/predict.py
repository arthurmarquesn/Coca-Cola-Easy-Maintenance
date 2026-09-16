from __future__ import annotations

import argparse
import re
import unicodedata
from pathlib import Path

import joblib


# ============================================================
# PATHS
# ============================================================

CURRENT_FILE = Path(
    __file__
).resolve()

ML_DIR = (
    CURRENT_FILE.parent
)

MODEL_PATH = (
    ML_DIR
    / "models"
    / "failure_classifier_v0.joblib"
)


# ============================================================
# NORMALIZAÇÃO
# ============================================================

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


# ============================================================
# INPUT DO MODELO
# ============================================================

def build_text(
    observation: str,

    equipment: str = "",

    stop_key_1: str = "",

    stop_subkey: str = "",

    stop_type: str = "",
) -> str:

    fields = [
        (
            "obs",
            observation,
        ),

        (
            "eq",
            equipment,
        ),

        (
            "k1",
            stop_key_1,
        ),

        (
            "sk",
            stop_subkey,
        ),

        (
            "st",
            stop_type,
        ),
    ]

    parts: list[str] = []

    for prefix, value in fields:

        normalized = (
            normalize(
                value
            )
        )

        if normalized:
            parts.append(
                f"{prefix} "
                f"{normalized}"
            )

    return " ".join(
        parts
    )


# ============================================================
# PREDICT
# ============================================================

def predict(
    observation: str,

    equipment: str = "",
) -> None:

    if not MODEL_PATH.exists():
        raise FileNotFoundError(
            "Modelo não encontrado. "
            "Execute primeiro:\n"
            "python "
            ".\\ml\\training\\train.py"
        )

    package = (
        joblib.load(
            MODEL_PATH
        )
    )

    model = (
        package["model"]
    )

    labels = (
        package[
            "failure_mode_labels"
        ]
    )

    text = (
        build_text(
            observation=
                observation,

            equipment=
                equipment,
        )
    )

    prediction = (
        model.predict(
            [
                text
            ]
        )[0]
    )

    probabilities = (
        model.predict_proba(
            [
                text
            ]
        )[0]
    )

    classes = (
        model
        .named_steps[
            "classifier"
        ]
        .classes_
    )

    ranked = sorted(
        zip(
            classes,
            probabilities,
        ),
        key=lambda item:
            item[1],
        reverse=True,
    )

    confidence = (
        float(
            ranked[0][1]
        )
    )

    failure_mode = (
        labels[
            prediction
        ]
    )

    print()

    print(
        "=" * 70
    )

    print(
        "MODELO ML - PREDIÇÃO"
    )

    print(
        "=" * 70
    )

    print(
        f"Ocorrência:"
    )

    print(
        observation
    )

    if equipment:
        print()

        print(
            "Equipamento:"
        )

        print(
            equipment
        )

    print()

    print(
        "Resultado:"
    )

    print(
        failure_mode
    )

    print()

    print(
        f"Classe interna: "
        f"{prediction}"
    )

    print(
        f"Confiança: "
        f"{confidence * 100:.2f}%"
    )

    print()

    print(
        "Top 5:"
    )

    for (
        component,
        probability,
    ) in ranked[:5]:

        component_label = (
            labels[
                component
            ]
        )

        print(
            f"  "
            f"{component_label:<32} "
            f"{probability * 100:>6.2f}%"
        )

    print()

    print(
        "Status: sugestão do Modelo ML."
    )

    print(
        "Revisão humana obrigatória."
    )

    print(
        "=" * 70
    )


# ============================================================
# CLI
# ============================================================

def main() -> None:

    parser = (
        argparse.ArgumentParser()
    )

    parser.add_argument(
        "observation",
        nargs="?",
    )

    parser.add_argument(
        "--equipment",
        default="",
    )

    args = (
        parser.parse_args()
    )

    observation = (
        args.observation
    )

    if not observation:
        observation = input(
            "Ocorrência: "
        ).strip()

    if not observation:
        raise ValueError(
            "Informe uma ocorrência."
        )

    predict(
        observation=
            observation,

        equipment=
            args.equipment,
    )


if __name__ == "__main__":
    main()