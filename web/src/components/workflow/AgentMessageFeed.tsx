import React, { useState } from 'react';
import { MessageSquare, ArrowRight, Clock, Filter } from 'lucide-react';

interface AgentMessageFeedProps {
  messages: any[];
}

export const AgentMessageFeed: React.FC<AgentMessageFeedProps> = ({ messages }) => {
  const [filterAgent, setFilterAgent] = useState<string>('all');
  const [expandedMessage, setExpandedMessage] = useState<string | null>(null);

  // Normalize messages
  const normalized = messages.map((m, idx) => {
    let payload = m.payload;
    if (!payload && typeof m.data_json === 'string') {
      try {
        payload = JSON.parse(m.data_json);
      } catch {
        payload = m.data_json;
      }
    }

    return {
      id: m.message_id || `msg-${idx}`,
      sender: m.sender_agent || m.sender || 'Agent',
      receiver: m.recipient_agent || m.receiver || 'Agent',
      type: m.message_type || 'communication',
      summary: m.content || m.summary || 'Transmitted operational payload',
      correlationId: m.correlation_id || null,
      timestamp: m.timestamp || new Date().toISOString(),
      payload,
    };
  });

  // Collect distinct agents
  const agentList = Array.from(
    new Set(normalized.flatMap((m) => [m.sender, m.receiver]).filter(Boolean))
  );

  const filteredMessages = normalized.filter((m) => {
    if (filterAgent === 'all') return true;
    return m.sender === filterAgent || m.receiver === filterAgent;
  });

  return (
    <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-4 flex flex-col h-[520px]">
      {/* Feed Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
        <div className="flex items-center space-x-2">
          <MessageSquare className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-semibold text-white">Agent Dialogue Stream</h3>
          <span className="text-xs bg-slate-800 text-indigo-300 font-mono px-2 py-0.5 rounded-full">
            {filteredMessages.length} events
          </span>
        </div>

        {/* Filter Dropdown */}
        {agentList.length > 0 && (
          <div className="flex items-center space-x-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={filterAgent}
              onChange={(e) => setFilterAgent(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 px-2 py-1 focus:outline-none focus:border-indigo-500 font-mono"
            >
              <option value="all">All Agents</option>
              {agentList.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
        {filteredMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
            <MessageSquare className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-xs">No agent-to-agent transmissions recorded yet.</p>
            <p className="text-[11px] text-slate-600 mt-1">
              Active agents communicate during task handoffs and verification events.
            </p>
          </div>
        ) : (
          filteredMessages.map((msg) => {
            const isExpanded = expandedMessage === msg.id;

            return (
              <div
                key={msg.id}
                onClick={() => setExpandedMessage(isExpanded ? null : msg.id)}
                className="p-3 bg-slate-950/80 hover:bg-slate-800/60 border border-slate-800/80 rounded-xl transition cursor-pointer"
              >
                {/* Sender -> Receiver Bar */}
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <div className="flex items-center space-x-1.5 font-mono">
                    <span className="text-indigo-400 font-semibold">{msg.sender}</span>
                    <ArrowRight className="w-3 h-3 text-slate-600" />
                    <span className="text-emerald-400 font-semibold">{msg.receiver}</span>
                  </div>
                  <span className="flex items-center space-x-1 text-[10px] text-slate-500 font-mono">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                  </span>
                </div>

                {/* Summary */}
                <p className="text-xs text-slate-300 leading-snug">{msg.summary}</p>

                {/* Footer Meta */}
                <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                  <span className="bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 text-slate-400">
                    {msg.type}
                  </span>
                  {msg.correlationId && (
                    <span className="truncate max-w-[140px]">
                      corr: {msg.correlationId}
                    </span>
                  )}
                </div>

                {/* Expanded Payload */}
                {isExpanded && msg.payload && (
                  <div className="mt-2.5 pt-2 border-t border-slate-800/80">
                    <span className="text-[10px] text-slate-400 block mb-1">Payload:</span>
                    <pre className="p-2 bg-slate-900 rounded font-mono text-[10px] text-slate-300 overflow-x-auto max-h-36">
                      {typeof msg.payload === 'object' ? JSON.stringify(msg.payload, null, 2) : msg.payload}
                    </pre>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
