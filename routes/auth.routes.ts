import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

const router = Router();
const SALT_ROUNDS = 10;

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------
const registerSchema = z.object({
  name:     z.string().min(2, 'Name must be at least 2 characters.'),
  email:    z.email('Invalid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.')
});

const loginSchema = z.object({
  email:    z.email('Invalid email address.'),
  password: z.string().min(1, 'Password is required.')
});

// ---------------------------------------------------------------------------
// POST /api/auth/register  –  Create a new user account
// ---------------------------------------------------------------------------
router.post('/register', async (req: Request, res: Response): Promise<any> => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: parsed.error.flatten().fieldErrors
    });
  }

  const { name, email, password } = parsed.data;

  try {
    // Check for existing user
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ success: false, message: 'A user with this email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: { name, email, password: hashedPassword },
      select: { id: true, name: true, email: true, role: true, createdAt: true }
    });

    return res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      data: user
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Registration failed.';
    return res.status(500).json({ success: false, message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/login  –  Authenticate and issue a JWT
// ---------------------------------------------------------------------------
router.post('/login', async (req: Request, res: Response): Promise<any> => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: parsed.error.flatten().fieldErrors
    });
  }

  const { email, password } = parsed.data;

  try {
    const user = await prisma.user.findUnique({ where: { email } });

    // Use the same generic message for both "not found" and "wrong password"
    // to prevent user enumeration attacks.
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ success: false, message: 'Server misconfiguration: JWT_SECRET missing.' });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      secret,
      { expiresIn: '24h' }
    );

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Login failed.';
    return res.status(500).json({ success: false, message });
  }
});

export default router;
