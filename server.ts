import express, { Request, Response } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import 'dotenv/config';
import { prisma, pool } from './lib/prisma';
import { studentRouter } from './routes/student.routes';
import { adminRouter }   from './routes/admin.routes';
import authRouter        from './routes/auth.routes';

// ---------------------------------------------------------------------------
// Initialize Express App
// ---------------------------------------------------------------------------
const app = express();

// ---------------------------------------------------------------------------
// CORS — Allow requests from Next.js frontend only
// ---------------------------------------------------------------------------
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// ---------------------------------------------------------------------------
// Rate Limiters
// ---------------------------------------------------------------------------

// Tight limiter for auth endpoints — 5 requests per 15 minutes
const authLimiter = rateLimit({
  windowMs:         15 * 60 * 1000, // 15 minutes
  max:              5,
  standardHeaders:  true,
  legacyHeaders:    false,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again after 15 minutes.'
  }
});

// Standard limiter for all other API routes — 100 requests per 15 minutes
const standardLimiter = rateLimit({
  windowMs:        15 * 60 * 1000, // 15 minutes
  max:             100,
  standardHeaders: true,
  legacyHeaders:   false,
  message: {
    success: false,
    message: 'Too many requests. Please slow down and try again shortly.'
  }
});

// Apply auth limiter specifically to login/register BEFORE mounting the full router
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/login',    authLimiter);

// Apply standard limiter to all remaining /api routes
app.use('/api', standardLimiter);

// ---------------------------------------------------------------------------
// Health Check
// ---------------------------------------------------------------------------
app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'success', message: 'Engine is LIVE.' });
});

// ---------------------------------------------------------------------------
// Mount Routers
// ---------------------------------------------------------------------------
app.use('/api/auth',  authRouter);     // POST /api/auth/register, POST /api/auth/login
app.use('/api',       studentRouter);  // POST /api/register,       POST /api/drop
app.use('/api/admin', adminRouter);    // POST /api/admin/courses,  GET /api/admin/courses, etc.

// ---------------------------------------------------------------------------
// 404 Handler — catch-all for unmatched routes
// ---------------------------------------------------------------------------
app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, message: 'Route not found.' });
});

// ---------------------------------------------------------------------------
// Graceful Shutdown — close Prisma + PG pool on SIGTERM / SIGINT
// ---------------------------------------------------------------------------
const gracefulShutdown = async () => {
  console.log('\nShutting down gracefully...');
  await prisma.$disconnect();
  await pool.end();
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT',  gracefulShutdown);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Engine running on http://localhost:${PORT}`);
  console.log(`🔐 Auth:  POST /api/auth/register | POST /api/auth/login`);
  console.log(`👤 Student: POST /api/register | POST /api/drop`);
  console.log(`🛡️  Admin:  POST /api/admin/courses | GET /api/admin/courses`);
});
