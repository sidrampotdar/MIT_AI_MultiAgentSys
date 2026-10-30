"""SQLite source of truth for workflows, tasks, approvals, red flags, verifications,
salary profiles, email threads, and append-only tamper-evident audit events."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from typing import Any
from uuid import uuid4


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class WorkflowStateStore:
    def __init__(self, database_path: str | Path = "enterprise_onboarding.db"):
        self.path = str(database_path)
        self.connection = sqlite3.connect(self.path, check_same_thread=False)
        self.connection.row_factory = sqlite3.Row
        self._create_schema()

    def _create_schema(self) -> None:
        self.connection.executescript("""
            CREATE TABLE IF NOT EXISTS workflows (
                workflow_id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                goal TEXT NOT NULL,
                employee_json TEXT NOT NULL,
                plan_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tasks (
                workflow_id TEXT NOT NULL,
                task_id TEXT NOT NULL,
                agent TEXT NOT NULL,
                status TEXT NOT NULL,
                depends_on_json TEXT NOT NULL,
                result_json TEXT,
                error TEXT,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (workflow_id, task_id)
            );
            CREATE TABLE IF NOT EXISTS employees (
                employee_id TEXT PRIMARY KEY,
                first_name TEXT NOT NULL,
                last_name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                profile_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS approvals (
                approval_id TEXT PRIMARY KEY,
                workflow_id TEXT NOT NULL,
                task_id TEXT NOT NULL,
                action TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                payload_fingerprint TEXT NOT NULL,
                status TEXT NOT NULL,
                requested_by TEXT NOT NULL,
                reviewed_by TEXT,
                comment TEXT,
                created_at TEXT NOT NULL,
                reviewed_at TEXT
            );
            CREATE TABLE IF NOT EXISTS red_flags (
                flag_id TEXT PRIMARY KEY,
                workflow_id TEXT NOT NULL,
                category TEXT NOT NULL,
                severity TEXT NOT NULL,
                description TEXT NOT NULL,
                evidence_json TEXT NOT NULL,
                detection_method TEXT NOT NULL,
                recommended_action TEXT NOT NULL,
                status TEXT NOT NULL,
                resolution_comment TEXT,
                resolved_by TEXT,
                resolved_at TEXT,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS verifications (
                verification_id TEXT PRIMARY KEY,
                workflow_id TEXT NOT NULL,
                verification_type TEXT NOT NULL,
                candidate_name TEXT NOT NULL,
                target_entity TEXT NOT NULL,
                status TEXT NOT NULL,
                details_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS salary_profiles (
                profile_id TEXT PRIMARY KEY,
                workflow_id TEXT NOT NULL,
                employee_email TEXT NOT NULL,
                structure_json TEXT NOT NULL,
                status TEXT NOT NULL,
                approved_by TEXT,
                approved_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS email_messages (
                message_id TEXT PRIMARY KEY,
                thread_id TEXT NOT NULL,
                workflow_id TEXT NOT NULL,
                direction TEXT NOT NULL,
                sender TEXT NOT NULL,
                recipient TEXT NOT NULL,
                subject TEXT NOT NULL,
                body TEXT NOT NULL,
                status TEXT NOT NULL,
                outcome TEXT,
                metadata_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS agent_messages (
                message_id TEXT PRIMARY KEY,
                workflow_id TEXT NOT NULL,
                sender_agent TEXT NOT NULL,
                recipient_agent TEXT NOT NULL,
                task_id TEXT,
                correlation_id TEXT NOT NULL,
                message_type TEXT NOT NULL,
                content TEXT NOT NULL,
                data_json TEXT NOT NULL,
                timestamp TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS recovery_records (
                recovery_id TEXT PRIMARY KEY,
                workflow_id TEXT NOT NULL,
                task_id TEXT NOT NULL,
                attempt INTEGER NOT NULL,
                max_retries INTEGER NOT NULL,
                error_type TEXT NOT NULL,
                error_message TEXT NOT NULL,
                action_taken TEXT NOT NULL,
                status TEXT NOT NULL,
                timestamp TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS audit_events (
                event_id TEXT PRIMARY KEY,
                workflow_id TEXT NOT NULL,
                task_id TEXT,
                timestamp TEXT NOT NULL,
                actor TEXT NOT NULL,
                event_type TEXT NOT NULL,
                status TEXT,
                input_json TEXT,
                output_json TEXT,
                error TEXT,
                previous_hash TEXT,
                hash TEXT
            );
        """)
        self.connection.commit()

    # --- Workflows & Tasks ---

    def create_workflow(self, goal: str, employee: dict[str, Any], plan: list[dict[str, Any]]) -> str:
        workflow_id = f"WF-{uuid4().hex[:10].upper()}"
        now = _now()
        self.connection.execute(
            "INSERT INTO workflows VALUES (?, ?, ?, ?, ?, ?, ?)",
            (workflow_id, "in_progress", goal, json.dumps(employee), json.dumps(plan), now, now)
        )
        for task in plan:
            self.connection.execute(
                "INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (workflow_id, task["task_id"], task["agent"], "pending", json.dumps(task.get("depends_on", [])), None, None, now)
            )
        self.connection.commit()
        self.audit(workflow_id, None, "workflow_service", "workflow_created", "in_progress", {"goal": goal}, {"plan_size": len(plan)})
        return workflow_id

    def workflow(self, workflow_id: str) -> dict[str, Any]:
        row = self.connection.execute("SELECT * FROM workflows WHERE workflow_id = ?", (workflow_id,)).fetchone()
        if not row:
            raise KeyError(f"Workflow {workflow_id} was not found")
        result = dict(row)
        result["employee"] = json.loads(result.pop("employee_json"))
        result["plan"] = json.loads(result.pop("plan_json"))
        result["tasks"] = self.tasks(workflow_id)
        return result

    def list_workflows(self, limit: int = 50) -> list[dict[str, Any]]:
        rows = self.connection.execute("SELECT * FROM workflows ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
        workflows = []
        for row in rows:
            w = dict(row)
            w["employee"] = json.loads(w.pop("employee_json"))
            w["plan"] = json.loads(w.pop("plan_json"))
            workflows.append(w)
        return workflows

    def tasks(self, workflow_id: str) -> list[dict[str, Any]]:
        rows = self.connection.execute("SELECT * FROM tasks WHERE workflow_id = ? ORDER BY rowid", (workflow_id,)).fetchall()
        return [{**dict(row), "depends_on": json.loads(row["depends_on_json"]), "result": json.loads(row["result_json"]) if row["result_json"] else None} for row in rows]

    def update_task(self, workflow_id: str, task_id: str, status: str, result: dict[str, Any] | None = None, error: str | None = None) -> None:
        self.connection.execute(
            "UPDATE tasks SET status=?, result_json=?, error=?, updated_at=? WHERE workflow_id=? AND task_id=?",
            (status, json.dumps(result) if result is not None else None, error, _now(), workflow_id, task_id)
        )
        self.connection.execute("UPDATE workflows SET updated_at=? WHERE workflow_id=?", (_now(), workflow_id))
        self.connection.commit()

    def update_workflow_status(self, workflow_id: str, status: str) -> None:
        self.connection.execute("UPDATE workflows SET status=?, updated_at=? WHERE workflow_id=?", (status, _now(), workflow_id))
        self.connection.commit()

    def update_workflow_plan(self, workflow_id: str, new_plan: list[dict[str, Any]]) -> None:
        now = _now()
        self.connection.execute(
            "UPDATE workflows SET plan_json=?, updated_at=? WHERE workflow_id=?",
            (json.dumps(new_plan), now, workflow_id)
        )
        existing_tasks = {t["task_id"] for t in self.tasks(workflow_id)}
        for task in new_plan:
            if task["task_id"] not in existing_tasks:
                self.connection.execute(
                    "INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (workflow_id, task["task_id"], task["agent"], "pending", json.dumps(task.get("depends_on", [])), None, None, now)
                )
        self.connection.commit()
        self.audit(workflow_id, None, "planner_agent", "plan_revised", "completed", {}, {"new_plan_size": len(new_plan)})

    # --- Employees ---

    def create_employee_record(self, employee_data: dict[str, Any]) -> dict[str, Any]:
        email = employee_data["email"].lower()
        row = self.connection.execute("SELECT * FROM employees WHERE email = ?", (email,)).fetchone()
        if row:
            raise ValueError(f"Employee with email {email} already exists")
        emp_id = employee_data.get("employee_id") or f"EMP-{uuid4().hex[:8].upper()}"
        first_name = employee_data.get("first_name", "")
        last_name = employee_data.get("last_name", "")
        now = _now()
        self.connection.execute(
            "INSERT INTO employees VALUES (?, ?, ?, ?, ?, ?, ?)",
            (emp_id, first_name, last_name, email, json.dumps(employee_data), now, now)
        )
        self.connection.commit()
        return self.get_employee_record(emp_id)

    def get_employee_record(self, employee_id_or_email: str) -> dict[str, Any]:
        row = self.connection.execute(
            "SELECT * FROM employees WHERE employee_id = ? OR email = ?",
            (employee_id_or_email, employee_id_or_email.lower())
        ).fetchone()
        if not row:
            raise KeyError(f"Employee {employee_id_or_email} not found")
        res = dict(row)
        res["profile"] = json.loads(res.pop("profile_json"))
        return res

    def list_employees(self) -> list[dict[str, Any]]:
        rows = self.connection.execute("SELECT * FROM employees ORDER BY created_at DESC").fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["profile"] = json.loads(d.pop("profile_json"))
            result.append(d)
        return result

    def update_employee_record(self, employee_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        emp = self.get_employee_record(employee_id)
        profile = {**emp["profile"], **updates}
        now = _now()
        first_name = updates.get("first_name", emp["first_name"])
        last_name = updates.get("last_name", emp["last_name"])
        self.connection.execute(
            "UPDATE employees SET first_name=?, last_name=?, profile_json=?, updated_at=? WHERE employee_id=?",
            (first_name, last_name, json.dumps(profile), now, employee_id)
        )
        self.connection.commit()
        return self.get_employee_record(employee_id)

    # --- Approvals ---

    def create_approval(self, workflow_id: str, task_id: str, action: str, payload: dict[str, Any], fingerprint: str, requested_by: str) -> str:
        approval_id = f"APR-{uuid4().hex[:10].upper()}"
        self.connection.execute(
            "INSERT INTO approvals VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (approval_id, workflow_id, task_id, action, json.dumps(payload), fingerprint, "pending", requested_by, None, None, _now(), None)
        )
        self.connection.commit()
        self.audit(workflow_id, task_id, requested_by, "approval_requested", "waiting_approval", payload, {"approval_id": approval_id})
        return approval_id

    def approval(self, approval_id: str) -> dict[str, Any]:
        row = self.connection.execute("SELECT * FROM approvals WHERE approval_id=?", (approval_id,)).fetchone()
        if not row:
            raise KeyError(f"Approval {approval_id} was not found")
        result = dict(row)
        result["payload"] = json.loads(result.pop("payload_json"))
        return result

    def list_approvals(self, workflow_id: str | None = None, status: str | None = None) -> list[dict[str, Any]]:
        query = "SELECT * FROM approvals WHERE 1=1"
        params: list[Any] = []
        if workflow_id:
            query += " AND workflow_id = ?"
            params.append(workflow_id)
        if status:
            query += " AND status = ?"
            params.append(status)
        query += " ORDER BY created_at DESC"
        rows = self.connection.execute(query, params).fetchall()
        return [{**dict(r), "payload": json.loads(r["payload_json"])} for r in rows]

    def decide_approval(self, approval_id: str, reviewer: str, decision: str, comment: str = "") -> dict[str, Any]:
        approval = self.approval(approval_id)
        if approval["status"] != "pending":
            raise ValueError("Approval has already been decided")
        now = _now()
        self.connection.execute(
            "UPDATE approvals SET status=?, reviewed_by=?, comment=?, reviewed_at=? WHERE approval_id=?",
            (decision, reviewer, comment, now, approval_id)
        )
        self.connection.commit()
        return self.approval(approval_id)

    # --- Red Flags ---

    def create_red_flag(
        self,
        workflow_id: str,
        category: str,
        severity: str,
        description: str,
        evidence: dict[str, Any],
        recommended_action: str,
        detection_method: str = "rule_based"
    ) -> str:
        flag_id = f"FLAG-{uuid4().hex[:10].upper()}"
        now = _now()
        self.connection.execute(
            "INSERT INTO red_flags VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (flag_id, workflow_id, category, severity, description, json.dumps(evidence), detection_method, recommended_action, "active", None, None, None, now)
        )
        self.connection.commit()
        self.audit(workflow_id, None, "red_flag_engine", "red_flag_detected", severity, evidence, {"flag_id": flag_id, "category": category, "description": description})
        return flag_id

    def red_flag(self, flag_id: str) -> dict[str, Any]:
        row = self.connection.execute("SELECT * FROM red_flags WHERE flag_id = ?", (flag_id,)).fetchone()
        if not row:
            raise KeyError(f"Red flag {flag_id} not found")
        res = dict(row)
        res["evidence"] = json.loads(res.pop("evidence_json"))
        return res

    def list_red_flags(self, workflow_id: str | None = None, status: str | None = None) -> list[dict[str, Any]]:
        query = "SELECT * FROM red_flags WHERE 1=1"
        params: list[Any] = []
        if workflow_id:
            query += " AND workflow_id = ?"
            params.append(workflow_id)
        if status:
            query += " AND status = ?"
            params.append(status)
        query += " ORDER BY created_at DESC"
        rows = self.connection.execute(query, params).fetchall()
        return [{**dict(r), "evidence": json.loads(r["evidence_json"])} for r in rows]

    def resolve_red_flag(self, flag_id: str, resolved_by: str, resolution_comment: str) -> dict[str, Any]:
        flag = self.red_flag(flag_id)
        if flag["status"] == "resolved":
            raise ValueError(f"Red flag {flag_id} is already resolved")
        now = _now()
        self.connection.execute(
            "UPDATE red_flags SET status='resolved', resolution_comment=?, resolved_by=?, resolved_at=? WHERE flag_id=?",
            (resolution_comment, resolved_by, now, flag_id)
        )
        self.connection.commit()
        self.audit(flag["workflow_id"], None, resolved_by, "red_flag_resolved", "resolved", {"flag_id": flag_id}, {"comment": resolution_comment})
        return self.red_flag(flag_id)

    # --- Verifications ---

    def save_verification(
        self,
        workflow_id: str,
        verification_type: str,
        candidate_name: str,
        target_entity: str,
        status: str,
        details: dict[str, Any],
        verification_id: str | None = None
    ) -> str:
        vid = verification_id or f"VER-{uuid4().hex[:10].upper()}"
        now = _now()
        self.connection.execute(
            """INSERT INTO verifications VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(verification_id) DO UPDATE SET
               status=excluded.status, details_json=excluded.details_json, updated_at=excluded.updated_at""",
            (vid, workflow_id, verification_type, candidate_name, target_entity, status, json.dumps(details), now, now)
        )
        self.connection.commit()
        return vid

    def verification(self, verification_id: str) -> dict[str, Any]:
        row = self.connection.execute("SELECT * FROM verifications WHERE verification_id = ?", (verification_id,)).fetchone()
        if not row:
            raise KeyError(f"Verification {verification_id} not found")
        res = dict(row)
        res["details"] = json.loads(res.pop("details_json"))
        return res

    def list_verifications(self, workflow_id: str | None = None, verification_type: str | None = None) -> list[dict[str, Any]]:
        query = "SELECT * FROM verifications WHERE 1=1"
        params: list[Any] = []
        if workflow_id:
            query += " AND workflow_id = ?"
            params.append(workflow_id)
        if verification_type:
            query += " AND verification_type = ?"
            params.append(verification_type)
        query += " ORDER BY created_at DESC"
        rows = self.connection.execute(query, params).fetchall()
        return [{**dict(r), "details": json.loads(r["details_json"])} for r in rows]

    # --- Salary Profiles ---

    def save_salary_profile(
        self,
        workflow_id: str,
        employee_email: str,
        structure: dict[str, Any],
        status: str = "pending_approval",
        approved_by: str | None = None
    ) -> str:
        pid = f"SAL-{uuid4().hex[:10].upper()}"
        now = _now()
        self.connection.execute(
            """INSERT INTO salary_profiles VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (pid, workflow_id, employee_email.lower(), json.dumps(structure), status, approved_by, now if approved_by else None, now, now)
        )
        self.connection.commit()
        return pid

    def salary_profile(self, profile_id_or_email: str) -> dict[str, Any]:
        row = self.connection.execute(
            "SELECT * FROM salary_profiles WHERE profile_id = ? OR employee_email = ? ORDER BY created_at DESC LIMIT 1",
            (profile_id_or_email, profile_id_or_email.lower())
        ).fetchone()
        if not row:
            raise KeyError(f"Salary profile {profile_id_or_email} not found")
        res = dict(row)
        res["structure"] = json.loads(res.pop("structure_json"))
        return res

    def update_salary_profile_status(self, profile_id: str, status: str, approved_by: str | None = None) -> dict[str, Any]:
        now = _now()
        self.connection.execute(
            "UPDATE salary_profiles SET status=?, approved_by=?, approved_at=?, updated_at=? WHERE profile_id=?",
            (status, approved_by, now if approved_by else None, now, profile_id)
        )
        self.connection.commit()
        return self.salary_profile(profile_id)

    # --- Email Operations ---

    def save_email_message(
        self,
        thread_id: str,
        workflow_id: str,
        direction: str,
        sender: str,
        recipient: str,
        subject: str,
        body: str,
        status: str = "sent",
        outcome: str | None = None,
        metadata: dict[str, Any] | None = None,
        message_id: str | None = None
    ) -> str:
        mid = message_id or f"EML-{uuid4().hex[:10].upper()}"
        now = _now()
        self.connection.execute(
            "INSERT INTO email_messages VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (mid, thread_id, workflow_id, direction, sender.lower(), recipient.lower(), subject, body, status, outcome, json.dumps(metadata or {}), now)
        )
        self.connection.commit()
        self.audit(workflow_id, None, "email_operations_agent", f"email_{direction}", status, {"recipient": recipient, "subject": subject}, {"message_id": mid, "outcome": outcome})
        return mid

    def email_message(self, message_id: str) -> dict[str, Any]:
        row = self.connection.execute("SELECT * FROM email_messages WHERE message_id = ?", (message_id,)).fetchone()
        if not row:
            raise KeyError(f"Email message {message_id} not found")
        res = dict(row)
        res["metadata"] = json.loads(res.pop("metadata_json"))
        return res

    def list_email_messages(self, workflow_id: str | None = None, direction: str | None = None) -> list[dict[str, Any]]:
        query = "SELECT * FROM email_messages WHERE 1=1"
        params: list[Any] = []
        if workflow_id:
            query += " AND workflow_id = ?"
            params.append(workflow_id)
        if direction:
            query += " AND direction = ?"
            params.append(direction)
        query += " ORDER BY created_at DESC"
        rows = self.connection.execute(query, params).fetchall()
        return [{**dict(r), "metadata": json.loads(r["metadata_json"])} for r in rows]

    def get_email_thread(self, thread_id: str) -> list[dict[str, Any]]:
        rows = self.connection.execute("SELECT * FROM email_messages WHERE thread_id = ? ORDER BY created_at ASC", (thread_id,)).fetchall()
        return [{**dict(r), "metadata": json.loads(r["metadata_json"])} for r in rows]

    def update_email_status(self, message_id: str, status: str, outcome: str | None = None) -> None:
        self.connection.execute("UPDATE email_messages SET status=?, outcome=? WHERE message_id=?", (status, outcome, message_id))
        self.connection.commit()

    # --- Agent Messages ---

    def save_agent_message(
        self,
        workflow_id: str,
        sender_agent: str,
        recipient_agent: str,
        task_id: str | None,
        correlation_id: str,
        message_type: str,
        content: str,
        data: dict[str, Any]
    ) -> str:
        mid = f"MSG-{uuid4().hex[:10].upper()}"
        now = _now()
        self.connection.execute(
            "INSERT INTO agent_messages VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (mid, workflow_id, sender_agent, recipient_agent, task_id, correlation_id, message_type, content, json.dumps(data), now)
        )
        self.connection.commit()
        return mid

    def list_agent_messages(self, workflow_id: str) -> list[dict[str, Any]]:
        rows = self.connection.execute("SELECT * FROM agent_messages WHERE workflow_id = ? ORDER BY timestamp ASC", (workflow_id,)).fetchall()
        return [{**dict(r), "data": json.loads(r["data_json"])} for r in rows]

    # --- Recovery Records ---

    def save_recovery_record(
        self,
        workflow_id: str,
        task_id: str,
        attempt: int,
        max_retries: int,
        error_type: str,
        error_message: str,
        action_taken: str,
        status: str = "in_progress"
    ) -> str:
        rid = f"REC-{uuid4().hex[:10].upper()}"
        now = _now()
        self.connection.execute(
            "INSERT INTO recovery_records VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (rid, workflow_id, task_id, attempt, max_retries, error_type, error_message, action_taken, status, now)
        )
        self.connection.commit()
        return rid

    def list_recovery_records(self, workflow_id: str | None = None) -> list[dict[str, Any]]:
        query = "SELECT * FROM recovery_records WHERE 1=1"
        params: list[Any] = []
        if workflow_id:
            query += " AND workflow_id = ?"
            params.append(workflow_id)
        query += " ORDER BY timestamp DESC"
        rows = self.connection.execute(query, params).fetchall()
        return [dict(r) for r in rows]

    # --- Tamper-Evident Hash-Chained Audit Trail ---

    def _last_audit_hash(self, workflow_id: str) -> str:
        row = self.connection.execute(
            "SELECT hash FROM audit_events WHERE workflow_id = ? ORDER BY timestamp DESC, rowid DESC LIMIT 1",
            (workflow_id,)
        ).fetchone()
        return row["hash"] if row and row["hash"] else "0" * 64

    def audit(
        self,
        workflow_id: str,
        task_id: str | None,
        actor: str,
        event_type: str,
        status: str | None = None,
        input_data: dict[str, Any] | None = None,
        output_data: dict[str, Any] | None = None,
        error: str | None = None
    ) -> str:
        event_id = f"EVT-{uuid4().hex[:12].upper()}"
        now = _now()
        input_json = json.dumps(input_data or {})
        output_json = json.dumps(output_data or {})
        prev_hash = self._last_audit_hash(workflow_id)
        payload = f"{event_id}|{workflow_id}|{task_id}|{now}|{actor}|{event_type}|{status}|{input_json}|{output_json}|{error}|{prev_hash}"
        cur_hash = sha256(payload.encode("utf-8")).hexdigest()

        self.connection.execute(
            "INSERT INTO audit_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (event_id, workflow_id, task_id, now, actor, event_type, status, input_json, output_json, error, prev_hash, cur_hash)
        )
        self.connection.commit()
        return event_id

    def audit_events(self, workflow_id: str) -> list[dict[str, Any]]:
        rows = self.connection.execute("SELECT * FROM audit_events WHERE workflow_id=? ORDER BY timestamp, rowid", (workflow_id,)).fetchall()
        return [{**dict(row), "input": json.loads(row["input_json"]), "output": json.loads(row["output_json"])} for row in rows]
