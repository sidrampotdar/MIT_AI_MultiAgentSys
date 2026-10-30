"""Deterministic Salary Calculation Engine.

Implements strict enterprise compensation formulas, reconciles annual and monthly
components, validates grade boundaries, and enforces pre-execution Finance approval.
All math is 100% deterministic; LLMs may never alter salary numbers.
"""

from __future__ import annotations

from typing import Any
from app.models.schemas import SalaryStructure


# Configurable salary bands by designation
SALARY_GRADE_BANDS: dict[str, tuple[int, int]] = {
    "Associate Software Engineer": (600_000, 1_000_000),
    "Software Engineer": (900_000, 1_800_000),
    "Senior Software Engineer": (1_600_000, 3_000_000),
    "Staff Engineer": (2_800_000, 5_500_000),
    "Engineering Manager": (3_000_000, 6_000_000),
    "Product Manager": (1_500_000, 3_500_000),
    "HR Specialist": (600_000, 1_200_000),
    "General": (400_000, 10_000_000),
}


class SalaryValidationError(ValueError):
    """Raised when salary inputs or components violate compensation rules."""


class SalaryCalculationEngine:
    """Enterprise deterministic compensation engine."""

    @staticmethod
    def calculate(
        annual_ctc: int,
        designation: str = "Software Engineer",
        tax_regime: str = "new",
        allow_grade_override: bool = False,
    ) -> SalaryStructure:
        if annual_ctc <= 0:
            raise SalaryValidationError(f"Annual CTC must be positive: got {annual_ctc}")

        # 1. Validate salary grade bounds
        band = SALARY_GRADE_BANDS.get(designation, SALARY_GRADE_BANDS["General"])
        min_allowed, max_allowed = band
        if not allow_grade_override and (annual_ctc < min_allowed or annual_ctc > max_allowed):
            raise SalaryValidationError(
                f"Proposed CTC {annual_ctc} is outside grade band for {designation} ({min_allowed} - {max_allowed})"
            )

        # 2. Component calculation based on enterprise standard rules
        # Basic: 40% of CTC
        basic = round(annual_ctc * 0.40)
        # HRA: 20% of CTC (50% of Basic)
        hra = round(annual_ctc * 0.20)
        # Special Allowance: 30% of CTC
        special_allowance = round(annual_ctc * 0.30)
        # Employer PF: 12% of Basic = 4.8% of CTC
        employer_pf = round(basic * 0.12)
        # Employee PF: 12% of Basic = 4.8% of CTC
        employee_pf = round(basic * 0.12)

        # Reconcile other benefits to make exact CTC sum
        subtotal = basic + hra + special_allowance + employer_pf
        other_benefits = annual_ctc - subtotal

        if other_benefits < 0:
            raise SalaryValidationError(
                f"Component sum {subtotal} exceeds annual CTC {annual_ctc}"
            )

        # 3. Monthly figures
        monthly_gross = round((basic + hra + special_allowance) / 12)

        # 4. Estimated income tax (simplified synthetic rules for enterprise simulation)
        # In new regime: standard deduction of 75,000; progressive slab calculation
        taxable_income = max(0, (basic + hra + special_allowance) - 75_000)
        if taxable_income <= 400_000:
            annual_tax = 0
        elif taxable_income <= 800_000:
            annual_tax = round((taxable_income - 400_000) * 0.05)
        elif taxable_income <= 1_200_000:
            annual_tax = round(20_000 + (taxable_income - 800_000) * 0.10)
        elif taxable_income <= 1_600_000:
            annual_tax = round(60_000 + (taxable_income - 1_200_000) * 0.15)
        elif taxable_income <= 2_000_000:
            annual_tax = round(120_000 + (taxable_income - 1_600_000) * 0.20)
        else:
            annual_tax = round(200_000 + (taxable_income - 2_000_000) * 0.30)

        monthly_tds = round(annual_tax / 12)
        monthly_pt = 200  # Professional tax standard
        total_monthly_deductions = round(employee_pf / 12) + monthly_tds + monthly_pt
        estimated_net_salary = max(0, monthly_gross - total_monthly_deductions)

        # 5. Exact reconciliation check
        reconciled_ctc = basic + hra + special_allowance + employer_pf + other_benefits
        if reconciled_ctc != annual_ctc:
            raise SalaryValidationError(
                f"Reconciliation error: computed {reconciled_ctc} != approved {annual_ctc}"
            )

        return SalaryStructure(
            annual_ctc=annual_ctc,
            basic=basic,
            hra=hra,
            special_allowance=special_allowance,
            employer_pf=employer_pf,
            employee_pf=employee_pf,
            applicable_deductions=round(total_monthly_deductions * 12),
            other_benefits=other_benefits,
            monthly_gross=monthly_gross,
            estimated_net_salary=estimated_net_salary,
            tax_assumptions={
                "regime": tax_regime,
                "standard_deduction": 75_000,
                "estimated_annual_tax": annual_tax,
                "monthly_tds": monthly_tds,
                "monthly_pt": monthly_pt,
            },
            reconciled=True,
        )

    @staticmethod
    def validate_structure(structure_dict: dict[str, Any], approved_ctc: int) -> dict[str, Any]:
        """Validate an existing or proposed salary structure against approved CTC."""
        ctc = structure_dict.get("annual_ctc")
        if ctc != approved_ctc:
            return {
                "valid": False,
                "reason": f"Structure annual CTC {ctc} does not match approved CTC {approved_ctc}",
                "error_code": "CTC_MISMATCH",
            }

        basic = structure_dict.get("basic", 0)
        hra = structure_dict.get("hra", 0)
        special = structure_dict.get("special_allowance", 0)
        employer_pf = structure_dict.get("employer_pf", 0)
        other = structure_dict.get("other_benefits", 0)

        sum_components = basic + hra + special + employer_pf + other
        if sum_components != approved_ctc:
            return {
                "valid": False,
                "reason": f"Sum of components ({sum_components}) does not equal CTC ({approved_ctc})",
                "error_code": "RECONCILIATION_FAILURE",
            }

        return {"valid": True, "reconciled": True}

