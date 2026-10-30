from typing import Any
from app.tools.base import ToolResponse
from app.tools.store import store


class CommunicationSimulator:
    """Communication and Email Notification Simulator."""

    @staticmethod
    def send_email(
        recipient: str,
        subject: str,
        body: str,
        template: str,
    ) -> ToolResponse:
        key = f"{recipient.lower()}:{template}"
        attempts = store.email_attempts.get(key, 0) + 1
        store.email_attempts[key] = attempts

        # First attempt fails deterministically if configured
        if (
            store.failures.email_fail_first_attempt
            and attempts == 1
        ):
            return ToolResponse(
                success=False,
                tool_name="communication",
                status="failed",
                message="Email provider temporarily unavailable",
                error_code="EMAIL_TEMPORARY_FAILURE",
                data={
                    "attempt": attempts,
                    "recipient": recipient,
                },
            )

        email_id = store.next_id("email")
        email_record = {
            "email_id": email_id,
            "recipient": recipient.lower(),
            "subject": subject,
            "body": body,
            "template": template,
            "attempt": attempts,
        }
        store.sent_emails.append(email_record)

        return ToolResponse(
            success=True,
            tool_name="communication",
            status="completed",
            message="Email sent successfully",
            data=email_record,
        )

    @staticmethod
    def send_welcome_email(recipient: str, employee_name: str) -> ToolResponse:
        return CommunicationSimulator.send_email(
            recipient=recipient,
            subject=f"Welcome to the company, {employee_name}!",
            body=f"Hi {employee_name},\nWelcome to the team! We are excited to have you on board.",
            template="welcome_email",
        )

    @staticmethod
    def notify_manager(
        manager_email: str,
        employee_name: str,
        employee_email: str,
    ) -> ToolResponse:
        return CommunicationSimulator.send_email(
            recipient=manager_email,
            subject=f"New Team Member Onboarding: {employee_name}",
            body=f"Hi,\n{employee_name} ({employee_email}) has started their onboarding process.",
            template="notify_manager",
        )

    @staticmethod
    def send_missing_documents_notice(
        recipient: str,
        missing_documents: list[str],
    ) -> ToolResponse:
        return CommunicationSimulator.send_email(
            recipient=recipient,
            subject="Action Required: Missing Onboarding Documents",
            body=f"Please upload the following missing documents to proceed: {', '.join(missing_documents)}",
            template="missing_documents",
        )

    @staticmethod
    def get_sent_emails(recipient: str | None = None) -> ToolResponse:
        if recipient:
            recipient_clean = recipient.lower()
            filtered = [
                e for e in store.sent_emails
                if e["recipient"] == recipient_clean
            ]
        else:
            filtered = list(store.sent_emails)

        return ToolResponse(
            success=True,
            tool_name="communication",
            status="completed",
            message=f"Retrieved {len(filtered)} sent emails",
            data={"emails": filtered, "count": len(filtered)},
        )
