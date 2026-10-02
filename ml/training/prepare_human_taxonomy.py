from __future__ import annotations

import argparse
import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path
from typing import Iterable

import pandas as pd


# ============================================================
# VERSÕES
# ============================================================

DATASET_VERSION = "human-dataset-v1"
TAXONOMY_VERSION = "taxonomy-v1-draft"


# ============================================================
# COLUNAS ESPERADAS
# ============================================================

OBSERVATION_COLUMN_CANDIDATES = {
    "OBSERVACOES",
    "OBSERVACAO",
}

CLASSIFICATION_COLUMN_CANDIDATES = {
    "CLASSIFICACAO",
    "CLASSIFICACOES",
}


# ============================================================
# PALAVRAS ESTRUTURAIS
#
# Usadas apenas para detectar candidatos a alias.
# Não alteram a classificação original.
# ============================================================

STOPWORDS = {
    "A",
    "AS",
    "O",
    "OS",
    "DE",
    "DA",
    "DAS",
    "DO",
    "DOS",
    "EM",
    "NA",
    "NAS",
    "NO",
    "NOS",
    "E",
}


# ============================================================
# SUGESTÕES DE MECANISMO
#
# Ainda NÃO são taxonomia oficial.
# Servem para revisão humana.
# ============================================================

MECHANISM_PATTERNS = [
    (
        "SEM MODO IDENTIFICADO",
        [
            "SEM MODO DE FALHA IDENTIFICADO",
        ],
    ),
    (
        "QUEBRA",
        [
            "QUEBRA",
            "QUEBRADO",
            "QUEBRADA",
        ],
    ),
    (
        "VAZAMENTO",
        [
            "VAZAMENTO",
        ],
    ),
    (
        "TRAVAMENTO",
        [
            "TRAVAMENTO",
            "TRAVADO",
            "TRAVADA",
        ],
    ),
    (
        "DESARME",
        [
            "DESARME",
            "DESARMOU",
        ],
    ),
    (
        "ENROSCO",
        [
            "ENROSCO",
            "ENROSCOU",
        ],
    ),
    (
        "ROMPIMENTO",
        [
            "ROMPIMENTO",
            "ROMPEU",
        ],
    ),
    (
        "DESALINHAMENTO",
        [
            "DESALINHAMENTO",
            "DESALINHADO",
        ],
    ),
    (
        "DESGASTE",
        [
            "DESGASTE",
            "DESGASTADO",
        ],
    ),
    (
        "FOLGA",
        [
            "FOLGA",
        ],
    ),
    (
        "PATINAGEM",
        [
            "PATINAGEM",
            "PATINAMENTO",
        ],
    ),
    (
        "ENTUPIMENTO",
        [
            "ENTUPIMENTO",
            "ENTUPIDO",
        ],
    ),
    (
        "QUEIMA",
        [
            "QUEIMA",
            "QUEIMADO",
            "QUEIMADA",
        ],
    ),
    (
        "DEFORMAÇÃO",
        [
            "DEFORMACAO",
            "DEFORMADO",
            "DEFORMADA",
        ],
    ),
    (
        "ESCAPE",
        [
            "ESCAPE",
        ],
    ),
    (
        "QUEDA",
        [
            "QUEDA",
        ],
    ),
    (
        "PERDA",
        [
            "PERDA",
        ],
    ),
    (
        "AUSÊNCIA",
        [
            "AUSENCIA",
        ],
    ),
    (
        "ERRO",
        [
            "ERRO",
        ],
    ),
    (
        "FALHA",
        [
            "FALHA",
        ],
    ),
]


# ============================================================
# COMPONENTES
#
# Os mais específicos vêm antes dos mais genéricos.
# ============================================================

