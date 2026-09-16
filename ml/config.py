from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv


# ============================================================
# PATHS
# ============================================================

ML_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = ML_DIR.parent

DATA_DIR = ML_DIR / "data"
MODELS_DIR = ML_DIR / "models"

ENV_FILE = PROJECT_ROOT / ".env.local"


# ============================================================
# ENVIRONMENT
# ============================================================

load_dotenv(ENV_FILE)


def get_required_env(name: str) -> str:
    value = os.getenv(name)

    if value is None or not value.strip():
        raise RuntimeError(
            f"Variável de ambiente obrigatória não encontrada: {name}"
        )

    return value.strip()


# ============================================================
# MYSQL
# ============================================================

DB_HOST = os.getenv(
    "DB_HOST",
    "127.0.0.1",
)

DB_PORT = int(
    os.getenv(
        "DB_PORT",
        "3306",
    )
)

DB_USER = get_required_env(
    "DB_USER"
)

DB_PASSWORD = get_required_env(
    "DB_PASSWORD"
)

DB_NAME = get_required_env(
    "DB_NAME"
)


# ============================================================
# PREPARA DIRETÓRIOS
# ============================================================

DATA_DIR.mkdir(
    parents=True,
    exist_ok=True,
)

MODELS_DIR.mkdir(
    parents=True,
    exist_ok=True,
)