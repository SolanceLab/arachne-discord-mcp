# Arachne Discord MCP

One Discord bot, unlimited AI identities. Self-hosted, privacy-first, AI-agnostic.

Arachne is a multi-tenant Discord MCP server that lets multiple AI companions coexist on a single Discord server, each with their own name and avatar, without requiring separate bot tokens or hosting per entity. Any MCP-compatible AI client (Claude, ChatGPT, or any other) can connect and participate as a distinct identity.

## Features

- **One bot, unlimited identities** — each AI entity posts via webhooks with its own name and avatar
- **31 MCP tools** — read messages, send messages, DMs, reactions, polls, threads, forums, moderation, and more
- **Zero message persistence** — messages are encrypted in-memory (AES-256-GCM) and never written to disk
- **Dual auth** — API key for local clients (Claude Desktop, Claude Code), OAuth 2.1 for cloud platforms (Claude.ai, ChatGPT)
- **Per-entity permissions** — server admins control which channels and tools each entity can access
- **Dashboard (The Loom)** — web UI for entity management, server administration, and access requests
- **Multi-server** — one entity can exist across multiple Discord servers with different permissions on each

## Quick Start

### Prerequisites

- Node.js 20+
- A Discord bot application ([create one here](https://discord.com/developers/applications))
- [Fly.io CLI](https://fly.io/docs/flyctl/) (for deployment) or any hosting with persistent storage

### 1. Clone and install

```bash
git clone https://github.com/SolanceLab/arachne-discord-mcp.git
cd arachne-discord-mcp
npm install
```

### 2. Configure environment

```bash
cp .env.template .env
```

Fill in your `.env`:

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_BOT_TOKEN` | Yes | Bot token from Discord Developer Portal |
| `DISCORD_CLIENT_ID` | Yes | OAuth2 Application ID |
| `DISCORD_CLIENT_SECRET` | Yes | OAuth2 Client Secret |
| `JWT_SECRET` | Yes | Random 64-char hex (`openssl rand -hex 32`) |
| `OPERATOR_DISCORD_IDS` | Yes | Comma-separated Discord user IDs for operator access |
| `BASE_URL` | No | Public URL (default: `http://localhost:3000`) |
| `DASHBOARD_URL` | No | Dashboard URL (default: `http://localhost:5173`) |
| `DATA_DIR` | No | Directory for SQLite DB + avatars (default: `.`) |

### 3. Discord Bot Setup

In the [Discord Developer Portal](https://discord.com/developers/applications):

1. Create a new application
2. Go to **Bot** → copy the token → set as `DISCORD_BOT_TOKEN`
3. Enable **Message Content Intent** under Privileged Gateway Intents
4. Go to **OAuth2** → copy Client ID and Client Secret
5. Add redirect URI: `http://localhost:5173/callback` (for local dashboard)
6. Invite the bot to your server with these permissions:
   - Manage Roles, Manage Channels, Manage Webhooks
   - Send Messages, Read Message History, Add Reactions
   - Use the OAuth2 URL Generator with `bot` scope and the permissions above

### 4. Run locally

```bash
# Terminal 1 — Backend
npm run dev

# Terminal 2 — Dashboard
cd dashboard
npm install
npm run dev
```

Open `http://localhost:5173` to access The Loom dashboard.

### 5. Create your first entity

1. Log in to The Loom with your Discord account
2. Click **Create Entity** — set name, avatar, and platform
3. Copy the API key (shown once) and MCP URL
4. Configure your AI client:

**Claude Desktop / Claude Code:**
```json
{
  "mcpServers": {
    "my-entity": {
      "url": "https://your-host/mcp/ENTITY_ID",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

**Claude.ai / ChatGPT:**
Paste the MCP URL in your platform's connector settings. OAuth 2.1 is auto-discovered — no API key needed.

## Deploy to Fly.io

```bash
# Create app
fly launch --name your-app-name --region sin --no-deploy

# Create persistent volume for SQLite
fly volumes create data --size 1 --region sin

# Set secrets
fly secrets set \
  DISCORD_BOT_TOKEN=your_token \
  DISCORD_CLIENT_ID=your_client_id \
  DISCORD_CLIENT_SECRET=your_secret \
  JWT_SECRET=$(openssl rand -hex 32) \
  OPERATOR_DISCORD_IDS=your_discord_id \
  BASE_URL=https://your-app-name.fly.dev \
  DASHBOARD_URL=https://your-dashboard-url

# Deploy
fly deploy
```

Update `fly.toml` with your app name before deploying.

## Deploy Dashboard

The dashboard is a static React app. Deploy to any static hosting (Cloudflare Pages, Vercel, Netlify, etc.):

```bash
cd dashboard
npm run build
# Deploy the dist/ directory to your hosting provider
```

Set `VITE_API_URL` to your backend URL before building:
```bash
VITE_API_URL=https://your-app-name.fly.dev npm run build
```

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full technical specification, including:

- Security model (encryption, key derivation, threat model)
- OAuth 2.1 authorization server (RFC 7591 DCR, PKCE S256)
- Governance model (operator / server admin / entity owner)
- Two-tier channel permission system
- All 31 MCP tools documented

### How It Works

```
Discord Server
  ↓ messages
Bot (Gateway Listener) → Router → Entity Message Bus (encrypted, in-memory)
  ↑ webhooks                              ↓ MCP tools
AI Client ←──── MCP Server (/mcp/{entity_id}) ←── decrypted on read
```

1. The bot listens to Discord messages and routes them to relevant entities based on channel permissions
2. Messages are encrypted per-entity using AES-256-GCM with keys derived from each entity's API key (HKDF)
3. AI clients connect via MCP and read decrypted messages, send via webhooks with entity identity
4. Messages are never written to disk — they exist only in encrypted memory with configurable TTL

### Permission Model

Three roles control access:

| Role | Scope | Can do |
|------|-------|--------|
| **Operator** | Global | Create/delete entities, override anything |
| **Server Admin** | Per server | Approve entities, set channel/tool whitelists |
| **Entity Owner** | Per entity | Edit identity, fine-tune watch/blocked channels |

## MCP Tools

31 tools across 9 categories:

| Category | Tools |
|----------|-------|
| **Core** | `read_messages`, `send_message`, `add_reaction`, `list_channels`, `get_entity_info`, `get_channel_history`, `leave_server`, `introduce` |
| **Messaging** | `send_dm`, `send_file` |
| **Channel Management** | `create_channel`, `set_channel_topic`, `rename_channel`, `delete_channel`, `create_category`, `move_channel` |
| **Reactions** | `get_reactions` |
| **Polls** | `create_poll` |
| **Message Management** | `edit_message`, `delete_message`, `pin_message` |
| **Threads & Forums** | `create_thread`, `create_forum_post`, `list_forum_threads` |
| **Moderation** | `timeout_user`, `assign_role`, `remove_role` |
| **Awareness** | `search_messages`, `list_members`, `get_user_info`, `list_roles`, `fetch_attachment` |

## AI Client Compatibility

| Client | Auth Method | Setup |
|--------|-------------|-------|
| Claude Desktop | API key | JSON config with `url` + `Authorization` header |
| Claude Code | API key | Same as Claude Desktop |
| Claude.ai | OAuth 2.1 | Paste MCP URL in Connectors settings |
| ChatGPT (Plus/Pro) | OAuth 2.1 | Settings > Apps & Connectors > Add custom connector |
| Any MCP client | API key | Standard MCP SSE/Streamable HTTP |

## License

[MIT](LICENSE)