COMPONENT_PATTERNS = [
    (
        "VÁLVULA DE ENCHIMENTO",
        [
            "VALVULA DE ENCHIMENTO",
        ],
    ),
    (
        "VÁLVULA MODULADORA",
        [
            "VALVULA MODULADORA",
        ],
    ),
    (
        "TROCADOR DE CALOR",
        [
            "TROCADOR DE CALOR",
        ],
    ),
    (
        "SERVO MOTOR",
        [
            "SERVO MOTOR",
            "SERVOMOTOR",
        ],
    ),
    (
        "RELÉ DE SEGURANÇA",
        [
            "RELE DE SEGURANCA",
        ],
    ),
    (
        "PORTA DE SEGURANÇA",
        [
            "PORTA DE SEGURANCA",
        ],
    ),
    (
        "VÁLVULA",
        [
            "VALVULA",
        ],
    ),
    (
        "SENSOR",
        [
            "SENSOR",
            "FOTOCELULA",
        ],
    ),
    (
        "ENCODER",
        [
            "ENCODER",
        ],
    ),
    (
        "INVERSOR",
        [
            "INVERSOR",
        ],
    ),
    (
        "PLC",
        [
            "PLC",
            "CLP",
        ],
    ),
    (
        "IHM",
        [
            "IHM",
        ],
    ),
    (
        "MOTOR",
        [
            "MOTOR",
        ],
    ),
    (
        "REDUTOR",
        [
            "REDUTOR",
        ],
    ),
    (
        "ROLAMENTO",
        [
            "ROLAMENTO",
        ],
    ),
    (
        "ESTEIRA",
        [
            "ESTEIRA",
        ],
    ),
    (
        "CORREIA",
        [
            "CORREIA",
        ],
    ),
    (
        "CORRENTE",
        [
            "CORRENTE",
        ],
    ),
    (
        "ENGRENAGEM",
        [
            "ENGRENAGEM",
        ],
    ),
    (
        "EIXO",
        [
            "EIXO",
        ],
    ),
    (
        "ROBÔ",
        [
            "ROBO",
        ],
    ),
    (
        "PINÇA",
        [
            "PINCA",
        ],
    ),
    (
        "VENTOSA",
        [
            "VENTOSA",
        ],
    ),
    (
        "PEGADOR",
        [
            "PEGADOR",
        ],
    ),
    (
        "FILME",
        [
            "FILME",
        ],
    ),
    (
        "TAMPA",
        [
            "TAMPA",
        ],
    ),
    (
        "RÓTULO",
        [
            "ROTULO",
            "ROTULAGEM",
        ],
    ),
    (
        "PALETE",
        [
            "PALETE",
        ],
    ),
    (
        "PACOTE",
        [
            "PACOTE",
        ],
    ),
    (
        "GARRAFA",
        [
            "GARRAFA",
        ],
    ),
    (
        "LATA",
        [
            "LATA",
        ],
    ),
    (
        "CAIXA",
        [
            "CAIXA",
        ],
    ),
    (
        "CILINDRO",
        [
            "CILINDRO",
        ],
    ),
    (
        "BOMBA",
        [
            "BOMBA",
        ],
    ),
    (
        "MANGUEIRA",
        [
            "MANGUEIRA",
        ],
    ),
    (
        "CABO",
        [
            "CABO",
        ],
    ),
    (
        "BOTÃO",
        [
            "BOTAO",
        ],
    ),
    (
        "MAGAZINE",
        [
            "MAGAZINE",
        ],
    ),
    (
        "CABEÇOTE",
        [
            "CABECOTE",
        ],
    ),
    (
        "CENTRADOR",
        [
            "CENTRADOR",
        ],
    ),
    (
        "ELEVADOR",
        [
            "ELEVADOR",
        ],
    ),
]


# ============================================================
# SISTEMAS / PROCESSOS
# ============================================================

