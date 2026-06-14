import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { executeDropWithPromotion } from '../services/validation.service';
import { authenticate, authorizeRole } from '../middlewares/auth.middleware';

// Local AppError (mirrors server.ts pattern)
class AppError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

// Day name → integer mapping (0 = Sunday, 6 = Saturday)
const DAY_NAME_TO_INT: Record<string, number> = {
  SUNDAY: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3,
  THURSDAY: 4, FRIDAY: 5, SATURDAY: 6
};

// Accept either day names (strings) or integers (0-6), normalise to Int[]
const daysOfWeekSchema = z
  .array(z.union([
    z.string(),
    z.number().int().min(0).max(6)
  ]))
  .min(1, 'daysOfWeek must contain at least one day.')
  .transform((days) =>
    days.map((d) => {
      if (typeof d === 'number') return d;
      const upper = d.toUpperCase();
      if (upper in DAY_NAME_TO_INT) return DAY_NAME_TO_INT[upper];
      const parsed = parseInt(d, 10);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 6) return parsed;
      throw new Error(`Invalid day: "${d}". Use day names (MONDAY-SUNDAY) or integers (0-6).`);
    })
  );

const createCourseSchema = z.object({
  title: z.string().min(1, 'Title is required.'),
  capacity: z.number().int().positive('Capacity must be a positive integer.'),
  credits: z.number().int().positive('Credits must be a positive integer.'),
  startTime: z.string().min(1, 'startTime is required.'),
  endTime: z.string().min(1, 'endTime is required.'),
  daysOfWeek: daysOfWeekSchema,
  registrationStart: z.string().nullable().optional(),
  registrationEnd: z.string().nullable().optional()
}).refine(
  (data) => {
    // Anchor time-only strings (e.g. "09:00:00") to a fixed date so Date parsing works.
    // Full ISO datetimes are also handled gracefully.
    const isTimeOnly = (s: string) => /^\d{2}:\d{2}/.test(s) && !s.includes('T');
    const parseTime = (s: string) => new Date(isTimeOnly(s) ? `1970-01-01T${s}` : s);
    const start = parseTime(data.startTime);
    const end = parseTime(data.endTime);
    return end > start;
  },
  { message: 'endTime must be after startTime.' }
);

const updateCourseSchema = z.object({
  title: z.string().min(1).optional(),
  capacity: z.number().int().positive('Capacity must be a positive integer.').optional(),
  credits: z.number().int().positive('Credits must be a positive integer.').optional(),
  startTime: z.string().min(1).optional(),
  endTime: z.string().min(1).optional(),
  daysOfWeek: daysOfWeekSchema.optional(),
  registrationStart: z.string().nullable().optional(),
  registrationEnd: z.string().nullable().optional()
});

const updateSettingsSchema = z.object({
  maxSemesterCredits: z.number().int().positive('maxSemesterCredits must be a positive integer.')
});

const adminDropSchema = z.object({
  userId: z.string().min(1, 'userId is required.'),
  courseId: z.string().min(1, 'courseId is required.')
});

const adminRouter = Router();

// Apply authenticate + authorizeRole('ADMIN') to ALL admin routes
adminRouter.use(authenticate, authorizeRole('ADMIN'));

