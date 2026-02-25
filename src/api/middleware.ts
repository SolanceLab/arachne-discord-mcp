import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import type { JWTPayload } from '../types.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

/**
 * Middleware: require a valid JWT. Attaches user to req.user.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JWTPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Middleware: require operator role.
 */
export function requireOperator(req: Request, res: Response, next: NextFunction): void {
  if (!req.user?.is_operator) {
    res.status(403).json({ error: 'Operator access required' });
    return;
  }
  next();
}

/**
 * Middleware factory: require admin of a specific server.
 * Server ID is read from req.params.server_id.
 */
export function requireServerAdmin(req: Request, res: Response, next: NextFunction): void {
  const serverId = (req.params.server_id || req.params.id) as string;
  if (!serverId) {
    res.status(400).json({ error: 'Server ID required' });
    return;
  }
  // Operators can access any server
  if (req.user?.is_operator) {
    next();
    return;
  }
  if (!req.user?.admin_guilds.includes(serverId)) {
    res.status(403).json({ error: 'Server admin access required' });
    return;
  }
  next();
}

/**
 * Sign a JWT payload.
 */
export function signJWT(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}