SYSTEM_PATTERNS = [
    (
        "ENCHIMENTO",
        [
            "ENCHIMENTO",
            "ENCHEDORA",
        ],
    ),
    (
        "TRANSPORTE",
        [
            "ESTEIRA",
            "TRANSPORTE",
            "ELEVADOR",
        ],
    ),
    (
        "ROTULAGEM",
        [
            "ROTULO",
            "ROTULAGEM",
            "ROTULADORA",
        ],
    ),
    (
        "TAMPAMENTO",
        [
            "TAMPA",
            "TAMPAMENTO",
            "TAMPADOR",
        ],
    ),
    (
        "PALETIZAÇÃO",
        [
            "PALETE",
            "PALETIZADOR",
            "PALETIZACAO",
        ],
    ),
    (
        "EMPACOTAMENTO",
        [
            "EMPACOT",
            "PACOTE",
            "FILME",
        ],
    ),
    (
        "INSPEÇÃO",
        [
            "INSPECAO",
            "INSPETOR",
            "REJEICAO",
        ],
    ),
    (
        "CODIFICAÇÃO",
        [
            "CODIFICACAO",
            "IMPRESSAO",
            "DATADOR",
        ],
    ),
    (
        "SOPRO",
        [
            "SOPR",
        ],
    ),
    (
        "ROBÓTICA / MANIPULAÇÃO",
        [
            "ROBO",
            "PINCA",
            "VENTOSA",
            "PEGADOR",
        ],
    ),
    (
        "AUTOMAÇÃO",
        [
            "PLC",
            "CLP",
            "IHM",
            "COMUNICACAO",
        ],
    ),
    (
        "ACIONAMENTO",
        [
            "INVERSOR",
            "MOTOR",
            "SERVO",
            "REDUTOR",
        ],
    ),
    (
        "SEGURANÇA",
        [
            "SEGURANCA",
        ],
    ),
]


# ============================================================
# NORMALIZAÇÃO
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


def normalize_display(
    value: object,
) -> str:
    if value is None:
        return ""

    return re.sub(
        r"\s+",
        " ",
        str(
            value,
        ).strip(),
    )


def content_tokens(
    value: str,
) -> tuple[str, ...]:
    return tuple(
        token
        for token
        in normalize_text(
            value,
        ).split()
        if token
        not in STOPWORDS
    )


def alias_key(
    value: str,
) -> str:
    return " ".join(
        content_tokens(
            value,
        )
    )


# ============================================================
# LOCALIZAÇÃO DAS COLUNAS
# ============================================================

def find_column(
    columns: Iterable[str],
    candidates: set[str],
) -> str:
    normalized_columns = {
        normalize_text(
            column,
        ): column
        for column
        in columns
    }

    for candidate in candidates:
        if (
            candidate
            in normalized_columns
        ):
            return normalized_columns[
                candidate
            ]

    raise ValueError(
        "Coluna não encontrada. "
        f"Esperado: {sorted(candidates)}. "
        f"Encontrado: {list(columns)}"
    )


# ============================================================
# SUGESTÕES DE TAXONOMIA
# ============================================================

def find_pattern(
    normalized_label: str,
    patterns: list[
        tuple[
            str,
            list[str],
        ]
    ],
) -> str:
    for (
        output,
        keywords,
    ) in patterns:
        for keyword in keywords:
            if (
                normalize_text(
                    keyword,
                )
                in normalized_label
            ):
                return output

    return "A VALIDAR"


def suggest_system(
    normalized_label: str,
) -> str:
    return find_pattern(
        normalized_label,
        SYSTEM_PATTERNS,
    )


def suggest_component(
    normalized_label: str,
) -> str:
    return find_pattern(
        normalized_label,
        COMPONENT_PATTERNS,
    )


def suggest_mechanism(
    normalized_label: str,
) -> str:
    return find_pattern(
        normalized_label,
        MECHANISM_PATTERNS,
    )


