from __future__ import annotations

from pathlib import Path

import pandas as pd


INPUT = Path(
    "ml/data/origin/real/"
    "origin_real_predictions_v1.csv"
)

OUTPUT = Path(
    "ml/reports/"
    "origin_real_errors_v1.csv"
)


def main() -> None:
    df = pd.read_csv(
        INPUT,
        dtype=str,
    )

    df["model_confidence"] = pd.to_numeric(
        df["model_confidence"],
        errors="coerce",
    )

    conclusive = df[
        df["human_origin"].isin(
            [
                "MANUTENCAO",
                "OPERACAO",
            ]
        )
    ].copy()

    errors = conclusive[
        conclusive["human_origin"]
        !=
        conclusive["model_prediction"]
    ].copy()

    errors = errors.sort_values(
        [
            "human_origin",
            "model_confidence",
        ],
        ascending=[
            True,
            False,
        ],
    )

    OUTPUT.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    errors.to_csv(
        OUTPUT,
        index=False,
        encoding="utf-8-sig",
    )

    print(
        "=" * 78
    )

    print(
        "EASY MAINTENANCE - ERROS REAIS ORIGIN V1"
    )

    print(
        "=" * 78
    )

    print()

    print(
        f"Conclusivos: {len(conclusive)}"
    )

    print(
        f"Erros:       {len(errors)}"
    )

    print(
        "Taxa erro:   "
        f"{len(errors) / len(conclusive):.2%}"
    )

    print()

    print(
        "TIPOS DE ERRO:"
    )

    print(
        errors.groupby(
            [
                "human_origin",
                "model_prediction",
            ]
        )
        .size()
        .to_string()
    )

    print()

    print(
        "ERROS DE ALTA CONFIANÇA >= 0.85:"
    )

    high = errors[
        errors["model_confidence"]
        >=
        0.85
    ]

    print(
        f"{len(high)}"
    )

    print()

    print(
        "TOP 30 ERROS MAIS CONFIANTES:"
    )

    columns = [
        column
        for column
        in [
            "event_id",
            "observation",
            "human_origin",
            "model_prediction",
            "model_confidence",
        ]
        if column
        in errors.columns
    ]

    print(
        errors[
            columns
        ]
        .head(30)
        .to_string(
            index=False,
        )
    )

    print()

    print(
        f"Arquivo completo: {OUTPUT.resolve()}"
    )

    print(
        "=" * 78
    )


if __name__ == "__main__":
    main()