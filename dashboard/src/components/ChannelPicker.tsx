import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';

export interface DiscordChannel {
  id: string;
  name: string;
  type: number;
  category_id: string | null;
  category_name: string | null;
  position: number;
  readable?: boolean;
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

  const channels = propChannels || fetchedChannels;
  const allIds = channels.map(c => c.id);
  const [allMode, setAllMode] = useState(selected.length === 0 && allowAll);

  // Sync allMode when selected prop changes externally (e.g. template apply)
  useEffect(() => {
    if (selected.length === 0 && allowAll) setAllMode(true);
    else if (selected.length > 0) setAllMode(false);
  }, [selected, allowAll]);

  useEffect(() => {
    if (propChannels) return;
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
    if (allMode) {
      setAllMode(false);
      onChange(allIds.filter(c => c !== id));
      return;
    }
    let next: string[];
    if (selected.includes(id)) {
      next = selected.filter(c => c !== id);
    } else {
      next = [...selected, id];
    }
    if (next.length >= allIds.length) {
      setAllMode(true);
      onChange([]);
    } else {
      onChange(next);
    }
  };

  const toggleCategory = (categoryChannels: DiscordChannel[]) => {
    const ids = categoryChannels.map(c => c.id);
    if (allMode) {
      setAllMode(false);
      onChange(allIds.filter(id => !ids.includes(id)));
      return;
    }
    const allSelected = ids.every(id => selected.includes(id));
    let next: string[];
    if (allSelected) {
      next = selected.filter(id => !ids.includes(id));
    } else {
      const merged = new Set([...selected, ...ids]);
      next = [...merged];
    }
    if (next.length >= allIds.length) {
      setAllMode(true);
      onChange([]);
    } else {
      onChange(next);
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
            onChange={() => {
            if (allMode) {
              setAllMode(false);
              onChange(allIds);
            } else {
              setAllMode(true);
              onChange([]);
            }
          }}
            className="rounded border-border"
          />
          <span className="text-sm">All channels</span>
        </label>
      )}

      <div className="max-h-52 overflow-y-auto space-y-2 border border-border rounded p-2 bg-bg-deep">
        {[...grouped.entries()].map(([category, chs]) => (
          <div key={category}>
            <label className="flex items-center gap-2 cursor-pointer mb-1">
              <input
                type="checkbox"
                checked={allMode || chs.every(c => selected.includes(c.id))}
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
                    checked={allMode || selected.includes(ch.id)}
                    onChange={() => toggle(ch.id)}
                    className="rounded border-border"
                  />
                  <span className="text-sm text-text-primary">
                    <span className="text-text-muted">#</span>{ch.name}
                    {ch.readable === false && (
                      <span className="ml-1 text-amber-400 cursor-help" title="Arachne cannot access this channel. Add the bot to the channel permissions.">&#9888;</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
