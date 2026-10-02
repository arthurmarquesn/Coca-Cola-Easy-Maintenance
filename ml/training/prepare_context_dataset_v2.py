from __future__ import annotations

import argparse
import json
import os
import re
import unicodedata
from collections import defaultdict
from pathlib import Path
from typing import Any

import pandas as pd
import pymysql
from pymysql.cursors import DictCursor


# ============================================================
# CONFIGURAÇÃO
# ============================================================

DATASET_VERSION = "human-context-v2-draft"

DEFAULT_HUMAN_DATASET = (
    "ml/data/human/prepared/human_labels_v1.csv"
)

DEFAULT_ENV_FILE = ".env.local"

DEFAULT_OUTPUT_DIR = (
    "ml/data/human/context_v2"
)

CONTEXT_FIELDS = [
    "source_equipment_name",
    "source_stop_key_1",
    "source_stop_subkey",
    "source_stop_type",
    "source_line_name",
]


# ============================================================
# TERMINAL
# ============================================================

def log(
    message: str,
) -> None:
    print(
        message,
        flush=True,
    )


# ============================================================
# TEXTO
# ============================================================

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
            character,
        ) != "Mn"
    )


def normalize_text(
    value: object,
) -> str:
    if value is None:
        return ""

    text = str(
        value,
    ).strip()

    if not text:
        return ""

    text = strip_accents(
        text,
    ).upper()

    text = re.sub(
        r"[^A-Z0-9]+",
        " ",
        text,
    )

    text = re.sub(
        r"\s+",
        " ",
        text,
    )

    return text.strip()


def clean_text(
    value: object,
) -> str:
    if value is None:
        return ""

    text = str(
        value,
    ).strip()

    return re.sub(
        r"\s+",
        " ",
        text,
    )


def rounded(
    value: float,
    digits: int = 4,
) -> float:
    return round(
        float(
            value,
        ),
        digits,
    )


# ============================================================
# .ENV.LOCAL
# ============================================================

def load_env_file(
    path: Path,
) -> dict[str, str]:
    values: dict[str, str] = {}

    if not path.exists():
        return values

    content = path.read_text(
        encoding="utf-8",
    )

    for raw_line in content.splitlines():
        line = raw_line.strip()

        if (
            not line
            or line.startswith(
                "#",
            )
            or "=" not in line
        ):
            continue

        key, value = line.split(
            "=",
            1,
        )

        key = key.strip()
        value = value.strip()

        if (
            len(
                value,
            ) >= 2
            and value[
                0
            ] == value[
                -1
            ]
            and value[
                0
            ] in {
                "'",
                '"',
            }
        ):
            value = value[
                1:-1
            ]

        values[
            key
        ] = value

    return values


def get_database_config(
    env_path: Path,
) -> dict[str, Any]:
    file_env = load_env_file(
        env_path,
    )

    def value(
        name: str,
        default: str | None = None,
    ) -> str | None:
        return (
            os.getenv(
                name,
            )
            or file_env.get(
                name,
            )
            or default
        )

    host = value(
        "DB_HOST",
        "127.0.0.1",
    )

    port = value(
        "DB_PORT",
        "3306",
    )

    user = value(
        "DB_USER",
    )

    password = value(
        "DB_PASSWORD",
    )

    database = value(
        "DB_NAME",
    )

    missing = []

    if not user:
        missing.append(
            "DB_USER",
        )

    if not password:
        missing.append(
            "DB_PASSWORD",
        )

    if not database:
        missing.append(
            "DB_NAME",
        )

    if missing:
        raise RuntimeError(
            "Configuração do banco incompleta no .env.local. "
            f"Ausentes: {', '.join(missing)}"
        )

    return {
        "host":
            str(
                host,
            ),

        "port":
            int(
                str(
                    port,
                )
            ),

        "user":
            str(
                user,
            ),

        "password":
            str(
                password,
            ),

        "database":
            str(
                database,
            ),

        "charset":
            "utf8mb4",

        "cursorclass":
            DictCursor,

        "autocommit":
            True,

        "connect_timeout":
            10,

        "read_timeout":
            120,

        "write_timeout":
            120,
    }


