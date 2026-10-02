import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReplyEmbed, truncateSnippet, parseAccentColor, withReplyMention, REPLY_SNIPPET_MAX } from './reply-card.js';

const base = {
  guildId: '1', channelId: '2', messageId: '3',
  authorName: 'Alex', authorAvatarUrl: 'https://cdn.example/a.png',
  content: 'hello there', hasAttachments: false,
};

test('short message is quoted whole, no ellipsis', () => {
  assert.equal(truncateSnippet('hello there'), 'hello there');
});

test('long message is cut to the cap with an ellipsis', () => {
  const long = 'word '.repeat(600); // ~3000 chars
  const out = truncateSnippet(long);
  assert.ok(out.endsWith('…'));
  assert.ok(Array.from(out).length <= REPLY_SNIPPET_MAX + 1);
});

test('newlines collapse to one line', () => {
  assert.equal(truncateSnippet('line one\n\nline two'), 'line one line two');
});

test('a mention cut in half is dropped, not left broken', () => {
  const text = 'a'.repeat(90) + ' <@123456789012345678> tail';
  const out = truncateSnippet(text);
  assert.ok(!out.includes('<@'), out);
});

test('a link cut in half is dropped', () => {
  const text = 'a'.repeat(80) + ' https://example.com/some/very/long/path/here';
  const out = truncateSnippet(text);
  assert.ok(!out.includes('http'), out);
});

test('a spoiler cut in half stays hidden (closed, not stripped)', () => {
  const out = truncateSnippet('||' + 'secret '.repeat(30) + '||');
  assert.ok(out.startsWith('||secret'), out);
  assert.ok(out.endsWith('||…'), out);
});

test('a spoiler opened near the cut is closed', () => {
  const out = truncateSnippet('a'.repeat(90) + ' ||secret spoiler text that runs long||');
  assert.equal((out.match(/\|\|/g) ?? []).length % 2, 0, out);
});

test('an inline code span cut in half is closed', () => {
  const out = truncateSnippet('a'.repeat(90) + ' `some code that runs long`');
  assert.equal((out.match(/`/g) ?? []).length % 2, 0, out);
});

test('emoji are not split mid code point', () => {
  const out = truncateSnippet('😀'.repeat(150));
  assert.ok(!out.includes('�'));
  assert.equal(Array.from(out.replace('…', '')).length, REPLY_SNIPPET_MAX);
});

test('embed carries author, jump link, snippet and entity colour', () => {
  const e = buildReplyEmbed(base, '#ff8800') as any;
  assert.equal(e.author.name, 'Alex ↩️');
  assert.equal(e.author.icon_url, 'https://cdn.example/a.png');
  assert.match(e.description, /\*\*\[Reply to:\]\(https:\/\/discord\.com\/channels\/1\/2\/3\)\*\* hello there/);
  assert.equal(e.color, 0xff8800);
});

test('attachment-only message gets a placeholder', () => {
  const e = buildReplyEmbed({ ...base, content: '', hasAttachments: true }) as any;
  assert.match(e.description, /click to see attachment/);
});

test('text plus attachment gets a paperclip', () => {
  const e = buildReplyEmbed({ ...base, hasAttachments: true }) as any;
  assert.match(e.description, /hello there 📎$/);
});

test('bad or missing colour falls back to blurple', () => {
  assert.equal(parseAccentColor(null), 0x5865F2);
  assert.equal(parseAccentColor('#zzz'), 0x5865F2);
});

test('reply pings the author by prefixing a mention', () => {
  assert.equal(withReplyMention('hi', '42', true), '<@42> hi');
});

test('ping off leaves content untouched', () => {
  assert.equal(withReplyMention('hi', '42', false), 'hi');
});

test('no pingable author (webhook/entity) leaves content untouched', () => {
  assert.equal(withReplyMention('hi', null, true), 'hi');
});

test('an existing mention of the author is not doubled', () => {
  assert.equal(withReplyMention('thanks <@42>!', '42', true), 'thanks <@42>!');
  assert.equal(withReplyMention('thanks <@!42>!', '42', true), 'thanks <@!42>!');
});

test('a message the mention would push past 2000 chars keeps its content, unpinged', () => {
  const long = 'x'.repeat(1990);
  assert.equal(withReplyMention(long, '123456789012345678', true), long);
});
