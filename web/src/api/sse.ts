import { api } from './client';
import { WorkflowEvent } from '../types';

export type WorkflowEventListener = (event: WorkflowEvent) => void;

export class WorkflowStreamManager {
  private workflowId: string;
  private eventSource: EventSource | null = null;
  private listeners: Set<WorkflowEventListener> = new Set();
  private isClosed: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectTimer: number | null = null;

  constructor(workflowId: string) {
    this.workflowId = workflowId;
  }

  subscribe(listener: WorkflowEventListener): () => void {
    this.listeners.add(listener);
    if (!this.eventSource && !this.isClosed) {
      this.connect();
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.close();
      }
    };
  }

  private async getStreamTicket(): Promise<string> {
    try {
      const response = await api.post<{ ticket: string; expires_at: string }>(
        '/api/auth/stream-ticket',
        { workflow_id: this.workflowId }
      );
      return response.ticket;
    } catch (err) {
      console.error('Failed to obtain stream ticket for workflow:', this.workflowId, err);
      throw err;
    }
  }

  private async connect() {
    if (this.isClosed) return;

    try {
      const ticket = await this.getStreamTicket();
      const sseUrl = `/api/workflows/${encodeURIComponent(this.workflowId)}/events?ticket=${encodeURIComponent(ticket)}`;

      if (this.eventSource) {
        this.eventSource.close();
      }

      this.eventSource = new EventSource(sseUrl);

      this.eventSource.onopen = () => {
        this.reconnectAttempts = 0;
      };

      this.eventSource.onmessage = (e) => {
        try {
          if (!e.data || e.data.trim() === 'heartbeat') return;
          const parsed = JSON.parse(e.data);
          const wfEvent: WorkflowEvent = {
            event_id: parsed.event_id || `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            workflow_id: parsed.workflow_id || this.workflowId,
            timestamp: parsed.timestamp || new Date().toISOString(),
            event_type: parsed.event_type || 'message',
            source: parsed.source || 'system',
            data: parsed.data || parsed,
          };
          this.listeners.forEach((listener) => listener(wfEvent));
        } catch (err) {
          console.warn('Failed to parse SSE event message:', e.data, err);
        }
      };

      // Also listen on custom event types that the backend may emit
      const eventTypes = [
        'task_update',
        'task_started',
        'task_completed',
        'task_failed',
        'agent_message',
        'approval_needed',
        'red_flag',
        'workflow_status',
        'heartbeat',
      ];

      eventTypes.forEach((type) => {
        this.eventSource?.addEventListener(type, (e: any) => {
          if (type === 'heartbeat') return;
          try {
            const parsed = JSON.parse(e.data);
            const wfEvent: WorkflowEvent = {
              event_id: parsed.event_id || `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              workflow_id: parsed.workflow_id || this.workflowId,
              timestamp: parsed.timestamp || new Date().toISOString(),
              event_type: type,
              source: parsed.source || 'system',
              data: parsed.data || parsed,
            };
            this.listeners.forEach((listener) => listener(wfEvent));
          } catch (err) {
            console.warn(`Error handling SSE event ${type}:`, e.data, err);
          }
        });
      });

      this.eventSource.onerror = (err) => {
        if (this.eventSource?.readyState === EventSource.CLOSED) {
          console.warn('EventSource closed, attempting reconnection...');
        }
        this.scheduleReconnect();
      };
    } catch (err) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.isClosed) return;
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`Max SSE reconnect attempts reached for workflow ${this.workflowId}`);
      return;
    }

    const backoff = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 10000);
    this.reconnectAttempts++;

    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
    }
    this.reconnectTimer = window.setTimeout(() => {
      this.connect();
    }, backoff);
  }

  close() {
    this.isClosed = true;
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.listeners.clear();
  }
}
