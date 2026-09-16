from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path
from typing import Any

import pandas as pd
import pymysql


# ============================================================
# PYTHON PATH
#
# Permite executar:
#
# python ml/training/build_dataset.py
#
# a partir da raiz do projeto.
# ============================================================

CURRENT_FILE = Path(__file__).resolve()
ML_DIR = CURRENT_FILE.parents[1]

if str(ML_DIR) not in sys.path:
    sys.path.insert(
        0,
        str(ML_DIR),
    )


from config import (  # noqa: E402
    DATA_DIR,
    DB_HOST,
    DB_NAME,
    DB_PASSWORD,
    DB_PORT,
    DB_USER,
)


# ============================================================
# ARQUIVOS
# ============================================================

HUMAN_DATASET_PATH = (
    DATA_DIR /
    "human_verified.csv"
)

AI_DATASET_PATH = (
    DATA_DIR /
    "ai_suggestions.csv"
)


# ============================================================
# SQL
# ============================================================

QUERY = """
SELECT
    e.id AS event_id,

    e.unit_id,

    e.import_id,

    e.event_date,

    e.source_line_name,

    e.source_stop_type,

    e.source_equipment_name,

    e.source_stop_subkey,

    e.source_stop_key_1,

    e.observation,

    e.downtime_minutes,

    ec.id AS classification_id,

    ec.source AS classification_source,

    ec.status AS classification_status,

    ec.confidence,

    ec.classified_by_user_id,

    ec.classification_notes,

    ec.created_at AS classification_created_at,

    ec.updated_at AS classification_updated_at

FROM maintenance_events e

INNER JOIN event_classifications ec
    ON ec.event_id = e.id

ORDER BY
    e.id ASC
"""


# ============================================================
# TEXT HELPERS
# ============================================================

def clean_text(
    value: Any,
) -> str:
    if value is None:
        return ""

    text = str(value)

    text = text.strip()

    text = re.sub(
        r"\s+",
        " ",
        text,
    )

    return text


def normalize_text(
    value: Any,
) -> str:
    """
    Versão normalizada para futuro ML.

    Mantemos também os campos originais no CSV.
    """

    text = clean_text(value)

    if not text:
        return ""

    text = text.lower()

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
# JSON
# ============================================================

def parse_classification_notes(
    value: Any,
) -> dict[str, Any]:
    if value is None:
        return {}

    if isinstance(
        value,
        dict,
    ):
        return value

    if isinstance(
        value,
        bytes,
    ):
        value = value.decode(
            "utf-8",
            errors="ignore",
        )

    if not isinstance(
        value,
        str,
    ):
        return {}

    value = value.strip()

    if not value:
        return {}

    try:
        parsed = json.loads(
            value
        )

        if isinstance(
            parsed,
            dict,
        ):
            return parsed

    except json.JSONDecodeError:
        pass

    return {}


# ============================================================
# FEATURES
# ============================================================

def build_combined_text(
    observation: Any,
    equipment: Any,
    stop_key_1: Any,
    stop_subkey: Any,
    stop_type: Any,
) -> str:
    """
    Criamos um único texto contendo contexto estrutural.

    Os identificadores OBS, EQ, K1 etc. ajudam o modelo
    a diferenciar a origem da informação.
    """

    parts: list[str] = []

    observation_text = normalize_text(
        observation
    )

    equipment_text = normalize_text(
        equipment
    )

    stop_key_text = normalize_text(
        stop_key_1
    )

    stop_subkey_text = normalize_text(
        stop_subkey
    )

    stop_type_text = normalize_text(
        stop_type
    )

    if observation_text:
        parts.append(
            f"obs {observation_text}"
        )

    if equipment_text:
        parts.append(
            f"eq {equipment_text}"
        )

    if stop_key_text:
        parts.append(
            f"k1 {stop_key_text}"
        )

    if stop_subkey_text:
        parts.append(
            f"sk {stop_subkey_text}"
        )

    if stop_type_text:
        parts.append(
            f"st {stop_type_text}"
        )

    return " ".join(
        parts
    ).strip()