# ============================================================
# DATASET HUMANO
# ============================================================

def load_human_dataset(
    path: Path,
) -> pd.DataFrame:
    dataframe = pd.read_csv(
        path,
        dtype=str,
    )

    required_columns = {
        "row_id",
        "observation",
        "observation_norm",
        "classification",
        "classification_norm",
    }

    missing = (
        required_columns
        -
        set(
            dataframe.columns,
        )
    )

    if missing:
        raise RuntimeError(
            "Dataset humano inválido. "
            f"Colunas ausentes: {sorted(missing)}"
        )

    for column in [
        "observation",
        "classification",
    ]:
        dataframe[
            column
        ] = (
            dataframe[
                column
            ]
            .fillna(
                "",
            )
            .map(
                clean_text,
            )
        )

    dataframe[
        "row_id"
    ] = pd.to_numeric(
        dataframe[
            "row_id"
        ],
        errors="coerce",
    )

    dataframe = dataframe[
        dataframe[
            "row_id"
        ].notna()
    ].copy()

    dataframe[
        "row_id"
    ] = dataframe[
        "row_id"
    ].astype(
        int,
    )

    # Recalculamos com exatamente a mesma normalização
    # que será aplicada aos registros vindos do MySQL.
    dataframe[
        "observation_norm"
    ] = dataframe[
        "observation"
    ].map(
        normalize_text,
    )

    dataframe[
        "classification_norm"
    ] = dataframe[
        "classification"
    ].map(
        normalize_text,
    )

    dataframe = dataframe[
        (
            dataframe[
                "observation_norm"
            ]
            != ""
        )
        &
        (
            dataframe[
                "classification_norm"
            ]
            != ""
        )
    ].copy()

    dataframe.reset_index(
        drop=True,
        inplace=True,
    )

    return dataframe


# ============================================================
# CONFLITOS HUMANOS
# ============================================================

def get_human_conflicts(
    dataframe: pd.DataFrame,
) -> set[str]:
    counts = (
        dataframe
        .groupby(
            "observation_norm",
        )[
            "classification_norm"
        ]
        .nunique()
    )

    return set(
        counts[
            counts
            >
            1
        ].index
    )


# ============================================================
# INSPEÇÃO DAS COLUNAS DO BANCO
# ============================================================

def get_table_columns(
    connection:
        pymysql.connections.Connection,
    table_name: str,
) -> set[str]:
    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            SHOW COLUMNS
            FROM `{table_name}`
            """
        )

        rows = cursor.fetchall()

    return {
        str(
            row[
                "Field"
            ]
        )
        for row in rows
    }


# ============================================================
# UNIDADES
# ============================================================

def fetch_units(
    connection:
        pymysql.connections.Connection,
) -> list[
    dict[str, Any]
]:
    columns = get_table_columns(
        connection,
        "units",
    )

    selected_columns = [
        "id",
    ]

    for optional in [
        "code",
        "name",
        "city",
        "sap_code",
        "external_code",
        "erp_code",
        "plant_code",
    ]:
        if optional in columns:
            selected_columns.append(
                optional,
            )

    select_sql = ", ".join(
        f"`{column}`"
        for column in selected_columns
    )

    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            SELECT
                {select_sql}

            FROM
                units

            ORDER BY
                id ASC
            """
        )

        rows = cursor.fetchall()

    return list(
        rows,
    )


def describe_unit(
    unit: dict[str, Any],
) -> str:
    parts = [
        f"id={unit.get('id')}",
    ]

    for field in [
        "code",
        "name",
        "city",
        "sap_code",
    ]:
        value = unit.get(
            field,
        )

        if value:
            parts.append(
                f"{field}={value}"
            )

    return " | ".join(
        parts,
    )


# ============================================================
# DETECÇÃO PELO NOME MARÍLIA
# ============================================================

