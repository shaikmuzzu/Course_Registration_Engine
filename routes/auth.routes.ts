import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key_change_in_production';

const authRouter = Router();

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------
const registerSchema = z.object({
  email: z.string().email('Invalid email address.'),
  name: z.string().min(1, 'Name is required.'),
  password: z.string().min(6, 'Password must be at least 6 characters.')
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address.'),
  password: z.string().min(1, 'Password is required.')
});

// ---------------------------------------------------------------------------
// POST /api/auth/register  –  Create a new user account
// ---------------------------------------------------------------------------
authRouter.post('/register', async (req: Request, res: Response): Promise<any> => {
  try {
    const parsed = registerSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed.',
        errors: parsed.error.issues
      });
    }

    const { email, name, password } = parsed.data;

    // Check if user already exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: { email, name, password: hashedPassword }
    });

    return res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      data: { id: user.id, email: user.email, name: user.name, role: user.role }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return res.status(500).json({ success: false, message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/login  –  Authenticate and issue JWT
// ---------------------------------------------------------------------------
authRouter.post('/login', async (req: Request, res: Response): Promise<any> => {
  try {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed.',
        errors: parsed.error.issues
      });
    }

    const { email, password } = parsed.data;

    // Find user
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // Issue JWT
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      token,
      data: { id: user.id, email: user.email, name: user.name, role: user.role }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return res.status(500).json({ success: false, message });
  }
});

export default authRouter;
