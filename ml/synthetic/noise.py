from __future__ import annotations

import random
import re
import unicodedata


# ============================================================
# ABREVIAÇÕES COMUNS EM APONTAMENTOS
# ============================================================

ABBREVIATIONS = {
    "bomba": "bba",
    "garrafa": "gfa",
    "garrafas": "gfas",
    "transportador": "transp",
    "transferência": "transf",
    "transferencia": "transf",
    "sensor": "sens",
    "motor": "mot",
    "válvula": "valv",
    "valvula": "valv",
    "inversor": "inv",
    "comunicação": "com",
    "comunicacao": "com",
    "pressão": "press",
    "pressao": "press",
    "pneumático": "pneum",
    "pneumatico": "pneum",
    "manutenção": "manut",
    "manutencao": "manut",
    "equipamento": "equip",
    "posição": "pos",
    "posicao": "pos",
}


PREPOSITIONS = {
    "de",
    "da",
    "do",
    "das",
    "dos",
    "no",
    "na",
    "nos",
    "nas",
}


# ============================================================
# ACENTOS
# ============================================================

def remove_accents(
    text: str,
) -> str:
    normalized = unicodedata.normalize(
        "NFKD",
        text,
    )

    return "".join(
        character
        for character in normalized
        if not unicodedata.combining(
            character
        )
    )


# ============================================================
# ABREVIAÇÕES
# ============================================================

def abbreviate(
    text: str,
    rng: random.Random,
) -> str:
    words = text.split()

    output: list[str] = []

    for word in words:
        clean_word = re.sub(
            r"[^\wÀ-ÿ]",
            "",
            word.lower(),
        )

        replacement = (
            ABBREVIATIONS.get(
                clean_word
            )
        )

        if (
            replacement
            and rng.random() < 0.45
        ):
            punctuation = ""

            if (
                word
                and not word[-1].isalnum()
            ):
                punctuation = word[-1]

            output.append(
                replacement
                + punctuation
            )
        else:
            output.append(word)

    return " ".join(output)


# ============================================================
# REMOVE PREPOSIÇÕES
# ============================================================

def remove_some_prepositions(
    text: str,
    rng: random.Random,
) -> str:
    words = text.split()

    output: list[str] = []

    for word in words:
        normalized = (
            remove_accents(
                word
            )
            .lower()
        )

        if (
            normalized
            in PREPOSITIONS
            and rng.random()
            < 0.35
        ):
            continue

        output.append(word)

    return " ".join(output)


# ============================================================
# NORMALIZA ESPAÇOS
# ============================================================

def normalize_spaces(
    text: str,
) -> str:
    return re.sub(
        r"\s+",
        " ",
        text,
    ).strip()


# ============================================================
# RUÍDO PRINCIPAL
# ============================================================

def apply_noise(
    text: str,
    rng: random.Random,
) -> str:
    result = text.strip()

    # Aproximadamente 60% recebem algum tipo
    # de linguagem abreviada.
    if rng.random() < 0.60:
        result = abbreviate(
            result,
            rng,
        )

    # Simula apontamentos sem acentuação.
    if rng.random() < 0.55:
        result = remove_accents(
            result
        )

    # Simula escrita telegráfica.
    if rng.random() < 0.35:
        result = (
            remove_some_prepositions(
                result,
                rng,
            )
        )

    # Grande parte dos apontamentos industriais
    # vem em caixa alta.
    case_mode = rng.random()

    if case_mode < 0.65:
        result = result.upper()

    elif case_mode < 0.80:
        result = result.lower()

    # Eventualmente remove pontuação.
    if rng.random() < 0.30:
        result = re.sub(
            r"[.,;:!?]",
            "",
            result,
        )

    return normalize_spaces(
        result
    )