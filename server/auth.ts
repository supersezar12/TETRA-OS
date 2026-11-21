import crypto from 'node:crypto';
import type {NextFunction, Request, Response} from 'express';
import {findUserById, getAuthSettings} from './db.ts';
import {
  roleHasPermission,
  type EnterpriseRoleId,
  type PermissionKey,
  type SafeUserRecord,
} from './types.ts';

const SESSION_SECRET =
  process.env.TETRA_SESSION_SECRET?.trim() || crypto.randomBytes(32).toString('hex');

export interface AuthSessionPayload {
  userId: string;
  companyId: string;
  roleId: EnterpriseRoleId;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  authUser?: SafeUserRecord;
  activeCompanyId?: string;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, originalHex] = parts;
  if (!salt || !originalHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const original = Buffer.from(originalHex, 'hex');
  if (derived.length !== original.length) return false;
  return crypto.timingSafeEqual(derived, original);
}

export function verifyConfiguredAdminPasscode(inputPasscode: string): boolean {
  const configured = process.env.TETRA_ADMIN_PASSCODE?.trim();
  if (!configured) return false;
  const a = Buffer.from(inputPasscode, 'utf8');
  const b = Buffer.from(configured, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function hasConfiguredAdminPasscode(): boolean {
  return Boolean(process.env.TETRA_ADMIN_PASSCODE?.trim());
}

export function needsAdminBootstrap(): boolean {
  if (hasConfiguredAdminPasscode()) return false;
  const settings = getAuthSettings();
  return !settings.adminPasswordHash;
}

export function signSessionToken(payload: Omit<AuthSessionPayload, 'exp'>): string {
  const full: AuthSessionPayload = {
    ...payload,
    exp: Date.now() + 1000 * 60 * 60 * 12,
  };
  const encoded = Buffer.from(JSON.stringify(full), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): AuthSessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;

  const expected = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(sig, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    ) as AuthSessionPayload;
    if (!parsed.userId || !parsed.exp || Date.now() > parsed.exp) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({error: 'Authentication required. Sign in to continue.'});
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  const payload = verifySessionToken(token);
  if (!payload) {
    res.status(401).json({error: 'Session expired or invalid. Sign in again.'});
    return;
  }

  const user = findUserById(payload.userId);
  if (!user || user.status === 'SUSPENDED') {
    res.status(403).json({error: 'User account is suspended or unavailable.'});
    return;
  }

  req.authUser = user;
  const requestedCompanyId =
    typeof req.headers['x-company-id'] === 'string'
      ? req.headers['x-company-id'].trim()
      : undefined;

  if (requestedCompanyId && requestedCompanyId !== user.companyId) {
    if (user.roleId !== 'platform_super_admin') {
      res.status(403).json({error: 'Cross-tenant access denied for your role.'});
      return;
    }
    req.activeCompanyId = requestedCompanyId;
  } else {
    req.activeCompanyId = user.companyId;
  }

  next();
}

export function requirePermission(permission: PermissionKey) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const user = req.authUser;
    if (!user) {
      res.status(401).json({error: 'Authentication required.'});
      return;
    }
    if (!roleHasPermission(user.roleId, permission)) {
      res.status(403).json({
        error: `Access denied: role "${user.roleId}" lacks "${permission}" permission.`,
      });
      return;
    }
    next();
  };
}
