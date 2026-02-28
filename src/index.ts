import 'dotenv/config';
import { EntityRegistry } from './entity-registry.js';
import { MessageBus } from './message-bus.js';
import { Gateway } from './gateway.js';
import { Router } from './router.js';
import { WebhookManager } from './webhook-manager.js';
import { createMcpHttpServer } from './mcp-server.js';
import { logger } from './logger.js';

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const MCP_PORT = parseInt(process.env.MCP_PORT || '3000', 10);
const DB_PATH = process.env.DB_PATH || './arachne.db';

if (!DISCORD_BOT_TOKEN) {
  logger.error('DISCORD_BOT_TOKEN is required');
  process.exit(1);
}

async function main() {
  // Initialize components
  const registry = new EntityRegistry(DB_PATH);
  const bus = new MessageBus();
  const gateway = new Gateway();

  // Start message bus eviction timer
  bus.start();

  // Connect to Discord
  logger.info('Connecting to Discord...');
  await gateway.login(DISCORD_BOT_TOKEN!);

  // Wait for ready
  await new Promise<void>(resolve => {
    if (gateway.isReady) {
      resolve();
    } else {
      gateway.once('ready', resolve);
    }
  });

  // Initialize webhook manager
  const webhookManager = new WebhookManager(gateway.discordClient);

  // Initialize router (gateway → entity queues)
  const _router = new Router(gateway, registry, bus, gateway.discordClient, webhookManager);

  // Auto-leave banned servers on rejoin
  gateway.on('guildCreate', async (guild: { id: string; name: string; leave: () => Promise<void> }) => {
    if (registry.isServerBanned(guild.id)) {
      logger.info(`Banned server rejoined — auto-leaving: ${guild.name} (${guild.id})`);
      await guild.leave();
    }
  });

  // Create and start HTTP server for MCP endpoints
  const app = createMcpHttpServer({
    registry,
    bus,
    webhookManager,
    discordClient: gateway.discordClient,
  });

  const server = app.listen(MCP_PORT, '0.0.0.0', () => {
    logger.info(`MCP server listening on port ${MCP_PORT}`);
    logger.info('Arachne is ready.');
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — shutting down...`);

    server.close();
    bus.stop();
    await gateway.destroy();
    registry.close();

    logger.info('Shutdown complete.');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch(err => {
  logger.error(`Fatal error: ${err}`);
  process.exit(1);
});
