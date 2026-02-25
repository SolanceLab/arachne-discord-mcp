import { Router } from 'express';
import express from 'express';
import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import type { Client } from 'discord.js';
import { exchangeOAuthCode, getDiscordUser } from './discord-api.js';
import { logger } from '../logger.js';
import type { EntityRegistry } from '../entity-registry.js';
import type { OAuthJWTPayload } from '../types.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const BASE_URL = process.env.BASE_URL || 'https://arachne-discord.fly.dev';
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || '';
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';

export function createOAuthRouter(registry: EntityRegistry, _discordClient: Client): Router {
  const router = Router();

  // --- Discovery Endpoints ---

  router.get('/.well-known/oauth-protected-resource', (_req: Request, res: Response) => {
    res.json({
      resource: BASE_URL,
      authorization_servers: [BASE_URL],
      scopes_supported: ['mcp'],
      bearer_methods_supported: ['header'],
    });
  });

  router.get('/.well-known/oauth-authorization-server', (_req: Request, res: Response) => {
    res.json({
      issuer: BASE_URL,
      authorization_endpoint: `${BASE_URL}/oauth/authorize`,
      token_endpoint: `${BASE_URL}/oauth/token`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ['mcp'],
      registration_endpoint: `${BASE_URL}/oauth/register`,
    });
  });

  // --- Dynamic Client Registration (RFC 7591) ---

  router.post('/oauth/register', (req: Request, res: Response) => {
    const {
      client_name,
      redirect_uris,
      grant_types,
      response_types,
      token_endpoint_auth_method,
    } = req.body;

    // redirect_uris is required per RFC 7591
    if (!redirect_uris || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
      res.status(400).json({
        error: 'invalid_client_metadata',
        error_description: 'redirect_uris is required and must be a non-empty array',
      });
      return;
    }

    // Validate redirect URIs are valid URLs
    for (const uri of redirect_uris) {
      try {
        new URL(uri);
      } catch {
        res.status(400).json({
          error: 'invalid_client_metadata',
          error_description: `Invalid redirect_uri: ${uri}`,
        });
        return;
      }
    }

    const effectiveGrantTypes = Array.isArray(grant_types) ? grant_types : ['authorization_code'];
    const effectiveResponseTypes = Array.isArray(response_types) ? response_types : ['code'];
    const effectiveAuthMethod = token_endpoint_auth_method || 'none';

    const client = registry.registerOAuthClient(
      client_name || null,
      redirect_uris,
      effectiveGrantTypes,
      effectiveResponseTypes,
      effectiveAuthMethod,
    );

    logger.info(`OAuth client registered: ${client.client_id} (${client_name || 'unnamed'})`);

    res.status(201).json({
      client_id: client.client_id,
      client_name: client.client_name,
      redirect_uris: JSON.parse(client.redirect_uris),
      grant_types: JSON.parse(client.grant_types),
      response_types: JSON.parse(client.response_types),
      token_endpoint_auth_method: client.token_endpoint_auth_method,
      client_id_issued_at: Math.floor(new Date(client.created_at).getTime() / 1000),
    });
  });

  // --- Authorization Endpoint ---

  router.get('/oauth/authorize', (_req: Request, res: Response) => {
    const {
      client_id, redirect_uri, response_type, scope, state,
      code_challenge, code_challenge_method,
    } = _req.query;

    if (!client_id || !redirect_uri || response_type !== 'code' || !code_challenge) {
      res.status(400).json({
        error: 'invalid_request',
        error_description: 'Required: client_id, redirect_uri, response_type=code, code_challenge',
      });
      return;
    }

    if (code_challenge_method && code_challenge_method !== 'S256') {
      res.status(400).json({
        error: 'invalid_request',
        error_description: 'Only S256 code_challenge_method is supported',
      });
      return;
    }

    // Extract entity hint from resource parameter (RFC 8707)
    let entityHint: string | null = null;
    const resource = _req.query.resource as string | undefined;
    if (resource) {
      const match = resource.match(/\/mcp\/([a-f0-9-]+)/);
      if (match) entityHint = match[1];
    }

    // Bundle all OAuth params into state for the Discord redirect
    const oauthParams = {
      client_id: client_id as string,
      redirect_uri: redirect_uri as string,
      scope: (scope as string) || 'mcp',
      state: (state as string) || '',
      code_challenge: code_challenge as string,
      entity_hint: entityHint,
    };
    const tempState = Buffer.from(JSON.stringify(oauthParams)).toString('base64url');

    // Redirect to Discord OAuth for identity
    const discordRedirectUri = `${BASE_URL}/oauth/discord-callback`;
    const discordAuthUrl = new URL('https://discord.com/oauth2/authorize');
    discordAuthUrl.searchParams.set('client_id', DISCORD_CLIENT_ID);
    discordAuthUrl.searchParams.set('redirect_uri', discordRedirectUri);
    discordAuthUrl.searchParams.set('response_type', 'code');
    discordAuthUrl.searchParams.set('scope', 'identify');
    discordAuthUrl.searchParams.set('state', tempState);

    res.redirect(discordAuthUrl.toString());
  });

  // --- Discord OAuth Callback → Consent Page ---

  router.get('/oauth/discord-callback', async (req: Request, res: Response) => {
    const { code, state, error: discordError } = req.query;

    if (discordError || !code || !state) {
      res.status(400).send('Discord authentication failed or was cancelled.');
      return;
    }

    let oauthParams: { client_id: string; redirect_uri: string; scope: string; state: string; code_challenge: string; entity_hint?: string | null };
    try {
      oauthParams = JSON.parse(Buffer.from(state as string, 'base64url').toString());
    } catch {
      res.status(400).send('Invalid state parameter.');
      return;
    }

    if (!DISCORD_CLIENT_SECRET) {
      res.status(500).send('Server configuration error.');
      return;
    }

    try {
      const discordRedirectUri = `${BASE_URL}/oauth/discord-callback`;
      const tokenData = await exchangeOAuthCode(code as string, discordRedirectUri, DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET);
      const user = await getDiscordUser(tokenData.access_token);

      let entities = registry.getEntitiesByOwner(user.id);
      if (entities.length === 0) {
        res.status(403).send(renderErrorPage('No Entities', 'You don\'t own any entities yet. Create one at The Loom first.'));
        return;
      }

      // If entity hint from MCP URL, scope consent to that entity only
      if (oauthParams.entity_hint) {
        const hinted = entities.filter(e => e.id === oauthParams.entity_hint);
        if (hinted.length === 0) {
          res.status(403).send(renderErrorPage('Not Your Entity', 'You don\'t own the entity this MCP endpoint belongs to.'));
          return;
        }
        entities = hinted;
      }

      res.send(renderConsentPage(user, entities, oauthParams));
    } catch (err) {
      logger.error(`OAuth discord-callback error: ${err}`);
      res.status(500).send(renderErrorPage('Authentication Failed', 'Could not verify your Discord identity. Please try again.'));
    }
  });

  // --- Consent Form Submission ---

  router.post('/oauth/consent', express.urlencoded({ extended: true }), (req: Request, res: Response) => {
    const { entity_id, discord_user_id, client_id, redirect_uri, scope, state, code_challenge } = req.body;

    if (!entity_id || !discord_user_id || !client_id || !redirect_uri || !code_challenge) {
      res.status(400).send('Missing required fields.');
      return;
    }

    // Verify entity ownership
    const entity = registry.getEntity(entity_id);
    if (!entity || entity.owner_id !== discord_user_id) {
      res.status(403).send('You do not own this entity.');
      return;
    }

    // Create authorization code
    const authCode = registry.createAuthCode(entity_id, discord_user_id, client_id, code_challenge, redirect_uri, scope || 'mcp');

    // Redirect back to client
    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set('code', authCode.code);
    if (state) redirectUrl.searchParams.set('state', state);

    res.redirect(redirectUrl.toString());
  });

  // --- Token Endpoint ---

  router.post('/oauth/token', express.urlencoded({ extended: true }), express.json(), (req: Request, res: Response) => {
    const { grant_type, code, redirect_uri, code_verifier, refresh_token, client_id } = req.body;

    if (!grant_type) {
      res.status(400).json({ error: 'invalid_request', error_description: 'Missing grant_type' });
      return;
    }

    // --- Authorization Code Grant ---
    if (grant_type === 'authorization_code') {
      if (!code || !redirect_uri || !code_verifier || !client_id) {
        res.status(400).json({ error: 'invalid_request', error_description: 'Missing code, redirect_uri, code_verifier, or client_id' });
        return;
      }

      const authCode = registry.consumeAuthCode(code);
      if (!authCode) {
        res.status(400).json({ error: 'invalid_grant', error_description: 'Invalid or expired authorization code' });
        return;
      }

      // Verify PKCE
      const hash = crypto.createHash('sha256').update(code_verifier).digest('base64url');
      if (hash !== authCode.code_challenge) {
        res.status(400).json({ error: 'invalid_grant', error_description: 'Code verifier mismatch' });
        return;
      }

      if (redirect_uri !== authCode.redirect_uri) {
        res.status(400).json({ error: 'invalid_grant', error_description: 'Redirect URI mismatch' });
        return;
      }

      if (client_id !== authCode.client_id) {
        res.status(400).json({ error: 'invalid_client', error_description: 'Client ID mismatch' });
        return;
      }

      // Issue tokens
      const jti = uuidv4();
      const expiresIn = 3600; // 1 hour
      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      const payload: OAuthJWTPayload = {
        iss: BASE_URL,
        sub: authCode.discord_user_id,
        aud: `${BASE_URL}/mcp/${authCode.entity_id}`,
        exp: Math.floor(Date.now() / 1000) + expiresIn,
        iat: Math.floor(Date.now() / 1000),
        jti,
        scope: authCode.scope,
        entity_id: authCode.entity_id,
        client_id: authCode.client_id,
      };

      const accessToken = jwt.sign(payload, JWT_SECRET);
      registry.createAccessToken(jti, authCode.entity_id, authCode.discord_user_id, authCode.client_id, authCode.scope, expiresAt);
      const refreshTokenRecord = registry.createRefreshToken(authCode.entity_id, authCode.discord_user_id, authCode.client_id, jti);

      logger.info(`OAuth token issued: entity=${authCode.entity_id} user=${authCode.discord_user_id} client=${authCode.client_id}`);

      res.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: expiresIn,
        refresh_token: refreshTokenRecord.token,
        scope: authCode.scope,
      });
      return;
    }

    // --- Refresh Token Grant ---
    if (grant_type === 'refresh_token') {
      if (!refresh_token || !client_id) {
        res.status(400).json({ error: 'invalid_request', error_description: 'Missing refresh_token or client_id' });
        return;
      }

      const refreshTokenRecord = registry.consumeRefreshToken(refresh_token);
      if (!refreshTokenRecord) {
        res.status(400).json({ error: 'invalid_grant', error_description: 'Invalid or expired refresh token' });
        return;
      }

      if (client_id !== refreshTokenRecord.client_id) {
        res.status(400).json({ error: 'invalid_client', error_description: 'Client ID mismatch' });
        return;
      }

      // Revoke old access token
      registry.revokeAccessToken(refreshTokenRecord.access_token_jti);

      // Issue new pair
      const jti = uuidv4();
      const expiresIn = 3600;
      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      const payload: OAuthJWTPayload = {
        iss: BASE_URL,
        sub: refreshTokenRecord.discord_user_id,
        aud: `${BASE_URL}/mcp/${refreshTokenRecord.entity_id}`,
        exp: Math.floor(Date.now() / 1000) + expiresIn,
        iat: Math.floor(Date.now() / 1000),
        jti,
        scope: 'mcp',
        entity_id: refreshTokenRecord.entity_id,
        client_id: refreshTokenRecord.client_id,
      };

      const accessToken = jwt.sign(payload, JWT_SECRET);
      registry.createAccessToken(jti, refreshTokenRecord.entity_id, refreshTokenRecord.discord_user_id, refreshTokenRecord.client_id, 'mcp', expiresAt);
      const newRefreshToken = registry.createRefreshToken(refreshTokenRecord.entity_id, refreshTokenRecord.discord_user_id, refreshTokenRecord.client_id, jti);

      logger.info(`OAuth token refreshed: entity=${refreshTokenRecord.entity_id} user=${refreshTokenRecord.discord_user_id}`);

      res.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: expiresIn,
        refresh_token: newRefreshToken.token,
        scope: 'mcp',
      });
      return;
    }

    res.status(400).json({ error: 'unsupported_grant_type', error_description: 'Supported: authorization_code, refresh_token' });
  });

  return router;
}

