import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EntityContext } from './types.js';

/**
 * Register Phase 1 MCP tools on an McpServer, scoped to an entity context.
 */
export function registerTools(server: McpServer, ctx: EntityContext): void {
  const { entity, entityServers, bus, webhookManager, discordClient } = ctx;

  // Compute allowed channel IDs across all servers (empty = all)
  const allowedChannels = new Set<string>();
  let hasAllAccess = false;
  for (const es of entityServers) {
    const channels: string[] = JSON.parse(es.channels);
    if (channels.length === 0) {
      hasAllAccess = true;
      break;
    }
    channels.forEach(ch => allowedChannels.add(ch));
  }

  const allowedServerIds = new Set(entityServers.map(es => es.server_id));

  function canAccessChannel(channelId: string): boolean {
    return hasAllAccess || allowedChannels.has(channelId);
  }

  // --- read_messages ---
  server.tool(
    'read_messages',
    'Read recent messages from the queue for subscribed channels. Messages are held for 15 minutes after they arrive.',
    {
      channel_id: z.string().optional().describe('Channel ID to read from. If omitted, reads from all subscribed channels.'),
      limit: z.number().optional().default(50).describe('Maximum number of messages to return (default 50)'),
    },
    async ({ channel_id, limit }) => {
      if (channel_id && !canAccessChannel(channel_id)) {
        return { content: [{ type: 'text' as const, text: 'Error: You do not have access to this channel.' }] };
      }
      const messages = bus.read(entity.id, channel_id, limit);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(messages, null, 2) }],
      };
    }
  );

  // --- send_message ---
  server.tool(
    'send_message',
    'Send a message to a Discord channel as this entity (with your name and avatar).',
    {
      channel_id: z.string().describe('The channel ID to send the message to'),
      content: z.string().describe('The message content to send'),
    },
    async ({ channel_id, content }) => {
      if (!canAccessChannel(channel_id)) {
        return { content: [{ type: 'text' as const, text: 'Error: You do not have access to this channel.' }] };
      }
      try {
        const result = await webhookManager.sendAsEntity(
          channel_id,
          content,
          entity.name,
          entity.avatar_url
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: true, message_id: result.messageId }) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );

  // --- add_reaction ---
  server.tool(
    'add_reaction',
    'Add a reaction emoji to a message.',
    {
      channel_id: z.string().describe('The channel ID where the message is'),
      message_id: z.string().describe('The message ID to react to'),
      emoji: z.string().describe('The emoji to react with (e.g., "👍" or custom emoji name)'),
    },
    async ({ channel_id, message_id, emoji }) => {
      if (!canAccessChannel(channel_id)) {
        return { content: [{ type: 'text' as const, text: 'Error: You do not have access to this channel.' }] };
      }
      try {
        const channel = await discordClient.channels.fetch(channel_id);
        if (!channel || !('messages' in channel)) {
          return { content: [{ type: 'text' as const, text: 'Error: Channel not found or not a text channel.' }] };
        }
        const message = await (channel as any).messages.fetch(message_id);
        await message.react(emoji);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: true }) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );

  // --- list_channels ---
  server.tool(
    'list_channels',
    'List Discord channels this entity can access.',
    {},
    async () => {
      try {
        const result: Array<{ id: string; name: string; type: string; server_id: string; server_name: string; category?: string }> = [];

        for (const es of entityServers) {
          const guild = discordClient.guilds.cache.get(es.server_id);
          if (!guild) continue;

          const channels = guild.channels.cache;
          const allowedInServer: string[] = JSON.parse(es.channels);
          const allChannels = allowedInServer.length === 0;

          for (const [id, channel] of channels) {
            if (!channel.isTextBased()) continue;
            if (channel.isDMBased()) continue;
            if (!allChannels && !allowedInServer.includes(id)) continue;

            result.push({
              id,
              name: channel.name,
              type: channel.type.toString(),
              server_id: es.server_id,
              server_name: guild.name,
              category: channel.parent?.name || undefined,
            });
          }
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );

  // --- get_entity_info ---
  server.tool(
    'get_entity_info',
    'Get information about this entity (name, avatar, servers, channels).',
    {},
    async () => {
      const servers = entityServers.map(es => ({
        server_id: es.server_id,
        channels: JSON.parse(es.channels),
        tools: JSON.parse(es.tools),
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            id: entity.id,
            name: entity.name,
            avatar_url: entity.avatar_url,
            servers,
          }, null, 2),
        }],
      };
    }
  );

  // --- get_channel_history ---
  server.tool(
    'get_channel_history',
    'Fetch recent message history from a Discord channel (live from Discord API, not from queue). Use this to catch up on messages from before you connected.',
    {
      channel_id: z.string().describe('The channel ID to fetch history from'),
      limit: z.number().optional().default(50).describe('Number of messages to fetch (default 50, max 100)'),
    },
    async ({ channel_id, limit }) => {
      if (!canAccessChannel(channel_id)) {
        return { content: [{ type: 'text' as const, text: 'Error: You do not have access to this channel.' }] };
      }
      try {
        const channel = await discordClient.channels.fetch(channel_id);
        if (!channel || !('messages' in channel)) {
          return { content: [{ type: 'text' as const, text: 'Error: Channel not found or not a text channel.' }] };
        }

        const fetchLimit = Math.min(limit, 100);
        const messages = await (channel as any).messages.fetch({ limit: fetchLimit });

        const formatted = messages
          .sort((a: any, b: any) => a.createdTimestamp - b.createdTimestamp)
          .map((msg: any) => ({
            id: msg.id,
            author_id: msg.author.id,
            author_name: msg.member?.displayName || msg.author.displayName || msg.author.username,
            content: msg.content,
            timestamp: msg.createdAt.toISOString(),
            is_bot: msg.author.bot,
            webhook_id: msg.webhookId || null,
          }));

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(formatted, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );
}
