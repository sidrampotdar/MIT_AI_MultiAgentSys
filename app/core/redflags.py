"""Deterministic Red-Flag Detection and Enforcement Engine.

Identifies discrepancies in Education, Employment, Finance, Email, Access, and Compliance.
Flags are assigned severity levels (CRITICAL, HIGH, MEDIUM, LOW).
Critical flags deterministically halt the relevant workflow step until human resolution.
"""

from __future__ import annotations

import re
from typing import Any
from app.core.state import WorkflowStateStore
from app.models.enums import RedFlagCategory, RedFlagSeverity
from app.models.schemas import RedFlag


SUSPICIOUS_PATTERNS = [
    r"ignore\s+(all\s+)?(prior|previous)\s+instructions",
    r"bypass\s+(all\s+)?(security|approval|checks)",
    r"system\s*:\s*you\s+are",
    r"grant\s+(admin|root|superuser)\s+access",
    r"drop\s+table",
]


class RedFlagEngine:
    def __init__(self, state_store: WorkflowStateStore):
        self.state = state_store

    def evaluate_education(
        self,
        workflow_id: str,
        expected: dict[str, Any],
        received: dict[str, Any]
    ) -> RedFlag | None:
        """Check for discrepancies in educational verification."""
        # 1. Graduation year check
        exp_year = int(expected.get("graduation_year", 0))
        rec_year = int(received.get("graduation_year", 0)) if received.get("graduation_year") else None

        if rec_year and exp_year != rec_year:
            flag_id = self.state.create_red_flag(
                workflow_id=workflow_id,
                category=RedFlagCategory.EDUCATION.value,
                severity=RedFlagSeverity.HIGH.value,
                description=f"Graduation year mismatch: submitted {exp_year}, institution reported {rec_year}",
                evidence={"expected_year": exp_year, "received_year": rec_year, "institution": expected.get("institution")},
                recommended_action="Initiate HR investigation and request original degree certificate with university transcripts",
                detection_method="rule_based",
            )
            return RedFlag(**self.state.red_flag(flag_id))

        # 2. Degree or branch mismatch
        if "degree" in received and expected.get("degree") and received["degree"].lower() != expected["degree"].lower():
            flag_id = self.state.create_red_flag(
                workflow_id=workflow_id,
                category=RedFlagCategory.EDUCATION.value,
                severity=RedFlagSeverity.HIGH.value,
                description=f"Degree mismatch: submitted '{expected['degree']}', institution reported '{received['degree']}'",
                evidence={"expected": expected.get("degree"), "received": received.get("degree")},
                recommended_action="Request official degree verification letter from university registrar",
                detection_method="rule_based",
            )
            return RedFlag(**self.state.red_flag(flag_id))

        # 3. Candidate not found
        if received.get("outcome") in {"no_record_found", "not_found"}:
            flag_id = self.state.create_red_flag(
                workflow_id=workflow_id,
                category=RedFlagCategory.EDUCATION.value,
                severity=RedFlagSeverity.CRITICAL.value,
                description="Institution reports no matching enrollment or graduation record for candidate",
                evidence=received,
                recommended_action="Hold onboarding and request notarized candidate explanation",
                detection_method="rule_based",
            )
            return RedFlag(**self.state.red_flag(flag_id))

        return None

    def evaluate_employment(
        self,
        workflow_id: str,
        expected: dict[str, Any],
        received: dict[str, Any]
    ) -> RedFlag | None:
        """Check for previous employment discrepancies."""
        # 1. Date mismatch
        if received.get("outcome") == "date_mismatch":
            flag_id = self.state.create_red_flag(
                workflow_id=workflow_id,
                category=RedFlagCategory.EMPLOYMENT.value,
                severity=RedFlagSeverity.MEDIUM.value,
                description=f"Previous employment dates mismatch for {expected.get('previous_employer')}",
                evidence={"expected_dates": expected.get("employment_dates"), "received_dates": received.get("actual_dates")},
                recommended_action="Request relieving letter and experience certificate",
                detection_method="rule_based",
            )
            return RedFlag(**self.state.red_flag(flag_id))

        # 2. Employer reports not employed
        if received.get("outcome") == "not_confirmed":
            flag_id = self.state.create_red_flag(
                workflow_id=workflow_id,
                category=RedFlagCategory.EMPLOYMENT.value,
                severity=RedFlagSeverity.HIGH.value,
                description=f"Previous employer {expected.get('previous_employer')} could not confirm candidate tenure",
                evidence=received,
                recommended_action="Request tax filings (Form 16/ITR) and bank statements showing salary credit",
                detection_method="rule_based",
            )
            return RedFlag(**self.state.red_flag(flag_id))

        return None

    def evaluate_salary(
        self,
        workflow_id: str,
        approved_ctc: int,
        calculated_ctc: int,
        reconciliation_ok: bool
    ) -> RedFlag | None:
        """Check for salary or CTC discrepancies."""
        if not reconciliation_ok or approved_ctc != calculated_ctc:
            flag_id = self.state.create_red_flag(
                workflow_id=workflow_id,
                category=RedFlagCategory.FINANCE.value,
                severity=RedFlagSeverity.CRITICAL.value,
                description=f"Salary reconciliation failed: approved CTC {approved_ctc} != calculated CTC {calculated_ctc}",
                evidence={"approved_ctc": approved_ctc, "calculated_ctc": calculated_ctc, "reconciliation_ok": reconciliation_ok},
                recommended_action="Block payroll profile creation until Finance corrects compensation components",
                detection_method="rule_based",
            )
            return RedFlag(**self.state.red_flag(flag_id))
        return None

    def evaluate_email_content(
        self,
        workflow_id: str,
        sender: str,
        expected_domain: str | None,
        body: str
    ) -> RedFlag | None:
        """Scan incoming emails for unverified senders and prompt injection attempts."""
        # 1. Domain verification
        if expected_domain and not sender.lower().endswith(expected_domain.lower()):
            flag_id = self.state.create_red_flag(
                workflow_id=workflow_id,
                category=RedFlagCategory.EMAIL.value,
                severity=RedFlagSeverity.HIGH.value,
                description=f"Email received from unexpected domain: {sender} (expected ending in {expected_domain})",
                evidence={"sender": sender, "expected_domain": expected_domain},
                recommended_action="Quarantine email and verify sender identity through official institutional directory",
                detection_method="rule_based",
            )
            return RedFlag(**self.state.red_flag(flag_id))

        # 2. Prompt injection pattern detection
        for pat in SUSPICIOUS_PATTERNS:
            if re.search(pat, body, re.IGNORECASE):
                flag_id = self.state.create_red_flag(
                    workflow_id=workflow_id,
                    category=RedFlagCategory.EMAIL.value,
                    severity=RedFlagSeverity.CRITICAL.value,
                    description="Potential prompt injection or instruction override detected in incoming email body",
                    evidence={"sender": sender, "matched_pattern": pat, "sample": body[:120]},
                    recommended_action="Quarantine content immediately; treat solely as untrusted string, never execute as instruction",
                    detection_method="rule_based",
                )
                return RedFlag(**self.state.red_flag(flag_id))

        return None

    def evaluate_privileged_access(
        self,
        workflow_id: str,
        requested_role: str,
        employee_designation: str
    ) -> RedFlag | None:
        """Detect unauthorized or privileged access requests."""
        privileged_roles = {"admin", "production_admin", "security_officer", "super_admin", "root"}
        if requested_role.lower() in privileged_roles:
            flag_id = self.state.create_red_flag(
                workflow_id=workflow_id,
                category=RedFlagCategory.ACCESS.value,
                severity=RedFlagSeverity.HIGH.value,
                description=f"Privileged role '{requested_role}' requested for standard designation '{employee_designation}'",
                evidence={"requested_role": requested_role, "designation": employee_designation},
                recommended_action="Require mandatory InfoSec approval before any permission provisioning",
                detection_method="rule_based",
            )
            return RedFlag(**self.state.red_flag(flag_id))
        return None

    def has_critical_flags(self, workflow_id: str) -> bool:
        """Returns True if any active CRITICAL red flags are present for this workflow."""
        flags = self.state.list_red_flags(workflow_id=workflow_id, status="active")
        return any(f["severity"] == RedFlagSeverity.CRITICAL.value for f in flags)

