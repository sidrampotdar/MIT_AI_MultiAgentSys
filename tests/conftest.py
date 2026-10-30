import pytest
from fastapi.testclient import TestClient

from app.auth import Role, hash_password

PASSWORD = "correct-horse-battery"


@pytest.fixture
def api(tmp_path, monkeypatch):
    """TestClient on an isolated offline database with one user per role."""
    monkeypatch.setenv("WORKFLOW_DATABASE", str(tmp_path / "api.db"))
    monkeypatch.setenv("LLM_PROVIDER", "offline")
    monkeypatch.setenv("JWT_SECRET", "test-secret-test-secret-test-secret-123")
    from app import api as api_module

    api_module._global_service = None
    with TestClient(api_module.app) as client:
        state = api_module.get_service().state
        for role in Role:
            state.create_user(role.value, hash_password(PASSWORD), role.value, f"{role.value.title()} User")
        client.login = lambda role: {
            "Authorization": "Bearer " + client.post(
                "/api/auth/login", json={"username": role, "password": PASSWORD}
            ).json()["access_token"]
        }
        yield client
    api_module._global_service = None