def detect_unit_by_name(
    units: list[
        dict[str, Any]
    ],
    human_file: Path,
) -> int | None:
    filename_norm = normalize_text(
        human_file.stem,
    )

    if (
        "MARILIA"
        not in filename_norm
    ):
        return None

    for unit in units:
        searchable = " ".join(
            normalize_text(
                unit.get(
                    field,
                    "",
                )
            )
            for field in [
                "code",
                "name",
                "city",
                "sap_code",
                "external_code",
                "erp_code",
                "plant_code",
            ]
        )

        if (
            "MARILIA"
            in searchable
        ):
            return int(
                unit[
                    "id"
                ]
            )

    return None


# ============================================================
# DETECÇÃO POR INTERSEÇÃO DE OBSERVAÇÕES
# ============================================================

def detect_unit_by_observation_overlap(
    connection:
        pymysql.connections.Connection,

    human_observations:
        set[str],
) -> tuple[
    int,
    list[
        dict[str, Any]
    ],
]:
    log(
        "    Lendo observações existentes no banco..."
    )

    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT
                unit_id,
                observation

            FROM
                maintenance_events

            WHERE
                observation IS NOT NULL

                AND TRIM(
                    observation
                ) <> ''
            """
        )

        rows = cursor.fetchall()

    log(
        f"    {len(rows)} eventos com observação encontrados."
    )

    matched: dict[
        int,
        set[str],
    ] = defaultdict(
        set,
    )

    totals: dict[
        int,
        int,
    ] = defaultdict(
        int,
    )

    for row in rows:
        unit_id = int(
            row[
                "unit_id"
            ]
        )

        observation_norm = normalize_text(
            row.get(
                "observation",
            )
        )

        if not observation_norm:
            continue

        totals[
            unit_id
        ] += 1

        if (
            observation_norm
            in human_observations
        ):
            matched[
                unit_id
            ].add(
                observation_norm,
            )

    ranking = []

    unit_ids = (
        set(
            totals.keys()
        )
        |
        set(
            matched.keys()
        )
    )

    for unit_id in unit_ids:
        ranking.append(
            {
                "unit_id":
                    unit_id,

                "matches":
                    len(
                        matched.get(
                            unit_id,
                            set(),
                        )
                    ),

                "events":
                    int(
                        totals.get(
                            unit_id,
                            0,
                        )
                    ),
            }
        )

    ranking.sort(
        key=lambda item: (
            -int(
                item[
                    "matches"
                ]
            ),
            -int(
                item[
                    "events"
                ]
            ),
        )
    )

    if (
        not ranking
        or
        ranking[
            0
        ][
            "matches"
        ]
        <=
        0
    ):
        raise RuntimeError(
            "Nenhuma unidade possui observações "
            "correspondentes ao dataset humano."
        )

    return (
        int(
            ranking[
                0
            ][
                "unit_id"
            ]
        ),
        ranking,
    )


# ============================================================
# EVENTOS DA UNIDADE
# ============================================================

def fetch_context_events(
    connection:
        pymysql.connections.Connection,

    unit_id: int,
) -> pd.DataFrame:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT
                id AS event_id,
                unit_id,
                event_date,
                shift,
                source_line_name,
                source_stop_type,
                source_material_code,
                source_material_description,
                source_equipment_name,
                source_stop_subkey,
                source_stop_key_1,
                observation,
                downtime_minutes

            FROM
                maintenance_events

            WHERE
                unit_id = %s

                AND observation IS NOT NULL

                AND TRIM(
                    observation
                ) <> ''

            ORDER BY
                id ASC
            """,
            (
                unit_id,
            ),
        )

        rows = cursor.fetchall()

    if not rows:
        raise RuntimeError(
            "Nenhum maintenance_event com observação "
            f"foi encontrado para unit_id={unit_id}."
        )

    dataframe = pd.DataFrame(
        rows,
    )

    text_columns = [
        "shift",
        "source_line_name",
        "source_stop_type",
        "source_material_code",
        "source_material_description",
        "source_equipment_name",
        "source_stop_subkey",
        "source_stop_key_1",
        "observation",
    ]

    for column in text_columns:
        dataframe[
            column
        ] = (
            dataframe[
                column
            ]
            .fillna(
                "",
            )
            .map(
                clean_text,
            )
        )

    dataframe[
        "observation_norm"
    ] = dataframe[
        "observation"
    ].map(
        normalize_text,
    )

    dataframe = dataframe[
        dataframe[
            "observation_norm"
        ]
        != ""
    ].copy()

    dataframe.reset_index(
        drop=True,
        inplace=True,
    )

    return dataframe


