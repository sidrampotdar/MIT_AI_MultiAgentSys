import React, { useState } from 'react';
import { TaskStatus } from '../../types';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  Bot,
} from 'lucide-react';
import { api } from '../../api/client';

interface ExecutionPlanTreeProps {
  tasks: any[];
  onTaskUpdated?: () => void;
}

const statusConfig: Record<string, { label: string; bg: string; text: string; icon: any }> = {
  completed: { label: 'Completed', bg: 'bg-emerald-950/60 border-emerald-800/80', text: 'text-emerald-300', icon: CheckCircle2 },
  in_progress: { label: 'In Progress', bg: 'bg-indigo-950/60 border-indigo-800/80', text: 'text-indigo-300 animate-pulse', icon: Clock },
  pending: { label: 'Pending', bg: 'bg-slate-900 border-slate-800', text: 'text-slate-400', icon: Clock },
  failed: { label: 'Failed', bg: 'bg-rose-950/60 border-rose-800/80', text: 'text-rose-300', icon: AlertTriangle },
  blocked: { label: 'Blocked (HITL)', bg: 'bg-amber-950/60 border-amber-800/80', text: 'text-amber-300', icon: ShieldAlert },
  cancelled: { label: 'Cancelled', bg: 'bg-slate-950 border-slate-900', text: 'text-slate-500', icon: AlertTriangle },
  escalated: { label: 'Escalated', bg: 'bg-purple-950/60 border-purple-800/80', text: 'text-purple-300', icon: ShieldAlert },
};

export const ExecutionPlanTree: React.FC<ExecutionPlanTreeProps> = ({
  tasks,
  onTaskUpdated,
}) => {
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});
  const [retryingTask, setRetryingTask] = useState<string | null>(null);

  const toggleExpand = (taskId: string) => {
    setExpandedTasks((prev) => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  const handleRetry = async (taskId: string) => {
    setRetryingTask(taskId);
    try {
      await api.post(`/api/recovery/tasks/${encodeURIComponent(taskId)}/retry`);
      onTaskUpdated?.();
    } catch (err: any) {
      alert(`Retry failed: ${err.message || 'Unknown error'}`);
    } finally {
      setRetryingTask(null);
    }
  };

  if (tasks.length === 0) {
    return (
      <div className="p-8 text-center bg-slate-900/40 rounded-2xl border border-slate-800">
        <Clock className="w-8 h-8 text-slate-500 mx-auto mb-2" />
        <p className="text-sm font-medium text-slate-400">
          No tasks generated yet. Planner Agent is preparing execution plan...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tasks.map((task, index) => {
        const status = task.status || 'pending';
        const conf = statusConfig[status] || statusConfig.pending;
        const Icon = conf.icon;
        const isExpanded = !!expandedTasks[task.task_id];
        const agentName = task.assigned_agent || task.agent || 'Planner';
        
        let deps: string[] = [];
        if (Array.isArray(task.dependencies)) deps = task.dependencies;
        else if (Array.isArray(task.depends_on)) deps = task.depends_on;
        else if (typeof task.depends_on_json === 'string') {
          try {
            deps = JSON.parse(task.depends_on_json);
          } catch {
            deps = [];
          }
        }

        let outputData = task.result;
        if (!outputData && typeof task.result_json === 'string') {
          try {
            outputData = JSON.parse(task.result_json);
          } catch {
            outputData = task.result_json;
          }
        }

        return (
          <div
            key={task.task_id}
            className={`border rounded-xl transition-all duration-200 overflow-hidden ${conf.bg}`}
          >
            {/* Header Row */}
            <div
              onClick={() => toggleExpand(task.task_id)}
              className="p-3.5 flex items-center justify-between cursor-pointer select-none hover:bg-slate-800/30 transition"
            >
              <div className="flex items-center space-x-3 min-w-0">
                <button className="text-slate-500 hover:text-slate-300">
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </button>

                <div className="flex items-center space-x-2">
                  <span className="font-mono text-xs text-slate-400 font-semibold">
                    #{index + 1}
                  </span>
                  <Icon className={`w-4 h-4 ${conf.text}`} />
                </div>

                <div className="truncate">
                  <span className="text-sm font-semibold text-slate-200">
                    {task.description || task.action || task.task_id}
                  </span>
                  <div className="flex items-center space-x-2 text-xs text-slate-400 mt-0.5">
                    <span className="flex items-center space-x-1 font-mono text-[11px] text-indigo-400">
                      <Bot className="w-3 h-3" />
                      <span>{agentName}</span>
                    </span>
                    {deps.length > 0 && (
                      <span className="text-[11px] text-slate-500">
                        • Depends on: {deps.join(', ')}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Status and Action Buttons */}
              <div className="flex items-center space-x-2.5">
                {(task.retry_count > 0 || task.attempts > 1) && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                    {task.retry_count || task.attempts} retries
                  </span>
                )}

                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-medium border font-mono ${conf.text} ${conf.bg}`}
                >
                  {conf.label}
                </span>

                {status === 'failed' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRetry(task.task_id);
                    }}
                    disabled={retryingTask === task.task_id}
                    className="p-1.5 text-xs bg-rose-600 hover:bg-rose-500 text-white rounded-lg flex items-center space-x-1 transition disabled:opacity-50"
                    title="Retry this failed task"
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${retryingTask === task.task_id ? 'animate-spin' : ''}`} />
                    <span>Retry</span>
                  </button>
                )}
              </div>
            </div>

            {/* Expandable Task Detail */}
            {isExpanded && (
              <div className="px-4 pb-4 pt-1 border-t border-slate-800/60 bg-slate-950/50 space-y-2 text-xs">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 py-2">
                  <div>
                    <span className="text-slate-500">Task ID:</span>
                    <p className="font-mono text-slate-300 truncate">{task.task_id}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Priority:</span>
                    <p className="font-mono text-slate-300">{task.priority ?? 1}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Started:</span>
                    <p className="font-mono text-slate-300">
                      {task.started_at ? new Date(task.started_at).toLocaleTimeString() : '—'}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Completed:</span>
                    <p className="font-mono text-slate-300">
                      {task.completed_at ? new Date(task.completed_at).toLocaleTimeString() : '—'}
                    </p>
                  </div>
                </div>

                {task.error && (
                  <div className="p-2.5 bg-rose-950/40 border border-rose-900/60 rounded-lg text-rose-300">
                    <span className="font-bold">Error:</span> {task.error}
                  </div>
                )}

                {outputData && (
                  <div>
                    <span className="text-slate-500 block mb-1">Execution Output / Evidence:</span>
                    <pre className="p-2.5 bg-slate-900 rounded-lg font-mono text-[11px] text-slate-300 overflow-x-auto max-h-40 border border-slate-800">
                      {typeof outputData === 'object' ? JSON.stringify(outputData, null, 2) : outputData}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
