import { Request, Response, NextFunction } from 'express';
import { verifyToken, JwtUserPayload } from '../utils/auth.js';

export interface AuthenticatedRequest extends Request {
  user?: JwtUserPayload;
}

/**
 * Middleware: Requires a valid JWT bearer token.
 */
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'] || req.headers['x-auth-token'];
  const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : (typeof authHeader === 'string' ? authHeader.trim() : null);

  if (!token) {
    res.status(401).json({ error: 'Authentication required. Missing Bearer token in Authorization header.' });
    return;
  }

  const payload = verifyToken<JwtUserPayload>(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired authentication token.' });
    return;
  }

  req.user = payload;
  next();
}

/**
 * Middleware: Optionally decodes JWT token if present.
 */
export function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'] || req.headers['x-auth-token'];
  const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : (typeof authHeader === 'string' ? authHeader.trim() : null);

  if (token) {
    const payload = verifyToken<JwtUserPayload>(token);
    if (payload) {
      req.user = payload;
    }
  }
  next();
}

/**
 * Middleware: Requires the user to have one of the specified roles.
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const userRole = req.user.role?.toLowerCase();
    const isAllowed = allowedRoles.some(r => r.toLowerCase() === userRole || userRole === 'admin');

    if (!isAllowed) {
      res.status(403).json({ 
        error: `Forbidden: Insufficient privileges. Required role: [${allowedRoles.join(', ')}], current role: ${req.user.role}.` 
      });
      return;
    }

    next();
  };
}

/**
 * Middleware: Requires the user account to be approved by an administrator.
 */
export function requireApproved(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  if (!req.user.isApproved && req.user.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden: Your account is pending administrator approval.' });
    return;
  }

  next();
}
