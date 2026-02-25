const TOOL_GROUPS = [
  {
    label: 'Messaging',
    tools: ['read_messages', 'send_message', 'send_dm', 'send_file'],
  },
  {
    label: 'Channel Management',
    tools: ['list_channels', 'create_channel', 'set_channel_topic', 'rename_channel', 'delete_channel', 'create_category', 'move_channel'],
  },
  {
    label: 'Reactions',
    tools: ['add_reaction', 'get_reactions'],
  },
  {
    label: 'Polls',
    tools: ['create_poll'],
  },
  {
    label: 'Message Management',
    tools: ['edit_message', 'delete_message', 'pin_message'],
  },
  {
    label: 'Threads & Forums',
    tools: ['create_thread', 'create_forum_post', 'list_forum_threads'],
  },
  {
    label: 'Attachments',
    tools: ['fetch_attachment'],
  },
  {
    label: 'Moderation',
    tools: ['timeout_user', 'assign_role', 'remove_role'],
  },
  {
    label: 'Awareness',
    tools: ['get_entity_info', 'get_channel_history', 'search_messages', 'list_members', 'get_user_info', 'list_roles'],
  },
  {
    label: 'System',
    tools: ['leave_server'],
  },
];

interface ToolPickerProps {
  selected: string[];
  onChange: (tools: string[]) => void;
  label?: string;
}

export default function ToolPicker({ selected, onChange, label = 'Tool whitelist' }: ToolPickerProps) {
  const toggleTool = (tool: string) => {
    if (selected.includes(tool)) {
      onChange(selected.filter(t => t !== tool));
    } else {
      onChange([...selected, tool]);
    }
  };

  const allToolsMode = selected.length === 0;

  return (
    <div>
      <label className="text-xs text-text-muted block mb-1.5">{label}</label>
      <label className="flex items-center gap-2 mb-2 cursor-pointer">
        <input
          type="checkbox"
          checked={allToolsMode}
          onChange={() => onChange(allToolsMode ? ['read_messages'] : [])}
          className="rounded border-border"
        />
        <span className="text-sm">All tools</span>
      </label>
      {!allToolsMode && (
        <div className="border border-border rounded p-2 bg-bg-card space-y-2">
          {TOOL_GROUPS.map(group => (
            <div key={group.label}>
              <p className="text-[10px] uppercase tracking-wider text-text-muted font-medium mb-1">
                {group.label}
              </p>
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 mb-1.5">
                {group.tools.map(tool => (
                  <label key={tool} className="flex items-center gap-2 cursor-pointer py-0.5">
                    <input
                      type="checkbox"
                      checked={selected.includes(tool)}
                      onChange={() => toggleTool(tool)}
                      className="rounded border-border"
                    />
                    <span className="text-xs text-text-primary">{tool}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