# ============================================================
# CONTEXTO
# ============================================================

def context_fingerprint(
    row: pd.Series,
) -> tuple[str, ...]:
    return tuple(
        normalize_text(
            row.get(
                field,
                "",
            )
        )
        for field in CONTEXT_FIELDS
    )


def build_context_index(
    events: pd.DataFrame,
) -> dict[
    str,
    dict[str, Any],
]:
    index: dict[
        str,
        dict[str, Any],
    ] = {}

    for (
        observation_norm,
        group,
    ) in events.groupby(
        "observation_norm",
        sort=False,
    ):
        fingerprints: dict[
            tuple[str, ...],
            list[int],
        ] = defaultdict(
            list,
        )

        for position, (
            _,
            row,
        ) in enumerate(
            group.iterrows()
        ):
            fingerprint = context_fingerprint(
                row,
            )

            fingerprints[
                fingerprint
            ].append(
                position,
            )

        representative = group.iloc[
            0
        ]

        status = (
            "EXACT_SAFE"
            if len(
                fingerprints,
            )
            ==
            1
            else
            "EXACT_AMBIGUOUS_CONTEXT"
        )

        index[
            str(
                observation_norm,
            )
        ] = {
            "status":
                status,

            "event_count":
                int(
                    len(
                        group,
                    )
                ),

            "context_variant_count":
                int(
                    len(
                        fingerprints,
                    )
                ),

            "representative":
                representative,
        }

    return index


# ============================================================
# TEXTO CONTEXTUAL V2
# ============================================================

def build_context_text(
    row: dict[str, Any],
) -> str:
    return " | ".join(
        [
            (
                "OBSERVACAO: "
                +
                clean_text(
                    row.get(
                        "observation",
                    )
                )
            ),

            (
                "EQUIPAMENTO: "
                +
                clean_text(
                    row.get(
                        "source_equipment_name",
                    )
                )
            ),

            (
                "CHAVE_1: "
                +
                clean_text(
                    row.get(
                        "source_stop_key_1",
                    )
                )
            ),

            (
                "SUBCHAVE: "
                +
                clean_text(
                    row.get(
                        "source_stop_subkey",
                    )
                )
            ),

            (
                "TIPO_PARADA: "
                +
                clean_text(
                    row.get(
                        "source_stop_type",
                    )
                )
            ),

            (
                "LINHA: "
                +
                clean_text(
                    row.get(
                        "source_line_name",
                    )
                )
            ),
        ]
    )


# ============================================================
# CRUZAMENTO
# ============================================================