def suggest_macro_area(
    normalized_label: str,
    system: str,
    component: str,
) -> str:
    text = " ".join(
        [
            normalized_label,
            normalize_text(
                system,
            ),
            normalize_text(
                component,
            ),
        ]
    )

    groups = [
        (
            "SEGURANÇA",
            [
                "SEGURANCA",
            ],
        ),
        (
            "AUTOMAÇÃO / INSTRUMENTAÇÃO",
            [
                "SENSOR",
                "ENCODER",
                "PLC",
                "CLP",
                "IHM",
                "COMUNICACAO",
                "LEITURA",
                "INSPECAO",
            ],
        ),
        (
            "ELÉTRICA / ACIONAMENTO",
            [
                "INVERSOR",
                "MOTOR",
                "SERVO",
                "RELE",
                "CONTATOR",
                "FUSIVEL",
                "ELETRIC",
            ],
        ),
        (
            "EMBALAGEM / MOVIMENTAÇÃO",
            [
                "FILME",
                "ROTULO",
                "ROTULAGEM",
                "TAMPA",
                "EMPACOT",
                "PACOTE",
                "PALETE",
            ],
        ),
        (
            "PROCESSO / PRODUÇÃO",
            [
                "ENCHIMENTO",
                "CARBONAT",
                "DOSAGEM",
                "XAROPE",
                "BEBIDA",
            ],
        ),
        (
            "PNEUMÁTICA",
            [
                "PNEUMATIC",
                "CILINDRO",
                "AR COMPRIMIDO",
            ],
        ),
        (
            "MECÂNICA",
            [
                "ESTEIRA",
                "CORREIA",
                "REDUTOR",
                "ROLAMENTO",
                "ENGRENAGEM",
                "EIXO",
                "CORRENTE",
                "ELEVADOR",
            ],
        ),
    ]

    for (
        area,
        keywords,
    ) in groups:
        if any(
            keyword
            in text
            for keyword
            in keywords
        ):
            return area

    return "A VALIDAR"


# ============================================================
# CARREGAMENTO
# ============================================================

def load_dataset(
    input_path: Path,
) -> pd.DataFrame:
    dataframe = pd.read_excel(
        input_path,
        sheet_name=0,
        dtype=str,
    )

    dataframe.columns = [
        normalize_display(
            column,
        )
        for column
        in dataframe.columns
    ]

    observation_column = find_column(
        dataframe.columns,
        OBSERVATION_COLUMN_CANDIDATES,
    )

    classification_column = find_column(
        dataframe.columns,
        CLASSIFICATION_COLUMN_CANDIDATES,
    )

    result = dataframe[
        [
            observation_column,
            classification_column,
        ]
    ].copy()

    result.columns = [
        "observation",
        "classification",
    ]

    result[
        "observation"
    ] = (
        result[
            "observation"
        ]
        .fillna(
            "",
        )
        .map(
            normalize_display,
        )
    )

    result[
        "classification"
    ] = (
        result[
            "classification"
        ]
        .fillna(
            "",
        )
        .map(
            normalize_display,
        )
    )

    result = result[
        (
            result[
                "observation"
            ] != ""
        )
        &
        (
            result[
                "classification"
            ] != ""
        )
    ].copy()

    result[
        "observation_norm"
    ] = result[
        "observation"
    ].map(
        normalize_text,
    )

    result[
        "classification_norm"
    ] = result[
        "classification"
    ].map(
        normalize_text,
    )

    result.reset_index(
        drop=True,
        inplace=True,
    )

    result.insert(
        0,
        "row_id",
        range(
            1,
            len(
                result,
            ) + 1,
        ),
    )

    return result


# ============================================================
# CONFLITOS HUMANOS
# ============================================================

def build_conflicts(
    dataset: pd.DataFrame,
) -> pd.DataFrame:
    rows: list[
        dict[
            str,
            object,
        ]
    ] = []

    conflict_id = 1

    for (
        observation_norm,
        group,
    ) in dataset.groupby(
        "observation_norm",
        sort=True,
    ):
        unique_labels = group[
            "classification_norm"
        ].nunique()

        if (
            unique_labels
            <= 1
        ):
            continue

        observation_display = (
            group[
                "observation"
            ]
            .value_counts()
            .index[
                0
            ]
        )

        counts = group[
            "classification"
        ].value_counts()

        total = int(
            len(
                group,
            )
        )

        for (
            classification,
            count,
        ) in counts.items():
            rows.append(
                {
                    "conflict_id":
                        conflict_id,

                    "observation":
                        observation_display,

                    "observation_norm":
                        observation_norm,

                    "classification":
                        classification,

                    "count":
                        int(
                            count,
                        ),

                    "share_percent":
                        round(
                            (
                                int(
                                    count,
                                )
                                /
                                total
                            )
                            *
                            100,
                            2,
                        ),

                    "total_rows_in_conflict":
                        total,

                    "decision":
                        "",

                    "review_status":
                        "PENDENTE",
                }
            )

        conflict_id += 1

    return pd.DataFrame(
        rows,
    )


