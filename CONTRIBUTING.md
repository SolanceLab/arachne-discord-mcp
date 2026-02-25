# Contributing

Arachne is an open-source project, but it's maintained as a side project by a small team. We welcome contributions that align with the project's goals.

## Reporting Issues

If you find a bug, feel free to [open an issue](../../issues). Include steps to reproduce, expected vs actual behavior, and your environment (Node version, OS, deployment method). We'll look at it when we can — no guarantees on response time.

## Pull Requests

We're open to PRs for bug fixes, documentation improvements, and small quality-of-life enhancements. For larger features or architectural changes, please open an issue first to discuss the approach.

Before submitting a PR:

1. Make sure the project builds cleanly (`npm run build`)
2. Test your changes locally with a real Discord bot
3. Keep changes focused — one PR per feature or fix

## What to Customize in Your Own Deployment

If you're running your own Arachne instance:

- `.env` — Bot token, client ID, secrets, operator IDs
- The Loom dashboard — Entity names, avatars, permissions
- `fly.toml` — App name and region for Fly.io deployment

## Questions

If you're stuck on setup or architecture decisions, check the [Architecture Guide](ARCHITECTURE.md) for design rationale, or open an issue.
