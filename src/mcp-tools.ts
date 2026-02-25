import { z } from 'zod';
import { ChannelType, type TextChannel } from 'discord.js';
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
            if (!channel.isTextBased() && channel.type !== 15) continue; // 15 = GuildForum
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
    'Get information about this entity — identity, description, platform, partner, servers, and channels. Call this at the start of a session to understand who you are.',
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
            description: entity.description || null,
            platform: entity.platform || null,
            partner: entity.owner_name || null,
            avatar_url: entity.avatar_url,
            servers,
          }, null, 2),
        }],
      };
    }
  );

  // --- introduce ---
  server.tool(
    'introduce',
    'Post a rich namecard embed in a channel introducing this entity. Shows name, description, platform, and partner. Use this when joining a new channel or when someone asks who you are.',
    {
      channel_id: z.string().describe('The channel ID to post the introduction in'),
    },
    async ({ channel_id }) => {
      if (!canAccessChannel(channel_id)) {
        return { content: [{ type: 'text' as const, text: 'Error: You do not have access to this channel.' }] };
      }
      try {
        const platformLabels: Record<string, string> = { claude: 'Claude', gpt: 'GPT', gemini: 'Gemini', other: 'Other' };
        const platformColors: Record<string, number> = { claude: 0xD97757, gpt: 0x10A37F, gemini: 0x4285F4, other: 0x6B7280 };

        const embedColor = entity.platform ? (platformColors[entity.platform] || 0x5865F2) :
                          entity.accent_color ? parseInt(entity.accent_color.replace('#', ''), 16) : 0x5865F2;

        const fields: Array<{ name: string; value: string; inline: boolean }> = [];
        if (entity.platform) {
          fields.push({ name: 'Platform', value: platformLabels[entity.platform] || entity.platform, inline: true });
        }
        if (entity.owner_name) {
          fields.push({ name: 'Partner', value: entity.owner_name, inline: true });
        }

        const result = await webhookManager.sendEmbedAsEntity(
          channel_id,
          entity.name,
          entity.avatar_url,
          [{
            description: entity.description || undefined,
            color: embedColor,
            fields: fields.length > 0 ? fields : undefined,
            footer: { text: 'Powered by Arachne' },
          }]
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

  // --- leave_server ---
  server.tool(
    'leave_server',
    'Remove this entity from a server. Deletes the entity role and stops receiving messages from that server. This action is irreversible without admin re-adding.',
    {
      server_id: z.string().describe('The server ID to leave'),
    },
    async ({ server_id }) => {
      // Verify entity is actually in this server
      if (!allowedServerIds.has(server_id)) {
        return { content: [{ type: 'text' as const, text: 'Error: You are not registered in this server.' }] };
      }

      try {
        // Get the role_id before removing
        const serverConfig = entityServers.find(es => es.server_id === server_id);
        const roleId = serverConfig?.role_id;

        // Remove from registry
        const { removed } = ctx.registry.removeServer(entity.id, server_id);
        if (!removed) {
          return { content: [{ type: 'text' as const, text: 'Error: Failed to remove server registration.' }] };
        }

        // Delete the Discord role if one exists
        if (roleId) {
          try {
            const guild = discordClient.guilds.cache.get(server_id);
            if (guild) {
              const role = await guild.roles.fetch(roleId);
              if (role) await role.delete('Entity left server via leave_server tool');
            }
          } catch {
            // Role deletion is best-effort
          }
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: true, server_id, message: `Left server ${server_id}. Role deleted.` }) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );

  // ==========================================================================
  // Phase 2 Tools
  // ==========================================================================

  // --- Messaging ---

  // --- send_dm ---
  server.tool(
    'send_dm',
    'Send a direct message to a Discord user. Note: the DM comes from the Arachne bot, not this entity\'s webhook persona.',
    {
      user_id: z.string().describe('The Discord user ID to DM'),
      content: z.string().describe('The message content to send'),
    },
    async ({ user_id, content }) => {
      try {
        const user = await discordClient.users.fetch(user_id);
        const msg = await user.send(content);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: true, message_id: msg.id }) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );

  // --- send_file ---
  server.tool(
    'send_file',
    'Send a file attachment to a Discord channel as this entity (with your name and avatar).',
    {
      channel_id: z.string().describe('The channel ID to send the file to'),
      file_name: z.string().describe('The file name (e.g., "image.png")'),
      file_data: z.string().describe('The file content, base64-encoded'),
      content: z.string().optional().describe('Optional message text to include with the file'),
    },
    async ({ channel_id, file_name, file_data, content }) => {
      if (!canAccessChannel(channel_id)) {
        return { content: [{ type: 'text' as const, text: 'Error: You do not have access to this channel.' }] };
      }
      try {
        const buffer = Buffer.from(file_data, 'base64');
        const result = await webhookManager.sendFileAsEntity(
          channel_id,
          file_name,
          buffer,
          entity.name,
          entity.avatar_url,
          content
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

  // --- Channel & Category Management ---

  // --- create_channel ---
  server.tool(
    'create_channel',
    'Create a new channel in a Discord server.',
    {
      server_id: z.string().describe('The server ID to create the channel in'),
      name: z.string().describe('The channel name'),
      type: z.enum(['text', 'voice', 'forum', 'announcement']).optional().describe('Channel type (default: text)'),
      category_id: z.string().optional().describe('Parent category ID'),
      topic: z.string().optional().describe('Channel topic'),
    },
    async ({ server_id, name, type, category_id, topic }) => {
      if (!allowedServerIds.has(server_id)) {
        return { content: [{ type: 'text' as const, text: 'Error: You do not have access to this server.' }] };
      }
      try {
        const guild = discordClient.guilds.cache.get(server_id);
        if (!guild) {
          return { content: [{ type: 'text' as const, text: 'Error: Server not found.' }] };
        }

        type GuildChannelTypes = ChannelType.GuildText | ChannelType.GuildVoice | ChannelType.GuildForum | ChannelType.GuildAnnouncement;
        const typeMap: Record<string, GuildChannelTypes> = {
          text: ChannelType.GuildText,
          voice: ChannelType.GuildVoice,
          forum: ChannelType.GuildForum,
          announcement: ChannelType.GuildAnnouncement,
        };
        const channelType = typeMap[type || 'text'] ?? ChannelType.GuildText;

        const channel = await guild.channels.create({
          name,
          type: channelType,
          parent: category_id || undefined,
          topic: topic || undefined,
        });

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: true, channel_id: channel.id, name: channel.name }) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );

  // --- set_channel_topic ---
  server.tool(
    'set_channel_topic',
    'Set the topic of a text channel.',
    {
      channel_id: z.string().describe('The channel ID'),
      topic: z.string().describe('The new topic text'),
    },
    async ({ channel_id, topic }) => {
      if (!canAccessChannel(channel_id)) {
        return { content: [{ type: 'text' as const, text: 'Error: You do not have access to this channel.' }] };
      }
      try {
        const channel = await discordClient.channels.fetch(channel_id);
        if (!channel || !('setTopic' in channel)) {
          return { content: [{ type: 'text' as const, text: 'Error: Channel not found or does not support topics.' }] };
        }
        await (channel as TextChannel).setTopic(topic);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: true, channel_id, topic }) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );

  // --- rename_channel ---
  server.tool(
    'rename_channel',
    'Rename a Discord channel.',
    {
      channel_id: z.string().describe('The channel ID'),
      new_name: z.string().describe('The new channel name'),
    },
    async ({ channel_id, new_name }) => {
      if (!canAccessChannel(channel_id)) {
        return { content: [{ type: 'text' as const, text: 'Error: You do not have access to this channel.' }] };
      }
      try {
        const channel = await discordClient.channels.fetch(channel_id);
        if (!channel || !('setName' in channel)) {
          return { content: [{ type: 'text' as const, text: 'Error: Channel not found or cannot be renamed.' }] };
        }
        await (channel as TextChannel).setName(new_name);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: true, channel_id, new_name }) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );

  // --- delete_channel ---
  server.tool(
    'delete_channel',
    'Delete a Discord channel. DANGEROUS — this action is irreversible.',
    {
      channel_id: z.string().describe('The channel ID to delete'),
      reason: z.string().optional().describe('Reason for deletion'),
    },
    async ({ channel_id, reason }) => {
      if (!canAccessChannel(channel_id)) {
        return { content: [{ type: 'text' as const, text: 'Error: You do not have access to this channel.' }] };
      }
      try {
        const channel = await discordClient.channels.fetch(channel_id);
        if (!channel || !('delete' in channel)) {
          return { content: [{ type: 'text' as const, text: 'Error: Channel not found.' }] };
        }
        await (channel as TextChannel).delete(reason || undefined);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: true, channel_id, deleted: true }) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );

  // --- create_category ---
  server.tool(
    'create_category',
    'Create a new category in a Discord server.',
    {
      server_id: z.string().describe('The server ID'),
      name: z.string().describe('The category name'),
      position: z.number().optional().describe('Position of the category'),
    },
    async ({ server_id, name, position }) => {
      if (!allowedServerIds.has(server_id)) {
        return { content: [{ type: 'text' as const, text: 'Error: You do not have access to this server.' }] };
      }
      try {
        const guild = discordClient.guilds.cache.get(server_id);
        if (!guild) {
          return { content: [{ type: 'text' as const, text: 'Error: Server not found.' }] };
        }
        const category = await guild.channels.create({
          name,
          type: ChannelType.GuildCategory,
          position: position ?? undefined,
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: true, category_id: category.id, name: category.name }) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );

  // --- move_channel ---
  server.tool(
    'move_channel',
    'Move a channel to a different category or position.',
    {
      channel_id: z.string().describe('The channel ID to move'),
      category_id: z.string().optional().describe('The target category ID (omit to remove from category)'),
      position: z.number().optional().describe('New position within the category'),
    },
    async ({ channel_id, category_id, position }) => {
      if (!canAccessChannel(channel_id)) {
        return { content: [{ type: 'text' as const, text: 'Error: You do not have access to this channel.' }] };
      }
      try {
        const channel = await discordClient.channels.fetch(channel_id);
        if (!channel || !('setParent' in channel)) {
          return { content: [{ type: 'text' as const, text: 'Error: Channel not found or cannot be moved.' }] };
        }
        const textChannel = channel as TextChannel;
        if (category_id !== undefined) {
          await textChannel.setParent(category_id || null);
        }
        if (position !== undefined) {
          await textChannel.setPosition(position);
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: true, channel_id, category_id: category_id ?? null, position: position ?? null }) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );

  // --- Reactions ---

  // --- get_reactions ---
  server.tool(
    'get_reactions',
    'Get all reactions on a message, including which users reacted.',
    {
      channel_id: z.string().describe('The channel ID'),
      message_id: z.string().describe('The message ID'),
    },
    async ({ channel_id, message_id }) => {
      if (!canAccessChannel(channel_id)) {
        return { content: [{ type: 'text' as const, text: 'Error: You do not have access to this channel.' }] };
      }
      try {
        const channel = await discordClient.channels.fetch(channel_id);
        if (!channel || !('messages' in channel)) {
          return { content: [{ type: 'text' as const, text: 'Error: Channel not found or not a text channel.' }] };
        }
        const message = await (channel as any).messages.fetch(message_id);
        const reactions: Array<{ emoji: string; count: number; users: Array<{ id: string; username: string }> }> = [];

        for (const [, reaction] of message.reactions.cache) {
          const users = await reaction.users.fetch();
          reactions.push({
            emoji: reaction.emoji.toString(),
            count: reaction.count,
            users: users.map((u: any) => ({ id: u.id, username: u.username })),
          });
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(reactions, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );

  // --- Polls ---

  // --- create_poll ---
  server.tool(
    'create_poll',
    'Create a poll in a Discord channel. Note: polls are sent as the bot, not the entity webhook persona.',
    {
      channel_id: z.string().describe('The channel ID'),
      question: z.string().describe('The poll question'),
      options: z.array(z.object({
        text: z.string().describe('Option text'),
        emoji: z.string().optional().describe('Optional emoji for this option'),
      })).describe('Poll options (2-10)'),
      duration_hours: z.number().optional().default(24).describe('Poll duration in hours (default 24)'),
      allow_multiselect: z.boolean().optional().default(false).describe('Allow multiple selections (default false)'),
    },
    async ({ channel_id, question, options, duration_hours, allow_multiselect }) => {
      if (!canAccessChannel(channel_id)) {
        return { content: [{ type: 'text' as const, text: 'Error: You do not have access to this channel.' }] };
      }
      try {
        const channel = await discordClient.channels.fetch(channel_id);
        if (!channel || !('send' in channel)) {
          return { content: [{ type: 'text' as const, text: 'Error: Channel not found or not a text channel.' }] };
        }
        const msg = await (channel as any).send({
          poll: {
            question: { text: question },
            answers: options.map(o => ({
              text: o.text,
              emoji: o.emoji ? { name: o.emoji } : undefined,
            })),
            duration: duration_hours,
            allowMultiselect: allow_multiselect,
            layoutType: 1,
          },
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: true, message_id: msg.id }) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );

  // --- Message Management ---

  // --- edit_message ---
  server.tool(
    'edit_message',
    'Edit a webhook message sent by this entity. Can only edit messages originally sent by this entity\'s webhook.',
    {
      channel_id: z.string().describe('The channel ID'),
      message_id: z.string().describe('The message ID to edit'),
      new_content: z.string().describe('The new message content'),
    },
    async ({ channel_id, message_id, new_content }) => {
      if (!canAccessChannel(channel_id)) {
        return { content: [{ type: 'text' as const, text: 'Error: You do not have access to this channel.' }] };
      }
      try {
        await webhookManager.editAsEntity(channel_id, message_id, new_content);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: true, message_id }) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );

  // --- delete_message ---
  server.tool(
    'delete_message',
    'Delete a message from a Discord channel. Can delete own webhook messages or others if the bot has MANAGE_MESSAGES permission.',
    {
      channel_id: z.string().describe('The channel ID'),
      message_id: z.string().describe('The message ID to delete'),
    },
    async ({ channel_id, message_id }) => {
      if (!canAccessChannel(channel_id)) {
        return { content: [{ type: 'text' as const, text: 'Error: You do not have access to this channel.' }] };
      }
      try {
        const channel = await discordClient.channels.fetch(channel_id);
        if (!channel || !('messages' in channel)) {
          return { content: [{ type: 'text' as const, text: 'Error: Channel not found or not a text channel.' }] };
        }
        const message = await (channel as any).messages.fetch(message_id);
        await message.delete();
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: true, message_id, deleted: true }) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );

  // --- pin_message ---
  server.tool(
    'pin_message',
    'Pin a message in a Discord channel.',
    {
      channel_id: z.string().describe('The channel ID'),
      message_id: z.string().describe('The message ID to pin'),
    },
    async ({ channel_id, message_id }) => {
      if (!canAccessChannel(channel_id)) {
        return { content: [{ type: 'text' as const, text: 'Error: You do not have access to this channel.' }] };
      }
      try {
        const channel = await discordClient.channels.fetch(channel_id);
        if (!channel || !('messages' in channel)) {
          return { content: [{ type: 'text' as const, text: 'Error: Channel not found or not a text channel.' }] };
        }
        const message = await (channel as any).messages.fetch(message_id);
        await message.pin();
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: true, message_id, pinned: true }) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );

  // --- Threads & Forums ---

  // --- create_thread ---
  server.tool(
    'create_thread',
    'Create a new thread in a Discord channel, optionally from an existing message.',
    {
      channel_id: z.string().describe('The channel ID to create the thread in'),
      name: z.string().describe('The thread name'),
      message_id: z.string().optional().describe('Optional message ID to start the thread from'),
      auto_archive_duration: z.number().optional().describe('Auto-archive duration in minutes (60, 1440, 4320, or 10080)'),
    },
    async ({ channel_id, name, message_id, auto_archive_duration }) => {
      if (!canAccessChannel(channel_id)) {
        return { content: [{ type: 'text' as const, text: 'Error: You do not have access to this channel.' }] };
      }
      try {
        const channel = await discordClient.channels.fetch(channel_id);
        if (!channel || !('threads' in channel)) {
          return { content: [{ type: 'text' as const, text: 'Error: Channel not found or does not support threads.' }] };
        }
        const threadOptions: any = {
          name,
          autoArchiveDuration: auto_archive_duration || undefined,
        };
        if (message_id) {
          threadOptions.startMessage = message_id;
        } else {
          threadOptions.type = ChannelType.PublicThread;
        }
        const thread = await (channel as any).threads.create(threadOptions);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: true, thread_id: thread.id, name: thread.name }) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );

  // --- create_forum_post ---
  server.tool(
    'create_forum_post',
    'Create a new post in a forum channel.',
    {
      channel_id: z.string().describe('The forum channel ID'),
      title: z.string().describe('The post title'),
      content: z.string().describe('The post content'),
      tags: z.array(z.string()).optional().describe('Optional tag IDs to apply'),
    },
    async ({ channel_id, title, content, tags }) => {
      if (!canAccessChannel(channel_id)) {
        return { content: [{ type: 'text' as const, text: 'Error: You do not have access to this channel.' }] };
      }
      try {
        const channel = await discordClient.channels.fetch(channel_id);
        if (!channel || !('threads' in channel)) {
          return { content: [{ type: 'text' as const, text: 'Error: Channel not found or not a forum channel.' }] };
        }
        const threadOptions: any = {
          name: title,
          message: { content },
        };
        if (tags && tags.length > 0) {
          threadOptions.appliedTags = tags;
        }
        const thread = await (channel as any).threads.create(threadOptions);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: true, thread_id: thread.id, name: thread.name }) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );

  // --- list_forum_threads ---
  server.tool(
    'list_forum_threads',
    'List threads in a forum channel.',
    {
      channel_id: z.string().describe('The forum channel ID'),
      limit: z.number().optional().default(20).describe('Maximum threads to return (default 20)'),
      include_archived: z.boolean().optional().default(false).describe('Include archived threads (default false)'),
    },
    async ({ channel_id, limit, include_archived }) => {
      if (!canAccessChannel(channel_id)) {
        return { content: [{ type: 'text' as const, text: 'Error: You do not have access to this channel.' }] };
      }
      try {
        const channel = await discordClient.channels.fetch(channel_id);
        if (!channel || !('threads' in channel)) {
          return { content: [{ type: 'text' as const, text: 'Error: Channel not found or not a forum channel.' }] };
        }

        const active = await (channel as any).threads.fetchActive();
        const threads: Array<{ id: string; name: string; archived: boolean; message_count: number; created_at: string }> = [];

        for (const [, thread] of active.threads) {
          threads.push({
            id: thread.id,
            name: thread.name,
            archived: thread.archived ?? false,
            message_count: thread.messageCount ?? 0,
            created_at: thread.createdAt?.toISOString() ?? '',
          });
        }

        if (include_archived) {
          const archived = await (channel as any).threads.fetchArchived({ limit });
          for (const [, thread] of archived.threads) {
            threads.push({
              id: thread.id,
              name: thread.name,
              archived: thread.archived ?? true,
              message_count: thread.messageCount ?? 0,
              created_at: thread.createdAt?.toISOString() ?? '',
            });
          }
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(threads.slice(0, limit), null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );

  // --- Attachments ---

  // --- fetch_attachment ---
  server.tool(
    'fetch_attachment',
    'Get attachment metadata and CDN URLs from a message. Does not download the files.',
    {
      channel_id: z.string().describe('The channel ID'),
      message_id: z.string().describe('The message ID'),
    },
    async ({ channel_id, message_id }) => {
      if (!canAccessChannel(channel_id)) {
        return { content: [{ type: 'text' as const, text: 'Error: You do not have access to this channel.' }] };
      }
      try {
        const channel = await discordClient.channels.fetch(channel_id);
        if (!channel || !('messages' in channel)) {
          return { content: [{ type: 'text' as const, text: 'Error: Channel not found or not a text channel.' }] };
        }
        const message = await (channel as any).messages.fetch(message_id);
        const attachments = message.attachments.map((a: any) => ({
          filename: a.name,
          url: a.url,
          size: a.size,
          content_type: a.contentType,
        }));
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(attachments, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );

  // --- Moderation ---

  // --- timeout_user ---
  server.tool(
    'timeout_user',
    'Timeout (mute) a user in a server for a specified duration.',
    {
      server_id: z.string().describe('The server ID'),
      user_id: z.string().describe('The user ID to timeout'),
      duration_minutes: z.number().describe('Timeout duration in minutes'),
      reason: z.string().optional().describe('Reason for the timeout'),
    },
    async ({ server_id, user_id, duration_minutes, reason }) => {
      if (!allowedServerIds.has(server_id)) {
        return { content: [{ type: 'text' as const, text: 'Error: You do not have access to this server.' }] };
      }
      try {
        const guild = discordClient.guilds.cache.get(server_id);
        if (!guild) {
          return { content: [{ type: 'text' as const, text: 'Error: Server not found.' }] };
        }
        const member = await guild.members.fetch(user_id);
        await member.timeout(duration_minutes * 60 * 1000, reason || undefined);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: true, user_id, duration_minutes }) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );

  // --- assign_role ---
  server.tool(
    'assign_role',
    'Assign a role to a user in a server.',
    {
      server_id: z.string().describe('The server ID'),
      user_id: z.string().describe('The user ID'),
      role_id: z.string().describe('The role ID to assign'),
      reason: z.string().optional().describe('Reason for assigning the role'),
    },
    async ({ server_id, user_id, role_id, reason }) => {
      if (!allowedServerIds.has(server_id)) {
        return { content: [{ type: 'text' as const, text: 'Error: You do not have access to this server.' }] };
      }
      try {
        const guild = discordClient.guilds.cache.get(server_id);
        if (!guild) {
          return { content: [{ type: 'text' as const, text: 'Error: Server not found.' }] };
        }
        const member = await guild.members.fetch(user_id);
        await member.roles.add(role_id, reason || undefined);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: true, user_id, role_id, action: 'assigned' }) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );

  // --- remove_role ---
  server.tool(
    'remove_role',
    'Remove a role from a user in a server.',
    {
      server_id: z.string().describe('The server ID'),
      user_id: z.string().describe('The user ID'),
      role_id: z.string().describe('The role ID to remove'),
      reason: z.string().optional().describe('Reason for removing the role'),
    },
    async ({ server_id, user_id, role_id, reason }) => {
      if (!allowedServerIds.has(server_id)) {
        return { content: [{ type: 'text' as const, text: 'Error: You do not have access to this server.' }] };
      }
      try {
        const guild = discordClient.guilds.cache.get(server_id);
        if (!guild) {
          return { content: [{ type: 'text' as const, text: 'Error: Server not found.' }] };
        }
        const member = await guild.members.fetch(user_id);
        await member.roles.remove(role_id, reason || undefined);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: true, user_id, role_id, action: 'removed' }) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );

  // --- Awareness ---

  // --- search_messages ---
  server.tool(
    'search_messages',
    'Search messages in a channel with various filters. At least one filter (keyword, author_id, before, after, has_attachment) is required.',
    {
      channel_id: z.string().describe('The channel ID to search in'),
      keyword: z.string().optional().describe('Keyword to search for in message content'),
      author_id: z.string().optional().describe('Filter by author user ID'),
      before: z.string().optional().describe('Only messages before this ISO date'),
      after: z.string().optional().describe('Only messages after this ISO date'),
      has_attachment: z.boolean().optional().describe('Filter messages that have attachments'),
      limit: z.number().optional().default(20).describe('Max results to return (default 20, max 50)'),
      scan_depth: z.number().optional().default(200).describe('How many messages to scan (default 200, max 500)'),
    },
    async ({ channel_id, keyword, author_id, before, after, has_attachment, limit, scan_depth }) => {
      if (!canAccessChannel(channel_id)) {
        return { content: [{ type: 'text' as const, text: 'Error: You do not have access to this channel.' }] };
      }

      // At least one filter required
      if (!keyword && !author_id && !before && !after && has_attachment === undefined) {
        return { content: [{ type: 'text' as const, text: 'Error: At least one filter (keyword, author_id, before, after, has_attachment) is required.' }] };
      }

      try {
        const channel = await discordClient.channels.fetch(channel_id);
        if (!channel || !('messages' in channel)) {
          return { content: [{ type: 'text' as const, text: 'Error: Channel not found or not a text channel.' }] };
        }

        const cappedScanDepth = Math.min(scan_depth, 500);
        const cappedLimit = Math.min(limit, 50);

        // Fetch in batches of 100
        const allMessages: any[] = [];
        let lastId: string | undefined;
        let remaining = cappedScanDepth;

        while (remaining > 0) {
          const fetchCount = Math.min(remaining, 100);
          const batch = await (channel as any).messages.fetch({
            limit: fetchCount,
            ...(lastId ? { before: lastId } : {}),
          });
          if (batch.size === 0) break;
          allMessages.push(...batch.values());
          lastId = batch.last()?.id;
          remaining -= batch.size;
        }

        // Apply filters
        let filtered = allMessages;

        if (keyword) {
          const kw = keyword.toLowerCase();
          filtered = filtered.filter((m: any) => m.content.toLowerCase().includes(kw));
        }
        if (author_id) {
          filtered = filtered.filter((m: any) => m.author.id === author_id);
        }
        if (before) {
          const beforeDate = new Date(before);
          filtered = filtered.filter((m: any) => m.createdAt < beforeDate);
        }
        if (after) {
          const afterDate = new Date(after);
          filtered = filtered.filter((m: any) => m.createdAt > afterDate);
        }
        if (has_attachment !== undefined) {
          filtered = filtered.filter((m: any) =>
            has_attachment ? m.attachments.size > 0 : m.attachments.size === 0
          );
        }

        // Sort by newest first, take limit
        const results = filtered
          .sort((a: any, b: any) => b.createdTimestamp - a.createdTimestamp)
          .slice(0, cappedLimit)
          .map((m: any) => ({
            id: m.id,
            author_id: m.author.id,
            author_name: m.member?.displayName || m.author.displayName || m.author.username,
            content: m.content,
            timestamp: m.createdAt.toISOString(),
            attachments: m.attachments.size,
          }));

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ count: results.length, scanned: allMessages.length, results }, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );

  // --- list_members ---
  server.tool(
    'list_members',
    'List members of a Discord server.',
    {
      server_id: z.string().describe('The server ID'),
      limit: z.number().optional().default(100).describe('Maximum members to return (default 100)'),
    },
    async ({ server_id, limit }) => {
      if (!allowedServerIds.has(server_id)) {
        return { content: [{ type: 'text' as const, text: 'Error: You do not have access to this server.' }] };
      }
      try {
        const guild = discordClient.guilds.cache.get(server_id);
        if (!guild) {
          return { content: [{ type: 'text' as const, text: 'Error: Server not found.' }] };
        }
        const members = await guild.members.list({ limit });
        const result = members.map(m => ({
          id: m.id,
          username: m.user.username,
          display_name: m.displayName,
          is_bot: m.user.bot,
          joined_at: m.joinedAt?.toISOString() ?? null,
          roles: m.roles.cache.map(r => ({ id: r.id, name: r.name })),
        }));
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

  // --- get_user_info ---
  server.tool(
    'get_user_info',
    'Get detailed information about a user in a server.',
    {
      server_id: z.string().describe('The server ID'),
      user_id: z.string().describe('The user ID'),
    },
    async ({ server_id, user_id }) => {
      if (!allowedServerIds.has(server_id)) {
        return { content: [{ type: 'text' as const, text: 'Error: You do not have access to this server.' }] };
      }
      try {
        const guild = discordClient.guilds.cache.get(server_id);
        if (!guild) {
          return { content: [{ type: 'text' as const, text: 'Error: Server not found.' }] };
        }
        const member = await guild.members.fetch(user_id);
        const result = {
          id: member.id,
          username: member.user.username,
          display_name: member.displayName,
          avatar: member.user.avatarURL(),
          roles: member.roles.cache.map(r => ({ id: r.id, name: r.name })),
          joined_at: member.joinedAt?.toISOString() ?? null,
          status: member.presence?.status ?? 'offline',
        };
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

  // --- list_roles ---
  server.tool(
    'list_roles',
    'List all roles in a Discord server.',
    {
      server_id: z.string().describe('The server ID'),
    },
    async ({ server_id }) => {
      if (!allowedServerIds.has(server_id)) {
        return { content: [{ type: 'text' as const, text: 'Error: You do not have access to this server.' }] };
      }
      try {
        const guild = discordClient.guilds.cache.get(server_id);
        if (!guild) {
          return { content: [{ type: 'text' as const, text: 'Error: Server not found.' }] };
        }
        const roles = guild.roles.cache.map(r => ({
          id: r.id,
          name: r.name,
          color: r.hexColor,
          position: r.position,
          mentionable: r.mentionable,
          member_count: r.members.size,
        }));
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(roles, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );
}
