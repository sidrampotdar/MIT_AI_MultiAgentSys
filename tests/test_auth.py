from datetime import timedelta

from app.auth import create_access_token

ONBOARD = {"name": "Alice Chen", "email": "alice@example.test"}


def _start(api):
    return api.post("/api/workflows/onboarding", json=ONBOARD, headers=api.login("hr")).json()


def _approval_for(api, workflow_id, action):
    pending = api.get("/api/approvals/pending", params={"workflow_id": workflow_id}, headers=api.login("viewer")).json()
    return next(a for a in pending if a["requested_action"] == action)


def test_missing_authentication_is_rejected(api):
    for method, path in [("get", "/api/workflows"), ("get", "/api/employees"), ("post", "/api/workflows/onboarding"),
                         ("get", "/api/approvals/pending"), ("get", "/api/audit")]:
        assert getattr(api, method)(path).status_code == 401, path
    assert api.get("/api/health").status_code == 200


def test_invalid_and_expired_tokens_are_rejected(api):
    assert api.get("/api/workflows", headers={"Authorization": "Bearer not-a-token"}).status_code == 401
    expired, _ = create_access_token("hr", "hr", ttl=timedelta(seconds=-5))
    response = api.get("/api/workflows", headers={"Authorization": f"Bearer {expired}"})
    assert response.status_code == 401 and "expired" in response.json()["detail"].lower()


def test_login_rejects_bad_credentials_and_issues_expiring_token(api):
    assert api.post("/api/auth/login", json={"username": "hr", "password": "wrong-password"}).status_code == 401
    assert api.post("/api/auth/login", json={"username": "ghost", "password": "x"}).status_code == 401
    ok = api.post("/api/auth/login", json={"username": "hr", "password": "correct-horse-battery"}).json()
    assert ok["user"]["role"] == "hr" and ok["expires_at"]
    assert "password_hash" not in str(ok)


def test_role_comes_from_the_user_store_not_the_token_or_headers(api):
    # A forged role header or claim never grants anything: viewer stays read-only.
    viewer = {**api.login("viewer"), "X-User-Role": "admin"}
    assert api.post("/api/workflows/onboarding", json=ONBOARD, headers=viewer).status_code == 403
    assert api.get("/api/workflows", headers=viewer).status_code == 200


def test_insufficient_role_is_forbidden_and_authorized_role_succeeds(api):
    assert api.post("/api/employees", json={"first_name": "A", "last_name": "B", "email": "a@b.test"},
                    headers=api.login("it")).status_code == 403
    assert api.post("/api/employees", json={"first_name": "A", "last_name": "B", "email": "a@b.test"},
                    headers=api.login("hr")).status_code == 201
    assert api.get("/api/users", headers=api.login("hr")).status_code == 403
    assert api.get("/api/users", headers=api.login("admin")).status_code == 200


def test_unauthorized_approval_is_rejected_and_audited(api):
    wf = _start(api)
    edu = _approval_for(api, wf["workflow_id"], "send_education_verification")
    # Finance and IT cannot approve an HR verification email.
    assert api.post(f"/api/approvals/{edu['approval_id']}/approve", json={}, headers=api.login("finance")).status_code == 403
    assert api.post(f"/api/approvals/{edu['approval_id']}/approve", json={}, headers=api.login("viewer")).status_code == 403
    assert api.get(f"/api/approvals/{edu['approval_id']}", headers=api.login("hr")).json()["status"] == "pending"
    events = api.get(f"/api/workflows/{wf['workflow_id']}/audit", headers=api.login("hr")).json()
    assert any(e["event_type"] == "approval_denied_unauthorized" for e in events)


