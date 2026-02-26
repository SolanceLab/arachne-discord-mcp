import { useState, useEffect, useRef } from 'react';
import { apiFetch, clearToken } from '../lib/api';
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
  platform: string | null;
  owner_name: string | null;
  triggers: string[];
  notify_on_mention: boolean;
  notify_on_trigger: boolean;
  created_at: string;
  servers: EntityServer[];
}

const PLATFORMS = [
  { value: 'claude', label: 'Claude', color: '#D97757' },
  { value: 'gpt', label: 'GPT', color: '#10A37F' },
  { value: 'gemini', label: 'Gemini', color: '#4285F4' },
  { value: 'other', label: 'Other', color: '#6B7280' },
];

interface AvailableServer {
  id: string;
  name: string;
  icon: string | null;
}

export default function MyEntities() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editPlatform, setEditPlatform] = useState('');
  const [editTriggers, setEditTriggers] = useState('');
  const [editNotifyMention, setEditNotifyMention] = useState(false);
  const [editNotifyTrigger, setEditNotifyTrigger] = useState(false);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPlatform, setNewPlatform] = useState('');
  const [newAvatarFile, setNewAvatarFile] = useState<File | null>(null);
  const createFileRef = useRef<HTMLInputElement>(null);

  // Avatar upload
  const [uploadingAvatar, setUploadingAvatar] = useState<string | null>(null);

  // Server request
  const [requestingFor, setRequestingFor] = useState<string | null>(null);
  const [availableServers, setAvailableServers] = useState<AvailableServer[]>([]);
  const [loadingServers, setLoadingServers] = useState(false);

  // Connect panel
  const [connectingFor, setConnectingFor] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Server detail panel
  const [expandedEntity, setExpandedEntity] = useState<string | null>(null);
  const [serverEdits, setServerEdits] = useState<Record<string, { watch: string; blocked: string }>>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [savedServer, setSavedServer] = useState<string | null>(null);

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
        platform: newPlatform || null,
      }),
    });
    setApiKey(data.api_key);

    if (newAvatarFile) {
      try {
        await uploadAvatar(data.id, newAvatarFile);
      } catch {
        // Entity created but avatar failed — user can retry from the card
      }
    }

    setShowCreate(false);
    setNewName('');
    setNewDesc('');
    setNewPlatform('');
    setNewAvatarFile(null);
    fetchEntities();
  };

  const uploadAvatar = async (entityId: string, file: File) => {
    const formData = new FormData();
    formData.append('avatar', file);
    const token = localStorage.getItem('loom_token');
    const resp = await fetch(`${import.meta.env.VITE_API_URL || 'https://arachne-discord.fly.dev'}/api/entities/${entityId}/avatar`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error || `Upload failed (${resp.status})`);
    }
  };

  const handleAvatarUpload = async (entityId: string, file: File) => {
    setUploadingAvatar(entityId);
    try {
      await uploadAvatar(entityId, file);
      fetchEntities();
    } catch (err) {
      alert(`Avatar upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setUploadingAvatar(null);
    }
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
    setEditPlatform(entity.platform || '');
    setEditTriggers((entity.triggers || []).join(', '));
    setEditNotifyMention(entity.notify_on_mention ?? false);
    setEditNotifyTrigger(entity.notify_on_trigger ?? false);
  };

  const saveEdit = async (entityId: string) => {
    setSavingEdit(true);
    const triggers = editTriggers.split(',').map(t => t.trim()).filter(Boolean);
    await apiFetch(`/api/entities/${entityId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: editName,
        description: editDesc || null,
        platform: editPlatform || null,
        triggers,
        notify_on_mention: editNotifyMention,
        notify_on_trigger: editNotifyTrigger,
      }),
    });
    setSavingEdit(false);
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

  const handleRefreshLogin = async () => {
    const { url } = await apiFetch<{ url: string }>('/api/auth/discord-url');
    clearToken();
    window.location.href = url;
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
    setSavedServer(serverId + '-saving');
    const watch = edit.watch.split(',').map(c => c.trim()).filter(Boolean);
    const blocked = edit.blocked.split(',').map(c => c.trim()).filter(Boolean);
    await apiFetch(`/api/entities/${entityId}/servers/${serverId}`, {
      method: 'PATCH',
      body: JSON.stringify({ watch_channels: watch, blocked_channels: blocked }),
    });
    setSavedServer(serverId);
    setTimeout(() => setSavedServer(null), 2000);
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
          <div className="h-16 relative bg-cover bg-center" style={{ backgroundImage: 'url(/assets/banner.png)' }}>
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
              <label className="text-xs text-text-muted block mb-1.5">Platform</label>
              <div className="flex gap-2">
                {PLATFORMS.map(p => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setNewPlatform(newPlatform === p.value ? '' : p.value)}
                    className={`px-3 py-1.5 text-xs rounded transition-all ${
                      newPlatform === p.value
                        ? 'ring-2 ring-white/50 font-medium'
                        : 'opacity-50 hover:opacity-80'
                    }`}
                    style={{ backgroundColor: p.color, color: 'white' }}
                  >
                    {p.label}
                  </button>
                ))}
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
                  <div className="h-16 bg-cover bg-center" style={{ backgroundImage: 'url(/assets/banner.png)' }} />
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
                      <label className="text-xs text-text-muted block mb-1.5">Platform</label>
                      <div className="flex gap-2">
                        {PLATFORMS.map(p => (
                          <button
                            key={p.value}
                            type="button"
                            onClick={() => setEditPlatform(editPlatform === p.value ? '' : p.value)}
                            className={`px-2.5 py-1 text-xs rounded transition-all ${
                              editPlatform === p.value
                                ? 'ring-2 ring-white/50 font-medium'
                                : 'opacity-50 hover:opacity-80'
                            }`}
                            style={{ backgroundColor: p.color, color: 'white' }}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Triggers & Notifications */}
                    <div className="border-t border-border pt-3 space-y-3">
                      <div>
                        <label className="text-xs text-text-muted block mb-1">Trigger Words</label>
                        <input
                          value={editTriggers}
                          onChange={e => setEditTriggers(e.target.value)}
                          placeholder="keyword1, keyword2, keyword3"
                          className="w-full bg-bg-deep border border-border rounded px-3 py-2 text-sm"
                        />
                        <p className="text-[10px] text-text-muted mt-1">(comma-separated keywords that flag messages for this entity)</p>
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editNotifyMention}
                            onChange={e => setEditNotifyMention(e.target.checked)}
                            className="w-3.5 h-3.5 rounded border-border accent-accent"
                          />
                          <span className="text-xs text-text-muted">Notify on @mention</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editNotifyTrigger}
                            onChange={e => setEditNotifyTrigger(e.target.checked)}
                            className="w-3.5 h-3.5 rounded border-border accent-accent"
                          />
                          <span className="text-xs text-text-muted">Notify on trigger word</span>
                        </label>
                        <p className="text-[10px] text-text-muted">Arachne will DM you when your entity is mentioned or triggered</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveEdit(entity.id)}
                        disabled={savingEdit}
                        className="px-3 py-1.5 bg-accent hover:bg-accent-hover disabled:opacity-40 text-white text-sm rounded transition-colors"
                      >
                        {savingEdit ? 'Saving...' : 'Save'}
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
                    className="h-16 relative bg-cover bg-center"
                    style={{ backgroundImage: 'url(/assets/banner.png)' }}
                  >
                    {/* Avatar */}
                    <div className="absolute -bottom-8 left-4 z-10">
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
                        {uploadingAvatar === entity.id ? (
                          <div className="w-16 h-16 rounded-full bg-bg-deep border-4 border-bg-card flex items-center justify-center">
                            <div className="w-5 h-5 border-2 border-text-muted border-t-transparent rounded-full animate-spin" />
                          </div>
                        ) : entity.avatar_url ? (
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
                      onClick={() => setConnectingFor(connectingFor === entity.id ? null : entity.id)}
                      className={`px-2.5 py-1 text-xs rounded transition-colors ${connectingFor === entity.id ? 'bg-accent text-white' : 'bg-bg-surface hover:bg-border text-accent'}`}
                    >
                      Connect
                    </button>
                    <button
                      onClick={() => openServerRequest(entity.id)}
                      className="px-2.5 py-1 text-xs bg-bg-surface hover:bg-border text-text-muted rounded transition-colors"
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
                      <p className="mt-2 text-[11px] text-text-muted">
                        Don't see your server?{' '}
                        <button
                          onClick={handleRefreshLogin}
                          className="underline hover:text-accent transition-colors"
                        >
                          Refresh &amp; re-login
                        </button>
                      </p>
                    </div>
                  )}

                  {/* Connect modal is rendered at bottom of page */}

                  {/* Profile info */}
                  <div className="px-4 pt-4 pb-4">
                    <h3 className="font-bold text-lg">{entity.name}</h3>
                    {(entity.platform || entity.owner_name) && (
                      <div className="flex items-center gap-2 mt-1">
                        {entity.platform && (
                          <span
                            className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                            style={{
                              backgroundColor: PLATFORMS.find(p => p.value === entity.platform)?.color || '#6B7280',
                              color: 'white',
                            }}
                          >
                            {entity.platform.charAt(0).toUpperCase() + entity.platform.slice(1)}
                          </span>
                        )}
                        {entity.owner_name && (
                          <span className="text-xs text-text-muted">
                            partnered with <span className="text-text-primary">@{entity.owner_name}</span>
                          </span>
                        )}
                      </div>
                    )}
                    {entity.description && (
                      <p className="text-sm text-text-muted mt-1 leading-relaxed">{entity.description}</p>
                    )}
                    {((entity.triggers && entity.triggers.length > 0) || entity.notify_on_mention || entity.notify_on_trigger) && (
                      <div className="mt-3 pt-3 border-t border-border space-y-1.5">
                        {entity.triggers && entity.triggers.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {entity.triggers.map((t, i) => (
                              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-bg-deep border border-border text-text-muted">
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-3">
                          {entity.notify_on_mention && (
                            <span className="text-[10px] text-accent">DM on @mention</span>
                          )}
                          {entity.notify_on_trigger && (
                            <span className="text-[10px] text-accent">DM on trigger</span>
                          )}
                        </div>
                      </div>
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
                                disabled={savedServer === server.server_id + '-saving'}
                                className={`px-3 py-1 text-xs rounded transition-colors ${
                                  savedServer === server.server_id
                                    ? 'bg-success/20 text-success border border-success/30'
                                    : 'bg-accent hover:bg-accent-hover text-white disabled:opacity-40'
                                }`}
                              >
                                {savedServer === server.server_id + '-saving' ? 'Saving...' : savedServer === server.server_id ? 'Saved' : 'Save'}
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

      {/* Connect modal */}
      {connectingFor && (() => {
        const entity = entities.find(e => e.id === connectingFor);
        if (!entity) return null;
        const mcpUrl = `${import.meta.env.VITE_API_URL || 'https://arachne-discord.fly.dev'}/mcp/${entity.id}`;
        const serverName = entity.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setConnectingFor(null)}>
            <div className="bg-bg-surface border border-border rounded-xl max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-bg-surface rounded-t-xl">
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">Connect your AI</h3>
                  <p className="text-xs text-text-muted mt-0.5">{entity.name}</p>
                </div>
                <button
                  onClick={() => setConnectingFor(null)}
                  className="text-text-muted hover:text-text-primary text-lg leading-none"
                >
                  &times;
                </button>
              </div>

              <div className="px-5 py-4 space-y-5">
                {/* Claude Desktop / Claude Code */}
                <div>
                  <label className="text-xs uppercase tracking-wider text-text-muted font-medium block mb-1.5">Claude Desktop / Claude Code</label>
                  <ol className="text-xs text-text-muted space-y-1.5 list-decimal list-inside mb-3">
                    <li>Open your config file:
                      <ul className="ml-5 mt-1 space-y-0.5 list-disc list-inside text-[11px]">
                        <li><span className="text-text-primary">macOS:</span> <code className="text-accent">~/Library/Application Support/Claude/claude_desktop_config.json</code></li>
                        <li><span className="text-text-primary">Windows:</span> <code className="text-accent">%APPDATA%\Claude\claude_desktop_config.json</code></li>
                        <li><span className="text-text-primary">Linux:</span> <code className="text-accent">~/.config/Claude/claude_desktop_config.json</code></li>
                      </ul>
                    </li>
                    <li>Add this block inside <code className="text-accent">"mcpServers"</code>:</li>
                  </ol>
                  <div className="relative">
                    <pre className="text-[11px] text-text-primary bg-bg-deep px-3 py-2.5 rounded border border-border overflow-x-auto whitespace-pre">{`"${serverName}": {
  "url": "${mcpUrl}",
  "headers": {
    "Authorization": "Bearer YOUR_API_KEY"
  }
}`}</pre>
                    <button
                      onClick={() => copyToClipboard(JSON.stringify({
                        [serverName]: {
                          url: mcpUrl,
                          headers: { Authorization: 'Bearer YOUR_API_KEY' },
                        },
                      }, null, 2).slice(2, -2).trim(), `config-${entity.id}`)}
                      className={`absolute top-1.5 right-1.5 px-2 py-0.5 text-[10px] border border-border rounded transition-colors ${copiedField === `config-${entity.id}` ? 'bg-success/20 text-success border-success/30' : 'bg-bg-surface hover:bg-border'}`}
                    >
                      {copiedField === `config-${entity.id}` ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-[10px] text-text-muted mt-1.5">
                    Replace <code className="text-warning">YOUR_API_KEY</code> with the key you received when creating this entity. Restart Claude Desktop after saving.
                  </p>
                </div>

                {/* Divider */}
                <div className="border-t border-border" />

                {/* MCP Endpoint */}
                <div>
                  <label className="text-xs uppercase tracking-wider text-text-muted font-medium block mb-1.5">MCP Endpoint</label>
                  <div className="flex items-center gap-1.5">
                    <code className="text-xs text-accent bg-bg-deep px-2.5 py-1.5 rounded border border-border flex-1 overflow-x-auto whitespace-nowrap">
                      {mcpUrl}
                    </code>
                    <button
                      onClick={() => copyToClipboard(mcpUrl, `endpoint-${entity.id}`)}
                      className={`px-2.5 py-1.5 text-xs border border-border rounded transition-colors shrink-0 ${copiedField === `endpoint-${entity.id}` ? 'bg-success/20 text-success border-success/30' : 'bg-bg-deep hover:bg-border'}`}
                    >
                      {copiedField === `endpoint-${entity.id}` ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-[10px] text-text-muted mt-1.5">Used by cloud platforms below — paste this URL when adding a connector.</p>
                </div>

                {/* Claude.ai */}
                <div>
                  <label className="text-xs uppercase tracking-wider text-text-muted font-medium block mb-1.5">Claude.ai</label>
                  <ol className="text-xs text-text-muted space-y-1 list-decimal list-inside">
                    <li>Go to <span className="text-text-primary">Settings &gt; Connectors &gt; Add connector</span></li>
                    <li>Paste your MCP endpoint URL</li>
                    <li>OAuth is auto-discovered — no API key needed</li>
                  </ol>
                </div>

                {/* ChatGPT */}
                <div>
                  <label className="text-xs uppercase tracking-wider text-text-muted font-medium block mb-1.5">ChatGPT</label>
                  <ol className="text-xs text-text-muted space-y-1 list-decimal list-inside">
                    <li>Go to <span className="text-text-primary">Settings &gt; Apps &gt; Advanced settings &gt; Create app</span></li>
                    <li>Set Authentication to <span className="text-text-primary">OAuth</span>, paste your MCP endpoint URL</li>
                    <li>Leave OAuth Client ID and Secret blank — auto-discovered</li>
                    <li>Requires <span className="text-text-primary">Developer Mode</span> and a paid tier (Plus, Pro, Business, Enterprise, or Edu)</li>
                  </ol>
                </div>

                {/* Footer note */}
                <div className="border-t border-border pt-3">
                  <p className="text-[10px] text-text-muted leading-relaxed">
                    Cloud platforms (<span className="text-text-primary">Claude.ai</span>, <span className="text-text-primary">ChatGPT</span>) use OAuth 2.1 — no API key needed.
                    Local clients (<span className="text-text-primary">Claude Desktop</span>, <span className="text-text-primary">Claude Code</span>) use the API key in the config file.
                    Lost your API key? Close this modal and click <span className="text-warning">Regen Key</span>.
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {apiKey && <ApiKeyModal apiKey={apiKey} onClose={() => setApiKey(null)} />}
    </div>
  );
}