# ============================================================
# ESTATÍSTICA DOS MODOS DE FALHA
# ============================================================

def build_label_stats(
    dataset: pd.DataFrame,
) -> pd.DataFrame:
    rows: list[
        dict[
            str,
            object,
        ]
    ] = []

    for (
        classification_norm,
        group,
    ) in dataset.groupby(
        "classification_norm",
        sort=False,
    ):
        display_label = (
            group[
                "classification"
            ]
            .value_counts()
            .index[
                0
            ]
        )

        examples = list(
            dict.fromkeys(
                group[
                    "observation"
                ].tolist()
            )
        )[
            :3
        ]

        rows.append(
            {
                "classification_norm":
                    classification_norm,

                "classification":
                    display_label,

                "frequency":
                    int(
                        len(
                            group,
                        )
                    ),

                "unique_observations":
                    int(
                        group[
                            "observation_norm"
                        ].nunique()
                    ),

                "examples":
                    " | ".join(
                        examples,
                    ),
            }
        )

    stats = pd.DataFrame(
        rows,
    )

    return stats.sort_values(
        [
            "frequency",
            "classification",
        ],
        ascending=[
            False,
            True,
        ],
        ignore_index=True,
    )


# ============================================================
# ALIASES
#
# Exemplo:
#
# FALHA INVERSOR
# FALHA DE INVERSOR
#
# Possuem a mesma chave estrutural:
# FALHA INVERSOR
# ============================================================

def build_alias_candidates(
    label_stats: pd.DataFrame,
) -> pd.DataFrame:
    groups: dict[
        str,
        list[
            dict[
                str,
                object,
            ]
        ],
    ] = defaultdict(
        list,
    )

    for row in label_stats.to_dict(
        orient="records",
    ):
        key = alias_key(
            str(
                row[
                    "classification"
                ]
            )
        )

        if (
            key
        ):
            groups[
                key
            ].append(
                row,
            )

    output: list[
        dict[
            str,
            object,
        ]
    ] = []

    group_id = 1

    sorted_groups = sorted(
        groups.items(),
        key=lambda item:
            -sum(
                int(
                    row[
                        "frequency"
                    ]
                )
                for row
                in item[
                    1
                ]
            ),
    )

    for (
        key,
        items,
    ) in sorted_groups:
        if (
            len(
                items,
            )
            <= 1
        ):
            continue

        ordered = sorted(
            items,
            key=lambda row: (
                -int(
                    row[
                        "frequency"
                    ]
                ),
                str(
                    row[
                        "classification"
                    ]
                ),
            ),
        )

        canonical_candidate = str(
            ordered[
                0
            ][
                "classification"
            ]
        )

        for item in ordered:
            classification = str(
                item[
                    "classification"
                ]
            )

            output.append(
                {
                    "alias_group":
                        group_id,

                    "comparison_key":
                        key,

                    "classification":
                        classification,

                    "frequency":
                        int(
                            item[
                                "frequency"
                            ]
                        ),

                    "canonical_candidate":
                        canonical_candidate,

                    "relation":
                        (
                            "CANONICAL_CANDIDATE"
                            if (
                                classification
                                ==
                                canonical_candidate
                            )
                            else
                            "ALIAS_CANDIDATE"
                        ),

                    "review_status":
                        "PENDENTE",
                }
            )

        group_id += 1

    return pd.DataFrame(
        output,
    )


# ============================================================
# POSSÍVEIS PAIS
#
# Exemplo:
#
# FALHA DE VÁLVULA
# pode ser candidata a pai de
# FALHA DE VÁLVULA DE ENCHIMENTO
# ============================================================

