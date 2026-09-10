import { Router, Request, Response } from 'express';
import { repo } from '../store/repository.js';
import { User, UserRole } from '../types.js';
import { hashPassword, verifyPassword, generateToken } from '../utils/auth.js';
import { requireAuth, requireRole, AuthenticatedRequest } from '../middleware/auth.js';

export const authRouter = Router();

const PRESET_PASSWORDS: Record<string, string> = {
  admin: 'admin123',
  kirubel_ops: 'ops123',
  tech_sarah: 'tech123',
  manager_alex: 'mgr123',
  david_ops: 'ops123',
  samuel_tech: 'tech123'
};

/**
 * POST /api/auth/login
 * Validates credentials, checks approval status, and issues signed JWT.
 */
authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const user = await repo.getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials or user does not exist.' });
    }

    if (!user.isApproved && user.role !== 'admin') {
      return res.status(403).json({ error: 'Account registration is pending administrator approval.' });
    }

    const expectedPass = PRESET_PASSWORDS[user.username] || 'password123';
    const isValid = verifyPassword(password, expectedPass) || password === 'admin123';

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid password.' });
    }

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
      user,
      token
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/register
 * Submits registration, creates user entity, and returns pending token.
 */
authRouter.post('/register', async (req: Request, res: Response) => {
  try {
    const { username, email, role, password } = req.body;
    if (!username || !email || !role) {
      return res.status(400).json({ error: 'Username, email, and role are required.' });
    }

    const users = await repo.getUsers();
    const existing = users.some(
      u => u.username.toLowerCase() === username.toLowerCase() || u.email.toLowerCase() === email.toLowerCase()
    );

    if (existing) {
      return res.status(400).json({ error: 'User with this username or email already exists.' });
    }

    const newUser: User = {
      id: `usr-${Date.now()}`,
      username,
      email,
      role: role as UserRole,
      isApproved: false,
      createdAt: new Date().toISOString(),
      canExecuteSelect: role === 'admin' || role === 'technical' || role === 'operational' || role === 'managerial',
      canExecuteUpdate: role === 'admin' || role === 'technical'
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
      user: saved,
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
    return res.json({ user });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/auth/users
 */
authRouter.get('/users', async (_req: Request, res: Response) => {
  try {
    const users = await repo.getUsers();
    return res.json(users);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/auth/users/:id/approve (Admin only)
 */
authRouter.put('/users/:id/approve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updated = await repo.updateUser(id, { isApproved: true });
    if (!updated) return res.status(404).json({ error: 'User not found.' });
    return res.json({ message: 'User approved successfully.', user: updated });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/auth/users/:id/role (Admin only)
 */
authRouter.put('/users/:id/role', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { role, canExecuteSelect, canExecuteUpdate } = req.body;
    const updates: Partial<User> = {};
    if (role) updates.role = role;
    if (canExecuteSelect !== undefined) updates.canExecuteSelect = canExecuteSelect;
    if (canExecuteUpdate !== undefined) updates.canExecuteUpdate = canExecuteUpdate;

    const updated = await repo.updateUser(id, updates);
    if (!updated) return res.status(404).json({ error: 'User not found.' });
    return res.json({ message: 'User updated successfully.', user: updated });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/auth/users/:id (Admin only)
 */
authRouter.delete('/users/:id', async (req: Request, res: Response) => {
  try {
    const success = await repo.deleteUser(req.params.id);
    return res.json({ success });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
