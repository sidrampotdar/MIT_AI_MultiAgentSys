import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { WorkflowStreamManager } from '../../api/sse';
import {
  WorkflowDetails,
  WorkflowTask,
  AgentMessage,
  AgentDescriptor,
  WorkflowStatus,
} from '../../types';
import { AgentGraphCanvas } from '../../components/3d/AgentGraphCanvas';
import { ExecutionPlanTree } from '../../components/workflow/ExecutionPlanTree';
import { AgentMessageFeed } from '../../components/workflow/AgentMessageFeed';
import { WorkflowControls } from '../../components/workflow/WorkflowControls';
import {
  Activity,
  Layers,
  AlertCircle,
  RefreshCw,
  User,
  Clock,
  ShieldCheck,
  CheckCircle,
  XCircle,
} from 'lucide-react';

export const WorkflowMonitorPage: React.FC = () => {
  const { workflowId: paramWorkflowId } = useParams<{ workflowId: string }>();
  const navigate = useNavigate();

  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(paramWorkflowId || null);
  const [workflowsList, setWorkflowsList] = useState<Array<{ workflow_id: string; status: WorkflowStatus; employee_name?: string }>>([]);
  const [workflow, setWorkflow] = useState<WorkflowDetails | null>(null);
  const [tasks, setTasks] = useState<WorkflowTask[]>([]);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [agents, setAgents] = useState<AgentDescriptor[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>('Planner Agent');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch available workflows
  const fetchWorkflows = useCallback(async () => {
    try {
      const data = await api.get<any[]>('/api/workflows');
      if (Array.isArray(data)) {
        const formatted = data.map((w) => ({
          workflow_id: w.workflow_id,
          status: w.status,
          employee_name: w.employee?.name || w.employee_id || 'Employee',
        }));
        setWorkflowsList(formatted);

        // If no active workflow is selected, pick the latest
        if (!activeWorkflowId && formatted.length > 0) {
          setActiveWorkflowId(formatted[0].workflow_id);
        }
      }
    } catch (err: any) {
      console.warn('Could not load workflows list:', err.message);
    }
  }, [activeWorkflowId]);

  // Fetch detailed data for selected workflow
  const fetchWorkflowData = useCallback(async (wid: string) => {
    setLoading(true);
    setError(null);
    try {
      // Parallel requests for details, tasks, messages, and agents
      const [wfDetails, taskList, msgList, agentList] = await Promise.allSettled([
        api.get<WorkflowDetails>(`/api/workflows/${encodeURIComponent(wid)}`),
        api.get<WorkflowTask[]>(`/api/workflows/${encodeURIComponent(wid)}/tasks`),
        api.get<AgentMessage[]>(`/api/workflows/${encodeURIComponent(wid)}/agent-messages`),
        api.get<AgentDescriptor[]>(`/api/workflows/${encodeURIComponent(wid)}/agents`),
      ]);

      if (wfDetails.status === 'fulfilled') {
        setWorkflow(wfDetails.value);
      } else {
        // Fallback placeholder if specific workflow endpoint returned 404
        setWorkflow({
          workflow_id: wid,
          employee: { name: 'Alice Chen', email: 'alice@example.com' },
          status: 'running',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          tasks: [],
        });
      }

      if (taskList.status === 'fulfilled' && Array.isArray(taskList.value)) {
        setTasks(taskList.value);
      }

      if (msgList.status === 'fulfilled' && Array.isArray(msgList.value)) {
        setMessages(msgList.value);
      }

      if (agentList.status === 'fulfilled' && Array.isArray(agentList.value)) {
        setAgents(agentList.value);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load workflow data');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initialize
  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  useEffect(() => {
    if (activeWorkflowId) {
      fetchWorkflowData(activeWorkflowId);
    }
  }, [activeWorkflowId, fetchWorkflowData]);

  // Connect live SSE updates
  useEffect(() => {
    if (!activeWorkflowId) return;

    const sse = new WorkflowStreamManager(activeWorkflowId);
    const unsubscribe = sse.subscribe((event) => {
      // Live event handlers
      if (event.event_type === 'task_update' || event.event_type.startsWith('task_')) {
        fetchWorkflowData(activeWorkflowId);
      } else if (event.event_type === 'agent_message') {
        const newMsg: AgentMessage = {
          message_id: event.event_id,
          workflow_id: activeWorkflowId,
          sender: event.data?.sender || 'Agent',
          receiver: event.data?.receiver || 'Planner',
          message_type: event.data?.message_type || 'communication',
          timestamp: event.timestamp,
          summary: event.data?.summary || JSON.stringify(event.data),
          payload: event.data,
        };
        setMessages((prev) => [newMsg, ...prev]);
      } else if (event.event_type === 'workflow_status') {
        if (event.data?.status) {
          setWorkflow((prev) => prev ? { ...prev, status: event.data.status } : null);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [activeWorkflowId, fetchWorkflowData]);

  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const pendingCount = tasks.filter((t) => t.status === 'pending').length;
  const inProgressCount = tasks.filter((t) => t.status === 'in_progress').length;
  const blockedCount = tasks.filter((t) => t.status === 'blocked').length;
  const failedCount = tasks.filter((t) => t.status === 'failed').length;
  const progressPercent = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Top Controls & Workflow Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/40 p-4 rounded-2xl border border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-950 border border-indigo-800 flex items-center justify-center text-indigo-400">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white flex items-center space-x-2">
              <span>Workflow Execution Monitor</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 font-mono border border-emerald-800/80">
                Live SSE
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Interactive Multi-Agent orchestration, deterministic tasks, and real-time dialogue.
            </p>
          </div>
        </div>

        {/* Workflow Switcher & Action Controls */}
        <div className="flex items-center space-x-3 flex-wrap gap-2">
          {workflowsList.length > 0 && (
            <select
              value={activeWorkflowId || ''}
              onChange={(e) => {
                setActiveWorkflowId(e.target.value);
                navigate(`/monitor/${encodeURIComponent(e.target.value)}`);
              }}
              className="bg-slate-950 border border-slate-700 text-xs text-slate-200 rounded-xl px-3 py-2 font-mono focus:outline-none focus:border-indigo-500"
            >
              {workflowsList.map((w) => (
                <option key={w.workflow_id} value={w.workflow_id}>
                  {w.employee_name} ({w.workflow_id.substring(0, 8)}) — {w.status}
                </option>
              ))}
            </select>
          )}

          {activeWorkflowId && workflow && (
            <WorkflowControls
              workflowId={activeWorkflowId}
              status={workflow.status}
              onStatusChange={() => fetchWorkflowData(activeWorkflowId)}
            />
          )}

          <button
            onClick={() => activeWorkflowId && fetchWorkflowData(activeWorkflowId)}
            className="p-2 text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 rounded-xl border border-slate-800 transition"
            title="Refresh state"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-950/60 border border-rose-800 rounded-xl flex items-center space-x-3 text-rose-300 text-xs">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Overview Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
          <span className="text-[11px] text-slate-400 block mb-0.5">Status</span>
          <span className="text-sm font-bold font-mono uppercase text-indigo-400">
            {workflow?.status || 'Active'}
          </span>
        </div>
        <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
          <span className="text-[11px] text-slate-400 block mb-0.5">Overall Progress</span>
          <div className="flex items-center space-x-2">
            <span className="text-sm font-bold font-mono text-emerald-400">{progressPercent}%</span>
            <div className="flex-1 bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>
        <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
          <span className="text-[11px] text-slate-400 block mb-0.5">Completed Tasks</span>
          <span className="text-sm font-bold font-mono text-emerald-400">{completedCount}</span>
        </div>
        <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
          <span className="text-[11px] text-slate-400 block mb-0.5">In Progress</span>
          <span className="text-sm font-bold font-mono text-indigo-300">{inProgressCount}</span>
        </div>
        <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
          <span className="text-[11px] text-slate-400 block mb-0.5">Blocked (HITL)</span>
          <span className="text-sm font-bold font-mono text-amber-400">{blockedCount}</span>
        </div>
        <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
          <span className="text-[11px] text-slate-400 block mb-0.5">Failed Tasks</span>
          <span className="text-sm font-bold font-mono text-rose-400">{failedCount}</span>
        </div>
      </div>

      {/* 3D Agent Network Visualization */}
      <AgentGraphCanvas
        agents={agents}
        selectedAgent={selectedAgent}
        onSelectAgent={(name) => setSelectedAgent(name)}
      />

      {/* Two Column Layout: Execution Plan & Agent Dialogue */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Execution Plan Tree */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              <span>Planner Execution Graph</span>
            </h3>
            <span className="text-xs text-slate-400 font-mono">
              {tasks.length} total tasks
            </span>
          </div>

          <ExecutionPlanTree
            tasks={tasks}
            onTaskUpdated={() => activeWorkflowId && fetchWorkflowData(activeWorkflowId)}
          />
        </div>

        {/* Right: Agent Message Feed */}
        <div className="lg:col-span-5">
          <AgentMessageFeed messages={messages} />
        </div>
      </div>
    </div>
  );
};
