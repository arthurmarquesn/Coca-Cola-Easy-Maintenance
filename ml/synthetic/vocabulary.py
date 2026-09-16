from __future__ import annotations


# ============================================================
# CAMPOS DE CONTEXTO
# ============================================================

EQUIPMENTS = [
    "ENCHEDORA",
    "ROTULADORA",
    "TRANSPORTADOR",
    "INSPETOR DE GARRAFAS",
    "PALETIZADOR",
    "DESPALETIZADOR",
    "CARBOCOOLER",
    "SISTEMA DE DOSAGEM",
    "SISTEMA CIP",
    "EMPACOTADORA",
    "SOPRADORA",
    "LAVADORA",
    "FORNO",
]


STOP_TYPES = [
    "PARADA DE EQUIPAMENTO",
    "PARADA NÃO PROGRAMADA",
    "MANUTENÇÃO",
    "FALHA DE PROCESSO",
]


STOP_KEYS = [
    "EQUIPAMENTO",
    "PROCESSO",
    "MANUTENÇÃO",
    "INTERVENÇÃO",
]


STOP_SUBKEYS = [
    "CORRETIVA",
    "INSPEÇÃO",
    "AJUSTE",
    "INTERVENÇÃO TÉCNICA",
]