import React, { useState } from 'react';
import { WorkflowStatus } from '../../types';
import { Play, Pause, Ban, RefreshCw } from 'lucide-react';
import { api } from '../../api/client';

interface WorkflowControlsProps {
  workflowId: string;
  status: WorkflowStatus;
  onStatusChange?: () => void;
}

export const WorkflowControls: React.FC<WorkflowControlsProps> = ({
  workflowId,
  status,
  onStatusChange,
}) => {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const handleAction = async (action: 'pause' | 'resume' | 'cancel') => {
    setLoadingAction(action);
    try {
      if (action === 'pause') {
        await api.post(`/api/workflows/${encodeURIComponent(workflowId)}/pause`);
      } else if (action === 'resume') {
        await api.post(`/api/workflows/${encodeURIComponent(workflowId)}/resume`);
      } else if (action === 'cancel') {
        if (!confirm('Are you sure you want to cancel this onboarding workflow?')) {
          setLoadingAction(null);
          return;
        }
        await api.post(`/api/workflows/${encodeURIComponent(workflowId)}/cancel`);
      }
      onStatusChange?.();
    } catch (err: any) {
      alert(`Operation failed: ${err.message || 'Server error'}`);
    } finally {
      setLoadingAction(null);
    }
  };

  const isTerminal = ['completed', 'failed', 'cancelled'].includes(status);

  return (
    <div className="flex items-center space-x-2 bg-slate-900/80 p-1.5 rounded-xl border border-slate-800">
      {status === 'running' && (
        <button
          onClick={() => handleAction('pause')}
          disabled={loadingAction !== null}
          className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-600/40 rounded-lg transition disabled:opacity-50"
          title="Pause active agent execution"
        >
          {loadingAction === 'pause' ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Pause className="w-3.5 h-3.5" />
          )}
          <span>Pause Workflow</span>
        </button>
      )}

      {status === 'paused' && (
        <button
          onClick={() => handleAction('resume')}
          disabled={loadingAction !== null}
          className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-600/40 rounded-lg transition disabled:opacity-50"
          title="Resume agent execution"
        >
          {loadingAction === 'resume' ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5" />
          )}
          <span>Resume Workflow</span>
        </button>
      )}

      {!isTerminal && (
        <button
          onClick={() => handleAction('cancel')}
          disabled={loadingAction !== null}
          className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-900/60 rounded-lg transition disabled:opacity-50"
          title="Cancel workflow execution"
        >
          {loadingAction === 'cancel' ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Ban className="w-3.5 h-3.5" />
          )}
          <span>Cancel</span>
        </button>
      )}
    </div>
  );
};
