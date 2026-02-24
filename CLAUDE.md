# arachne-discord-mcp

Multi-tenant Discord MCP bot — one bot, unlimited AI identities via webhooks. Self-hosted, privacy-first, AI-agnostic.

## Project Structure
```
arachne-discord-mcp/
├── ARCHITECTURE.md          # Full architecture spec
├── arcadia-vox-recon.md     # Competitive intel (Vox/Codependent AI)
├── DEVLOG.md                # Development log
├── CLAUDE.md                # This file
└── src/                     # Source code (Phase 1)
```

## Stack
- **Runtime:** Node.js 20+ / TypeScript
- **Discord:** discord.js v14
- **Database:** SQLite (better-sqlite3)
- **MCP Server:** SSE + Streamable HTTP
- **Encryption:** AES-256-GCM per entity, bcrypt for key hashing
- **Deployment:** Fly.io free tier (Singapore region)

## Key Files (once built)
- `src/bot.ts` — Discord gateway listener + router
- `src/mcp-server.ts` — Per-entity MCP endpoint handler
- `src/webhook-manager.ts` — Webhook creation + identity masking
- `src/entity-registry.ts` — SQLite CRUD for entities
- `src/message-bus.ts` — In-memory encrypted message queues
- `src/crypto.ts` — Key derivation, encryption, hashing

## Commands
- `npm run dev` — Local development
- `npm run build` — Build for production
- `fly deploy` — Deploy to Fly.io

## Git
- Repo: SolanceLab/arachne-discord-mcp (private)
- **No Co-Authored-By lines** — SolanceLab repos are Anne & Chadrien's joint account
