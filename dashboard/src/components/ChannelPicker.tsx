import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';

export interface DiscordChannel {
  id: string;
  name: string;
  type: number;
  category_id: string | null;
  category_name: string | null;
  position: number;
}

interface ChannelPickerProps {
  serverId: string;
  selected: string[];
  onChange: (channelIds: string[]) => void;
  channels?: DiscordChannel[]; // Pre-fetched channels (avoids duplicate fetches)
  allowAll?: boolean;          // Show "All channels" toggle (default true)
  label?: string;
}

export default function ChannelPicker({ serverId, selected, onChange, channels: propChannels, allowAll = true, label }: ChannelPickerProps) {
  const [fetchedChannels, setFetchedChannels] = useState<DiscordChannel[]>([]);
  const [loading, setLoading] = useState(!propChannels);
  const [allMode, setAllMode] = useState(selected.length === 0 && allowAll);

  const channels = propChannels || fetchedChannels;

  useEffect(() => {
    if (propChannels) return; // Skip fetch if pre-fetched
    setLoading(true);
    apiFetch<DiscordChannel[]>(`/api/servers/${serverId}/channels`)
      .then(setFetchedChannels)
      .finally(() => setLoading(false));
  }, [serverId, propChannels]);

  // Group by category
  const grouped = new Map<string, DiscordChannel[]>();
  for (const ch of channels) {
    const key = ch.category_name || 'Uncategorized';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(ch);
  }

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter(c => c !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  const toggleAll = () => {
    if (allMode) {
      setAllMode(false);
      onChange([]);
    } else {
      setAllMode(true);
      onChange([]);
    }
  };

  const toggleCategory = (categoryChannels: DiscordChannel[]) => {
    const ids = categoryChannels.map(c => c.id);
    const allSelected = ids.every(id => selected.includes(id));
    if (allSelected) {
      onChange(selected.filter(id => !ids.includes(id)));
    } else {
      const merged = new Set([...selected, ...ids]);
      onChange([...merged]);
    }
  };

  if (loading) return <p className="text-xs text-text-muted">Loading channels...</p>;

  return (
    <div>
      {label && <label className="text-xs text-text-muted block mb-1.5">{label}</label>}

      {allowAll && (
        <label className="flex items-center gap-2 mb-2 cursor-pointer">
          <input
            type="checkbox"
            checked={allMode}
            onChange={toggleAll}
            className="rounded border-border"
          />
          <span className="text-sm">All channels</span>
        </label>
      )}

      {!allMode && (
        <div className="max-h-52 overflow-y-auto space-y-2 border border-border rounded p-2 bg-bg-deep">
          {[...grouped.entries()].map(([category, chs]) => (
            <div key={category}>
              <label className="flex items-center gap-2 cursor-pointer mb-1">
                <input
                  type="checkbox"
                  checked={chs.every(c => selected.includes(c.id))}
                  onChange={() => toggleCategory(chs)}
                  className="rounded border-border"
                />
                <span className="text-xs font-medium text-text-muted uppercase tracking-wide">
                  {category}
                </span>
              </label>
              <div className="ml-5 space-y-0.5">
                {chs.map(ch => (
                  <label key={ch.id} className="flex items-center gap-2 cursor-pointer py-0.5">
                    <input
                      type="checkbox"
                      checked={selected.includes(ch.id)}
                      onChange={() => toggle(ch.id)}
                      className="rounded border-border"
                    />
                    <span className="text-sm text-text-primary">
                      <span className="text-text-muted">#</span>{ch.name}
                    </span>
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
