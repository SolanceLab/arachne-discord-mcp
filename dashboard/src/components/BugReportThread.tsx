import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';

interface Message {
  id: string;
  report_id: string;
  sender_id: string;
  sender_name: string | null;
  is_operator: number;
  message: string;
  created_at: string;
}

interface BugReportThreadProps {
  reportId: string;
  isOpen: boolean;
}

export default function BugReportThread({ reportId, isOpen }: BugReportThreadProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);

  const fetchMessages = async () => {
    try {
      const data = await apiFetch<Message[]>(`/api/bug-reports/${reportId}/messages`);
      setMessages(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) fetchMessages();
  }, [isOpen, reportId]);

  const handleSend = async () => {
    if (!newMessage.trim() || sending) return;
    setSending(true);
    try {
      await apiFetch(`/api/bug-reports/${reportId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ message: newMessage.trim() }),
      });
      setNewMessage('');
      fetchMessages();
    } catch {
      // silent
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="mt-3 pt-3 border-t border-border/50">
      {/* Messages */}
      {loading ? (
        <p className="text-xs text-text-muted/50">Loading messages...</p>
      ) : messages.length === 0 ? (
        <p className="text-xs text-text-muted/40 mb-3">No messages yet. Start the conversation.</p>
      ) : (
        <div className="space-y-2 mb-3 max-h-60 overflow-y-auto">
          {messages.map(msg => (
            <div key={msg.id} className="flex gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-text-primary">
                    {msg.sender_name || 'Unknown'}
                  </span>
                  {msg.is_operator === 1 && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/15 text-accent border border-accent/30 font-medium">
                      Operator
                    </span>
                  )}
                  <span className="text-[10px] text-text-muted/40">
                    {new Date(msg.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-xs text-text-muted leading-relaxed mt-0.5">{msg.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2">
        <input
          value={newMessage}
          onChange={e => setNewMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          maxLength={2000}
          className="flex-1 bg-bg-deep border border-border rounded px-3 py-1.5 text-xs"
        />
        <button
          onClick={handleSend}
          disabled={!newMessage.trim() || sending}
          className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
        >
          {sending ? '...' : 'Send'}
        </button>
      </div>
    </div>
  );
}
