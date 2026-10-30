export type Role = 'admin' | 'hr' | 'finance' | 'it' | 'security' | 'compliance' | 'viewer';

export type WorkflowStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'blocked'
  | 'failed'
  | 'cancelled';

export type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'cancelled';

export type AgentStatus = 'idle' | 'executing' | 'waiting' | 'blocked' | 'error';

export interface CurrentUser {
  username: string;
  role: Role;
  full_name: string;
}

export interface Employee {
  employee_id?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  email: string;
  personal_email?: string;
  phone?: string;
  department?: string;
  designation?: string;
  reporting_manager?: string;
  joining_date?: string;
  employment_type?: string;
  university_name?: string;
  degree?: string;
  branch?: string;
  graduation_year?: number;
  proposed_ctc?: number;
  previous_employer?: string;
  documents?: Array<{
    document_id: string;
    doc_type: string;
    filename: string;
    verified: boolean;
  }>;
}

export interface WorkflowTask {
  task_id: string;
  workflow_id: string;
  assigned_agent: string;
  action: string;
  description: string;
  dependencies: string[];
  priority: number;
  status: TaskStatus;
  retry_count: number;
  result?: Record<string, any> | null;
  error?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface AgentDescriptor {
  name: string;
  role: string;
  description: string;
  tools: string[];
  status: AgentStatus;
  current_task_id?: string | null;
  last_active?: string | null;
}

export interface AgentMessage {
  message_id: string;
  workflow_id: string;
  sender: string;
  receiver: string;
  message_type: string;
  task_id?: string | null;
  correlation_id?: string | null;
  timestamp: string;
  summary: string;
  processing_status?: 'sent' | 'received' | 'processed' | 'failed';
  payload?: Record<string, any>;
}

export interface WorkflowEvent {
  event_id: string;
  workflow_id: string;
  timestamp: string;
  event_type: string;
  source: string;
  data: Record<string, any>;
}

export interface ApprovalItem {
  approval_id: string;
  workflow_id: string;
  employee_id?: string;
  employee_name?: string;
  requested_action: string;
  requesting_agent: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  requested_at: string;
  status: 'pending' | 'approved' | 'rejected';
  action_summary: string;
  reason?: string;
  agent_recommendation?: string;
  action_parameters?: Record<string, any>;
  parameter_hash?: string;
  decided_by?: string | null;
  decided_at?: string | null;
  decision_reason?: string | null;
}

export interface RedFlagItem {
  flag_id: string;
  workflow_id: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  evidence: Record<string, any>;
  created_at: string;
  resolved: boolean;
  resolved_by?: string | null;
  resolved_at?: string | null;
  resolution_note?: string | null;
}

export interface WorkflowDetails {
  workflow_id: string;
  employee: Employee;
  objective?: string;
  status: WorkflowStatus;
  created_at: string;
  updated_at: string;
  progress_percent?: number;
  completed_tasks?: number;
  total_tasks?: number;
  tasks: WorkflowTask[];
  active_agents?: AgentDescriptor[];
  red_flags?: RedFlagItem[];
}

export interface DashboardSummary {
  total_employees: number;
  active_workflows: number;
  completed_workflows: number;
  pending_approvals: number;
  active_verifications: number;
  critical_red_flags: number;
  failed_tasks: number;
  recent_activities: Array<{
    timestamp: string;
    message: string;
    type: string;
    workflow_id?: string;
  }>;
  agent_summaries: Array<{
    agent_name: string;
    status: AgentStatus;
    active_count: number;
  }>;
}
