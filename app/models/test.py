from uuid import uuid4

from app.models.schemas import (
    Employee,
    EmployeeProfile,
    OnboardingRequest,
    WorkflowStep,
    WorkflowPlan,
    WorkflowState,
)

from app.models.enums import AgentName, TaskStatus

# 1. Create employee
employee = Employee(
    first_name="Alice",
    last_name="Johnson",
    email="alice@company.com",
    phone="+919876543210",

    profile=EmployeeProfile(
        department="Engineering",
        designation="Software Engineer",
        employment_type="full_time",
        manager_name="John Smith",
        manager_email="john@company.com",
        location="Bangalore",
        joining_date="2026-11-15",
    ),
)


# 2. Create onboarding request
request = OnboardingRequest(
    employee=employee,
    requested_by="HR Manager",
    business_goal=(
        "Complete employee onboarding including document "
        "verification, HR registration, IT provisioning "
        "and manager notification."
    ),
)


# 3. Define workflow tasks
verify_documents = WorkflowStep(
    description="Verify employee identity documents",
    assigned_agent=AgentName.DOCUMENT,
    required_tools=["document_verification"],
)

create_hr = WorkflowStep(
    description="Create employee HR database record",
    assigned_agent=AgentName.HR,
    dependencies=[verify_documents.task_id],
    required_tools=["create_hr_record"],
)

provision_laptop = WorkflowStep(
    description="Create laptop provisioning request",
    assigned_agent=AgentName.IT,
    dependencies=[verify_documents.task_id],
    required_tools=["provision_laptop"],
)

configure_email = WorkflowStep(
    description="Create employee company email",
    assigned_agent=AgentName.IT,
    dependencies=[create_hr.task_id],
    required_tools=["create_email_account"],
)

notify_manager = WorkflowStep(
    description="Notify manager about new employee",
    assigned_agent=AgentName.NOTIFICATION,
    dependencies=[
        create_hr.task_id,
        provision_laptop.task_id,
        configure_email.task_id,
    ],
    required_tools=["send_email"],
)


# 4. Create workflow plan
plan = WorkflowPlan(
    objective="Complete Alice's employee onboarding",
    steps=[
        verify_documents,
        create_hr,
        provision_laptop,
        configure_email,
        notify_manager,
    ],
)


# 5. Initialize workflow state
state = WorkflowState(
    workflow_id=plan.workflow_id,
    employee_id=employee.employee_id,
    current_plan=plan,
    pending_steps=[step.task_id for step in plan.steps],
)


# 6. Display validated objects
print("\n========== ONBOARDING REQUEST ==========")
print(request.model_dump_json(indent=2))

print("\n========== WORKFLOW PLAN ==========")
print(plan.model_dump_json(indent=2))

print("\n========== WORKFLOW STATE ==========")
print(state.model_dump_json(indent=2))