def parent_candidates(
    classification: str,
    all_labels: list[
        dict[
            str,
            object,
        ]
    ],
) -> list[str]:
    current_tokens = set(
        content_tokens(
            classification,
        )
    )

    if (
        len(
            current_tokens,
        )
        < 3
    ):
        return []

    candidates: list[
        tuple[
            int,
            int,
            str,
        ]
    ] = []

    for item in all_labels:
        candidate_label = str(
            item[
                "classification"
            ]
        )

        if (
            normalize_text(
                candidate_label,
            )
            ==
            normalize_text(
                classification,
            )
        ):
            continue

        candidate_tokens = set(
            content_tokens(
                candidate_label,
            )
        )

        if (
            len(
                candidate_tokens,
            )
            < 2
        ):
            continue

        if (
            candidate_tokens
            <
            current_tokens
        ):
            candidates.append(
                (
                    len(
                        candidate_tokens,
                    ),

                    int(
                        item[
                            "frequency"
                        ]
                    ),

                    candidate_label,
                )
            )

    candidates.sort(
        key=lambda item: (
            -item[
                0
            ],
            -item[
                1
            ],
            item[
                2
            ],
        )
    )

    return [
        item[
            2
        ]
        for item
        in candidates[
            :3
        ]
    ]


# ============================================================
# TABELA DE TAXONOMIA PARA REVISÃO
# ============================================================

def build_taxonomy_review(
    dataset: pd.DataFrame,
    label_stats: pd.DataFrame,
    aliases: pd.DataFrame,
) -> pd.DataFrame:
    alias_map: dict[
        str,
        str,
    ] = {}

    if (
        not aliases.empty
    ):
        for row in aliases.to_dict(
            orient="records",
        ):
            if (
                row[
                    "relation"
                ]
                ==
                "ALIAS_CANDIDATE"
            ):
                alias_map[
                    normalize_text(
                        row[
                            "classification"
                        ]
                    )
                ] = str(
                    row[
                        "canonical_candidate"
                    ]
                )

    all_labels = label_stats.to_dict(
        orient="records",
    )

    total_rows = len(
        dataset,
    )

    rows: list[
        dict[
            str,
            object,
        ]
    ] = []

    for item in all_labels:
        original = str(
            item[
                "classification"
            ]
        )

        normalized = str(
            item[
                "classification_norm"
            ]
        )

        frequency = int(
            item[
                "frequency"
            ]
        )

        canonical_candidate = alias_map.get(
            normalized,
            original,
        )

        relation_type = (
            "ALIAS_CANDIDATE"
            if (
                canonical_candidate
                !=
                original
            )
            else
            "CANONICAL_CANDIDATE"
        )

        system = suggest_system(
            normalized,
        )

        component = suggest_component(
            normalized,
        )

        mechanism = suggest_mechanism(
            normalized,
        )

        macro_area = suggest_macro_area(
            normalized,
            system,
            component,
        )

        rows.append(
            {
                "classification_original":
                    original,

                "classification_norm":
                    normalized,

                "frequency":
                    frequency,

                "dataset_share_percent":
                    round(
                        (
                            frequency
                            /
                            total_rows
                        )
                        *
                        100,
                        4,
                    ),

                "unique_observations":
                    int(
                        item[
                            "unique_observations"
                        ]
                    ),

                "canonical_name_suggested":
                    canonical_candidate,

                "relation_type":
                    relation_type,

                "parent_candidates":
                    " | ".join(
                        parent_candidates(
                            original,
                            all_labels,
                        )
                    ),

                "macro_area_suggested":
                    macro_area,

                "system_suggested":
                    system,

                "component_suggested":
                    component,

                "failure_mechanism_suggested":
                    mechanism,

                "example_1_2_3":
                    str(
                        item[
                            "examples"
                        ]
                    ),

                "canonical_name_validated":
                    "",

                "macro_area_validated":
                    "",

                "system_validated":
                    "",

                "component_validated":
                    "",

                "failure_mechanism_validated":
                    "",

                "validation_status":
                    "PENDENTE",

                "validation_notes":
                    "",
            }
        )

    return pd.DataFrame(
        rows,
    )


