import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import ChannelPicker, { type DiscordChannel } from '../components/ChannelPicker';

interface ServerEntity {
  id: string;
  name: string;
  avatar_url: string | null;
  owner_id: string | null;
  channels: string[];
  tools: string[];
  watch_channels: string[];
  blocked_channels: string[];
  role_id: string | null;
}

interface ServerRequest {
  id: string;
  entity_id: string;
  server_id: string;
  status: string;
  requested_by: string;
  created_at: string;
  entity_name: string;
  entity_avatar: string | null;
}

const AVAILABLE_TOOLS = [
  'read_messages',
  'send_message',
  'send_dm',
  'add_reaction',
  'list_channels',
  'get_entity_info',
  'get_channel_history',
  'leave_server',
];

interface ServerTemplateData {
  id: string;
  server_id: string;
  name: string;
  channels: string[];
  tools: string[];
}

interface ServerSettingsData {
  server_id: string;
  announce_channel: string | null;
  default_template: string | null;
}

export default function MyServers() {
  const { user } = useAuth();
  const [selectedServer, setSelectedServer] = useState<string | null>(null);
  const [entities, setEntities] = useState<ServerEntity[]>([]);
  const [requests, setRequests] = useState<ServerRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [serverChannels, setServerChannels] = useState<DiscordChannel[]>([]);

  // Server settings
  const [serverSettings, setServerSettings] = useState<ServerSettingsData | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Templates
  const [templates, setTemplates] = useState<ServerTemplateData[]>([]);
  const [templateBuilderOpen, setTemplateBuilderOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [templateChannels, setTemplateChannels] = useState<string[]>([]);
  const [templateTools, setTemplateTools] = useState<string[]>([]);

  // Approve form
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approveChannels, setApproveChannels] = useState<string[]>([]);
  const [approveTools, setApproveTools] = useState<string[]>([]);

  // Entity config editing
  const [configuringId, setConfiguringId] = useState<string | null>(null);
  const [configChannels, setConfigChannels] = useState<string[]>([]);
  const [configTools, setConfigTools] = useState<string[]>([]);

  const servers = user?.admin_servers || [];

  useEffect(() => {
    if (servers.length > 0 && !selectedServer) {
      setSelectedServer(servers[0].id);
    }
  }, [servers, selectedServer]);

  useEffect(() => {
    if (!selectedServer) return;
    setLoading(true);
    setConfiguringId(null);
    setApprovingId(null);
    setSettingsOpen(false);
    setTemplateBuilderOpen(false);
    Promise.all([
      apiFetch<ServerEntity[]>(`/api/servers/${selectedServer}/entities`),
      apiFetch<ServerRequest[]>(`/api/servers/${selectedServer}/requests`),
      apiFetch<DiscordChannel[]>(`/api/servers/${selectedServer}/channels`),
      apiFetch<ServerSettingsData>(`/api/servers/${selectedServer}/settings`),
      apiFetch<ServerTemplateData[]>(`/api/servers/${selectedServer}/templates`),
    ]).then(([e, r, ch, s, t]) => {
      setEntities(e);
      setRequests(r);
      setServerChannels(ch);
      setServerSettings(s);
      setTemplates(t);
    }).finally(() => setLoading(false));
  }, [selectedServer]);

  const refreshData = async () => {
    if (!selectedServer) return;
    const [e, r] = await Promise.all([
      apiFetch<ServerEntity[]>(`/api/servers/${selectedServer}/entities`),
      apiFetch<ServerRequest[]>(`/api/servers/${selectedServer}/requests`),
    ]);
    setEntities(e);
    setRequests(r);
  };

  const handleRemove = async (entityId: string, entityName: string) => {
    if (!confirm(`Remove ${entityName} from this server?`)) return;
    await apiFetch(`/api/servers/${selectedServer}/entities/${entityId}`, {
      method: 'DELETE',
    });
    setEntities(prev => prev.filter(e => e.id !== entityId));
  };

  const applyTemplate = (template: ServerTemplateData) => {
    setApproveChannels(template.channels);
    setApproveTools(template.tools);
  };

  const saveTemplate = async () => {
    if (!selectedServer || !newTemplateName.trim()) return;
    const created = await apiFetch<ServerTemplateData>(`/api/servers/${selectedServer}/templates`, {
      method: 'POST',
      body: JSON.stringify({ name: newTemplateName.trim(), channels: templateChannels, tools: templateTools }),
    });
    setTemplates(prev => [created, ...prev]);
    setNewTemplateName('');
    setTemplateChannels([]);
    setTemplateTools([]);
    setTemplateBuilderOpen(false);
  };

  const deleteTemplate = async (templateId: string) => {
    if (!selectedServer || !confirm('Delete this template?')) return;
    await apiFetch(`/api/servers/${selectedServer}/templates/${templateId}`, { method: 'DELETE' });
    setTemplates(prev => prev.filter(t => t.id !== templateId));
  };

  const handleApprove = async (requestId: string) => {
    await apiFetch(`/api/servers/${selectedServer}/requests/${requestId}/approve`, {
      method: 'POST',
      body: JSON.stringify({
        channels: approveChannels,
        tools: approveTools,
      }),
    });
    setApprovingId(null);
    setApproveChannels([]);
    setApproveTools([]);
    await refreshData();
  };

  const saveSettings = async (updates: Partial<ServerSettingsData>) => {
    if (!selectedServer) return;
    const updated = await apiFetch<ServerSettingsData>(`/api/servers/${selectedServer}/settings`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    setServerSettings(updated);
  };

  const handleReject = async (requestId: string) => {
    if (!confirm('Reject this request?')) return;
    await apiFetch(`/api/servers/${selectedServer}/requests/${requestId}/reject`, {
      method: 'POST',
    });
    setRequests(prev => prev.filter(r => r.id !== requestId));
  };

  const startConfigure = (entity: ServerEntity) => {
    if (configuringId === entity.id) {
      setConfiguringId(null);
      return;
    }
    setConfiguringId(entity.id);
    setConfigChannels(entity.channels);
    setConfigTools(entity.tools);
  };

  const saveConfig = async (entityId: string) => {
    await apiFetch(`/api/servers/${selectedServer}/entities/${entityId}`, {
      method: 'PATCH',
      body: JSON.stringify({ channels: configChannels, tools: configTools }),
    });
    setConfiguringId(null);
    const e = await apiFetch<ServerEntity[]>(`/api/servers/${selectedServer}/entities`);
    setEntities(e);
  };

  const toggleTool = (tool: string, current: string[], setter: (v: string[]) => void) => {
    if (current.includes(tool)) {
      setter(current.filter(t => t !== tool));
    } else {
      setter([...current, tool]);
    }
  };

  if (servers.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-text-muted">You don't admin any servers where the bot is present.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">My Servers</h2>

      {/* Server selector */}
      <div className="flex gap-2 mb-6">
        {servers.map(s => (
          <button
            key={s.id}
            onClick={() => setSelectedServer(s.id)}
            className={`px-4 py-2 rounded text-sm transition-colors ${
              selectedServer === s.id
                ? 'bg-accent/15 text-accent border border-accent/30'
                : 'bg-bg-card border border-border text-text-muted hover:text-text-primary'
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-text-muted">Loading...</div>
      ) : (
        <div className="space-y-6">
          {/* Server Settings */}
          {serverSettings && (
            <div className="bg-bg-card border border-border rounded-lg">
              <button
                onClick={() => setSettingsOpen(!settingsOpen)}
                className="w-full flex items-center justify-between p-4"
              >
                <h3 className="text-sm font-medium text-text-primary">Server Settings</h3>
                <span className={`text-text-muted transition-transform ${settingsOpen ? 'rotate-90' : ''}`}>
                  &#9654;
                </span>
              </button>
              {settingsOpen && (
                <div className="px-4 pb-4 pt-0 border-t border-border space-y-4">
                  {/* Announcement channel */}
                  <div>
                    <label className="text-xs text-text-muted block mb-1.5">
                      Welcome announcement channel
                    </label>
                    <p className="text-xs text-text-muted mb-2">
                      New entities will be announced here when approved.
                    </p>
                    <select
                      value={serverSettings.announce_channel || ''}
                      onChange={e => saveSettings({ announce_channel: e.target.value || null })}
                      className="w-full bg-bg-deep border border-border rounded px-3 py-1.5 text-sm"
                    >
                      <option value="">None (no announcements)</option>
                      {serverChannels.map(ch => (
                        <option key={ch.id} value={ch.id}>#{ch.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Default template */}
                  {templates.length > 0 && (
                    <div>
                      <label className="text-xs text-text-muted block mb-1.5">
                        Default role template
                      </label>
                      <p className="text-xs text-text-muted mb-2">
                        Pre-selected when approving new entities.
                      </p>
                      <select
                        value={serverSettings.default_template || ''}
                        onChange={e => saveSettings({ default_template: e.target.value || null })}
                        className="w-full bg-bg-deep border border-border rounded px-3 py-1.5 text-sm"
                      >
                        <option value="">None (manual setup each time)</option>
                        {templates.map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Role Templates */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs text-text-muted">Role Templates</label>
                      <button
                        onClick={() => setTemplateBuilderOpen(!templateBuilderOpen)}
                        className="text-xs text-accent hover:text-accent-hover transition-colors"
                      >
                        {templateBuilderOpen ? 'Cancel' : '+ New Template'}
                      </button>
                    </div>

                    {/* Template builder */}
                    {templateBuilderOpen && (
                      <div className="bg-bg-deep border border-border rounded-lg p-3 mb-3 space-y-3">
                        <input
                          value={newTemplateName}
                          onChange={e => setNewTemplateName(e.target.value)}
                          placeholder="Template name (e.g. Companion, Observer)"
                          className="w-full bg-bg-card border border-border rounded px-3 py-1.5 text-sm"
                        />

                        <ChannelPicker
                          serverId={selectedServer!}
                          selected={templateChannels}
                          onChange={setTemplateChannels}
                          channels={serverChannels}
                          label="Channel whitelist"
                        />

                        <div>
                          <label className="text-xs text-text-muted block mb-1.5">Tool whitelist</label>
                          <label className="flex items-center gap-2 mb-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={templateTools.length === 0}
                              onChange={() => setTemplateTools(templateTools.length === 0 ? ['read_messages'] : [])}
                              className="rounded border-border"
                            />
                            <span className="text-sm">All tools</span>
                          </label>
                          {templateTools.length > 0 && (
                            <div className="grid grid-cols-2 gap-1 border border-border rounded p-2 bg-bg-card">
                              {AVAILABLE_TOOLS.map(tool => (
                                <label key={tool} className="flex items-center gap-2 cursor-pointer py-0.5">
                                  <input
                                    type="checkbox"
                                    checked={templateTools.includes(tool)}
                                    onChange={() => toggleTool(tool, templateTools, setTemplateTools)}
                                    className="rounded border-border"
                                  />
                                  <span className="text-xs text-text-primary">{tool}</span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>

                        <button
                          onClick={saveTemplate}
                          disabled={!newTemplateName.trim()}
                          className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-40 text-white text-sm rounded transition-colors"
                        >
                          Save Template
                        </button>
                      </div>
                    )}

                    {/* Existing templates list */}
                    {templates.length === 0 && !templateBuilderOpen ? (
                      <p className="text-xs text-text-muted">No templates yet. Create one to speed up approvals.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {templates.map(t => (
                          <div key={t.id} className="flex items-center justify-between bg-bg-deep rounded px-3 py-2">
                            <div>
                              <p className="text-sm font-medium">{t.name}</p>
                              <p className="text-xs text-text-muted">
                                {t.channels.length === 0 ? 'All channels' : `${t.channels.length} ch`}
                                {' · '}
                                {t.tools.length === 0 ? 'All tools' : `${t.tools.length} tools`}
                              </p>
                            </div>
                            <button
                              onClick={() => deleteTemplate(t.id)}
                              className="text-xs text-danger hover:text-danger/80 transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Pending requests */}
          {requests.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-warning mb-3">
                Pending Requests ({requests.length})
              </h3>
              <div className="grid gap-3">
                {requests.map(req => (
                  <div
                    key={req.id}
                    className="bg-bg-card border border-warning/30 rounded-lg p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {req.entity_avatar ? (
                          <img src={req.entity_avatar} alt="" className="w-10 h-10 rounded-full" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-bg-deep flex items-center justify-center text-text-muted text-sm">
                            ?
                          </div>
                        )}
                        <div>
                          <p className="font-medium">{req.entity_name}</p>
                          <p className="text-xs text-text-muted">
                            Requested {new Date(req.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            if (approvingId === req.id) {
                              setApprovingId(null);
                            } else {
                              setApprovingId(req.id);
                              setApproveChannels([]);
                              setApproveTools([]);
                            }
                          }}
                          className="px-3 py-1.5 text-xs bg-accent hover:bg-accent-hover text-white rounded transition-colors"
                        >
                          {approvingId === req.id ? 'Cancel' : 'Approve'}
                        </button>
                        <button
                          onClick={() => handleReject(req.id)}
                          className="px-3 py-1.5 text-xs bg-bg-surface hover:bg-danger/20 text-danger rounded transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                    </div>

                    {/* Approve config panel */}
                    {approvingId === req.id && (
                      <div className="mt-3 pt-3 border-t border-border space-y-3">
                        {/* Role templates */}
                        {templates.length > 0 && (
                          <div>
                            <label className="text-xs text-text-muted block mb-1.5">Apply template</label>
                            <div className="flex gap-2 flex-wrap">
                              {templates.map(tmpl => (
                                <button
                                  key={tmpl.id}
                                  onClick={() => applyTemplate(tmpl)}
                                  className="px-3 py-1.5 text-xs bg-bg-surface hover:bg-border rounded transition-colors"
                                  title={`${tmpl.channels.length === 0 ? 'All channels' : tmpl.channels.length + ' ch'} · ${tmpl.tools.length === 0 ? 'All tools' : tmpl.tools.length + ' tools'}`}
                                >
                                  {tmpl.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Channel whitelist */}
                        <ChannelPicker
                          serverId={selectedServer!}
                          selected={approveChannels}
                          onChange={setApproveChannels}
                          channels={serverChannels}
                          label="Channel whitelist"
                        />

                        {/* Tool whitelist */}
                        <div>
                          <label className="text-xs text-text-muted block mb-1.5">Tool whitelist</label>
                          <label className="flex items-center gap-2 mb-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={approveTools.length === 0}
                              onChange={() => setApproveTools(approveTools.length === 0 ? ['read_messages'] : [])}
                              className="rounded border-border"
                            />
                            <span className="text-sm">All tools</span>
                          </label>
                          {approveTools.length > 0 && (
                            <div className="grid grid-cols-2 gap-1 border border-border rounded p-2 bg-bg-deep">
                              {AVAILABLE_TOOLS.map(tool => (
                                <label key={tool} className="flex items-center gap-2 cursor-pointer py-0.5">
                                  <input
                                    type="checkbox"
                                    checked={approveTools.includes(tool)}
                                    onChange={() => toggleTool(tool, approveTools, setApproveTools)}
                                    className="rounded border-border"
                                  />
                                  <span className="text-xs text-text-primary">{tool}</span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>

                        <button
                          onClick={() => handleApprove(req.id)}
                          className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm rounded transition-colors"
                        >
                          Confirm Approval
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active entities */}
          <div>
            <h3 className="text-sm font-medium text-text-muted mb-3">
              Active Entities ({entities.length})
            </h3>
            {entities.length === 0 ? (
              <div className="text-text-muted text-sm">No entities on this server.</div>
            ) : (
              <div className="grid gap-3">
                {entities.map(entity => (
                  <div
                    key={entity.id}
                    className="bg-bg-card border border-border rounded-lg p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {entity.avatar_url ? (
                          <img src={entity.avatar_url} alt="" className="w-8 h-8 rounded-full" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-bg-deep flex items-center justify-center text-text-muted text-xs">
                            ?
                          </div>
                        )}
                        <div>
                          <p className="font-medium">{entity.name}</p>
                          <p className="text-xs text-text-muted">
                            {entity.channels.length === 0 ? 'All channels' : `${entity.channels.length} channel${entity.channels.length !== 1 ? 's' : ''}`}
                            {' · '}
                            {entity.tools.length === 0 ? 'All tools' : `${entity.tools.length} tool${entity.tools.length !== 1 ? 's' : ''}`}
                            {entity.role_id && <span className="ml-2 text-accent">@mentionable</span>}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => startConfigure(entity)}
                          className="px-2.5 py-1 text-xs bg-bg-surface hover:bg-border text-text-muted rounded transition-colors"
                        >
                          {configuringId === entity.id ? 'Close' : 'Configure'}
                        </button>
                        <button
                          onClick={() => handleRemove(entity.id, entity.name)}
                          className="px-2.5 py-1 text-xs bg-bg-surface hover:bg-danger/20 text-danger rounded transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    {/* Owner's channel config summary */}
                    {(entity.watch_channels.length > 0 || entity.blocked_channels.length > 0) && (
                      <div className="mt-2 flex gap-3 text-xs text-text-muted">
                        {entity.watch_channels.length > 0 && (
                          <span>
                            <span className="text-accent">Watch:</span> {entity.watch_channels.length} ch
                          </span>
                        )}
                        {entity.blocked_channels.length > 0 && (
                          <span>
                            <span className="text-danger">Blocked:</span> {entity.blocked_channels.length} ch
                          </span>
                        )}
                      </div>
                    )}

                    {/* Admin config panel */}
                    {configuringId === entity.id && (
                      <div className="mt-3 pt-3 border-t border-border space-y-3">
                        {/* Channel whitelist */}
                        <ChannelPicker
                          serverId={selectedServer!}
                          selected={configChannels}
                          onChange={setConfigChannels}
                          channels={serverChannels}
                          label="Channel whitelist"
                        />

                        {/* Tool whitelist */}
                        <div>
                          <label className="text-xs text-text-muted block mb-1.5">Tool whitelist</label>
                          <label className="flex items-center gap-2 mb-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={configTools.length === 0}
                              onChange={() => setConfigTools(configTools.length === 0 ? ['read_messages'] : [])}
                              className="rounded border-border"
                            />
                            <span className="text-sm">All tools</span>
                          </label>
                          {configTools.length > 0 && (
                            <div className="grid grid-cols-2 gap-1 border border-border rounded p-2 bg-bg-deep">
                              {AVAILABLE_TOOLS.map(tool => (
                                <label key={tool} className="flex items-center gap-2 cursor-pointer py-0.5">
                                  <input
                                    type="checkbox"
                                    checked={configTools.includes(tool)}
                                    onChange={() => toggleTool(tool, configTools, setConfigTools)}
                                    className="rounded border-border"
                                  />
                                  <span className="text-xs text-text-primary">{tool}</span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Owner's watch/blocked info */}
                        {(entity.watch_channels.length > 0 || entity.blocked_channels.length > 0) && (
                          <div className="bg-bg-deep rounded p-2 text-xs text-text-muted space-y-1">
                            <p className="font-medium text-text-primary">Owner's channel config (read-only)</p>
                            {entity.watch_channels.length > 0 && (
                              <p>
                                <span className="text-accent">Watch:</span>{' '}
                                {entity.watch_channels.map(id => {
                                  const ch = serverChannels.find(c => c.id === id);
                                  return ch ? `#${ch.name}` : id;
                                }).join(', ')}
                              </p>
                            )}
                            {entity.blocked_channels.length > 0 && (
                              <p>
                                <span className="text-danger">Blocked:</span>{' '}
                                {entity.blocked_channels.map(id => {
                                  const ch = serverChannels.find(c => c.id === id);
                                  return ch ? `#${ch.name}` : id;
                                }).join(', ')}
                              </p>
                            )}
                          </div>
                        )}

                        <button
                          onClick={() => saveConfig(entity.id)}
                          className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm rounded transition-colors"
                        >
                          Save Whitelist
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
