from dataclasses import dataclass, field
from typing import Any


@dataclass
class FailureConfig:
    # Document management
    missing_certificate: bool = False

    # Background verification
    background_status: str = "pass"

    # Identity management
    identity_api_failures: int = 0
    privileged_access_requires_approval: bool = True

    # Equipment
    laptop_out_of_stock: bool = False

    # Communication
    email_fail_first_attempt: bool = False


class EnterpriseStore:
    def __init__(self, failures: FailureConfig | None = None):
        self.failures = failures or FailureConfig()

        # Incremental ID counters
        self.id_counters: dict[str, int] = {
            "employee": 1000,
            "approval": 5000,
            "equipment": 3000,
            "bg": 2000,
            "account": 4000,
            "email": 6000,
        }

        # HRIS
        self.employees: dict[str, dict[str, Any]] = {}

        # Document management
        self.documents: dict[str, dict[str, Any]] = {}

        # Background verification
        self.background_checks: dict[str, dict[str, Any]] = {}

        # Identity management
        self.accounts: dict[str, dict[str, Any]] = {}
        self.approvals: dict[str, dict[str, Any]] = {}

        # Equipment
        self.inventory: dict[str, int] = {
            "laptop": 10,
            "monitor": 25,
            "keyboard": 30,
            "mouse": 30,
            "headset": 15,
        }
        self.equipment_orders: dict[str, dict[str, Any]] = {}

        # Compliance
        self.compliance_records: dict[str, dict[str, Any]] = {}

        # Communication
        self.email_attempts: dict[str, int] = {}
        self.sent_emails: list[dict[str, Any]] = []
        self.inbox: list[dict[str, Any]] = []

        # Shared workflow state. These records live alongside the simulated
        # enterprise applications so agents coordinate through observable state.
        self.workflows: dict[str, dict[str, Any]] = {}
        self.verifications: dict[str, dict[str, Any]] = {}
        self.salary_profiles: dict[str, dict[str, Any]] = {}
        self.approval_requests: dict[str, dict[str, Any]] = {}
        self.audit_events: list[dict[str, Any]] = []

    def next_id(self, prefix: str) -> str:
        current = self.id_counters.get(prefix, 1000) + 1
        self.id_counters[prefix] = current
        return f"{prefix.upper()}-{current}"

    def reset(self, failures: FailureConfig | None = None) -> None:
        """Reset the shared enterprise store to clean state."""
        self.__init__(failures=failures)


# Global shared instance for multi-agent enterprise tools
store = EnterpriseStore()
