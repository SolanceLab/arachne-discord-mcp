import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import { Navigate } from 'react-router-dom';
import ApiKeyModal from '../components/ApiKeyModal';
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

interface EntityServer {
  server_id: string;
  channels: string[];
  tools: string[];
  role_id: string | null;
}

interface FullEntity {
  id: string;
  name: string;
  avatar_url: string | null;
  owner_id: string | null;
  owner_name: string | null;
  created_at: string;
  active: boolean;
  servers: EntityServer[];
}

interface Server {
  id: string;
  name: string;
  icon: string | null;
  member_count: number;
}

interface BannedServer {
  server_id: string;
  server_name: string | null;
  banned_at: string;
}

export default function Operator() {
  const { user } = useAuth();
  const [entities, setEntities] = useState<FullEntity[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
  const [bannedServers, setBannedServers] = useState<BannedServer[]>([]);
  const [bugReports, setBugReports] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState<string | null>(null);

  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [savingOwner, setSavingOwner] = useState(false);

  // Create entity form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAvatar, setNewAvatar] = useState('');
  const [newOwner, setNewOwner] = useState('');

  // Add to server form
  const [addingToServer, setAddingToServer] = useState<string | null>(null);
  const [addServerId, setAddServerId] = useState('');
  const [addChannels, setAddChannels] = useState('');
  const [addAnnounce, setAddAnnounce] = useState('');

  // Assign owner
  const [assigningOwner, setAssigningOwner] = useState<string | null>(null);
  const [ownerInput, setOwnerInput] = useState('');

  // Inline confirmations (click-twice, replaces browser confirm())
  const [deletingEntityId, setDeletingEntityId] = useState<string | null>(null);
  const [kickingServerId, setKickingServerId] = useState<string | null>(null);
  const [banningServerId, setBanningServerId] = useState<string | null>(null);

  const isOperator = user?.is_operator ?? false;
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!isOperator) return;
    Promise.all([
      apiFetch<FullEntity[]>('/api/operator/entities'),
      apiFetch<Server[]>('/api/operator/servers'),
      apiFetch<BannedServer[]>('/api/operator/banned-servers'),
      apiFetch<BugReport[]>('/api/bug-reports/all'),
    ]).then(([e, s, b, br]) => {
      setEntities(e);
      setServers(s);
      setBannedServers(b);
      setBugReports(br);
    }).finally(() => setLoading(false));
  }, [isOperator, refreshKey]);

  const refresh = () => setRefreshKey(k => k + 1);

  if (!isOperator) return <Navigate to="/entities" replace />;

  const serverName = (id: string) => servers.find(s => s.id === id)?.name || id;

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const data = await apiFetch<{ api_key: string }>('/api/operator/entities', {
      method: 'POST',
      body: JSON.stringify({
        name: newName.trim(),
        avatar_url: newAvatar.trim() || null,
        owner_id: newOwner.trim() || null,
      }),
    });
    setApiKey(data.api_key);
    setShowCreate(false);
    setNewName('');
    setNewAvatar('');
    setNewOwner('');
    refresh();
  };

  const handleDelete = async (entityId: string) => {
    if (deletingEntityId !== entityId) {
      setDeletingEntityId(entityId);
      return;
    }
    setDeletingEntityId(null);
    try {
      await apiFetch(`/api/operator/entities/${entityId}`, { method: 'DELETE' });
      refresh();
    } catch (err) {
      window.alert(`Failed to delete: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleAddServer = async (entityId: string) => {
    if (!addServerId) return;
    const channels = addChannels.split(',').map(c => c.trim()).filter(Boolean);
    await apiFetch(`/api/operator/entities/${entityId}/add-server`, {
      method: 'POST',
      body: JSON.stringify({
        server_id: addServerId,
        channels,
        tools: [],
        announce_channel: addAnnounce.trim() || null,
      }),
    });
    setAddingToServer(null);
    setAddServerId('');
    setAddChannels('');
    setAddAnnounce('');
    refresh();
  };

  const handleKickServer = async (serverId: string) => {
    if (kickingServerId !== serverId) {
      setKickingServerId(serverId);
      setBanningServerId(null);
      return;
    }
    setKickingServerId(null);
    try {
      await apiFetch(`/api/operator/servers/${serverId}`, { method: 'DELETE' });
      refresh();
    } catch (err) {
      window.alert(`Failed to remove: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleBanServer = async (serverId: string) => {
    if (banningServerId !== serverId) {
      setBanningServerId(serverId);
      setKickingServerId(null);
      return;
    }
    setBanningServerId(null);
    try {
      await apiFetch(`/api/operator/servers/${serverId}?ban=true`, { method: 'DELETE' });
      refresh();
    } catch (err) {
      window.alert(`Failed to blacklist: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleUnbanServer = async (serverId: string) => {
    await apiFetch(`/api/operator/servers/${serverId}/ban`, { method: 'DELETE' });
    refresh();
  };

  const handleBugReportStatus = async (reportId: string, status: 'open' | 'resolved') => {
    await apiFetch(`/api/bug-reports/${reportId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    refresh();
  };

  const handleAssignOwner = async (entityId: string) => {
    setSavingOwner(true);
    await apiFetch(`/api/operator/entities/${entityId}/owner`, {
      method: 'PATCH',
      body: JSON.stringify({ owner_id: ownerInput.trim() || null }),
    });
    setSavingOwner(false);
    setAssigningOwner(null);
    setOwnerInput('');
    refresh();
  };

  if (loading) return <div className="text-text-muted">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Operator Panel</h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm rounded transition-colors"
        >
          {showCreate ? 'Cancel' : 'Create Entity'}
        </button>
      </div>

      {/* Create entity form */}
      {showCreate && (
        <div className="bg-bg-card border border-border rounded-lg p-5 mb-6 space-y-3">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Entity name"
            className="w-full bg-bg-deep border border-border rounded px-3 py-2 text-sm"
          />
          <input
            value={newAvatar}
            onChange={e => setNewAvatar(e.target.value)}
            placeholder="Avatar URL (optional)"
            className="w-full bg-bg-deep border border-border rounded px-3 py-2 text-sm"
          />
          <input
            value={newOwner}
            onChange={e => setNewOwner(e.target.value)}
            placeholder="Owner Discord ID (optional)"
            className="w-full bg-bg-deep border border-border rounded px-3 py-2 text-sm"
          />
          <button
            onClick={handleCreate}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm rounded transition-colors"
          >
            Create
          </button>
        </div>
      )}

      {/* Servers summary */}
      <div className="mb-6">
        <h3 className="text-sm font-medium text-text-muted mb-2">
          Bot present in {servers.length} server{servers.length !== 1 ? 's' : ''}
        </h3>
        <div className="flex flex-wrap gap-3">
          {servers.map(s => (
            <div key={s.id} className="bg-bg-card border border-border rounded-lg px-4 py-3 min-w-[160px]">
              <div className="text-sm font-medium mb-1">{s.name}</div>
              <div className="text-xs text-text-muted mb-3">
                {entities.filter(e => e.servers.some(es => es.server_id === s.id)).length} entities
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleKickServer(s.id)}
                  className={`flex-1 px-3 py-1.5 text-xs border rounded transition-colors ${
                    kickingServerId === s.id
                      ? 'bg-warning text-white border-warning'
                      : 'bg-bg-surface hover:bg-warning/20 text-warning border-border'
                  }`}
                >
                  {kickingServerId === s.id ? 'Sure?' : 'Remove'}
                </button>
                <button
                  type="button"
                  onClick={() => handleBanServer(s.id)}
                  className={`flex-1 px-3 py-1.5 text-xs border rounded transition-colors ${
                    banningServerId === s.id
                      ? 'bg-danger text-white border-danger'
                      : 'bg-bg-surface hover:bg-danger/20 text-danger border-border'
                  }`}
                >
                  {banningServerId === s.id ? 'Sure?' : 'Blacklist'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Entities */}
      <div className="grid gap-4">
        {entities.map(entity => (
          <div key={entity.id} className="bg-bg-card border border-border rounded-lg p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  {entity.avatar_url && (
                    <img src={entity.avatar_url} alt="" className="w-6 h-6 rounded-full" />
                  )}
                  <h3 className="font-semibold">{entity.name}</h3>
                  {!entity.active && (
                    <span className="text-xs text-danger bg-danger/10 px-2 py-0.5 rounded">Inactive</span>
                  )}
                </div>
                <p className="text-xs text-text-muted mt-1">
                  ID: {entity.id}
                </p>
                <p className="text-xs text-text-muted">
                  Owner: {entity.owner_name ? `${entity.owner_name} (${entity.owner_id})` : entity.owner_id || <span className="italic">unassigned</span>}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setAssigningOwner(assigningOwner === entity.id ? null : entity.id);
                    setOwnerInput(entity.owner_id || '');
                  }}
                  className="px-3 py-1.5 text-xs bg-bg-surface hover:bg-border text-text-muted rounded transition-colors"
                >
                  Owner
                </button>
                <button
                  onClick={() => setAddingToServer(addingToServer === entity.id ? null : entity.id)}
                  className="px-3 py-1.5 text-xs bg-bg-surface hover:bg-border text-accent rounded transition-colors"
                >
                  + Server
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(entity.id)}
                  className={`px-3 py-1.5 text-xs rounded transition-colors ${
                    deletingEntityId === entity.id
                      ? 'bg-danger text-white hover:bg-danger/80'
                      : 'bg-bg-surface hover:bg-danger/20 text-danger'
                  }`}
                >
                  {deletingEntityId === entity.id ? 'Sure?' : 'Delete'}
                </button>
              </div>
            </div>

            {/* Assign owner inline */}
            {assigningOwner === entity.id && (
              <div className="flex gap-2 mb-3">
                <input
                  value={ownerInput}
                  onChange={e => setOwnerInput(e.target.value)}
                  placeholder="Discord user ID (blank to unassign)"
                  className="flex-1 bg-bg-deep border border-border rounded px-3 py-1.5 text-sm"
                />
                <button
                  onClick={() => handleAssignOwner(entity.id)}
                  disabled={savingOwner}
                  className="px-3 py-1.5 text-xs bg-accent hover:bg-accent-hover text-white rounded transition-colors disabled:opacity-40"
                >
                  {savingOwner ? 'Saving...' : 'Save'}
                </button>
              </div>
            )}

            {/* Add to server inline */}
            {addingToServer === entity.id && (
              <div className="space-y-2 mb-3 p-3 bg-bg-deep rounded border border-border">
                <select
                  value={addServerId}
                  onChange={e => setAddServerId(e.target.value)}
                  className="w-full bg-bg-surface border border-border rounded px-3 py-1.5 text-sm"
                >
                  <option value="">Select server...</option>
                  {servers
                    .filter(s => !entity.servers.some(es => es.server_id === s.id))
                    .map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))
                  }
                </select>
                <input
                  value={addChannels}
                  onChange={e => setAddChannels(e.target.value)}
                  placeholder="Channel IDs (comma-separated, or leave blank for all)"
                  className="w-full bg-bg-surface border border-border rounded px-3 py-1.5 text-sm"
                />
                <input
                  value={addAnnounce}
                  onChange={e => setAddAnnounce(e.target.value)}
                  placeholder="Announce channel ID (optional)"
                  className="w-full bg-bg-surface border border-border rounded px-3 py-1.5 text-sm"
                />
                <button
                  onClick={() => handleAddServer(entity.id)}
                  className="px-3 py-1.5 text-xs bg-accent hover:bg-accent-hover text-white rounded transition-colors"
                >
                  Add to Server
                </button>
              </div>
            )}

            {/* Servers */}
            {entity.servers.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {entity.servers.map(s => (
                  <span
                    key={s.server_id}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-bg-deep border border-border rounded text-xs"
                  >
                    <span className="text-text-muted">{serverName(s.server_id)}</span>
                    {s.role_id && <span className="w-1.5 h-1.5 rounded-full bg-success" title="Role active" />}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Banned servers */}
      {bannedServers.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-medium text-text-muted mb-2">
            Blacklisted servers ({bannedServers.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {bannedServers.map(b => (
              <span key={b.server_id} className="inline-flex items-center gap-1.5 px-2 py-1 bg-danger/10 border border-danger/20 rounded text-xs text-danger">
                {b.server_name ? `${b.server_name} (${b.server_id})` : b.server_id}
                <button
                  onClick={() => handleUnbanServer(b.server_id)}
                  className="text-danger/50 hover:text-text-primary transition-colors"
                  title="Unban"
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Bug reports */}
      <div className="mt-8">
        <h3 className="text-sm font-medium text-text-muted mb-3">
          Bug Reports ({bugReports.length})
          {bugReports.reduce((sum, r) => sum + r.unread_count, 0) > 0 && (
            <span className="ml-2 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-accent text-white text-[10px] font-bold px-1">
              {bugReports.reduce((sum, r) => sum + r.unread_count, 0)}
            </span>
          )}
        </h3>
        {bugReports.length === 0 ? (
          <p className="text-xs text-text-muted/50">No reports submitted.</p>
        ) : (
          <div className="space-y-2">
            {bugReports.map(report => (
              <div key={report.id} className="bg-bg-card border border-border rounded-lg p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border flex-shrink-0 capitalize ${
                        report.status === 'open'
                          ? 'bg-warning/15 text-warning border-warning/30'
                          : 'bg-success/15 text-success border-success/30'
                      }`}>
                        {report.status}
                      </span>
                      <h4 className="text-sm font-medium text-text-primary truncate">{report.title}</h4>
                    </div>
                    <p className="text-xs text-text-muted leading-relaxed mt-1">{report.description}</p>
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-text-muted/50">
                      <span>By: {report.reporter_name || report.reporter_id}</span>
                      <span>{new Date(report.created_at).toLocaleDateString()}</span>
                      {report.entity_id && (
                        <span>Entity: {entities.find(e => e.id === report.entity_id)?.name || report.entity_id.slice(0, 8)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <div className="relative">
                      <button
                        onClick={() => {
                          const opening = expandedReport !== report.id;
                          setExpandedReport(opening ? report.id : null);
                          if (opening && report.unread_count > 0) {
                            setBugReports(prev => prev.map(r => r.id === report.id ? { ...r, unread_count: 0 } : r));
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
                    <button
                      onClick={() => handleBugReportStatus(report.id, report.status === 'open' ? 'resolved' : 'open')}
                      className={`px-3 py-1.5 text-xs rounded transition-colors ${
                        report.status === 'open'
                          ? 'bg-bg-surface hover:bg-success/20 text-success border border-border'
                          : 'bg-bg-surface hover:bg-warning/20 text-warning border border-border'
                      }`}
                    >
                      {report.status === 'open' ? 'Resolve' : 'Reopen'}
                    </button>
                  </div>
                </div>
                <BugReportThread reportId={report.id} isOpen={expandedReport === report.id} />
              </div>
            ))}
          </div>
        )}
      </div>

      {apiKey && <ApiKeyModal apiKey={apiKey} onClose={() => setApiKey(null)} />}
    </div>
  );
}
