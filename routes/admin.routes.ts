import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, authorizeRole } from '../middlewares/auth.middleware';

const router = Router();

// ---------------------------------------------------------------------------
// All admin routes require authentication AND the ADMIN role
// ---------------------------------------------------------------------------
router.use(authenticate, authorizeRole('ADMIN'));

// ---------------------------------------------------------------------------
// Zod Schema for Course Creation
// ---------------------------------------------------------------------------
const createCourseSchema = z
  .object({
    title:             z.string().min(3, 'Title must be at least 3 characters.'),
    capacity:          z.number().int().positive('Capacity must be a positive integer.'),
    credits:           z.number().int().min(1).max(6, 'Credits must be between 1 and 6.'),
    // Time strings expected in "HH:MM" or "HH:MM:SS" format (time-only, not full ISO)
    startTime:         z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'startTime must be in HH:MM or HH:MM:SS format.'),
    endTime:           z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'endTime must be in HH:MM or HH:MM:SS format.'),
    daysOfWeek:        z.array(z.number().int().min(0).max(6)).min(1, 'At least one day must be specified.'),
    registrationStart: z.string().datetime().optional(),
    registrationEnd:   z.string().datetime().optional()
  })
  // ✅ CRITICAL BUG FIX: Prepend a dummy date before parsing time strings into
  //    Date objects so that JavaScript can reliably compare them with < and >.
  //    Without this, string comparison ("09:00" < "10:30") is coincidentally
  //    correct for ASCII but fails for edge cases and is semantically wrong.
  .refine(
    (data) => {
      const start = new Date(`1970-01-01T${data.startTime}`);
      const end   = new Date(`1970-01-01T${data.endTime}`);
      return start < end;
    },
    { message: 'startTime must be before endTime.', path: ['endTime'] }
  );

