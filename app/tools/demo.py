"""Human-readable command line demonstration of the enterprise workflow."""

from app.enterprise import run_demo


def main(scenario: str = "success") -> None:
    workflow = run_demo("discrepancy" if scenario == "discrepancy" else "success")
    snapshot = workflow.snapshot()
    print("\nENTERPRISE AUTONOMOUS ONBOARDING & VERIFICATION SYSTEM")
    print(f"Workflow: {workflow.workflow_id}  |  Status: {snapshot['workflow']['status']}")
    print("\nTASK STATUS")
    for name, task in snapshot["workflow"]["tasks"].items():
        print(f"- {name}: {task['status']} ({task['agent']})")
    print("\nAPPROVALS")
    for approval in snapshot["approvals"]:
        print(f"- {approval['action']}: {approval['status']} by {approval['reviewed_by']}")
    print("\nAUDIT TRAIL")
    for event in snapshot["audit_events"]:
        print(f"{event['timestamp']} | {event['actor']} | {event['event_type']} | {event['description']}")


if __name__ == "__main__":
    main()