// ---------------------------------------------------------------------------
// GET /api/admin/courses  –  List all courses with enrollment stats
// ---------------------------------------------------------------------------
adminRouter.get('/courses', async (_req: Request, res: Response): Promise<any> => {
  try {
    const courses = await prisma.course.findMany({
      include: {
        registrations: {
          where: { status: 'ENROLLED' },
          include: { user: { select: { id: true, name: true, email: true } } }
        },
        waitlists: { orderBy: { position: 'asc' }, include: { user: { select: { id: true, name: true, email: true } } } }
      },
      orderBy: { createdAt: 'desc' }
    });
    return res.status(200).json({ success: true, data: courses });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return res.status(500).json({ success: false, message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/courses/:id/students  –  List enrolled students in a course
// ---------------------------------------------------------------------------
adminRouter.get('/courses/:id/students', async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params.id as string;
    const registrations = await prisma.registration.findMany({
      where: { courseId: id, status: 'ENROLLED' },
      include: { user: { select: { id: true, name: true, email: true, role: true } } }
    });
    return res.status(200).json({ success: true, data: registrations });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return res.status(500).json({ success: false, message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/settings  –  Get current system settings
// ---------------------------------------------------------------------------
adminRouter.get('/settings', async (_req: Request, res: Response): Promise<any> => {
  try {
    const settings = await prisma.systemSettings.findUnique({ where: { id: 'default' } });
    return res.status(200).json({ success: true, data: settings || { id: 'default', maxSemesterCredits: 18 } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return res.status(500).json({ success: false, message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/courses  –  Create a new course
// ---------------------------------------------------------------------------
adminRouter.post('/courses', async (req: Request, res: Response): Promise<any> => {
  try {
    console.log('[POST /api/admin/courses] Incoming body:', JSON.stringify(req.body, null, 2));

    const parsed = createCourseSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed.',
        errors: parsed.error.issues
      });
    }

    const { title, capacity, credits, startTime, endTime, daysOfWeek, registrationStart, registrationEnd } = parsed.data;

    const course = await prisma.course.create({
      data: {
        title,
        capacity,
        credits,
        startTime: new Date(`1970-01-01T${startTime}Z`),
        endTime: new Date(`1970-01-01T${endTime}Z`),
        daysOfWeek,
        registrationStart: registrationStart ? new Date(registrationStart) : null,
        registrationEnd: registrationEnd ? new Date(registrationEnd) : null
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Course created successfully.',
      data: course
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return res.status(500).json({ success: false, message });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/courses/:id  –  Update an existing course
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// PATCH /api/admin/courses/:id  –  Update an existing course
// ---------------------------------------------------------------------------
adminRouter.patch('/courses/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params.id as string;

    const parsed = updateCourseSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed.',
        errors: parsed.error.issues
      });
    }

    const existing = await prisma.course.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Course not found.' });
    }

    // Capacity guard
    if (parsed.data.capacity !== undefined && parsed.data.capacity < existing.filledSeats) {
      return res.status(400).json({
        success: false,
        message: `Capacity cannot be reduced below current filledSeats (${existing.filledSeats}).`
      });
    }

    // Construct data object carefully
    const data: any = { ...parsed.data };

    // Fix: Properly stitch the dummy date to the time strings
    if (parsed.data.startTime) {
      data.startTime = new Date(`1970-01-01T${parsed.data.startTime}Z`);
    }
    if (parsed.data.endTime) {
      data.endTime = new Date(`1970-01-01T${parsed.data.endTime}Z`);
    }
    
    // Standard Date handling
    if (parsed.data.registrationStart) data.registrationStart = new Date(parsed.data.registrationStart);
    if (parsed.data.registrationEnd) data.registrationEnd = new Date(parsed.data.registrationEnd);

    const course = await prisma.course.update({ where: { id }, data });

    return res.status(200).json({
      success: true,
      message: 'Course updated successfully.',
      data: course
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return res.status(500).json({ success: false, message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/admin/courses/:id  –  Delete a course (only if no enrollments)
// ---------------------------------------------------------------------------
adminRouter.delete('/courses/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params.id as string;

    const existing = await prisma.course.findUnique({
      where: { id },
      include: { registrations: { where: { status: 'ENROLLED' } } }
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Course not found.' });
    }

    if (existing.registrations.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete course. ${existing.registrations.length} student(s) are currently enrolled.`
      });
    }

    await prisma.course.delete({ where: { id } });

    return res.status(200).json({
      success: true,
      message: 'Course deleted successfully.'
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return res.status(500).json({ success: false, message });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/settings  –  Update system-wide settings (upsert)
// ---------------------------------------------------------------------------
adminRouter.patch('/settings', async (req: Request, res: Response): Promise<any> => {
  try {
    const parsed = updateSettingsSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed.',
        errors: parsed.error.issues
      });
    }

    const settings = await prisma.systemSettings.upsert({
      where: { id: 'default' },
      update: { maxSemesterCredits: parsed.data.maxSemesterCredits },
      create: { id: 'default', maxSemesterCredits: parsed.data.maxSemesterCredits }
    });

    return res.status(200).json({
      success: true,
      message: 'Settings updated successfully.',
      data: settings
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return res.status(500).json({ success: false, message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/drop  –  Admin force-drop a student from a course
// ---------------------------------------------------------------------------
adminRouter.post('/drop', async (req: Request, res: Response): Promise<any> => {
  try {
    const parsed = adminDropSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed.',
        errors: parsed.error.issues
      });
    }

    const { userId, courseId } = parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      return executeDropWithPromotion(tx, userId, courseId, 'ADMIN_DROP');
    });

    return res.status(200).json({
      success: true,
      message: 'Admin force-drop completed successfully.',
      data: result
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return res.status(500).json({ success: false, message });
  }
});

export default adminRouter;
