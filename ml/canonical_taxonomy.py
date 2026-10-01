from __future__ import annotations

import re
import unicodedata
from typing import Final


# ============================================================
# VERSÃO DA TAXONOMIA
# ============================================================

CANONICAL_TAXONOMY_VERSION: Final[str] = (
    "canonical-taxonomy-v1"
)


# ============================================================
# MAPA DE ALIASES
#
# Esquerda:
# rótulo humano histórico
#
# Direita:
# rótulo oficial/canônico
#
# Somente equivalências semanticamente seguras entram aqui.
# ============================================================

CANONICAL_LABEL_MAP: Final[
    dict[str, str]
] = {
    "DEFORMAÇÃO DE CABEÇOTE":
        "DEFORMAÇÃO DO CABEÇOTE",

    "DESALINHAMENTO DE CENTRADOR":
        "DESALINHAMENTO DO CENTRADOR",

    "DESARME TRANSPORTE":
        "DESARME DE TRANSPORTE",

    "ESPUMAMENTO DA BEBIDA":
        "ESPUMAMENTO DE BEBIDA",

    "FALHA DA PINÇA":
        "FALHA DE PINÇA",

    "FALHA DE FORMAÇÃO DE CAMADA":
        "FALHA NA FORMAÇÃO DE CAMADA",

    "FALHA INVERSOR":
        "FALHA DE INVERSOR",

    "FALHA NA VALVULA":
        "FALHA DE VÁLVULA",

    "FALHA NO BOTÃO RESET":
        "FALHA DE BOTÃO DE RESET",

    "FALHA TROCADOR DE CALOR":
        "FALHA NO TROCADOR DE CALOR",

    "FALHA VALVULA DE ENCHIMENTO":
        "FALHA DE VÁLVULA DE ENCHIMENTO",

    "PATINAGEM DE ESTEIRA":
        "PATINAMENTO DE ESTEIRA",

    "QUEBRA DA ESTEIRA":
        "QUEBRA DE ESTEIRA",

    "TRAVAMENTO ELEVADOR":
        "TRAVAMENTO DE ELEVADOR",

    "ALIMENTAÇÃO TAMPAS FALHA":
        "FALHA DE ALIMENTAÇÃO DE TAMPAS",
}


# ============================================================
# NORMALIZAÇÃO DE CHAVE
# ============================================================

def normalize_taxonomy_key(
    value: object,
) -> str:
    """
    Normalização usada apenas para procurar aliases.

    Não é o rótulo final apresentado ao usuário.

    Exemplos:

    'Falha Invérsor'
        -> 'FALHA INVERSOR'

    '  falha   inversor '
        -> 'FALHA INVERSOR'
    """

    text = (
        ""
        if value is None
        else str(value)
    )

    text = unicodedata.normalize(
        "NFKD",
        text,
    )

    text = "".join(
        character
        for character in text
        if not unicodedata.combining(
            character,
        )
    )

    text = text.upper()

    text = re.sub(
        r"[^A-Z0-9]+",
        " ",
        text,
    )

    return re.sub(
        r"\s+",
        " ",
        text,
    ).strip()


# ============================================================
# ÍNDICE NORMALIZADO
# ============================================================

_CANONICAL_BY_NORMALIZED_KEY: Final[
    dict[str, str]
] = {
    normalize_taxonomy_key(
        source,
    ): target

    for source, target
    in CANONICAL_LABEL_MAP.items()
}


# ============================================================
# CANONICALIZAÇÃO
# ============================================================

def canonicalize_failure_mode(
    value: object,
) -> str:
    """
    Converte um rótulo histórico para sua versão canônica.

    Se o rótulo não estiver no mapa, ele é preservado.

    Isso é deliberadamente conservador:
    não fazemos fuzzy matching durante o treinamento.
    """

    if value is None:
        return ""

    original = str(
        value,
    ).strip()

    if not original:
        return ""

    normalized = normalize_taxonomy_key(
        original,
    )

    return (
        _CANONICAL_BY_NORMALIZED_KEY.get(
            normalized,
            original,
        )
    )


# ============================================================
# VERIFICAÇÃO
# ============================================================

def is_alias(
    value: object,
) -> bool:
    normalized = normalize_taxonomy_key(
        value,
    )

    return (
        normalized
        in
        _CANONICAL_BY_NORMALIZED_KEY
    )


def canonicalization_changed(
    value: object,
) -> bool:
    if value is None:
        return False

    original = str(
        value,
    ).strip()

    canonical = (
        canonicalize_failure_mode(
            original,
        )
    )

    return (
        normalize_taxonomy_key(
            original,
        )
        !=
        normalize_taxonomy_key(
            canonical,
        )
    )


# ============================================================
# ESTATÍSTICAS
# ============================================================

def canonicalize_labels(
    labels: list[str],
) -> list[str]:
    return [
        canonicalize_failure_mode(
            label,
        )
        for label in labels
    ]


def count_unique_canonical_labels(
    labels: list[str],
) -> int:
    return len(
        {
            canonicalize_failure_mode(
                label,
            )
            for label in labels
            if str(label).strip()
        }
    )


# ============================================================
# TESTE LOCAL
# ============================================================

if __name__ == "__main__":
    examples = [
        "FALHA INVERSOR",
        "FALHA DE INVERSOR",
        "PATINAGEM DE ESTEIRA",
        "PATINAMENTO DE ESTEIRA",
        "QUEBRA DA ESTEIRA",
        "QUEBRA DE ESTEIRA",
        "ALIMENTAÇÃO TAMPAS FALHA",
        "FALHA DE ALIMENTAÇÃO DE TAMPAS",
        "QUEBRA DE ENGRENAGEM",
    ]

    print()
    print(
        "========================================"
    )
    print(
        CANONICAL_TAXONOMY_VERSION
    )
    print(
        "========================================"
    )

    for example in examples:
        result = canonicalize_failure_mode(
            example,
        )

        print(
            f"{example} -> {result}"
        )