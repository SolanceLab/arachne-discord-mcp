# arachne-discord-mcp

Multi-tenant Discord MCP bot — one bot, unlimited AI identities via webhooks. Self-hosted, privacy-first, AI-agnostic.

## Project Structure
```
arachne-discord-mcp/
├── ARCHITECTURE.md          # Full architecture spec
├── src/                     # Backend (TypeScript, Express, discord.js)
│   ├── bot.ts               # Discord gateway listener + router
│   ├── mcp-server.ts        # Per-entity MCP endpoint handler + Express app
│   ├── webhook-manager.ts   # Webhook creation + identity masking
│   ├── entity-registry.ts   # SQLite CRUD for entities + OAuth
│   ├── message-bus.ts       # In-memory encrypted message queues
│   ├── crypto.ts            # Key derivation, encryption, hashing
│   └── api/                 # REST API routes (auth, entities, servers, OAuth)
├── dashboard/               # The Loom (React + Vite frontend)
│   └── src/
│       ├── pages/           # Dashboard pages
│       └── lib/             # API client, utilities
├── fly.toml                 # Fly.io deployment config
└── Dockerfile               # Container build
```

## Stack
- **Runtime:** Node.js 20+ / TypeScript
- **Discord:** discord.js v14
- **Database:** SQLite (better-sqlite3)
- **MCP Server:** SSE + Streamable HTTP
- **Auth:** Dual — API key (bcrypt) for local clients, OAuth 2.1 (JWT) for cloud platforms
- **Encryption:** AES-256-GCM per entity, HKDF key derivation
- **Frontend:** React 19 + Vite + TailwindCSS
- **Deployment:** Fly.io (backend), Cloudflare Pages (dashboard)

## Commands
- `npm run dev` — Local development (backend)
- `npm run build` — Build for production
- `fly deploy` — Deploy backend to Fly.io
- `cd dashboard && npm run dev` — Local dashboard development
- `cd dashboard && npm run deploy` — Deploy dashboard to Cloudflare Pages

## Key Patterns
- All message content is encrypted in-memory, never written to disk or database
- Entity permissions are scoped per server (channel whitelist + tool whitelist)
- MCP endpoint accepts both API key and OAuth JWT tokens
- Webhooks are shared per channel with username/avatar overrides per entity
