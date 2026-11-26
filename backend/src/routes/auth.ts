import { Router, Request, Response } from 'express';
import { repo } from '../store/repository.js';
import { User, UserRole } from '../types.js';
import { hashPassword, verifyPassword, generateToken } from '../utils/auth.js';
import { requireAuth, requireRole, AuthenticatedRequest } from '../middleware/auth.js';

export const authRouter = Router();

/**
 * Sanitizes user entity by stripping sensitive credential hashes before HTTP serialization.
 */
export function sanitizeUser(user: User): Omit<User, 'password_hash'> {
  const { password_hash, ...safeUser } = user;
  return safeUser;
}

const loginAttempts = new Map<string, { count: number; firstAttempt: number }>();
const MAX_LOGIN_ATTEMPTS = 15;
const LOGIN_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function checkLoginRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record) return true;
  if (now - record.firstAttempt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(ip);
    return true;
  }
  return record.count < MAX_LOGIN_ATTEMPTS;
}

function recordFailedAttempt(ip: string): void {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record || now - record.firstAttempt > LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, firstAttempt: now });
  } else {
    record.count++;
  }
}

function clearLoginAttempts(ip: string): void {
  loginAttempts.delete(ip);
}

/**
 * POST /api/auth/login
 * Validates credentials, checks approval status, and issues signed JWT.
 */
authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    if (!checkLoginRateLimit(ip)) {
      return res.status(429).json({ error: 'Too many failed login attempts. Please try again in 5 minutes.' });
    }

    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const user = await repo.getUserByUsername(username);
    if (!user) {
      recordFailedAttempt(ip);
      return res.status(401).json({ error: 'Invalid credentials or user does not exist.' });
    }

    if (!user.isApproved) {
      return res.status(403).json({ error: 'Account registration is pending administrator approval.' });
    }

    // Password verification strictly enforces database password_hash.
    let isValid = false;
    if (user.password_hash) {
      isValid = verifyPassword(password, user.password_hash);
    } else if (process.env.NODE_ENV !== 'production') {
      // In development, auto-initialize password_hash for legacy seeded accounts without a hash
      const newHash = hashPassword(password);
      user.password_hash = newHash;
      await repo.createUser(user);
      isValid = true;
    }

    if (!isValid) {
      recordFailedAttempt(ip);
      return res.status(401).json({ error: 'Invalid password.' });
    }

    clearLoginAttempts(ip);

    // Generate JWT token
    const token = generateToken({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      isApproved: user.isApproved,
      canExecuteSelect: user.canExecuteSelect,
      canExecuteUpdate: user.canExecuteUpdate
    });

    return res.json({
      message: 'Login successful',
      user: sanitizeUser(user),
      token
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/register
 * Submits registration, creates user entity, and returns pending token.
 * Prevents self-assignment of administrator privileges.
 */
authRouter.post('/register', async (req: Request, res: Response) => {
  try {
    const { username, email, role, password } = req.body;
    if (!username || !email || !role || !password) {
      return res.status(400).json({ error: 'Username, email, role, and password are required.' });
    }

    if (typeof role === 'string' && role.toLowerCase() === 'admin') {
      return res.status(400).json({ error: 'Administrative accounts cannot be created via public registration. Contact an administrator.' });
    }

    const ALLOWED_REGISTRATION_ROLES: UserRole[] = ['operational', 'technical', 'managerial'];
    if (!ALLOWED_REGISTRATION_ROLES.includes(role as UserRole)) {
      return res.status(400).json({ error: 'Invalid registration role. Allowed roles are: operational, technical, managerial.' });
    }

    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const users = await repo.getUsers();
    const existing = users.some(
      u => u.username.toLowerCase() === username.toLowerCase() || u.email.toLowerCase() === email.toLowerCase()
    );

    if (existing) {
      return res.status(400).json({ error: 'User with this username or email already exists.' });
    }

    const hashedPassword = hashPassword(password);

    const newUser: User = {
      id: `usr-${Date.now()}`,
      username,
      email,
      role: role as UserRole,
      isApproved: false,
      createdAt: new Date().toISOString(),
      canExecuteSelect: true,
      canExecuteUpdate: role === 'technical',
      password_hash: hashedPassword
    };

    const saved = await repo.createUser(newUser);

    // Issue registration token
    const token = generateToken({
      id: saved.id,
      username: saved.username,
      email: saved.email,
      role: saved.role,
      isApproved: saved.isApproved,
      canExecuteSelect: saved.canExecuteSelect,
      canExecuteUpdate: saved.canExecuteUpdate
    });

    return res.status(201).json({
      message: 'Registration submitted for admin approval.',
      user: sanitizeUser(saved),
      token
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/auth/me
 * Returns current authenticated user from token.
 */
authRouter.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthenticated.' });
    }
    const user = await repo.getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    return res.json({ user: sanitizeUser(user) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/auth/users (Requires Authentication)
 * Returns directory of users with password hashes stripped.
 */
authRouter.get('/users', requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const users = await repo.getUsers();
    return res.json(users.map(u => sanitizeUser(u)));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/auth/users/:id/approve (Admin only)
 */
authRouter.put('/users/:id/approve', requireAuth, requireRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updated = await repo.updateUser(id, { isApproved: true });
    if (!updated) return res.status(404).json({ error: 'User not found.' });
    return res.json({ message: 'User approved successfully.', user: sanitizeUser(updated) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/auth/users/:id/role (Admin only)
 */
authRouter.put('/users/:id/role', requireAuth, requireRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { role, canExecuteSelect, canExecuteUpdate } = req.body;
    const updates: Partial<User> = {};
    if (role) updates.role = role;
    if (canExecuteSelect !== undefined) updates.canExecuteSelect = canExecuteSelect;
    if (canExecuteUpdate !== undefined) updates.canExecuteUpdate = canExecuteUpdate;

    const updated = await repo.updateUser(id, updates);
    if (!updated) return res.status(404).json({ error: 'User not found.' });
    return res.json({ message: 'User updated successfully.', user: sanitizeUser(updated) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/auth/users/:id/profile (Self or Admin only)
 * Updates user profile, display name, avatar, contact information, and message provider preferences.
 */
authRouter.put('/users/:id/profile', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const callerId = req.user?.id;
    const callerRole = req.user?.role?.toLowerCase();

    if (callerId !== id && callerRole !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: You can only update your own user profile.' });
    }

    const {
      name,
      displayName,
      avatarUrl,
      phone,
      department,
      title,
      timezone,
      messageProviderSettings,
      preferences,
      email
    } = req.body;

    const updates: Partial<User> = {};
    if (displayName !== undefined || name !== undefined) {
      updates.displayName = displayName || name;
      updates.name = displayName || name;
    }
    if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl;
    if (phone !== undefined) updates.phone = phone;
    if (department !== undefined) updates.department = department;
    if (title !== undefined) updates.title = title;
    if (timezone !== undefined) updates.timezone = timezone;
    if (email !== undefined) updates.email = email;
    if (messageProviderSettings !== undefined) updates.messageProviderSettings = messageProviderSettings;
    if (preferences !== undefined) updates.preferences = preferences;

    const updated = await repo.updateUser(id, updates);
    if (!updated) return res.status(404).json({ error: 'User not found.' });
    return res.json({ message: 'Profile updated successfully.', user: sanitizeUser(updated) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/auth/users/:id/workspace-sharing (Self or Admin only)
 * Toggles whether the user shares their workspace with their permanent team.
 */
authRouter.put('/users/:id/workspace-sharing', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const callerId = req.user?.id;
    const callerRole = req.user?.role?.toLowerCase();

    if (callerId !== id && callerRole !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: You can only update your own workspace sharing settings.' });
    }

    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled boolean is required.' });
    }
    const updated = await repo.updateUserWorkspaceSharing(id, enabled);
    if (!updated) return res.status(404).json({ error: 'User not found.' });
    return res.json({ message: 'Workspace sharing updated successfully.', user: sanitizeUser(updated) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/auth/users/:id (Admin only)
 */
authRouter.delete('/users/:id', requireAuth, requireRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const success = await repo.deleteUser(req.params.id);
    return res.json({ success });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
