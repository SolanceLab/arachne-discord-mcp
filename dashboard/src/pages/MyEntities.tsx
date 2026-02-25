import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../lib/api';
import ApiKeyModal from '../components/ApiKeyModal';

interface EntityServer {
  server_id: string;
  server_name: string;
  channels: string[];
  tools: string[];
  watch_channels: string[];
  blocked_channels: string[];
  role_id: string | null;
}

interface Entity {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  accent_color: string | null;
  created_at: string;
  servers: EntityServer[];
}

interface AvailableServer {
  id: string;
  name: string;
  icon: string | null;
}

const DEFAULT_COLORS = ['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#ED4245', '#F47B67', '#E78BD4', '#9B59B6'];

export default function MyEntities() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editColor, setEditColor] = useState('');

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newColor, setNewColor] = useState(DEFAULT_COLORS[0]);
  const [newAvatarFile, setNewAvatarFile] = useState<File | null>(null);
  const createFileRef = useRef<HTMLInputElement>(null);

  // Server request
  const [requestingFor, setRequestingFor] = useState<string | null>(null);
  const [availableServers, setAvailableServers] = useState<AvailableServer[]>([]);
  const [loadingServers, setLoadingServers] = useState(false);

  // Server detail panel
  const [expandedEntity, setExpandedEntity] = useState<string | null>(null);
  const [serverEdits, setServerEdits] = useState<Record<string, { watch: string; blocked: string }>>({});

  const fetchEntities = async () => {
    try {
      const data = await apiFetch<Entity[]>('/api/entities');
      setEntities(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchEntities(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const data = await apiFetch<{ id: string; api_key: string }>('/api/entities', {
      method: 'POST',
      body: JSON.stringify({
        name: newName.trim(),
        description: newDesc.trim() || null,
        accent_color: newColor,
      }),
    });
    setApiKey(data.api_key);

    if (newAvatarFile) {
      await uploadAvatar(data.id, newAvatarFile);
    }

    setShowCreate(false);
    setNewName('');
    setNewDesc('');
    setNewColor(DEFAULT_COLORS[0]);
    setNewAvatarFile(null);
    fetchEntities();
  };

  const uploadAvatar = async (entityId: string, file: File) => {
    const formData = new FormData();
    formData.append('avatar', file);
    const token = localStorage.getItem('loom_token');
    await fetch(`${import.meta.env.VITE_API_URL || 'https://arachne-discord.fly.dev'}/api/entities/${entityId}/avatar`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });
  };

  const handleAvatarUpload = async (entityId: string, file: File) => {
    await uploadAvatar(entityId, file);
    fetchEntities();
  };

  const handleRegenKey = async (entityId: string) => {
    if (!confirm('Regenerate API key? The current key will stop working immediately.')) return;
    const data = await apiFetch<{ api_key: string }>(`/api/entities/${entityId}/regenerate-key`, {
      method: 'POST',
    });
    setApiKey(data.api_key);
  };

  const startEdit = (entity: Entity) => {
    setEditing(entity.id);
    setEditName(entity.name);
    setEditDesc(entity.description || '');
    setEditColor(entity.accent_color || DEFAULT_COLORS[0]);
  };

  const saveEdit = async (entityId: string) => {
    await apiFetch(`/api/entities/${entityId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: editName,
        description: editDesc || null,
        accent_color: editColor,
      }),
    });
    setEditing(null);
    fetchEntities();
  };

  const openServerRequest = async (entityId: string) => {
    setRequestingFor(entityId);
    setLoadingServers(true);
    try {
      const servers = await apiFetch<AvailableServer[]>('/api/servers/available');
      setAvailableServers(servers);
    } finally {
      setLoadingServers(false);
    }
  };

  const handleServerRequest = async (entityId: string, serverId: string) => {
    await apiFetch(`/api/entities/${entityId}/request-server`, {
      method: 'POST',
      body: JSON.stringify({ server_id: serverId }),
    });
    setRequestingFor(null);
    alert('Request sent! The server admin will review it.');
  };

  const toggleServers = (entityId: string, servers: EntityServer[]) => {
    if (expandedEntity === entityId) {
      setExpandedEntity(null);
      return;
    }
    setExpandedEntity(entityId);
    // Init edit state from current values
    const edits: Record<string, { watch: string; blocked: string }> = {};
    for (const s of servers) {
      edits[s.server_id] = {
        watch: s.watch_channels.join(', '),
        blocked: s.blocked_channels.join(', '),
      };
    }
    setServerEdits(edits);
  };

  const saveServerConfig = async (entityId: string, serverId: string) => {
    const edit = serverEdits[serverId];
    if (!edit) return;
    const watch = edit.watch.split(',').map(c => c.trim()).filter(Boolean);
    const blocked = edit.blocked.split(',').map(c => c.trim()).filter(Boolean);
    await apiFetch(`/api/entities/${entityId}/servers/${serverId}`, {
      method: 'PATCH',
      body: JSON.stringify({ watch_channels: watch, blocked_channels: blocked }),
    });
    fetchEntities();
  };

  if (loading) return <div className="text-text-muted">Loading entities...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">My Entities</h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm rounded transition-colors"
        >
          {showCreate ? 'Cancel' : 'Create Entity'}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-bg-card border border-border rounded-lg overflow-hidden mb-6">
          {/* Banner preview */}
          <div className="h-16 relative" style={{ backgroundColor: newColor }}>
            {/* Avatar upload */}
            <div className="absolute -bottom-6 left-5">
              <input
                ref={createFileRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                onChange={e => setNewAvatarFile(e.target.files?.[0] || null)}
                className="hidden"
              />
              <button
                onClick={() => createFileRef.current?.click()}
                className="w-16 h-16 rounded-full bg-bg-card border-4 border-bg-card flex items-center justify-center overflow-hidden hover:opacity-80 transition-opacity"
              >
                {newAvatarFile ? (
                  <img src={URL.createObjectURL(newAvatarFile)} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-text-muted text-xs">Avatar</span>
                )}
              </button>
            </div>
          </div>
          <div className="p-5 pt-8 space-y-3">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Entity name"
              className="w-full bg-bg-deep border border-border rounded px-3 py-2 text-sm"
              autoFocus
            />
            <textarea
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              placeholder="Description / bio (optional)"
              rows={2}
              className="w-full bg-bg-deep border border-border rounded px-3 py-2 text-sm resize-none"
            />
            <div>
              <label className="text-xs text-text-muted block mb-1.5">Banner color</label>
              <div className="flex gap-2">
                {DEFAULT_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setNewColor(c)}
                    className={`w-7 h-7 rounded-full transition-all ${newColor === c ? 'ring-2 ring-white ring-offset-2 ring-offset-bg-card' : 'hover:scale-110'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <input
                  type="color"
                  value={newColor}
                  onChange={e => setNewColor(e.target.value)}
                  className="w-7 h-7 rounded-full cursor-pointer border-0 bg-transparent"
                  title="Custom color"
                />
              </div>
            </div>
            <button
              onClick={handleCreate}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm rounded transition-colors"
            >
              Create
            </button>
          </div>
        </div>
      )}

      {entities.length === 0 && !showCreate ? (
        <div className="text-center py-12">
          <p className="text-text-muted">You don't have any entities yet.</p>
          <p className="text-sm text-text-muted mt-2">Create one to get started.</p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {entities.map(entity => (
            <div key={entity.id} className="bg-bg-card border border-border rounded-lg overflow-hidden">
              {editing === entity.id ? (
                /* Edit mode */
                <div>
                  <div className="h-16" style={{ backgroundColor: editColor }} />
                  <div className="p-5 space-y-3">
                    <input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="w-full bg-bg-deep border border-border rounded px-3 py-2 text-sm"
                      placeholder="Entity name"
                    />
                    <textarea
                      value={editDesc}
                      onChange={e => setEditDesc(e.target.value)}
                      className="w-full bg-bg-deep border border-border rounded px-3 py-2 text-sm resize-none"
                      placeholder="Description (optional)"
                      rows={2}
                    />
                    <div>
                      <label className="text-xs text-text-muted block mb-1.5">Banner color</label>
                      <div className="flex gap-2">
                        {DEFAULT_COLORS.map(c => (
                          <button
                            key={c}
                            onClick={() => setEditColor(c)}
                            className={`w-6 h-6 rounded-full transition-all ${editColor === c ? 'ring-2 ring-white ring-offset-2 ring-offset-bg-card' : 'hover:scale-110'}`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                        <input
                          type="color"
                          value={editColor}
                          onChange={e => setEditColor(e.target.value)}
                          className="w-6 h-6 rounded-full cursor-pointer border-0 bg-transparent"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveEdit(entity.id)}
                        className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-sm rounded transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        className="px-3 py-1.5 bg-bg-surface text-text-muted text-sm rounded hover:bg-border transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Profile card view */
                <div>
                  {/* Banner */}
                  <div
                    className="h-16 relative"
                    style={{ backgroundColor: entity.accent_color || '#5865F2' }}
                  >
                    {/* Avatar */}
                    <div className="absolute -bottom-8 left-4">
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/gif,image/webp"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) handleAvatarUpload(entity.id, file);
                          e.target.value = '';
                        }}
                        className="hidden"
                        id={`avatar-${entity.id}`}
                      />
                      <label htmlFor={`avatar-${entity.id}`} className="cursor-pointer block">
                        {entity.avatar_url ? (
                          <img
                            src={entity.avatar_url}
                            alt=""
                            className="w-16 h-16 rounded-full object-cover border-4 border-bg-card hover:brightness-75 transition-all"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-full bg-bg-deep border-4 border-bg-card flex items-center justify-center text-text-muted text-lg hover:bg-border transition-colors">
                            +
                          </div>
                        )}
                      </label>
                    </div>
                  </div>

                  {/* Actions (top right) */}
                  <div className="flex justify-end gap-1.5 px-3 pt-2">
                    <button
                      onClick={() => startEdit(entity)}
                      className="px-2.5 py-1 text-xs bg-bg-surface hover:bg-border text-text-muted rounded transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => openServerRequest(entity.id)}
                      className="px-2.5 py-1 text-xs bg-bg-surface hover:bg-border text-accent rounded transition-colors"
                    >
                      Join Server
                    </button>
                    <button
                      onClick={() => handleRegenKey(entity.id)}
                      className="px-2.5 py-1 text-xs bg-bg-surface hover:bg-border text-warning rounded transition-colors"
                    >
                      Regen Key
                    </button>
                  </div>

                  {/* Server request picker */}
                  {requestingFor === entity.id && (
                    <div className="mx-4 mt-2 p-3 bg-bg-deep border border-border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-medium">Request server access</p>
                        <button
                          onClick={() => setRequestingFor(null)}
                          className="text-xs text-text-muted hover:text-text-primary"
                        >
                          Cancel
                        </button>
                      </div>
                      {loadingServers ? (
                        <p className="text-xs text-text-muted">Loading servers...</p>
                      ) : (() => {
                        const entityServerIds = new Set(entity.servers.map(s => s.server_id));
                        const filtered = availableServers.filter(s => !entityServerIds.has(s.id));
                        return filtered.length === 0 ? (
                          <p className="text-xs text-text-muted">
                            {availableServers.length === 0
                              ? 'No servers available.'
                              : 'Already on all available servers.'}
                          </p>
                        ) : (
                          <div className="space-y-1.5 max-h-40 overflow-y-auto">
                            {filtered.map(server => (
                              <button
                                key={server.id}
                                onClick={() => handleServerRequest(entity.id, server.id)}
                                className="w-full text-left px-3 py-2 rounded bg-bg-card hover:bg-border text-sm transition-colors flex items-center gap-2"
                              >
                                <span className="truncate">{server.name}</span>
                              </button>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Profile info */}
                  <div className="px-4 pt-4 pb-4">
                    <h3 className="font-bold text-lg">{entity.name}</h3>
                    {entity.description && (
                      <p className="text-sm text-text-muted mt-1 leading-relaxed">{entity.description}</p>
                    )}
                    <div className="mt-3 pt-3 border-t border-border space-y-1">
                      <button
                        onClick={() => toggleServers(entity.id, entity.servers)}
                        className="text-xs text-text-muted hover:text-accent transition-colors flex items-center gap-1"
                      >
                        <span className={`inline-block transition-transform ${expandedEntity === entity.id ? 'rotate-90' : ''}`}>
                          &#9654;
                        </span>
                        {entity.servers.length} server{entity.servers.length !== 1 ? 's' : ''}
                      </button>
                      <p className="text-xs text-text-muted">
                        MCP: <code className="text-accent">/mcp/{entity.id}</code>
                      </p>
                    </div>

                    {/* Expanded server detail */}
                    {expandedEntity === entity.id && entity.servers.length > 0 && (
                      <div className="mt-3 space-y-3">
                        {entity.servers.map(server => (
                          <div key={server.server_id} className="bg-bg-deep border border-border rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-sm font-medium">{server.server_name}</p>
                              {server.role_id && (
                                <span className="text-xs text-accent">@mentionable</span>
                              )}
                            </div>
                            <p className="text-xs text-text-muted mb-2">
                              Whitelist: {server.channels.length === 0 ? 'All channels' : `${server.channels.length} channel${server.channels.length !== 1 ? 's' : ''}`}
                              {' · '}
                              {server.tools.length === 0 ? 'All tools' : `${server.tools.length} tool${server.tools.length !== 1 ? 's' : ''}`}
                            </p>
                            <div className="space-y-2">
                              <div>
                                <label className="text-xs text-text-muted block mb-1">
                                  Watch channels <span className="text-accent">(auto-respond)</span>
                                </label>
                                <input
                                  value={serverEdits[server.server_id]?.watch || ''}
                                  onChange={e => setServerEdits(prev => ({
                                    ...prev,
                                    [server.server_id]: { ...prev[server.server_id], watch: e.target.value },
                                  }))}
                                  placeholder="Channel IDs, comma-separated"
                                  className="w-full bg-bg-card border border-border rounded px-2.5 py-1.5 text-xs"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-text-muted block mb-1">
                                  Blocked channels <span className="text-danger">(no-respond)</span>
                                </label>
                                <input
                                  value={serverEdits[server.server_id]?.blocked || ''}
                                  onChange={e => setServerEdits(prev => ({
                                    ...prev,
                                    [server.server_id]: { ...prev[server.server_id], blocked: e.target.value },
                                  }))}
                                  placeholder="Channel IDs, comma-separated"
                                  className="w-full bg-bg-card border border-border rounded px-2.5 py-1.5 text-xs"
                                />
                              </div>
                              <button
                                onClick={() => saveServerConfig(entity.id, server.server_id)}
                                className="px-3 py-1 text-xs bg-accent hover:bg-accent-hover text-white rounded transition-colors"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {apiKey && <ApiKeyModal apiKey={apiKey} onClose={() => setApiKey(null)} />}
    </div>
  );
}