def build_enriched_dataset(
    human: pd.DataFrame,

    context_index: dict[
        str,
        dict[str, Any],
    ],

    human_conflicts:
        set[str],
) -> pd.DataFrame:
    rows: list[
        dict[str, Any]
    ] = []

    for _, human_row in human.iterrows():
        observation_norm = str(
            human_row[
                "observation_norm"
            ]
        )

        result: dict[
            str,
            Any,
        ] = {
            "row_id":
                int(
                    human_row[
                        "row_id"
                    ]
                ),

            "observation":
                str(
                    human_row[
                        "observation"
                    ]
                ),

            "observation_norm":
                observation_norm,

            "classification":
                str(
                    human_row[
                        "classification"
                    ]
                ),

            "classification_norm":
                str(
                    human_row[
                        "classification_norm"
                    ]
                ),

            "match_status":
                "NOT_FOUND",

            "event_count_for_observation":
                0,

            "context_variant_count":
                0,

            "event_id_reference":
                None,

            "unit_id":
                None,

            "event_date":
                "",

            "shift":
                "",

            "source_line_name":
                "",

            "source_stop_type":
                "",

            "source_material_code":
                "",

            "source_material_description":
                "",

            "source_equipment_name":
                "",

            "source_stop_subkey":
                "",

            "source_stop_key_1":
                "",

            "downtime_minutes":
                None,

            "context_text":
                "",
        }

        # ----------------------------------------------------
        # Conflito da própria base humana
        # ----------------------------------------------------

        if (
            observation_norm
            in human_conflicts
        ):
            result[
                "match_status"
            ] = "HUMAN_LABEL_CONFLICT"

            rows.append(
                result,
            )

            continue

        context = context_index.get(
            observation_norm,
        )

        if context is None:
            rows.append(
                result,
            )

            continue

        representative: pd.Series = (
            context[
                "representative"
            ]
        )

        result[
            "match_status"
        ] = str(
            context[
                "status"
            ]
        )

        result[
            "event_count_for_observation"
        ] = int(
            context[
                "event_count"
            ]
        )

        result[
            "context_variant_count"
        ] = int(
            context[
                "context_variant_count"
            ]
        )

        result[
            "event_id_reference"
        ] = int(
            representative[
                "event_id"
            ]
        )

        result[
            "unit_id"
        ] = int(
            representative[
                "unit_id"
            ]
        )

        for field in [
            "event_date",
            "shift",
            "source_line_name",
            "source_stop_type",
            "source_material_code",
            "source_material_description",
            "source_equipment_name",
            "source_stop_subkey",
            "source_stop_key_1",
        ]:
            result[
                field
            ] = clean_text(
                representative.get(
                    field,
                )
            )

        downtime = representative.get(
            "downtime_minutes",
        )

        try:
            result[
                "downtime_minutes"
            ] = (
                float(
                    downtime,
                )
                if downtime is not None
                and str(
                    downtime,
                ).strip()
                != ""
                else None
            )

        except (
            TypeError,
            ValueError,
        ):
            result[
                "downtime_minutes"
            ] = None

        result[
            "context_text"
        ] = build_context_text(
            result,
        )

        rows.append(
            result,
        )

    return pd.DataFrame(
        rows,
    )


# ============================================================
# RELATÓRIO
# ============================================================

def build_report(
    enriched: pd.DataFrame,

    unit_id: int,
) -> dict[str, Any]:
    counts = (
        enriched[
            "match_status"
        ]
        .value_counts()
        .to_dict()
    )

    total = int(
        len(
            enriched,
        )
    )

    safe = int(
        counts.get(
            "EXACT_SAFE",
            0,
        )
    )

    ambiguous = int(
        counts.get(
            "EXACT_AMBIGUOUS_CONTEXT",
            0,
        )
    )

    not_found = int(
        counts.get(
            "NOT_FOUND",
            0,
        )
    )

    conflicts = int(
        counts.get(
            "HUMAN_LABEL_CONFLICT",
            0,
        )
    )

    safe_rows = enriched[
        enriched[
            "match_status"
        ]
        ==
        "EXACT_SAFE"
    ].copy()

    field_coverage: dict[
        str,
        dict[str, Any],
    ] = {}

    for field in CONTEXT_FIELDS:
        if safe == 0:
            present = 0

        else:
            present = int(
                (
                    safe_rows[
                        field
                    ]
                    .fillna(
                        "",
                    )
                    .astype(
                        str,
                    )
                    .str
                    .strip()
                    != ""
                ).sum()
            )

        field_coverage[
            field
        ] = {
            "present":
                present,

            "total_safe":
                safe,

            "coverage_percent":
                rounded(
                    (
                        present
                        /
                        safe
                        *
                        100
                    )
                    if safe
                    else 0.0
                ),
        }

    return {
        "dataset_version":
            DATASET_VERSION,

        "unit_id":
            unit_id,

        "total_human_rows":
            total,

        "safe_context_rows":
            safe,

        "safe_context_percent":
            rounded(
                (
                    safe
                    /
                    total
                    *
                    100
                )
                if total
                else 0.0
            ),

        "ambiguous_context_rows":
            ambiguous,

        "not_found_rows":
            not_found,

        "human_conflict_rows":
            conflicts,

        "unique_safe_observations":
            int(
                safe_rows[
                    "observation_norm"
                ].nunique()
            )
            if safe
            else 0,

        "safe_failure_modes":
            int(
                safe_rows[
                    "classification_norm"
                ].nunique()
            )
            if safe
            else 0,

        "context_field_coverage":
            field_coverage,
    }