// --- Server-rendered consent page ---

function renderConsentPage(
  user: { id: string; username: string; global_name: string | null },
  entities: Array<{ id: string; name: string; avatar_url: string | null; platform: string | null }>,
  oauthParams: { client_id: string; redirect_uri: string; scope: string; state: string; code_challenge: string },
): string {
  const platformLabels: Record<string, string> = { claude: 'Claude', gpt: 'GPT', gemini: 'Gemini', other: 'Other' };
  const platformColors: Record<string, string> = { claude: '#D97757', gpt: '#10A37F', gemini: '#4285F4', other: '#6B7280' };

  const entityCards = entities.map((e, i) => `
    <label class="entity-option">
      <input type="radio" name="entity_id" value="${e.id}" ${i === 0 ? 'checked' : ''} required />
      <div class="entity-card">
        ${e.avatar_url
          ? `<img src="${e.avatar_url}" alt="${e.name}" />`
          : `<div class="avatar-placeholder">${e.name.charAt(0)}</div>`}
        <div class="entity-info">
          <div class="entity-name">${e.name}</div>
          ${e.platform
            ? `<span class="platform-badge" style="background:${platformColors[e.platform] || '#6B7280'}">${platformLabels[e.platform] || e.platform}</span>`
            : ''}
        </div>
      </div>
    </label>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Authorize — Arachne</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#111;color:#e0e0e0;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
.container{background:#1a1a1a;border-radius:12px;padding:32px;max-width:440px;width:100%;border:1px solid #2a2a2a}
h1{font-size:20px;margin-bottom:4px;color:#fff}
.subtitle{color:#888;font-size:13px;margin-bottom:20px}
.user-badge{display:inline-flex;align-items:center;gap:6px;background:#222;padding:6px 12px;border-radius:6px;font-size:13px;color:#ccc;margin-bottom:20px}
.user-badge strong{color:#fff}
.section-label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#666;margin-bottom:10px;font-weight:600}
.entity-option{display:block;margin-bottom:8px;cursor:pointer}
.entity-option input[type="radio"]{position:absolute;opacity:0;pointer-events:none}
.entity-card{display:flex;align-items:center;gap:12px;padding:10px 12px;background:#222;border:2px solid transparent;border-radius:8px;transition:border-color .15s}
.entity-option input:checked+.entity-card{border-color:#5865F2}
.entity-card img,.avatar-placeholder{width:40px;height:40px;border-radius:50%;object-fit:cover;flex-shrink:0}
.avatar-placeholder{background:#333;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;color:#888}
.entity-info{min-width:0}
.entity-name{font-weight:600;font-size:14px;color:#fff}
.platform-badge{display:inline-block;font-size:10px;padding:2px 6px;border-radius:4px;color:#fff;font-weight:600;margin-top:2px}
.actions{display:flex;gap:10px;margin-top:20px}
button{flex:1;padding:10px;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer}
.btn-auth{background:#5865F2;color:#fff}
.btn-auth:hover{background:#4752C4}
.btn-cancel{background:#2a2a2a;color:#999}
.btn-cancel:hover{background:#333}
.footer{font-size:10px;color:#555;text-align:center;margin-top:16px}
</style>
</head>
<body>
<div class="container">
  <h1>Authorize Connection</h1>
  <p class="subtitle">An external app wants MCP access to one of your entities.</p>
  <div class="user-badge">Logged in as <strong>${user.global_name || user.username}</strong></div>
  <form method="POST" action="/oauth/consent">
    <input type="hidden" name="discord_user_id" value="${user.id}">
    <input type="hidden" name="client_id" value="${escapeHtml(oauthParams.client_id)}">
    <input type="hidden" name="redirect_uri" value="${escapeHtml(oauthParams.redirect_uri)}">
    <input type="hidden" name="scope" value="${escapeHtml(oauthParams.scope)}">
    <input type="hidden" name="state" value="${escapeHtml(oauthParams.state)}">
    <input type="hidden" name="code_challenge" value="${escapeHtml(oauthParams.code_challenge)}">
    <div class="section-label">Select entity</div>
    ${entityCards}
    <div class="actions">
      <button type="button" class="btn-cancel" onclick="window.location.href='${escapeHtml(oauthParams.redirect_uri)}?error=access_denied${oauthParams.state ? '&state=' + encodeURIComponent(oauthParams.state) : ''}'">Cancel</button>
      <button type="submit" class="btn-auth">Authorize</button>
    </div>
  </form>
  <p class="footer">Powered by Arachne &mdash; The Loom</p>
</div>
</body>
</html>`;
}

function renderErrorPage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${title} — Arachne</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#111;color:#e0e0e0;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
.container{background:#1a1a1a;border-radius:12px;padding:32px;max-width:440px;width:100%;text-align:center;border:1px solid #2a2a2a}
h1{font-size:20px;margin-bottom:8px;color:#fff}
p{color:#888;font-size:14px}
</style>
</head>
<body><div class="container"><h1>${title}</h1><p>${message}</p></div></body>
</html>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