# ============================================================
# HUMAN VERIFIED
# ============================================================

def is_human_verified(
    row: pd.Series,
) -> bool:
    """
    Regra conservadora.

    O registro precisa demonstrar intervenção humana.

    Hoje consideramos confiável quando:

    - source = MANUAL

    OU

    - existe classified_by_user_id
      e status APROVADA/CORRIGIDA.

    Isso evita usar automaticamente uma sugestão do LLM
    como ground truth.
    """

    source = clean_text(
        row.get(
            "classification_source"
        )
    ).upper()

    status = clean_text(
        row.get(
            "classification_status"
        )
    ).upper()

    classified_by_user_id = row.get(
        "classified_by_user_id"
    )

    has_human_user = (
        classified_by_user_id
        is not None
        and not pd.isna(
            classified_by_user_id
        )
    )

    if source == "MANUAL":
        return True

    if (
        has_human_user
        and status
        in {
            "APROVADA",
            "CORRIGIDA",
        }
    ):
        return True

    return False


# ============================================================
# PROCESSAMENTO
# ============================================================

def prepare_dataset(
    dataframe: pd.DataFrame,
) -> pd.DataFrame:
    rows: list[
        dict[str, Any]
    ] = []

    for _, source_row in dataframe.iterrows():

        notes = parse_classification_notes(
            source_row.get(
                "classification_notes"
            )
        )

        failure_mode_code = clean_text(
            notes.get(
                "failureModeCode"
            )
        )

        failure_detail = clean_text(
            notes.get(
                "failureDetail"
            )
        )

        failure_mode = clean_text(
            notes.get(
                "failureMode"
            )
        )

        system = clean_text(
            notes.get(
                "system"
            )
        )

        technical_category = clean_text(
            notes.get(
                "category"
            )
        )

        model_name = clean_text(
            notes.get(
                "model"
            )
        )

        version = notes.get(
            "version"
        )

        combined_text = build_combined_text(
            observation=source_row.get(
                "observation"
            ),
            equipment=source_row.get(
                "source_equipment_name"
            ),
            stop_key_1=source_row.get(
                "source_stop_key_1"
            ),
            stop_subkey=source_row.get(
                "source_stop_subkey"
            ),
            stop_type=source_row.get(
                "source_stop_type"
            ),
        )

        human_verified = is_human_verified(
            source_row
        )

        rows.append(
            {
                "event_id":
                    source_row.get(
                        "event_id"
                    ),

                "unit_id":
                    source_row.get(
                        "unit_id"
                    ),

                "import_id":
                    source_row.get(
                        "import_id"
                    ),

                "event_date":
                    source_row.get(
                        "event_date"
                    ),

                "line":
                    clean_text(
                        source_row.get(
                            "source_line_name"
                        )
                    ),

                "observation":
                    clean_text(
                        source_row.get(
                            "observation"
                        )
                    ),

                "equipment":
                    clean_text(
                        source_row.get(
                            "source_equipment_name"
                        )
                    ),

                "stop_key_1":
                    clean_text(
                        source_row.get(
                            "source_stop_key_1"
                        )
                    ),

                "stop_subkey":
                    clean_text(
                        source_row.get(
                            "source_stop_subkey"
                        )
                    ),

                "stop_type":
                    clean_text(
                        source_row.get(
                            "source_stop_type"
                        )
                    ),

                "text":
                    combined_text,

                "failure_mode_code":
                    failure_mode_code,

                "failure_detail":
                    failure_detail,

                "failure_mode":
                    failure_mode,

                "system":
                    system,

                "technical_category":
                    technical_category,

                "confidence":
                    source_row.get(
                        "confidence"
                    ),

                "classification_source":
                    clean_text(
                        source_row.get(
                            "classification_source"
                        )
                    ),

                "classification_status":
                    clean_text(
                        source_row.get(
                            "classification_status"
                        )
                    ),

                "classified_by_user_id":
                    source_row.get(
                        "classified_by_user_id"
                    ),

                "human_verified":
                    human_verified,

                "model":
                    model_name,

                "classification_version":
                    version,
            }
        )

    return pd.DataFrame(
        rows
    )