def test_salary_approval_is_finance_only_and_records_authenticated_reviewer(api):
    wf = _start(api)
    wid = wf["workflow_id"]
    edu = _approval_for(api, wid, "send_education_verification")
    assert api.post(f"/api/approvals/{edu['approval_id']}/approve", json={}, headers=api.login("hr")).status_code == 200
    api.post("/api/verification/education/EDU-%s/process-reply" % wid, headers=api.login("hr"))
    salary = _approval_for(api, wid, "finalize_salary_profile")
    for role in ("hr", "it", "viewer", "security", "admin"):
        assert api.post(f"/api/approvals/{salary['approval_id']}/approve", json={}, headers=api.login(role)).status_code == 403, role
    # Reviewer in the body is not accepted (extra fields are forbidden)...
    spoof = api.post(f"/api/approvals/{salary['approval_id']}/approve", json={"reviewer": "CFO"}, headers=api.login("finance"))
    assert spoof.status_code == 422
    # ...and the recorded reviewer is the authenticated username.
    ok = api.post(f"/api/approvals/{salary['approval_id']}/approve", json={}, headers=api.login("finance"))
    assert ok.status_code == 200
    assert api.get(f"/api/approvals/{salary['approval_id']}", headers=api.login("hr")).json()["reviewed_by"] == "finance"


def test_rejection_requires_a_comment(api):
    wf = _start(api)
    edu = _approval_for(api, wf["workflow_id"], "send_education_verification")
    assert api.post(f"/api/approvals/{edu['approval_id']}/reject", json={}, headers=api.login("hr")).status_code == 422
    assert api.post(f"/api/approvals/{edu['approval_id']}/reject", json={"comment": "Consent unclear"}, headers=api.login("hr")).status_code == 200


def test_cors_is_restricted_to_configured_origins(api):
    allowed = api.options("/api/health", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"})
    assert allowed.headers.get("access-control-allow-origin") == "http://localhost:5173"
    denied = api.options("/api/health", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"})
    assert "access-control-allow-origin" not in denied.headers


def test_admin_cannot_demote_self_and_unknown_role_is_rejected(api):
    admin = api.login("admin")
    assert api.patch("/api/users/admin", json={"role": "viewer"}, headers=admin).status_code == 409
    assert api.patch("/api/users/hr", json={"role": "wizard"}, headers=admin).status_code == 422
    assert api.patch("/api/users/hr", json={"is_active": False}, headers=admin).status_code == 200
    assert api.post("/api/auth/login", json={"username": "hr", "password": "correct-horse-battery"}).status_code == 401


def test_every_route_except_health_and_login_requires_authentication(api):
    """Route audit: no endpoint is reachable anonymously by accident."""
    from fastapi.routing import APIRoute

    public = {"/health", "/api/health", "/api/auth/login"}
    for route in api.app.routes:
        if not isinstance(route, APIRoute) or route.path in public:
            continue
        path = route.path.replace("{", "x").replace("}", "")
        for method in route.methods - {"HEAD", "OPTIONS"}:
            response = api.request(method, path)
            assert response.status_code == 401, f"{method} {route.path} -> {response.status_code}"


def test_stream_ticket_is_scoped_short_lived_and_not_a_bearer_token(api):
    hr = api.login("hr")
    wid = api.post("/api/workflows/onboarding", json=ONBOARD, headers=hr).json()["workflow_id"]
    ticket = api.post("/api/auth/stream-ticket", params={"workflow_id": wid}, headers=hr).json()["ticket"]
    # A ticket cannot be used as a normal bearer token on other endpoints.
    assert api.get("/api/workflows", headers={"Authorization": f"Bearer {ticket}"}).status_code == 401
    # It is bound to its workflow.
    other = api.post("/api/workflows/onboarding", json={**ONBOARD, "email": "b@example.test"}, headers=hr).json()["workflow_id"]
    assert api.get(f"/api/workflows/{other}/events", params={"ticket": ticket}).status_code == 403
    # Access tokens are no longer accepted in the query string.
    token = hr["Authorization"].split()[1]
    assert api.get(f"/api/workflows/{wid}/events", params={"access_token": token}).status_code == 401
    assert api.post("/api/auth/stream-ticket", params={"workflow_id": wid}).status_code == 401
