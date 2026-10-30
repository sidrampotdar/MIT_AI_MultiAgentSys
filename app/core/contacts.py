"""Approved external contact directory.

Verification emails may only be addressed to contacts listed here. The directory
is intentionally static configuration (simulated institutions and employers);
nothing is derived from candidate-supplied or inbound-email data.
"""

from __future__ import annotations

from typing import Any

INSTITUTIONS: dict[str, dict[str, str]] = {
    "ABC Engineering College": {"contact": "registrar@abc-engineering.edu.test", "domain": "abc-engineering.edu.test"},
    "XYZ Institute of Technology": {"contact": "verification@xyz-tech.edu.test", "domain": "xyz-tech.edu.test"},
}

EMPLOYERS: dict[str, dict[str, str]] = {
    "Tech Innovators Inc": {"contact": "hr-verify@tech-innovators.example.test", "domain": "tech-innovators.example.test"},
    "Globex Solutions": {"contact": "hr-verify@globex.example.test", "domain": "globex.example.test"},
}


def _lookup(directory: dict[str, dict[str, str]], name: str | None) -> dict[str, str] | None:
    if not name:
        return None
    wanted = name.strip().lower()
    for known, contact in directory.items():
        if known.lower() == wanted:
            return {"name": known, **contact}
    return None


def institution_contact(name: str | None) -> dict[str, str] | None:
    return _lookup(INSTITUTIONS, name)


def employer_contact(name: str | None) -> dict[str, str] | None:
    return _lookup(EMPLOYERS, name)


def directory() -> dict[str, Any]:
    return {
        "institutions": [{"name": n, "domain": c["domain"]} for n, c in INSTITUTIONS.items()],
        "employers": [{"name": n, "domain": c["domain"]} for n, c in EMPLOYERS.items()],
    }
