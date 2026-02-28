import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import ChannelPicker, { type DiscordChannel } from '../components/ChannelPicker';
import ToolPicker from '../components/ToolPicker';

interface ServerEntity {
  id: string;
  name: string;
  avatar_url: string | null;
  owner_id: string | null;
  platform: string | null;
  owner_name: string | null;
  channels: string[];
  tools: string[];
  template_id: string | null;
  dedicated_channels: string[];
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
  requested_by_name: string | null;
  created_at: string;
  entity_name: string;
  entity_avatar: string | null;
  entity_platform: string | null;
  entity_owner_name: string | null;
}

const PLATFORM_COLORS: Record<string, string> = {
  claude: '#D97757',
  gpt: '#10A37F',
  gemini: '#4285F4',
  other: '#6B7280',
};

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
  announce_message: string | null;
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

  // Templates
  const [templates, setTemplates] = useState<ServerTemplateData[]>([]);
  const [templateBuilderOpen, setTemplateBuilderOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
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
  const [configDedicatedChannels, setConfigDedicatedChannels] = useState('');
  const [configTemplateId, setConfigTemplateId] = useState<string | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Approval flow template tracking
  const [approveTemplateId, setApproveTemplateId] = useState<string | null>(null);
  const [approveDedicatedChannels, setApproveDedicatedChannels] = useState('');

  // Inline confirmations (click-twice, replaces browser confirm())
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);

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

  const handleRemove = async (entityId: string) => {
    if (removingId !== entityId) {
      setRemovingId(entityId);
      return;
    }
    setRemovingId(null);
    try {
      await apiFetch(`/api/servers/${selectedServer}/entities/${entityId}`, {
        method: 'DELETE',
      });
      setEntities(prev => prev.filter(e => e.id !== entityId));
    } catch (err) {
      window.alert(`Failed to remove: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const applyTemplate = (template: ServerTemplateData) => {
    setApproveChannels(template.channels);
    setApproveTools(template.tools);
    setApproveTemplateId(template.id);
  };

  const applyTemplateToConfig = (template: ServerTemplateData) => {
    // Parse current dedicated channels
    const dedicated = configDedicatedChannels
      .split(',').map(s => s.trim()).filter(Boolean);
    // Merge template channels + dedicated
    const merged = [...new Set([...template.channels, ...dedicated])];
    setConfigChannels(merged);
    setConfigTools(template.tools);
    setConfigTemplateId(template.id);
  };

  const saveTemplate = async () => {
    if (!selectedServer || !newTemplateName.trim()) return;
    setSavingTemplate(true);

    if (editingTemplateId) {
      const updated = await apiFetch<ServerTemplateData>(`/api/servers/${selectedServer}/templates/${editingTemplateId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: newTemplateName.trim(), channels: templateChannels, tools: templateTools }),
      });
      setTemplates(prev => prev.map(t => t.id === editingTemplateId ? updated : t));
    } else {
      const created = await apiFetch<ServerTemplateData>(`/api/servers/${selectedServer}/templates`, {
        method: 'POST',
        body: JSON.stringify({ name: newTemplateName.trim(), channels: templateChannels, tools: templateTools }),
      });
      setTemplates(prev => [created, ...prev]);
    }
    setSavingTemplate(false);
    setNewTemplateName('');
    setTemplateChannels([]);
    setTemplateTools([]);
    setEditingTemplateId(null);
    setTemplateBuilderOpen(false);
  };

  const editTemplate = (template: ServerTemplateData) => {
    setEditingTemplateId(template.id);
    setNewTemplateName(template.name);
    setTemplateChannels(template.channels);
    setTemplateTools(template.tools);
    setTemplateBuilderOpen(true);
  };

  const deleteTemplate = async (templateId: string) => {
    if (!selectedServer) return;
    if (deletingTemplateId !== templateId) {
      setDeletingTemplateId(templateId);
      return;
    }
    setDeletingTemplateId(null);
    try {
      await apiFetch(`/api/servers/${selectedServer}/templates/${templateId}`, { method: 'DELETE' });
      setTemplates(prev => prev.filter(t => t.id !== templateId));
    } catch (err) {
      window.alert(`Failed to delete: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleApprove = async (requestId: string) => {
    const dedicatedArr = approveDedicatedChannels
      .split(',').map(s => s.trim()).filter(Boolean);
    await apiFetch(`/api/servers/${selectedServer}/requests/${requestId}/approve`, {
      method: 'POST',
      body: JSON.stringify({
        channels: approveChannels,
        tools: approveTools,
        template_id: approveTemplateId,
        dedicated_channels: dedicatedArr,
      }),
    });
    setApprovingId(null);
    setApproveChannels([]);
    setApproveTools([]);
    setApproveTemplateId(null);
    setApproveDedicatedChannels('');
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
    if (rejectingId !== requestId) {
      setRejectingId(requestId);
      return;
    }
    setRejectingId(null);
    try {
      await apiFetch(`/api/servers/${selectedServer}/requests/${requestId}/reject`, {
        method: 'POST',
      });
      setRequests(prev => prev.filter(r => r.id !== requestId));
    } catch (err) {
      window.alert(`Failed to reject: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const startConfigure = (entity: ServerEntity) => {
    if (configuringId === entity.id) {
      setConfiguringId(null);
      return;
    }
    setConfiguringId(entity.id);
    setConfigChannels(entity.channels);
    setConfigTools(entity.tools);
    setConfigDedicatedChannels(entity.dedicated_channels.join(', '));
    setConfigTemplateId(entity.template_id);
  };

  const saveConfig = async (entityId: string) => {
    setSavingConfig(true);
    const dedicatedArr = configDedicatedChannels
      .split(',').map(s => s.trim()).filter(Boolean);
    await apiFetch(`/api/servers/${selectedServer}/entities/${entityId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        channels: configChannels,
        tools: configTools,
        template_id: configTemplateId,
        dedicated_channels: dedicatedArr,
      }),
    });
    setSavingConfig(false);
    setConfiguringId(null);
    const e = await apiFetch<ServerEntity[]>(`/api/servers/${selectedServer}/entities`);
    setEntities(e);
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
      <div className="flex flex-wrap gap-2 mb-6">
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
            <div className="bg-bg-card border border-border rounded-lg p-4 space-y-4">
              <h3 className="text-sm font-medium text-text-primary">Server Settings</h3>

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

              {/* Announcement message */}
              {serverSettings.announce_channel && (
                <div>
                  <label className="text-xs text-text-muted block mb-1.5">
                    Announcement message
                  </label>
                  <p className="text-xs text-text-muted mb-2">
                    Placeholders: <code className="text-accent">{'{name}'}</code> <code className="text-accent">{'{mention}'}</code> <code className="text-accent">{'{platform}'}</code> <code className="text-accent">{'{owner}'}</code> <code className="text-accent">{'{owner_mention}'}</code>
                  </p>
                  <textarea
                    value={serverSettings.announce_message || ''}
                    onChange={e => setServerSettings(prev => prev ? { ...prev, announce_message: e.target.value || null } : prev)}
                    onBlur={e => saveSettings({ announce_message: e.target.value || null })}
                    placeholder="**{name}** ({platform}) has joined this server. You can mention them with {mention}.&#10;Partnered with **{owner}**"
                    rows={3}
                    className="w-full bg-bg-deep border border-border rounded px-3 py-1.5 text-sm font-mono resize-y"
                  />
                  <p className="text-[10px] text-text-muted mt-1">
                    Leave empty for default message. Supports Discord markdown.
                  </p>
                </div>
              )}

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
                    onClick={() => {
                      if (templateBuilderOpen) {
                        setTemplateBuilderOpen(false);
                        setEditingTemplateId(null);
                        setNewTemplateName('');
                        setTemplateChannels([]);
                        setTemplateTools([]);
                      } else {
                        setEditingTemplateId(null);
                        setNewTemplateName('');
                        setTemplateChannels([]);
                        setTemplateTools([]);
                        setTemplateBuilderOpen(true);
                      }
                    }}
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

                    <ToolPicker selected={templateTools} onChange={setTemplateTools} />

                    <button
                      onClick={saveTemplate}
                      disabled={!newTemplateName.trim() || savingTemplate}
                      className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-40 text-white text-sm rounded transition-colors"
                    >
                      {savingTemplate ? 'Saving...' : editingTemplateId ? 'Update Template' : 'Save Template'}
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
                        <div className="flex gap-3">
                          <button
                            onClick={() => editTemplate(t)}
                            className="text-xs text-accent hover:text-accent-hover transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteTemplate(t.id)}
                            className={`text-xs transition-colors ${
                              deletingTemplateId === t.id
                                ? 'text-white bg-danger px-2 py-0.5 rounded'
                                : 'text-danger hover:text-danger/80'
                            }`}
                          >
                            {deletingTemplateId === t.id ? 'Sure?' : 'Delete'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {req.entity_avatar ? (
                          <img src={req.entity_avatar} alt="" className="w-10 h-10 rounded-full flex-shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-bg-deep flex items-center justify-center text-text-muted text-sm flex-shrink-0">
                            ?
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="font-medium">{req.entity_name}</p>
                            {req.entity_platform && (
                              <span
                                className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                                style={{ backgroundColor: PLATFORM_COLORS[req.entity_platform] || '#6B7280', color: 'white' }}
                              >
                                {req.entity_platform.charAt(0).toUpperCase() + req.entity_platform.slice(1)}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-text-muted">
                            by <span className="text-text-primary">
                              {req.requested_by_name ? `@${req.requested_by_name} (${req.requested_by})` : req.requested_by}
                            </span> · Requested {new Date(req.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2 self-end sm:self-auto flex-shrink-0">
                        <button
                          onClick={() => {
                            if (approvingId === req.id) {
                              setApprovingId(null);
                            } else {
                              setApprovingId(req.id);
                              setApproveChannels([]);
                              setApproveTools([]);
                              setApproveTemplateId(null);
                              setApproveDedicatedChannels('');
                              // Auto-apply default template if set
                              if (serverSettings?.default_template) {
                                const def = templates.find(t => t.id === serverSettings.default_template);
                                if (def) {
                                  setApproveChannels(def.channels);
                                  setApproveTools(def.tools);
                                  setApproveTemplateId(def.id);
                                }
                              }
                            }
                          }}
                          className="px-3 py-1.5 text-xs bg-accent hover:bg-accent-hover text-white rounded transition-colors"
                        >
                          {approvingId === req.id ? 'Cancel' : 'Approve'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReject(req.id)}
                          className={`px-3 py-1.5 text-xs rounded transition-colors ${
                            rejectingId === req.id
                              ? 'bg-danger text-white hover:bg-danger/80'
                              : 'bg-bg-surface hover:bg-danger/20 text-danger'
                          }`}
                        >
                          {rejectingId === req.id ? 'Sure?' : 'Reject'}
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
                        <ToolPicker selected={approveTools} onChange={setApproveTools} />

                        {/* Dedicated channels */}
                        <div>
                          <label className="text-xs text-text-muted block mb-1.5">
                            Dedicated channels
                          </label>
                          <p className="text-xs text-text-muted/60 mb-2">
                            Private channels for this Entity (independent of template). Comma-separated channel IDs.
                          </p>
                          <input
                            value={approveDedicatedChannels}
                            onChange={e => setApproveDedicatedChannels(e.target.value)}
                            placeholder="e.g. 1234567890, 9876543210"
                            className="w-full bg-bg-deep border border-border rounded px-3 py-1.5 text-sm font-mono"
                          />
                        </div>

                        {approveTemplateId && (
                          <p className="text-xs text-accent">
                            Will be bound to template: {templates.find(t => t.id === approveTemplateId)?.name}
                          </p>
                        )}

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
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {entity.avatar_url ? (
                          <img src={entity.avatar_url} alt="" className="w-8 h-8 rounded-full flex-shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-bg-deep flex items-center justify-center text-text-muted text-xs flex-shrink-0">
                            ?
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="font-medium">{entity.name}</p>
                            {entity.platform && (
                              <span
                                className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                                style={{ backgroundColor: PLATFORM_COLORS[entity.platform] || '#6B7280', color: 'white' }}
                              >
                                {entity.platform.charAt(0).toUpperCase() + entity.platform.slice(1)}
                              </span>
                            )}
                            {entity.owner_name && (
                              <span className="text-[10px] text-text-muted">@{entity.owner_name}</span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-text-muted mt-0.5">
                            <span>
                              {entity.channels.length === 0 ? 'All channels' : `${entity.channels.length} channel${entity.channels.length !== 1 ? 's' : ''}`}
                              {' · '}
                              {entity.tools.length === 0 ? 'All tools' : `${entity.tools.length} tool${entity.tools.length !== 1 ? 's' : ''}`}
                            </span>
                            {entity.template_id && (
                              <span className="text-accent">
                                {templates.find(t => t.id === entity.template_id)?.name || 'Template'}
                              </span>
                            )}
                            {entity.dedicated_channels.length > 0 && (
                              <span className="text-warning">+{entity.dedicated_channels.length} dedicated</span>
                            )}
                            {entity.role_id && <span className="text-accent">@mentionable</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1.5 self-end sm:self-auto flex-shrink-0">
                        <button
                          onClick={() => startConfigure(entity)}
                          className="px-2.5 py-1 text-xs bg-bg-surface hover:bg-border text-text-muted rounded transition-colors"
                        >
                          {configuringId === entity.id ? 'Close' : 'Configure'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemove(entity.id)}
                          className={`px-2.5 py-1 text-xs rounded transition-colors ${
                            removingId === entity.id
                              ? 'bg-danger text-white hover:bg-danger/80'
                              : 'bg-bg-surface hover:bg-danger/20 text-danger'
                          }`}
                        >
                          {removingId === entity.id ? 'Sure?' : 'Remove'}
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
                        <ToolPicker selected={configTools} onChange={setConfigTools} />

                        {/* Template binding */}
                        {templates.length > 0 && (
                          <div>
                            <label className="text-xs text-text-muted block mb-1.5">
                              Bound template
                              {configTemplateId && (
                                <span className="ml-1 text-accent">
                                  ({templates.find(t => t.id === configTemplateId)?.name})
                                </span>
                              )}
                            </label>
                            <p className="text-xs text-text-muted/60 mb-2">
                              Bind to a template so channel/tool changes propagate automatically. Manual channel edits detach the binding.
                            </p>
                            <div className="flex gap-2 flex-wrap">
                              {templates.map(tmpl => (
                                <button
                                  key={tmpl.id}
                                  onClick={() => applyTemplateToConfig(tmpl)}
                                  className={`px-3 py-1.5 text-xs rounded transition-colors ${
                                    configTemplateId === tmpl.id
                                      ? 'bg-accent/20 text-accent border border-accent/30'
                                      : 'bg-bg-surface hover:bg-border text-text-muted'
                                  }`}
                                >
                                  {tmpl.name}
                                </button>
                              ))}
                              {configTemplateId && (
                                <button
                                  onClick={() => setConfigTemplateId(null)}
                                  className="px-3 py-1.5 text-xs bg-bg-surface hover:bg-danger/20 text-danger rounded transition-colors"
                                >
                                  Detach
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Dedicated channels */}
                        <div>
                          <label className="text-xs text-text-muted block mb-1.5">
                            Dedicated channels
                          </label>
                          <p className="text-xs text-text-muted/60 mb-2">
                            Private channels for this Entity, independent of template. Comma-separated channel IDs.
                          </p>
                          <input
                            value={configDedicatedChannels}
                            onChange={e => setConfigDedicatedChannels(e.target.value)}
                            placeholder="e.g. 1234567890, 9876543210"
                            className="w-full bg-bg-deep border border-border rounded px-3 py-1.5 text-sm font-mono"
                          />
                          {configDedicatedChannels && (
                            <p className="text-[10px] text-text-muted mt-1">
                              {configDedicatedChannels.split(',').map(s => s.trim()).filter(Boolean).map(id => {
                                const ch = serverChannels.find(c => c.id === id);
                                return ch ? `#${ch.name}` : id;
                              }).join(', ')}
                            </p>
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
                          disabled={savingConfig}
                          className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-40 text-white text-sm rounded transition-colors"
                        >
                          {savingConfig ? 'Saving...' : 'Save Whitelist'}
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