# ============================================================
# DISTRIBUIÇÃO
# ============================================================

def build_distribution(
    label_stats: pd.DataFrame,
    total_rows: int,
) -> pd.DataFrame:
    distribution = label_stats[
        [
            "classification",
            "frequency",
            "unique_observations",
        ]
    ].copy()

    distribution.insert(
        0,
        "rank",
        range(
            1,
            len(
                distribution,
            ) + 1,
        ),
    )

    distribution[
        "share_percent"
    ] = (
        distribution[
            "frequency"
        ]
        /
        total_rows
        *
        100
    ).round(
        4,
    )

    distribution[
        "cumulative_percent"
    ] = (
        distribution[
            "frequency"
        ].cumsum()
        /
        total_rows
        *
        100
    ).round(
        4,
    )

    return distribution[
        [
            "rank",
            "classification",
            "frequency",
            "share_percent",
            "cumulative_percent",
            "unique_observations",
        ]
    ]


# ============================================================
# RELATÓRIO
# ============================================================

def build_report(
    dataset: pd.DataFrame,
    label_stats: pd.DataFrame,
    conflicts: pd.DataFrame,
    aliases: pd.DataFrame,
) -> dict[
    str,
    object,
]:
    frequencies = label_stats[
        "frequency"
    ].astype(
        int,
    )

    def support(
        minimum: int,
    ) -> dict[
        str,
        object,
    ]:
        selected = frequencies[
            frequencies
            >=
            minimum
        ]

        rows = int(
            selected.sum()
        )

        return {
            "minimum_examples":
                minimum,

            "classes":
                int(
                    len(
                        selected,
                    )
                ),

            "rows":
                rows,

            "coverage_percent":
                round(
                    (
                        rows
                        /
                        len(
                            dataset,
                        )
                    )
                    *
                    100,
                    4,
                ),
        }

    conflict_groups = (
        int(
            conflicts[
                "conflict_id"
            ].nunique()
        )
        if (
            not conflicts.empty
        )
        else 0
    )

    conflict_rows = (
        int(
            conflicts.groupby(
                "conflict_id",
            )[
                "total_rows_in_conflict"
            ]
            .first()
            .sum()
        )
        if (
            not conflicts.empty
        )
        else 0
    )

    alias_groups = (
        int(
            aliases[
                "alias_group"
            ].nunique()
        )
        if (
            not aliases.empty
        )
        else 0
    )

    return {
        "dataset_version":
            DATASET_VERSION,

        "taxonomy_version":
            TAXONOMY_VERSION,

        "total_valid_rows":
            int(
                len(
                    dataset,
                )
            ),

        "unique_observations_raw":
            int(
                dataset[
                    "observation"
                ].nunique()
            ),

        "unique_observations_normalized":
            int(
                dataset[
                    "observation_norm"
                ].nunique()
            ),

        "unique_failure_modes":
            int(
                dataset[
                    "classification_norm"
                ].nunique()
            ),

        "conflict_groups":
            conflict_groups,

        "rows_inside_conflict_groups":
            conflict_rows,

        "singleton_failure_modes":
            int(
                (
                    frequencies
                    ==
                    1
                ).sum()
            ),

        "strong_alias_groups":
            alias_groups,

        "strong_alias_rows":
            int(
                len(
                    aliases,
                )
            ),

        "support": [
            support(
                2,
            ),
            support(
                5,
            ),
            support(
                10,
            ),
            support(
                20,
            ),
        ],
    }


# ============================================================
# GRAVAÇÃO DOS ARQUIVOS
# ============================================================

