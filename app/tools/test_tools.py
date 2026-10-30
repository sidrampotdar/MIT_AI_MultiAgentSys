from app.tools.store import store, FailureConfig
from app.tools.hris import HRISSimulator
from app.tools.documents import DocumentSimulator
from app.tools.background import BackgroundVerificationSimulator
from app.tools.identity import IdentitySimulator
from app.tools.equipment import EquipmentSimulator
from app.tools.compliance import ComplianceSimulator
from app.tools.communication import CommunicationSimulator


def test_all_tools():
    print("Testing all 7 enterprise simulators independently...")

    # Reset simulation environment to healthy state (no failures injected)
    store.reset(failures=FailureConfig())

    # 1. HRIS
    hris_create = HRISSimulator.create_employee({
        "first_name": "Bob",
        "last_name": "Smith",
        "email": "bob@company.com",
        "department": "Sales",
    })
    assert hris_create.success is True
    print("HRIS Create:", hris_create.model_dump())

    hris_status = HRISSimulator.update_employee_status("bob@company.com", "active")
    assert hris_status.success is True
    print("HRIS Status Update:", hris_status.model_dump())

    # 2. Documents
    docs_add = DocumentSimulator.add_synthetic_documents("bob@company.com")
    assert docs_add.success is True
    print("Documents Add:", docs_add.model_dump())

    docs_val = DocumentSimulator.validate_documents("bob@company.com")
    assert docs_val.success is True
    print("Documents Validate:", docs_val.model_dump())

    # 3. Background Verification
    bg_sub = BackgroundVerificationSimulator.submit_verification("bob@company.com")
    assert bg_sub.success is True
    assert bg_sub.status == "completed"
    print("Background Submit:", bg_sub.model_dump())

    # 4. Identity
    id_prov = IdentitySimulator.provision_account("bob@company.com")
    assert id_prov.success is True
    print("Identity Provision:", id_prov.model_dump())

    id_perm = IdentitySimulator.check_permissions("bob@company.com")
    assert id_perm.success is True
    print("Identity Permissions:", id_perm.model_dump())

    # 5. Equipment
    eq_avail = EquipmentSimulator.check_availability("laptop")
    assert eq_avail.success is True
    assert eq_avail.data["in_stock"] is True
    print("Equipment Availability:", eq_avail.model_dump())

    eq_req = EquipmentSimulator.request_equipment("bob@company.com", "laptop")
    assert eq_req.success is True
    print("Equipment Request:", eq_req.model_dump())

    # 6. Compliance
    comp_init = ComplianceSimulator.initialize_employee("bob@company.com")
    assert comp_init.success is True
    print("Compliance Init:", comp_init.model_dump())

    comp_stat = ComplianceSimulator.check_compliance_status("bob@company.com")
    assert comp_stat.success is True
    print("Compliance Status:", comp_stat.model_dump())

    # 7. Communication
    comm_email = CommunicationSimulator.send_welcome_email("bob@company.com", "Bob")
    assert comm_email.success is True
    print("Communication Welcome:", comm_email.model_dump())

    print("\nAll independent tool tests PASSED successfully!")


if __name__ == "__main__":
    test_all_tools()
