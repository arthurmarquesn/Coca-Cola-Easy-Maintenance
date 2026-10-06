from __future__ import annotations

import pytest
from fastapi import HTTPException

from ml.api.app import ML_SERVICE_TOKEN_ENV, app, require_service_token


def test_token_check_is_disabled_without_configured_token(monkeypatch):
    monkeypatch.delenv(ML_SERVICE_TOKEN_ENV, raising=False)

    assert require_service_token(None) is None


def test_token_check_rejects_missing_or_wrong_token(monkeypatch):
    monkeypatch.setenv(ML_SERVICE_TOKEN_ENV, "segredo-de-teste")

    for received in (None, "", "outro-token"):
        with pytest.raises(HTTPException) as error:
            require_service_token(received)

        assert error.value.status_code == 401


def test_token_check_accepts_matching_token(monkeypatch):
    monkeypatch.setenv(ML_SERVICE_TOKEN_ENV, " segredo-de-teste ")

    assert require_service_token("segredo-de-teste") is None


def test_predict_routes_require_token_and_health_stays_open():
    protected = {
        route.path: any(
            dependency.call is require_service_token
            for dependency in route.dependant.dependencies
        )
        for route in app.routes
        if getattr(route, "path", None) in {"/predict", "/predict-batch", "/health"}
    }

    assert protected == {
        "/health": False,
        "/predict": True,
        "/predict-batch": True,
    }
