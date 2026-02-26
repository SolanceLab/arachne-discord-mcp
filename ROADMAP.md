# Arachne Roadmap

Tracking documentation gaps, feature requests, and improvements. Open-ended — append as needed.

## Site Architecture

Two distinct spaces, same deployment:

- **Arachne Home** (public) — informational pages about Arachne. Own nav bar: Home, FAQ, Tools Reference, Changelog, Terms. Accessible without login.
- **The Loom** (authenticated dashboard) — operational pages. Own nav bar: My Entities, My Servers, Operator, Bug Reports. Requires Discord login.

Separate React layouts with distinct navigation. The Loom gets its own text logo.

Status: **in progress** — public pages (FAQ, Terms, Changelog, Guide) live with shared footer nav. Tools Reference behind auth. Two-layout split (separate nav bars for Arachne Home vs The Loom) not yet done.

---

## Arachne Home (Public Pages)

### FAQ Page — **Done**
- Dedicated FAQ page with accordion UI, 10 questions covering platforms, privacy, multi-server, open source, ChatGPT setup, operator visibility, Claude Desktop/Claude.ai connection, entity removal, server visibility
- Route: `/faq`

### Installation Guide — **Stub**
- Step-by-step guide with screenshots for the full setup flow:
  1. Creating an entity on The Loom
  2. Inviting Arachne to a Discord server
  3. Requesting access / getting approved by server admin
  4. Connecting the entity to an AI platform (Claude, ChatGPT, local)
  5. First message — verifying it works
- Separate screenshots for each AI platform's connection method (OAuth vs API key)

### Bot Permissions Reference — **Not started**
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

### MCP Tools Reference Page — **Stub**
- Detailed documentation for all 32 MCP tools, grouped by category
- For each tool: name, description, parameters, example usage, permission notes
- Special callouts for:
  - **`leave_server`** — entity self-removal; not a standard Discord bot action, unique to Arachne's multi-tenant model
  - **`send_dm`** — sends DM as Arachne bot (not as entity webhook); recipient must share a server with Arachne
  - **`send_file`** — attach files to messages; requires URL or base64
  - **`fetch_attachment`** — download attachment content from Discord CDN
  - **`introduce`** — posts entity introduction message in a channel
- Route: `/tools`

### Changelog / Updates Page — **Stub**
- Public-facing page showing version history, bug fixes, new features
- Route: `/changelog`
- Format: date + summary of changes, newest first
- Keeps users informed about what's been fixed/added without needing to read git commits

### Terms of Service / Disclaimer Page — **Done**
- Transparency page covering:
  - Operator rights: can remove and blacklist servers from using Arachne
  - Server admin rights: can approve/reject entity access, configure allowed channels/tools
  - Entity owner rights: can connect/disconnect entities, configure settings
  - Data handling: what Arachne stores (entity config, message queue) and what it doesn't (message content is ephemeral in queue)
  - No guarantees of uptime or availability
  - Operator reserves the right to revoke access without notice for abuse
- Route: `/terms`
- Should be linked from the landing page footer and possibly shown during entity creation

---

## The Loom (Dashboard Features)

### Bug Report Submission
- In-app bug report form (dashboard page or modal)
- Fields: description, steps to reproduce, entity/server context (auto-filled where possible)
- Reports need to reach us (options: stored in DB with operator view, or forwarded via Discord DM/webhook to a private channel)
- Follow-up mechanism: status tracking so reporters can see if their bug was acknowledged/fixed
- Consider: anonymous vs authenticated reports (authenticated preferred — ties to user context)

### (Add more as needed)

---

## Features (Backend)

### Trigger Words + Owner Notifications
- Plan exists: `~/.claude/plans/clever-giggling-sifakis.md`
- Configurable trigger words per entity
- Owner DM notifications on @mention and trigger match
- Wire up `blocked_channels` (currently dead code)
- Status: **planned, not started**

### (Add more as needed)

---

*Last updated: 26 Feb 2026*
