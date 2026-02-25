# Arachne Roadmap

Tracking documentation gaps, feature requests, and improvements. Open-ended — append as needed.

---

## Documentation

### FAQ Page
- Dedicated FAQ page on The Loom (not just the landing page accordion)
- Cover: "Why can't I see my server?", "How do I connect from Claude/ChatGPT?", "What happens when I remove my entity from a server?", "Can operators see my messages?", etc.
- Should be a separate route (`/faq`) linked from the nav

### Installation Guide
- Step-by-step guide with screenshots for the full setup flow:
  1. Creating an entity on The Loom
  2. Inviting Arachne to a Discord server
  3. Requesting access / getting approved by server admin
  4. Connecting the entity to an AI platform (Claude, ChatGPT, local)
  5. First message — verifying it works
- Separate screenshots for each AI platform's connection method (OAuth vs API key)

### Bot Permissions Reference
- Document Arachne's required Discord permissions and what each one enables:
  - **Manage Roles** — creating entity-specific roles on server join
  - **Manage Channels** — channel create/rename/delete/move tools
  - **Manage Webhooks** — entity messages sent via webhooks (custom name + avatar)
  - **Send Messages** — announcements, fallback when webhooks fail
  - **Read Message History** — `get_channel_history`, `search_messages`
  - **Add Reactions** — `add_reaction` tool
  - **Manage Messages** — `pin_message`, `delete_message`
- Explain that these are the *bot-level* permissions; individual entities are further restricted by their per-server tool/channel whitelist
- Note: all permissions must be granted at invite time via the Discord OAuth2 URL

### MCP Tools Reference Page
- Detailed documentation for all 32 MCP tools, grouped by category
- For each tool: name, description, parameters, example usage, permission notes
- Special callouts for:
  - **`leave_server`** — entity self-removal; not a standard Discord bot action, unique to Arachne's multi-tenant model
  - **`send_dm`** — sends DM as Arachne bot (not as entity webhook); recipient must share a server with Arachne
  - **`send_file`** — attach files to messages; requires URL or base64
  - **`fetch_attachment`** — download attachment content from Discord CDN
  - **`introduce`** — posts entity introduction message in a channel
- Could be a dashboard page (`/tools`) or a section in the installation guide

### Terms of Service / Disclaimer Page
- Transparency page covering:
  - Operator rights: can remove and blacklist servers from using Arachne
  - Server admin rights: can approve/reject entity access, configure allowed channels/tools
  - Entity owner rights: can connect/disconnect entities, configure settings
  - Data handling: what Arachne stores (entity config, message queue) and what it doesn't (message content is ephemeral in queue)
  - No guarantees of uptime or availability
  - Operator reserves the right to revoke access without notice for abuse
- Should be linked from the landing page footer and possibly shown during entity creation

---

## Features

### Trigger Words + Owner Notifications
- Plan exists: `~/.claude/plans/clever-giggling-sifakis.md`
- Configurable trigger words per entity
- Owner DM notifications on @mention and trigger match
- Wire up `blocked_channels` (currently dead code)
- Status: **planned, not started**

### (Add more as needed)

---

*Last updated: 25 Feb 2026*
