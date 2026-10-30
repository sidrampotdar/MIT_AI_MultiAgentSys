"""CLI interface over OnboardingService; no agent logic belongs here."""

from __future__ import annotations

import argparse
import json

from app.core.service import OnboardingService, default_employee


def _print(data: object) -> None:
    print(json.dumps(data, indent=2, default=str))


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="enterprise-ai", description="Enterprise Autonomous Onboarding & Verification System")
    parser.add_argument("--database", default="enterprise_onboarding.db")
    parser.add_argument("--provider", default="groq", choices=["offline", "groq", "gemini"])
    commands = parser.add_subparsers(dest="command", required=True)
    onboard = commands.add_parser("onboard", help="Start onboarding and execute until an approval is needed")
    onboard.add_argument("--name", default="Alice Chen")
    onboard.add_argument("--email", default="alice.chen@example.test")
    onboard.add_argument("--goal", default="Complete employee onboarding with controlled approvals.")
    onboard.add_argument("--auto-approve", action="store_true")
    onboard.add_argument("--laptop-unavailable", action="store_true", help="Demonstrate controlled equipment recovery")
    status = commands.add_parser("status", help="Show persisted workflow state"); status.add_argument("workflow_id")
    approve = commands.add_parser("approve", help="Approve a pending action"); approve.add_argument("approval_id"); approve.add_argument("--reviewer", default="Finance Manager")
    reject = commands.add_parser("reject", help="Reject a pending action"); reject.add_argument("approval_id"); reject.add_argument("--reviewer", default="Finance Manager"); reject.add_argument("--comment", default="")
    resume = commands.add_parser("resume", help="Continue a workflow"); resume.add_argument("workflow_id")
    audit = commands.add_parser("audit", help="Show append-only audit history"); audit.add_argument("workflow_id")
    commands.add_parser("agents", help="List specialized agents")
    args = parser.parse_args(argv)
    service = OnboardingService(args.database, args.provider)
    if args.command == "onboard":
        employee = default_employee(args.name, args.email)
        employee["laptop_available"] = not args.laptop_unavailable
        workflow_id = service.start(args.goal, employee)
        if args.auto_approve:
            while True:
                current = service.status(workflow_id)
                pending = [event for event in service.audit(workflow_id) if event["event_type"] == "approval_requested"]
                approvals = [service.state.approval(event["output"]["approval_id"]) for event in pending]
                waiting = [approval for approval in approvals if approval["status"] == "pending"]
                if not waiting:
                    break
                service.decide_approval(waiting[0]["approval_id"], "Demo Approver", "approved")
            _print(service.status(workflow_id))
        else:
            _print({"workflow_id": workflow_id, "state": service.status(workflow_id)["status"]})
    elif args.command == "status": _print(service.status(args.workflow_id))
    elif args.command == "approve": _print(service.decide_approval(args.approval_id, args.reviewer, "approved"))
    elif args.command == "reject": _print(service.decide_approval(args.approval_id, args.reviewer, "rejected", args.comment))
    elif args.command == "resume": _print(service.resume(args.workflow_id))
    elif args.command == "audit": _print(service.audit(args.workflow_id))
    else: _print(service.agents())
