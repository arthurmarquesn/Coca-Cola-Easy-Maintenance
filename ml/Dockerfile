# syntax=docker/dockerfile:1
# Imagem de produção do serviço de classificação (FastAPI).
# Contexto de build: raiz do repositório (ver docker-compose.prod.yml).
# O .dockerignore deixa entrar só os artefatos usados em runtime:
# Ursus v1.5 (fallback), Ursus v1.6, modelo de origem v4, config
# travado da v1.6 e a taxonomia.

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY ml/requirements.txt ml/requirements.txt
RUN pip install -r ml/requirements.txt

COPY ml ml

# Clone sem `git lfs pull` traz ponteiros de ~130 bytes no lugar
# dos modelos. Falha o build aqui em vez de subir um serviço
# quebrado. O SHA-256 de cada artefato é conferido de novo pelo
# ml/model_registry.py ao carregar.
RUN python - <<'EOF'
from pathlib import Path

required = [
    "ml/models/failure_classifier_marilia_v1_5_candidate.joblib",
    "ml/models/ursus_reranker_v16_experimental_locked.joblib",
    "ml/models/failure_origin_classifier_v4_candidate.joblib",
    "ml/reports/ursus_reranker_v16_locked_config.json",
    "ml/taxonomy/canonical_failure_modes.csv",
]

for name in required:
    path = Path(name)
    if not path.is_file():
        raise SystemExit(f"Artefato ausente: {name}")
    if path.read_bytes()[:40].startswith(b"version https://git-lfs"):
        raise SystemExit(f"{name} é um ponteiro do Git LFS. Rode git lfs pull.")
EOF

RUN useradd --system --uid 10001 --no-create-home ml
USER ml

EXPOSE 8001


CMD ["uvicorn", "ml.api.app:app", "--host", "0.0.0.0", "--port", "8001"]