# ============================================================
# ESTATÍSTICAS
# ============================================================

def print_statistics(
    dataframe: pd.DataFrame,
    human_dataframe: pd.DataFrame,
    ai_dataframe: pd.DataFrame,
) -> None:
    total = len(
        dataframe
    )

    human_count = len(
        human_dataframe
    )

    ai_count = len(
        ai_dataframe
    )

    usable_human = (
        human_dataframe[
            (
                human_dataframe[
                    "failure_mode_code"
                ]
                .astype(str)
                .str.strip()
                != ""
            )
            &
            (
                human_dataframe[
                    "text"
                ]
                .astype(str)
                .str.strip()
                != ""
            )
        ]
    )

    print()
    print(
        "=" * 64
    )

    print(
        "EASY MAINTENANCE - DATASET ML"
    )

    print(
        "=" * 64
    )

    print(
        f"Classificações encontradas: {total}"
    )

    print(
        f"Revisadas por humano:       {human_count}"
    )

    print(
        f"Somente IA/sugestões:       {ai_count}"
    )

    print(
        f"Humanas utilizáveis p/ ML:  {len(usable_human)}"
    )

    print()

    if len(
        usable_human
    ) > 0:

        print(
            "Distribuição dos modos de falha confirmados:"
        )

        print()

        distribution = (
            usable_human[
                "failure_mode_code"
            ]
            .value_counts()
        )

        for (
            label,
            count,
        ) in distribution.items():
            print(
                f"  {label:<32} {count:>6}"
            )

    print()

    print(
        f"Dataset humano: {HUMAN_DATASET_PATH}"
    )

    print(
        f"Sugestões IA:   {AI_DATASET_PATH}"
    )

    print(
        "=" * 64
    )


# ============================================================
# MAIN
# ============================================================

def main() -> None:

    print()
    print(
        "Conectando ao MySQL..."
    )

    connection = pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        charset="utf8mb4",
        cursorclass=
            pymysql.cursors.DictCursor,
    )

    try:
        print(
            "Lendo classificações..."
        )

        with connection.cursor() as cursor:
            cursor.execute(
                QUERY
            )

            database_rows = (
                cursor.fetchall()
            )

    finally:
        connection.close()

    if not database_rows:
        print()
        print(
            "Nenhuma classificação encontrada."
        )
        return

    raw_dataframe = pd.DataFrame(
        database_rows
    )

    prepared_dataframe = (
        prepare_dataset(
            raw_dataframe
        )
    )

    # ========================================================
    # HUMAN VERIFIED
    # ========================================================

    human_dataframe = (
        prepared_dataframe[
            prepared_dataframe[
                "human_verified"
            ]
            == True
        ]
        .copy()
    )

    # ========================================================
    # AI / NÃO CONFIRMADO
    # ========================================================

    ai_dataframe = (
        prepared_dataframe[
            prepared_dataframe[
                "human_verified"
            ]
            == False
        ]
        .copy()
    )

    # ========================================================
    # SALVA CSV
    # ========================================================

    human_dataframe.to_csv(
        HUMAN_DATASET_PATH,
        index=False,
        encoding="utf-8-sig",
    )

    ai_dataframe.to_csv(
        AI_DATASET_PATH,
        index=False,
        encoding="utf-8-sig",
    )

    print_statistics(
        dataframe=
            prepared_dataframe,

        human_dataframe=
            human_dataframe,

        ai_dataframe=
            ai_dataframe,
    )


if __name__ == "__main__":
    main()