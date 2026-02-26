import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import BugReportThread from '../components/BugReportThread';

interface BugReport {
  id: string;
  reporter_id: string;
  reporter_name: string | null;
  entity_id: string | null;
  server_id: string | null;
  title: string;
  description: string;
  status: 'open' | 'resolved';
  created_at: string;
  resolved_at: string | null;
  unread_count: number;
}

const statusStyles = {
  open: 'bg-warning/15 text-warning border-warning/30',
  resolved: 'bg-success/15 text-success border-success/30',
};

export default function BugReports() {
  const { user } = useAuth();
  const [reports, setReports] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedReport, setExpandedReport] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [entityId, setEntityId] = useState('');
  const [serverId, setServerId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const fetchReports = async () => {
    try {
      const data = await apiFetch<BugReport[]>('/api/bug-reports');
      setReports(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) return;
    setSubmitting(true);
    try {
      await apiFetch('/api/bug-reports', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          entity_id: entityId || undefined,
          server_id: serverId || undefined,
        }),
      });
      setTitle('');
      setDescription('');
      setEntityId('');
      setServerId('');
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 3000);
      fetchReports();
    } catch {
      // silent
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h1 className="text-xl font-semibold text-text-primary mb-6">Bug Reports</h1>

      {/* Submit form */}
      <div className="bg-bg-card border border-border rounded-lg p-5 mb-8">
        <h2 className="text-sm font-medium text-text-primary mb-4">Submit a Report</h2>

        <label className="text-xs text-text-muted block mb-1.5">Title</label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Brief summary of the issue"
          maxLength={200}
          className="w-full bg-bg-deep border border-border rounded px-3 py-2 text-sm mb-4"
        />

        <label className="text-xs text-text-muted block mb-1.5">Description</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="What happened? Steps to reproduce, expected behavior, etc."
          rows={4}
          maxLength={2000}
          className="w-full bg-bg-deep border border-border rounded px-3 py-2 text-sm resize-none mb-4"
        />

        {user?.owned_entities && user.owned_entities.length > 0 && (
          <>
            <label className="text-xs text-text-muted block mb-1.5">Related Entity (optional)</label>
            <select
              value={entityId}
              onChange={e => setEntityId(e.target.value)}
              className="w-full bg-bg-deep border border-border rounded px-3 py-2 text-sm mb-4"
            >
              <option value="">None</option>
              {user.owned_entities.map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </>
        )}

        {user?.admin_servers && user.admin_servers.length > 0 && (
          <>
            <label className="text-xs text-text-muted block mb-1.5">Related Server (optional)</label>
            <select
              value={serverId}
              onChange={e => setServerId(e.target.value)}
              className="w-full bg-bg-deep border border-border rounded px-3 py-2 text-sm mb-4"
            >
              <option value="">None</option>
              {user.admin_servers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || !description.trim() || submitting}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Submitting...' : 'Submit Report'}
          </button>
          {submitted && (
            <span className="text-xs text-success">Report submitted. Thank you!</span>
          )}
        </div>
      </div>

      {/* My reports */}
      <h2 className="text-sm font-medium text-text-primary mb-4">
        My Reports {!loading && `(${reports.length})`}
      </h2>

      {loading ? (
        <p className="text-sm text-text-muted">Loading...</p>
      ) : reports.length === 0 ? (
        <p className="text-sm text-text-muted/60">No reports submitted yet.</p>
      ) : (
        <div className="space-y-3">
          {reports.map(report => (
            <div key={report.id} className="bg-bg-card border border-border rounded-lg p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border flex-shrink-0 capitalize ${statusStyles[report.status]}`}>
                      {report.status}
                    </span>
                    <h3 className="text-sm font-medium text-text-primary truncate">{report.title}</h3>
                  </div>
                  <p className="text-xs text-text-muted leading-relaxed mt-1">{report.description}</p>
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-text-muted/50">
                    <span>{new Date(report.created_at).toLocaleDateString()}</span>
                    {report.entity_id && <span>Entity: {user?.owned_entities.find(e => e.id === report.entity_id)?.name || report.entity_id.slice(0, 8)}</span>}
                    {report.server_id && <span>Server: {user?.admin_servers.find(s => s.id === report.server_id)?.name || report.server_id.slice(0, 8)}</span>}
                    {report.resolved_at && <span>Resolved: {new Date(report.resolved_at).toLocaleDateString()}</span>}
                  </div>
                </div>
                <div className="relative flex-shrink-0">
                  <button
                    onClick={() => {
                      const opening = expandedReport !== report.id;
                      setExpandedReport(opening ? report.id : null);
                      if (opening && report.unread_count > 0) {
                        setReports(prev => prev.map(r => r.id === report.id ? { ...r, unread_count: 0 } : r));
                      }
                    }}
                    className="px-3 py-1.5 text-xs bg-bg-surface hover:bg-border text-text-muted rounded transition-colors"
                  >
                    {expandedReport === report.id ? 'Close' : 'Discuss'}
                  </button>
                  {report.unread_count > 0 && expandedReport !== report.id && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500" />
                  )}
                </div>
              </div>
              <BugReportThread reportId={report.id} isOpen={expandedReport === report.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
