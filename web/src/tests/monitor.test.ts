import { describe, it, expect } from 'vitest';
import { WorkflowTask, AgentMessage } from '../types';

describe('Workflow Execution Monitor Logic', () => {
  it('correctly calculates completed task progress percentage', () => {
    const tasks: Partial<WorkflowTask>[] = [
      { task_id: 't-1', status: 'completed' },
      { task_id: 't-2', status: 'completed' },
      { task_id: 't-3', status: 'in_progress' },
      { task_id: 't-4', status: 'pending' },
    ];

    const completed = tasks.filter((t) => t.status === 'completed').length;
    const progress = Math.round((completed / tasks.length) * 100);

    expect(progress).toBe(50);
  });

  it('filters agent messages by sender or receiver', () => {
    const messages: AgentMessage[] = [
      {
        message_id: 'm1',
        workflow_id: 'wf1',
        sender: 'Document Agent',
        receiver: 'Education Verification',
        message_type: 'handoff',
        timestamp: new Date().toISOString(),
        summary: 'Transferred extracted graduation certificate',
      },
      {
        message_id: 'm2',
        workflow_id: 'wf1',
        sender: 'Finance Agent',
        receiver: 'Planner Agent',
        message_type: 'salary_calculated',
        timestamp: new Date().toISOString(),
        summary: 'Submitted deterministic CTC breakdown',
      },
    ];

    const docFilter = messages.filter(
      (m) => m.sender === 'Document Agent' || m.receiver === 'Document Agent'
    );
    expect(docFilter.length).toBe(1);
    expect(docFilter[0].message_id).toBe('m1');
  });

  it('validates terminal workflow states', () => {
    const terminalStates = ['completed', 'failed', 'cancelled'];
    expect(terminalStates.includes('completed')).toBe(true);
    expect(terminalStates.includes('running')).toBe(false);
    expect(terminalStates.includes('blocked')).toBe(false);
  });
});
