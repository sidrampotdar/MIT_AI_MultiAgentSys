import asyncio
import json

from app.api import workflow_event_stream
from app.core.service import OnboardingService, default_employee


def _collect(service, workflow_id, last_id, stop_after_polls=3):
    polls = {"n": 0}

    async def disconnected():
        polls["n"] += 1
        return polls["n"] > stop_after_polls

    async def run():
        return [chunk async for chunk in workflow_event_stream(
            service, workflow_id, last_id, disconnected, poll_seconds=0.01, heartbeat_seconds=0.02)]

    return asyncio.run(run())


def _ids(chunks):
    return [int(c.split("\n")[0][4:]) for c in chunks if c.startswith("id: ")]


def test_stream_replays_persisted_events_then_heartbeats(tmp_path):
    service = OnboardingService(tmp_path / "s.db", provider="offline")
    wid = service.start("Onboard", default_employee())
    chunks = _collect(service, wid, 0)
    assert chunks[0].startswith("retry:") and "event: connected" in chunks[0]
    ids = _ids(chunks)
    assert ids and ids == sorted(set(ids)), "ids are monotonic with no duplicates"
    assert any(c.startswith(": heartbeat") for c in chunks)
    payload = json.loads(next(c for c in chunks if c.startswith("id: ")).split("data: ")[1])
    assert payload["workflow_id"] == wid


def test_reconnect_with_last_event_id_skips_seen_events_and_gets_new_ones(tmp_path):
    service = OnboardingService(tmp_path / "s.db", provider="offline")
    wid = service.start("Onboard", default_employee())
    first = _ids(_collect(service, wid, 0))
    resumed = _collect(service, wid, first[-1])
    assert _ids(resumed) == []
    service.pause(wid)  # new persisted events after the client "dropped"
    after = _ids(_collect(service, wid, first[-1]))
    assert after and min(after) > first[-1]


def test_stream_requires_auth_and_known_workflow(api):
    assert api.get("/api/workflows/WF-x/events").status_code == 401
    assert api.get("/api/workflows/WF-missing/events", headers=api.login("viewer")).status_code == 404