# ============================================================
# MAIN
# ============================================================

def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Prepara o dataset humano contextual v2 "
            "a partir dos maintenance_events."
        )
    )

    parser.add_argument(
        "--human",
        default=DEFAULT_HUMAN_DATASET,
    )

    parser.add_argument(
        "--env",
        default=DEFAULT_ENV_FILE,
    )

    parser.add_argument(
        "--output-dir",
        default=DEFAULT_OUTPUT_DIR,
    )

    parser.add_argument(
        "--unit-id",
        type=int,
        default=None,
    )

    args = parser.parse_args()

    human_path = Path(
        args.human,
    ).resolve()

    env_path = Path(
        args.env,
    ).resolve()

    output_dir = Path(
        args.output_dir,
    ).resolve()

    log(
        "=" * 72
    )

    log(
        "EASY MAINTENANCE - PREPARAÇÃO CONTEXTUAL V2"
    )

    log(
        "=" * 72
    )

    log(
        f"Dataset humano: {human_path}"
    )

    log(
        f".env:           {env_path}"
    )

    log(
        ""
    )

    # ========================================================
    # 1. DATASET HUMANO
    # ========================================================

    log(
        "[1/7] Carregando dataset humano..."
    )

    if not human_path.exists():
        raise FileNotFoundError(
            "Dataset humano não encontrado: "
            f"{human_path}"
        )

    human = load_human_dataset(
        human_path,
    )

    log(
        f"      {len(human)} linhas válidas."
    )

    human_conflicts = get_human_conflicts(
        human,
    )

    log(
        "      "
        f"{len(human_conflicts)} observações "
        "com conflito humano."
    )

    # ========================================================
    # 2. CONFIGURAÇÃO DO BANCO
    # ========================================================

    log(
        "[2/7] Lendo configuração do MySQL..."
    )

    if not env_path.exists():
        raise FileNotFoundError(
            ".env.local não encontrado: "
            f"{env_path}"
        )

    config = get_database_config(
        env_path,
    )

    log(
        "      Configuração encontrada."
    )

    # ========================================================
    # 3. CONEXÃO
    # ========================================================

    log(
        "[3/7] Conectando ao MySQL..."
    )

    connection = pymysql.connect(
        **config
    )

    log(
        "      Conectado."
    )

    try:
        # ====================================================
        # 4. UNIDADE
        # ====================================================

        log(
            "[4/7] Identificando unidade..."
        )

        units = fetch_units(
            connection,
        )

        log(
            f"      {len(units)} unidades encontradas."
        )

        unit_id: int

        if args.unit_id is not None:
            unit_id = int(
                args.unit_id,
            )

            log(
                "      Unidade definida manualmente: "
                f"{unit_id}"
            )

        else:
            detected_by_name = detect_unit_by_name(
                units,
                human_path,
            )

            if (
                detected_by_name
                is not None
            ):
                unit_id = detected_by_name

                log(
                    "      Unidade detectada pelo nome "
                    "MARILIA."
                )

            else:
                log(
                    "      Não foi possível detectar "
                    "pelo nome."
                )

                log(
                    "      Tentando cruzamento das "
                    "observações..."
                )

                (
                    unit_id,
                    ranking,
                ) = detect_unit_by_observation_overlap(
                    connection,
                    set(
                        human[
                            "observation_norm"
                        ]
                    ),
                )

                log(
                    "      Ranking de interseção:"
                )

                for item in ranking[
                    :5
                ]:
                    log(
                        "        "
                        f"unit_id={item['unit_id']} | "
                        f"matches={item['matches']} | "
                        f"events={item['events']}"
                    )

        selected_unit = next(
            (
                unit
                for unit in units
                if int(
                    unit[
                        "id"
                    ]
                )
                ==
                unit_id
            ),
            None,
        )

        if selected_unit is None:
            raise RuntimeError(
                f"unit_id={unit_id} não existe."
            )

        log(
            "      Selecionada: "
            +
            describe_unit(
                selected_unit,
            )
        )

        # ====================================================
        # 5. EVENTOS
        # ====================================================

        log(
            "[5/7] Carregando maintenance_events..."
        )

        events = fetch_context_events(
            connection,
            unit_id,
        )

        log(
            f"      {len(events)} eventos carregados."
        )

        log(
            "      "
            f"{events['observation_norm'].nunique()} "
            "observações únicas no banco."
        )

        # ====================================================
        # 6. CRUZAMENTO
        # ====================================================

        log(
            "[6/7] Cruzando classificações humanas "
            "com contexto..."
        )

        context_index = build_context_index(
            events,
        )

        enriched = build_enriched_dataset(
            human,
            context_index,
            human_conflicts,
        )

        report = build_report(
            enriched,
            unit_id,
        )

        log(
            "      Cruzamento concluído."
        )

        # ====================================================
        # 7. ARQUIVOS
        # ====================================================

        log(
            "[7/7] Gravando arquivos..."
        )

        output_dir.mkdir(
            parents=True,
            exist_ok=True,
        )

        all_path = (
            output_dir
            /
            "human_context_v2_all.csv"
        )

        trainable_path = (
            output_dir
            /
            "human_context_v2_trainable.csv"
        )

        review_path = (
            output_dir
            /
            "human_context_v2_review.csv"
        )

        report_path = (
            output_dir
            /
            "human_context_v2_report.json"
        )

        enriched.to_csv(
            all_path,
            index=False,
            encoding="utf-8-sig",
        )

        enriched[
            enriched[
                "match_status"
            ]
            ==
            "EXACT_SAFE"
        ].to_csv(
            trainable_path,
            index=False,
            encoding="utf-8-sig",
        )

        enriched[
            enriched[
                "match_status"
            ]
            !=
            "EXACT_SAFE"
        ].to_csv(
            review_path,
            index=False,
            encoding="utf-8-sig",
        )

        with report_path.open(
            "w",
            encoding="utf-8",
        ) as file:
            json.dump(
                report,
                file,
                ensure_ascii=False,
                indent=2,
            )

        log(
            "      Arquivos gravados."
        )

        # ====================================================
        # RESULTADO
        # ====================================================

        log(
            ""
        )

        log(
            "=" * 72
        )

        log(
            "RESULTADO DA PREPARAÇÃO CONTEXTUAL V2"
        )

        log(
            "=" * 72
        )

        log(
            ""
        )

        log(
            "Dataset:"
        )

        log(
            "  Linhas humanas:            "
            f"{report['total_human_rows']}"
        )

        log(
            "  Contexto seguro:           "
            f"{report['safe_context_rows']}"
        )

        log(
            "  Cobertura segura:          "
            f"{report['safe_context_percent']:.2f}%"
        )

        log(
            "  Contexto ambíguo:          "
            f"{report['ambiguous_context_rows']}"
        )

        log(
            "  Não encontrados no banco:  "
            f"{report['not_found_rows']}"
        )

        log(
            "  Conflito humano:           "
            f"{report['human_conflict_rows']}"
        )

        log(
            "  Observações seguras únicas:"
            f" {report['unique_safe_observations']}"
        )

        log(
            "  Modos de falha seguros:    "
            f"{report['safe_failure_modes']}"
        )

        log(
            ""
        )

        log(
            "Cobertura dos campos contextuais:"
        )

        for (
            field,
            info,
        ) in report[
            "context_field_coverage"
        ].items():
            log(
                f"  {field:30} "
                f"{info['coverage_percent']:6.2f}%"
            )

        log(
            ""
        )

        log(
            "Arquivos:"
        )

        log(
            f"  {all_path}"
        )

        log(
            f"  {trainable_path}"
        )

        log(
            f"  {review_path}"
        )

        log(
            f"  {report_path}"
        )

    finally:
        connection.close()

        log(
            ""
        )

        log(
            "Conexão MySQL encerrada."
        )


if __name__ == "__main__":
    main()