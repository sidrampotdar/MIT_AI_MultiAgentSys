from app.tools.base import ToolResponse
from app.tools.store import store


class DocumentSimulator:
    """Document Management Simulator."""

    REQUIRED_DOCUMENTS = [
        "identity_proof",
        "address_proof",
        "education_certificate",
    ]

    @staticmethod
    def add_synthetic_documents(email: str) -> ToolResponse:
        documents = [
            "identity_proof",
            "address_proof",
            "education_certificate",
        ]
        if store.failures.missing_certificate:
            documents.remove("education_certificate")

        record = {
            "employee_email": email.lower(),
            "documents": documents,
        }
        store.documents[email.lower()] = record

        return ToolResponse(
            success=True,
            tool_name="documents",
            status="completed",
            message="Synthetic documents generated",
            data=record,
        )

    @staticmethod
    def validate_documents(email: str) -> ToolResponse:
        record = store.documents.get(email.lower())
        if not record:
            return ToolResponse(
                success=False,
                tool_name="documents",
                status="failed",
                message="No documents submitted for employee",
                error_code="DOCUMENTS_NOT_FOUND",
                data={"employee_email": email.lower()},
            )

        submitted = record.get("documents", [])
        missing = [doc for doc in DocumentSimulator.REQUIRED_DOCUMENTS if doc not in submitted]

        if missing:
            return ToolResponse(
                success=False,
                tool_name="documents",
                status="failed",
                message="Missing required documents",
                error_code="MISSING_DOCUMENTS",
                data={
                    "submitted_documents": submitted,
                    "missing_documents": missing,
                },
            )

        return ToolResponse(
            success=True,
            tool_name="documents",
            status="completed",
            message="All required documents verified successfully",
            data={
                "submitted_documents": submitted,
                "missing_documents": [],
                "verified": True,
            },
        )

    @staticmethod
    def upload_document(email: str, document_name: str) -> ToolResponse:
        record = store.documents.setdefault(
            email.lower(),
            {"employee_email": email.lower(), "documents": []},
        )
        if document_name not in record["documents"]:
            record["documents"].append(document_name)

        return ToolResponse(
            success=True,
            tool_name="documents",
            status="completed",
            message=f"Document '{document_name}' uploaded successfully",
            data=record,
        )

    @staticmethod
    def get_documents(email: str) -> ToolResponse:
        record = store.documents.get(email.lower())
        if not record:
            return ToolResponse(
                success=False,
                tool_name="documents",
                status="failed",
                message="No documents found for employee",
                error_code="DOCUMENTS_NOT_FOUND",
            )

        return ToolResponse(
            success=True,
            tool_name="documents",
            status="completed",
            message="Documents retrieved",
            data=record,
        )
