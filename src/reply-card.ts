/**
 * Reply card — the webhook stand-in for Discord's native reply.
 *
 * Webhooks cannot send `message_reference` (Discord's Execute Webhook endpoint
 * does not accept it), so an entity cannot post a true reply. Instead we attach
 * a small embed under the message, PluralKit-style: the replied-to author's
 * name + avatar, a "Reply to:" jump link, and the first 100 characters of the
 * original. The quote never grows with the original's length.
 */

export const REPLY_SNIPPET_MAX = 100;
const DEFAULT_COLOR = 0x5865F2;

export interface RepliedMessage {
  guildId: string;
  channelId: string;
  messageId: string;
  authorName: string;
  authorAvatarUrl?: string | null;
  content: string;
  hasAttachments: boolean;
}

/**
 * Cut a message down to a one-line snippet of at most `max` characters.
 * Collapses whitespace, never leaves half a mention/emoji/link token or an
 * unclosed spoiler/code span behind, and marks a cut with "…".
 */
export function truncateSnippet(text: string, max = REPLY_SNIPPET_MAX): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  const chars = Array.from(oneLine); // code points, so emoji aren't split
  if (chars.length <= max) return oneLine;

  let cut = chars.slice(0, max).join('');
  // Drop a half-cut <@id>, <#id>, <:emoji:id>, <t:...> token.
  cut = cut.replace(/<[^<>\s]*$/, '');
  // Drop a half-cut link.
  cut = cut.replace(/https?:\/\/\S*$/, '');
  cut = cut.trimEnd();
  // Close a spoiler or code span the cut left open — closing (never stripping
  // the opener) keeps spoilered text hidden in the card.
  if ((cut.match(/`/g) ?? []).length % 2 === 1) cut += '`';
  if ((cut.match(/\|\|/g) ?? []).length % 2 === 1) cut += '||';
  return `${cut}…`;
}

/**
 * Native Discord replies ping the replied-to author by default. A webhook
 * can't reply natively, so the ping has to live in the content as a mention.
 * Skipped when there's no pingable user (webhook/entity authors) or the
 * content already mentions them.
 */
export const DISCORD_CONTENT_MAX = 2000;

export function withReplyMention(content: string, authorId: string | null, ping: boolean): string {
  if (!ping || !authorId) return content;
  const mention = `<@${authorId}>`;
  if (content.includes(mention) || content.includes(`<@!${authorId}>`)) return content;
  const pinged = `${mention} ${content}`;
  // Never let the ping turn a sendable message into a rejected one.
  return pinged.length > DISCORD_CONTENT_MAX ? content : pinged;
}

export function parseAccentColor(hex: string | null | undefined): number {
  if (!hex) return DEFAULT_COLOR;
  const n = parseInt(hex.replace('#', ''), 16);
  return Number.isFinite(n) && n >= 0 && n <= 0xFFFFFF ? n : DEFAULT_COLOR;
}

export function buildReplyEmbed(
  replied: RepliedMessage,
  accentColor?: string | null
): Record<string, unknown> {
  const jumpLink = `https://discord.com/channels/${replied.guildId}/${replied.channelId}/${replied.messageId}`;

  let body = truncateSnippet(replied.content);
  if (!body) body = replied.hasAttachments ? '*(click to see attachment)*' : '*(click to see message)*';
  else if (replied.hasAttachments) body += ' 📎';

  return {
    author: {
      name: `${replied.authorName} ↩️`,
      ...(replied.authorAvatarUrl && { icon_url: replied.authorAvatarUrl }),
    },
    description: `**[Reply to:](${jumpLink})** ${body}`,
    color: parseAccentColor(accentColor),
  };
}