def write_outputs(
    output_dir: Path,
    dataset: pd.DataFrame,
    taxonomy: pd.DataFrame,
    conflicts: pd.DataFrame,
    aliases: pd.DataFrame,
    distribution: pd.DataFrame,
    report: dict[
        str,
        object,
    ],
) -> None:
    output_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    dataset[
        [
            "row_id",
            "observation",
            "observation_norm",
            "classification",
            "classification_norm",
        ]
    ].to_csv(
        output_dir
        /
        "human_labels_v1.csv",

        index=False,

        encoding="utf-8-sig",
    )

    taxonomy.to_csv(
        output_dir
        /
        "taxonomy_review_v1.csv",

        index=False,

        encoding="utf-8-sig",
    )

    conflicts.to_csv(
        output_dir
        /
        "conflicts_v1.csv",

        index=False,

        encoding="utf-8-sig",
    )

    aliases.to_csv(
        output_dir
        /
        "alias_candidates_v1.csv",

        index=False,

        encoding="utf-8-sig",
    )

    distribution.to_csv(
        output_dir
        /
        "label_distribution_v1.csv",

        index=False,

        encoding="utf-8-sig",
    )

    with (
        output_dir
        /
        "dataset_report_v1.json"
    ).open(
        "w",
        encoding="utf-8",
    ) as file:
        json.dump(
            report,
            file,
            ensure_ascii=False,
            indent=2,
        )


# ============================================================
# MAIN
# ============================================================

def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Prepara classificações humanas validadas "
            "e gera uma proposta de taxonomia para revisão."
        )
    )

    parser.add_argument(
        "--input",
        required=True,
        help="Caminho para a planilha XLSX.",
    )

    parser.add_argument(
        "--output-dir",
        default="ml/data/human/prepared",
        help="Diretório dos arquivos gerados.",
    )

    args = parser.parse_args()

    input_path = Path(
        args.input,
    ).expanduser().resolve()

    output_dir = Path(
        args.output_dir,
    ).expanduser().resolve()

    if (
        not input_path.exists()
    ):
        raise FileNotFoundError(
            f"Arquivo não encontrado: {input_path}"
        )

    print(
        "=" * 72
    )

    print(
        "EASY MAINTENANCE - PREPARAÇÃO DO DATASET HUMANO"
    )

    print(
        "=" * 72
    )

    print(
        f"Entrada: {input_path}"
    )

    print()

    dataset = load_dataset(
        input_path,
    )

    label_stats = build_label_stats(
        dataset,
    )

    conflicts = build_conflicts(
        dataset,
    )

    aliases = build_alias_candidates(
        label_stats,
    )

    taxonomy = build_taxonomy_review(
        dataset,
        label_stats,
        aliases,
    )

    distribution = build_distribution(
        label_stats,
        len(
            dataset,
        ),
    )

    report = build_report(
        dataset,
        label_stats,
        conflicts,
        aliases,
    )

    write_outputs(
        output_dir=output_dir,
        dataset=dataset,
        taxonomy=taxonomy,
        conflicts=conflicts,
        aliases=aliases,
        distribution=distribution,
        report=report,
    )

    print(
        f"Linhas válidas: "
        f"{report['total_valid_rows']}"
    )

    print(
        f"Observações únicas: "
        f"{report['unique_observations_normalized']}"
    )

    print(
        f"Modos de falha: "
        f"{report['unique_failure_modes']}"
    )

    print(
        f"Conflitos humanos: "
        f"{report['conflict_groups']}"
    )

    print(
        f"Classes com 1 exemplo: "
        f"{report['singleton_failure_modes']}"
    )

    print(
        f"Grupos de alias candidatos: "
        f"{report['strong_alias_groups']}"
    )

    print()

    print(
        "Cobertura por suporte:"
    )

    for item in report[
        "support"
    ]:
        print(
            f"  >= "
            f"{item['minimum_examples']:2} exemplos: "
            f"{item['classes']:3} classes | "
            f"{item['rows']:4} linhas | "
            f"{item['coverage_percent']:6.2f}%"
        )

    print()

    print(
        f"Saída: {output_dir}"
    )

    print(
        "Nenhuma classificação foi alterada "
        "ou fundida automaticamente."
    )


if __name__ == "__main__":
    main()