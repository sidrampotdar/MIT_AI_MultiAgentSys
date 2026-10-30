from fastapi.testclient import TestClient


def test_api_can_start_and_inspect_a_persisted_workflow(tmp_path, monkeypatch):
    monkeypatch.setenv("WORKFLOW_DATABASE", str(tmp_path / "api.db"))
    monkeypatch.setenv("LLM_PROVIDER", "offline")
    from app.api import app

    with TestClient(app) as client:
        health = client.get("/health")
        assert health.status_code == 200
        created = client.post("/workflows", json={"name": "Alice Chen", "email": "alice@example.test"})
        assert created.status_code == 201
        assert created.json()["status"] == "waiting_approval"
        assert client.get(f"/workflows/{created.json()['workflow_id']}").status_code == 200
        assert client.get(f"/workflows/{created.json()['workflow_id']}/audit").json()
