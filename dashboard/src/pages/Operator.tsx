import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import { Navigate } from 'react-router-dom';
import ApiKeyModal from '../components/ApiKeyModal';

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

export default function Operator() {
  const { user } = useAuth();
  const [entities, setEntities] = useState<FullEntity[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState<string | null>(null);

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

  const isOperator = user?.is_operator ?? false;
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!isOperator) return;
    Promise.all([
      apiFetch<FullEntity[]>('/api/operator/entities'),
      apiFetch<Server[]>('/api/operator/servers'),
    ]).then(([e, s]) => {
      setEntities(e);
      setServers(s);
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

  const handleDelete = async (entityId: string, entityName: string) => {
    if (!confirm(`Permanently delete ${entityName}? This cannot be undone.`)) return;
    await apiFetch(`/api/operator/entities/${entityId}`, { method: 'DELETE' });
    refresh();
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

  const handleAssignOwner = async (entityId: string) => {
    await apiFetch(`/api/operator/entities/${entityId}/owner`, {
      method: 'PATCH',
      body: JSON.stringify({ owner_id: ownerInput.trim() || null }),
    });
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
        <div className="flex flex-wrap gap-2">
          {servers.map(s => (
            <span key={s.id} className="px-2 py-1 bg-bg-card border border-border rounded text-xs text-text-muted">
              {s.name} ({s.member_count})
            </span>
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
                  Owner: {entity.owner_id || <span className="italic">unassigned</span>}
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
                  onClick={() => handleDelete(entity.id, entity.name)}
                  className="px-3 py-1.5 text-xs bg-bg-surface hover:bg-danger/20 text-danger rounded transition-colors"
                >
                  Delete
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
                  className="px-3 py-1.5 text-xs bg-accent hover:bg-accent-hover text-white rounded transition-colors"
                >
                  Save
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

      {apiKey && <ApiKeyModal apiKey={apiKey} onClose={() => setApiKey(null)} />}
    </div>
  );
}
