import express from 'express';
import path from 'path';
import type { Request, Response, NextFunction } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { verifyApiKey } from './crypto.js';
import { registerTools } from './mcp-tools.js';
import { logger } from './logger.js';
import { createAuthRouter } from './api/auth.js';
import { createEntitiesRouter } from './api/entities.js';
import { createServersRouter } from './api/servers.js';
import { createOperatorRouter } from './api/operator.js';
import type { EntityRegistry } from './entity-registry.js';
import type { MessageBus } from './message-bus.js';
import type { WebhookManager } from './webhook-manager.js';
import type { Client } from 'discord.js';
import type { EntityContext } from './types.js';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
};

function applyCors(res: Response): void {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    res.setHeader(key, value);
  }
}

interface McpServerDeps {
  registry: EntityRegistry;
  bus: MessageBus;
  webhookManager: WebhookManager;
  discordClient: Client;
}

export function createMcpHttpServer(deps: McpServerDeps): express.Express {
  const { registry, bus, webhookManager, discordClient } = deps;
  const app = express();
  app.use(express.json());

  // CORS for all routes
  app.use((_req: Request, res: Response, next: NextFunction) => {
    applyCors(res);
    if (_req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Serve uploaded avatars
  const dataDir = process.env.DATA_DIR || '/data';
  app.use('/avatars', express.static(path.join(dataDir, 'avatars'), {
    maxAge: '1h',
    immutable: false,
  }));

  // Health check (unauthenticated)
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      queues: bus.stats(),
    });
  });

  // Dashboard API routes
  app.use('/api/auth', createAuthRouter(registry, discordClient));
  app.use('/api/entities', createEntitiesRouter(registry, discordClient));
  app.use('/api/servers', createServersRouter(registry, discordClient));
  app.use('/api/operator', createOperatorRouter(registry, discordClient));

  // DELETE for MCP session close
  app.delete('/mcp/:entity_id', (_req: Request, res: Response) => {
    res.status(200).json({ message: 'Session closed' });
  });

  // GET for MCP (not supported in stateless mode)
  app.get('/mcp/:entity_id', (_req: Request, res: Response) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed. Use POST for MCP requests.' },
      id: null,
    });
  });

  // Main MCP endpoint — per-entity routing
  app.post('/mcp/:entity_id', async (req: Request, res: Response) => {
    const entityId = req.params.entity_id;

    // Extract Bearer token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }
    const apiKey = authHeader.slice(7);

    // Look up entity
    const entity = registry.getEntity(entityId as string);
    if (!entity || !entity.active) {
      res.status(404).json({ error: 'Entity not found' });
      return;
    }

    // Verify API key
    const valid = await verifyApiKey(apiKey, entity.api_key_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }

    // Get entity's server configurations
    const entityServers = registry.getEntityServers(entityId as string);

    // Build entity context for tools
    const ctx: EntityContext = {
      entity,
      entityServers,
      registry,
      bus,
      webhookManager,
      discordClient,
    };

    // Create stateless McpServer + transport per request
    const server = new McpServer({ name: 'arachne', version: '0.1.0' });
    registerTools(server, ctx);

    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // Stateless — no sessions
      });

      await server.connect(transport);

      await transport.handleRequest(req, res, req.body);

      res.on('close', () => {
        transport.close();
        server.close();
      });
    } catch (err) {
      logger.error(`MCP request error for entity ${entityId}: ${err}`);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  return app;
}
