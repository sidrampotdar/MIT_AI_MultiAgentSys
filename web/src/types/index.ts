export type Role = 'admin' | 'hr' | 'finance' | 'it' | 'security' | 'compliance' | 'viewer';

export interface UserSession {
  username: string;
  role: Role;
  full_name: string;
  token?: string;
}

export interface DashboardSummary {
  workflows_active: number;
  pending_approvals: number;
  red_flags_critical: number;
  red_flags_high?: number;
  workflows_completed: number;
  workflows_total?: number;
  employees_total?: number;
  active_verifications?: number;
  failed_or_blocked_tasks?: number;
  recent_activity?: {
    workflow_id: string;
    timestamp: string;
    actor: string;
    event_type: string;
    status: string;
    task_id?: string;
  }[];
  agent_summary?: {
    agent: string;
    completed: number;
    active: number;
    failed: number;
    blocked: number;
  }[];
}

export interface EmployeeIntakeInput {
  name: string;
  email: string;
  phone: string;
  department: string;
  designation: string;
  reporting_manager: string;
  joining_date: string;
  annual_ctc: number;
  university: string;
  degree: string;
  branch: string;
  graduation_year: number;
  previous_employer: string;
  previous_designation: string;
  employment_dates: string;
  goal: string;
  simulate_documents: boolean;
}

export interface Approval {
  approval_id: string;
  workflow_id: string;
  task_id: string;
  action?: string;
  requested_action?: string;
  category?: string;
  risk?: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  requested_by?: string;
  requesting_agent?: string;
  required_roles?: string[];
  reviewed_by?: string;
  comment?: string;
  created_at?: string;
  requested_at?: string;
  reviewed_at?: string;
  payload?: Record<string, any>;
  payload_fingerprint?: string;
  parameters_version?: string;
  employee?: {
    name?: string;
    email?: string;
    department?: string;
    designation?: string;
  };
  description?: string;
  reason?: string;
  agent_recommendation?: string;
  parameters?: Record<string, any>;
  evidence?: Record<string, any>;
  tool?: string;
  audit_history?: any[];
}

export interface RedFlag {
  flag_id: string;
  workflow_id: string;
  task_id?: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'active' | 'resolved' | 'dismissed';
  summary?: string;
  description?: string;
  evidence?: any;
  remediation_hint?: string;
  resolved_by?: string;
  resolution_comment?: string;
  created_at: string;
  resolved_at?: string;
}

export interface VerificationCardData {
  workflow_id: string;
  kind: 'education' | 'employment';
  employee: {
    name?: string;
    email?: string;
  };
  claimed: Record<string, any>;
  task_status: string;
  status: string;
  verification_id?: string;
  details?: Record<string, any>;
  thread_id?: string;
  request_history?: EmailMessage[];
  response?: EmailMessage;
  extracted_fields?: Record<string, any>;
  discrepancies?: RedFlag[];
  human_review?: {
    approval_id: string;
    action: string;
    status: string;
    reviewed_by?: string;
  }[];
  evidence_basis?: string;
  documents?: any[];
}

export interface EmailMessage {
  message_id: string;
  thread_id: string;
  workflow_id: string;
  direction: 'inbound' | 'outbound';
  sender: string;
  recipient: string;
  subject: string;
  body: string;
  status: 'draft' | 'drafted' | 'waiting_approval' | 'approved' | 'sent' | 'delivered' | 'received' | 'quarantined' | 'rejected';
  outcome?: 'confirmed' | 'year_mismatch' | 'ambiguous' | 'prompt_injection' | string;
  created_at: string;
  metadata?: Record<string, any>;
}

export interface EmailThread {
  thread_id: string;
  workflow_id: string;
  subject: string;
  last_status: string;
  messages: EmailMessage[];
}

export interface SalaryStructure {
  annual_ctc: number;
  basic: number;
  hra: number;
  special_allowance: number;
  employer_pf: number;
  employee_pf: number;
  applicable_deductions?: number;
  other_benefits?: number;
  monthly_gross?: number;
  estimated_net_salary?: number;
  tax_assumptions?: Record<string, any>;
  reconciled?: boolean;
}

export interface MonthlyBreakdown {
  basic: number;
  hra: number;
  special_allowance: number;
  employer_pf: number;
  employee_pf: number;
  other_benefits?: number;
  annual_ctc: number;
}

export interface FinanceWorkflowView {
  workflow_id: string;
  employee: {
    name?: string;
    email?: string;
    department?: string;
    designation?: string;
    employee_id?: string | null;
  };
  approved_annual_ctc: number;
  structure: SalaryStructure;
  monthly: MonthlyBreakdown;
  validation: {
    ctc_reconciled: boolean;
    result?: Record<string, any>;
    missing_inputs?: string[];
    policy_violations?: string[];
    red_flags?: RedFlag[];
  };
  assumptions?: Record<string, any>;
  salary_version?: string;
  approved_salary_version?: string;
  approval_is_current: boolean;
  salary_calculation_status: string;
  finance_approval?: {
    approval_id: string;
    status: string;
    reviewed_by?: string;
    comment?: string;
  } | null;
  payroll: {
    status: string;
    profile_id?: string;
    approval?: {
      approval_id: string;
      status: string;
    } | null;
    created_at?: string | null;
    blocked_reason?: string | null;
  };
  salary_profile?: any;
  audit?: any[];
}

export interface FinanceOverviewRow {
  workflow_id: string;
  employee: {
    name?: string;
    first_name?: string;
    last_name?: string;
    email: string;
    department?: string;
    designation?: string;
  };
  approved_annual_ctc: number;
  salary_calculation_status: string;
  finance_approval_status: string;
  payroll_status: string;
  ctc_reconciled: boolean;
  salary_structure?: SalaryStructure;
}

export interface WorkflowTask {
  workflow_id: string;
  task_id: string;
  agent: string;
  status: string;
  depends_on: string[];
  result?: any;
  error?: string;
  updated_at: string;
}

export interface Workflow {
  workflow_id: string;
  status: string;
  goal: string;
  employee: Record<string, any>;
  plan: any[];
  tasks: WorkflowTask[];
  created_at: string;
  pending_approvals?: number;
  progress?: {
    total: number;
    completed: number;
    pending: number;
    failed: number;
    blocked: number;
    percent: number;
  };
}