// ---------------------------------------------------------------------------
// POST /api/admin/courses  –  Create a new course
// ---------------------------------------------------------------------------
router.post('/courses', async (req: Request, res: Response): Promise<any> => {
  const parsed = createCourseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: parsed.error.flatten().fieldErrors
    });
  }

  const {
    title,
    capacity,
    credits,
    startTime,
    endTime,
    daysOfWeek,
    registrationStart,
    registrationEnd
  } = parsed.data;

  try {
    // Convert "HH:MM" strings into full ISO DateTime strings using a reference date
    const REFERENCE_DATE = '1970-01-01T';
    const startDateTime = new Date(`${REFERENCE_DATE}${startTime}Z`);
    const endDateTime   = new Date(`${REFERENCE_DATE}${endTime}Z`);

    const course = await prisma.course.create({
      data: {
        title,
        capacity,
        credits,
        startTime:         startDateTime,
        endTime:           endDateTime,
        daysOfWeek,
        registrationStart: registrationStart ? new Date(registrationStart) : undefined,
        registrationEnd:   registrationEnd   ? new Date(registrationEnd)   : undefined
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Course created successfully.',
      data: course
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create course.';
    return res.status(500).json({ success: false, message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/courses  –  List all courses with stats
// ---------------------------------------------------------------------------
router.get('/courses', async (_req: Request, res: Response): Promise<any> => {
  try {
    const courses = await prisma.course.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id:                true,
        title:             true,
        capacity:          true,
        filledSeats:       true,
        credits:           true,
        startTime:         true,
        endTime:           true,
        daysOfWeek:        true,
        registrationStart: true,
        registrationEnd:   true,
        createdAt:         true,
        _count: {
          select: {
            registrations: true,
            waitlists:     true
          }
        }
      }
    });

    return res.status(200).json({
      success: true,
      data: courses,
      meta: { total: courses.length }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch courses.';
    return res.status(500).json({ success: false, message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/admin/courses/:id  –  Delete a course
// ---------------------------------------------------------------------------
router.delete('/courses/:id', async (req: Request, res: Response): Promise<any> => {
  const id = req.params['id'] as string;

  try {
    const course = await prisma.course.findUnique({ where: { id } });
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found.' });
    }

    await prisma.course.delete({ where: { id } });

    return res.status(200).json({
      success: true,
      message: `Course "${course.title}" deleted successfully.`
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete course.';
    return res.status(500).json({ success: false, message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/courses/:id/students  –  List enrolled + waitlisted students
// ---------------------------------------------------------------------------
router.get('/courses/:id/students', async (req: Request, res: Response): Promise<any> => {
  const courseId = req.params['id'] as string;

  try {
    const [enrolled, waitlisted] = await Promise.all([
      prisma.registration.findMany({
        where: { courseId, status: 'ENROLLED' },
        include: {
          user: { select: { id: true, name: true, email: true, role: true } }
        },
        orderBy: { createdAt: 'asc' }
      }),
      prisma.waitlist.findMany({
        where: { courseId },
        include: {
          user: { select: { id: true, name: true, email: true, role: true } }
        },
        orderBy: { position: 'asc' }
      })
    ]);

    return res.status(200).json({
      success: true,
      data: {
        enrolled:  enrolled.map(r  => ({ registrationId: r.id,  ...r.user })),
        waitlisted: waitlisted.map(w => ({ waitlistId: w.id, position: w.position, ...w.user }))
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch students.';
    return res.status(500).json({ success: false, message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/force-drop  –  Admin removes any student from any course
// Reuses the waitlist-promotion logic for fairness
// ---------------------------------------------------------------------------
router.post('/force-drop', async (req: Request, res: Response): Promise<any> => {
  const { courseId, targetUserId } = req.body;

  if (!courseId || !targetUserId) {
    return res.status(400).json({ success: false, message: 'courseId and targetUserId are required.' });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existingReg = await tx.registration.findUnique({
        where: { userId_courseId: { userId: targetUserId, courseId } }
      });

      if (!existingReg || existingReg.status !== 'ENROLLED') {
        throw new Error('Student is not currently enrolled in this course.');
      }

      await tx.registration.update({
        where: { id: existingReg.id },
        data: { status: 'DROPPED' }
      });

      await tx.auditLog.create({
        data: { userId: targetUserId, action: 'DROP', courseId, details: { forcedByAdmin: true } }
      });

      await tx.course.update({
        where: { id: courseId },
        data: { filledSeats: { decrement: 1 } }
      });

      // Promote next waitlisted student
      const waitlistedRows: any[] = await tx.$queryRaw`
        SELECT * FROM "Waitlist" WHERE "courseId" = ${courseId} ORDER BY position ASC LIMIT 1 FOR UPDATE
      `;

      let promotedStudent = null;
      if (waitlistedRows && waitlistedRows.length > 0) {
        const next = waitlistedRows[0];
        const existingWlReg = await tx.registration.findUnique({
          where: { userId_courseId: { userId: next.userId, courseId } }
        });

        if (existingWlReg) {
          promotedStudent = await tx.registration.update({
            where: { id: existingWlReg.id }, data: { status: 'ENROLLED' }
          });
        } else {
          promotedStudent = await tx.registration.create({
            data: { userId: next.userId, courseId, status: 'ENROLLED' }
          });
        }

        await tx.course.update({
          where: { id: courseId },
          data: { filledSeats: { increment: 1 } }
        });
        await tx.waitlist.delete({ where: { id: next.id } });
        await tx.auditLog.create({
          data: { userId: next.userId, action: 'PROMOTE', courseId, details: { promotedFromWaitlist: true } }
        });
      }

      return { dropped: true, promotedStudent };
    });

    return res.status(200).json({
      success: true,
      message: result.promotedStudent
        ? 'Student force-dropped. Next waitlisted student promoted.'
        : 'Student force-dropped successfully.',
      data: result
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Force-drop failed.';
    return res.status(500).json({ success: false, message });
  }
});

export { router as adminRouter };

