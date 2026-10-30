def test_api_can_start_and_inspect_a_persisted_workflow(api):
    assert api.get("/health").status_code == 200
    hr = api.login("hr")
    created = api.post("/workflows", json={"name": "Alice Chen", "email": "alice@example.test"}, headers=hr)
    assert created.status_code == 201
    assert created.json()["status"] == "waiting_approval"
    workflow_id = created.json()["workflow_id"]
    assert api.get(f"/workflows/{workflow_id}", headers=hr).status_code == 200
    assert api.get(f"/workflows/{workflow_id}/audit", headers=hr).json()
