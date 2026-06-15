import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma, pool } from '../lib/prisma';
import { authenticate } from '../middlewares/auth.middleware';
import {
  checkCreditLimit,
  checkPrerequisites,
  checkTimeClash,
  checkAlreadyEnrolled,
  checkAlreadyWaitlisted
} from '../services/validation.service';

// Custom error class for client-facing errors with explicit status codes
class AppError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}

const router = Router();

// Apply `authenticate` to all student routes — userId comes from JWT, not body
router.use(authenticate);

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------
const enrollSchema = z.object({
  courseId: z.string().uuid('courseId must be a valid UUID.')
});

const dropSchema = z.object({
  courseId: z.string().uuid('courseId must be a valid UUID.')
});

// ---------------------------------------------------------------------------
// POST /api/register  –  Course Enrollment (JWT-authenticated)
// ---------------------------------------------------------------------------
router.post('/register', async (req: Request, res: Response): Promise<any> => {
  const parsed = enrollSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: parsed.error.flatten().fieldErrors
    });
  }

  // userId extracted from verified JWT — never from the request body
  const userId = req.user!.userId;
  const { courseId } = parsed.data;

  try {
    // --- STEP A0: Registration Window Guard (Temporal Check) ---
    const courseForWindow = await prisma.course.findUnique({
      where: { id: courseId },
      select: { registrationStart: true, registrationEnd: true }
    });

    if (!courseForWindow) {
      return res.status(404).json({ success: false, message: 'Course not found.' });
    }

    const now = new Date();
    if (courseForWindow.registrationStart && now < courseForWindow.registrationStart) {
      return res.status(400).json({
        success: false,
        message: 'Registration window has not opened yet for this course.'
      });
    }
    if (courseForWindow.registrationEnd && now > courseForWindow.registrationEnd) {
      return res.status(400).json({
        success: false,
        message: 'Registration window is closed for this course.'
      });
    }

    // --- STEP A: Duplicate Registration Guard ---
    const enrolledCheck = await checkAlreadyEnrolled(userId, courseId);
    if (!enrolledCheck.success) return res.status(400).json(enrolledCheck);

    // --- STEP B: Read-Only Validation Checks ---
    const creditCheck = await checkCreditLimit(userId, courseId);
    if (!creditCheck.success) return res.status(400).json(creditCheck);

    const prereqCheck = await checkPrerequisites(userId, courseId);
    if (!prereqCheck.success) return res.status(400).json(prereqCheck);

    const timeCheck = await checkTimeClash(userId, courseId);
    if (!timeCheck.success) return res.status(400).json(timeCheck);

    // --- STEP C: Duplicate Waitlist Guard ---
    const waitlistCheck = await checkAlreadyWaitlisted(userId, courseId);
    if (!waitlistCheck.success) return res.status(400).json(waitlistCheck);

    // --- STEP D: Transaction with Pessimistic Lock ---
    const result = await prisma.$transaction(async (tx) => {
      // Lock the course row – nobody else reads/writes until we finish
      const courses: any[] = await tx.$queryRaw`
        SELECT * FROM "Course" WHERE id = ${courseId} FOR UPDATE
      `;

      if (!courses || courses.length === 0) {
        throw new AppError('Course not found.', 404);
      }

      const course = courses[0];

      // If the course is full, route the student into the Waitlist
      if (course.filledSeats >= course.capacity) {
        const maxPosResult: any[] = await tx.$queryRaw`
          SELECT COALESCE(MAX(position), 0)::int AS max_pos
          FROM "Waitlist"
          WHERE "courseId" = ${courseId}
        `;
        const nextPosition: number = Number(maxPosResult[0].max_pos) + 1;

        const waitlistEntry = await tx.waitlist.create({
          data: { userId, courseId, position: nextPosition }
        });

        const registration = await tx.registration.create({
          data: { userId, courseId, status: 'WAITLISTED' }
        });

        await tx.auditLog.create({
          data: {
            userId,
            action: 'WAITLIST',
            courseId,
            details: { position: nextPosition }
          }
        });

        return { waitlisted: true as const, position: nextPosition, waitlistEntry, registration };
      }

      // Seat is available – lock it in
      const registration = await tx.registration.create({
        data: { userId, courseId, status: 'ENROLLED' }
      });

      await tx.course.update({
        where: { id: courseId },
        data: { filledSeats: { increment: 1 } }
      });

      await tx.auditLog.create({
        data: { userId, action: 'REGISTER', courseId }
      });

      return { waitlisted: false as const, registration };
    });

    // --- STEP E: Response ---
    if (result.waitlisted) {
      return res.status(200).json({
        success: true,
        waitlisted: true,
        message: `Course is full. You have been placed on the waitlist at position ${result.position}.`,
        data: result
      });
    }

    return res.status(200).json({
      success: true,
      waitlisted: false,
      message: 'Registration locked in successfully!',
      data: result.registration
    });

  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    const message = error instanceof Error ? error.message : 'An unexpected error occurred during registration.';
    return res.status(500).json({ success: false, message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/drop  –  Drop a Course + Event-Driven Waitlist Promotion (JWT-authenticated)
// ---------------------------------------------------------------------------
router.post('/drop', async (req: Request, res: Response): Promise<any> => {
  const parsed = dropSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: parsed.error.flatten().fieldErrors
    });
  }

  // userId extracted from verified JWT — never from the request body
  const userId = req.user!.userId;
  const { courseId } = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Verify the student is currently ENROLLED
      const existingReg = await tx.registration.findUnique({
        where: { userId_courseId: { userId, courseId } }
      });

      if (!existingReg || existingReg.status !== 'ENROLLED') {
        throw new AppError('Student is not currently enrolled in this course.');
      }

      // 2. Lock the course row with FOR UPDATE
      const courses: any[] = await tx.$queryRaw`
        SELECT * FROM "Course" WHERE id = ${courseId} FOR UPDATE
      `;

      if (!courses || courses.length === 0) {
        throw new AppError('Course not found.', 404);
      }

      // 3. Mark the registration as DROPPED
      await tx.registration.update({
        where: { id: existingReg.id },
        data: { status: 'DROPPED' }
      });

      await tx.auditLog.create({
        data: { userId: existingReg.userId, action: 'DROP', courseId }
      });

      // 4. Decrement filledSeats
      await tx.course.update({
        where: { id: courseId },
        data: { filledSeats: { decrement: 1 } }
      });

      // 5. Find the first waitlisted student (locked with FOR UPDATE)
      const waitlistedRows: any[] = await tx.$queryRaw`
        SELECT * FROM "Waitlist"
        WHERE "courseId" = ${courseId}
        ORDER BY position ASC
        LIMIT 1
        FOR UPDATE
      `;

      let promotedStudent = null;

      if (waitlistedRows && waitlistedRows.length > 0) {
        const nextStudent = waitlistedRows[0];

        const existingWaitlistedReg = await tx.registration.findUnique({
          where: { userId_courseId: { userId: nextStudent.userId, courseId } }
        });

        if (existingWaitlistedReg) {
          promotedStudent = await tx.registration.update({
            where: { id: existingWaitlistedReg.id },
            data: { status: 'ENROLLED' }
          });
        } else {
          promotedStudent = await tx.registration.create({
            data: { userId: nextStudent.userId, courseId, status: 'ENROLLED' }
          });
        }

        // Re-increment filledSeats (net zero: one dropped, one promoted)
        await tx.course.update({
          where: { id: courseId },
          data: { filledSeats: { increment: 1 } }
        });

        // Remove the waitlist entry
        await tx.waitlist.delete({ where: { id: nextStudent.id } });

        await tx.auditLog.create({
          data: {
            userId: nextStudent.userId,
            action: 'PROMOTE',
            courseId,
            details: { promotedFromWaitlist: true }
          }
        });
      }

      return { dropped: true, droppedRegistrationId: existingReg.id, promotedStudent };
    });

    const responseBody: Record<string, unknown> = {
      success: true,
      dropped: true,
      message: 'Course dropped successfully.'
    };

    if (result.promotedStudent) {
      responseBody.message =
        'Course dropped successfully. The next waitlisted student has been promoted to ENROLLED.';
      responseBody.promotedStudent = result.promotedStudent;
    }

    return res.status(200).json(responseBody);

  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    const message = error instanceof Error ? error.message : 'An unexpected error occurred during drop.';
    return res.status(500).json({ success: false, message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/courses  –  Browse all available courses (JWT-authenticated)
// Returns full course list enriched with the requesting student's status
// ---------------------------------------------------------------------------
router.get('/courses', async (req: Request, res: Response): Promise<any> => {
  const userId = req.user!.userId;

  try {
    const [courses, myRegistrations, myWaitlist] = await Promise.all([
      prisma.course.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          prerequisites: {
            select: { prerequisiteId: true }
          },
          _count: { select: { registrations: true, waitlists: true } }
        }
      }),
      prisma.registration.findMany({
        where: { userId },
        select: { courseId: true, status: true }
      }),
      prisma.waitlist.findMany({
        where: { userId },
        select: { courseId: true, position: true }
      })
    ]);

    // Determine which prereqs this student has completed
    const completedCourseIds = myRegistrations
      .filter(r => r.status === 'ENROLLED')
      .map(r => r.courseId);

    const enriched = courses.map(course => {
      const regRecord   = myRegistrations.find(r => r.courseId === course.id);
      const waitRecord  = myWaitlist.find(w => w.courseId === course.id);
      const prereqIds   = course.prerequisites.map(p => p.prerequisiteId);
      const missingPrereqs = prereqIds.filter(id => !completedCourseIds.includes(id));

      return {
        id:                course.id,
        title:             course.title,
        capacity:          course.capacity,
        filledSeats:       course.filledSeats,
        credits:           course.credits,
        startTime:         course.startTime,
        endTime:           course.endTime,
        daysOfWeek:        course.daysOfWeek,
        registrationStart: course.registrationStart,
        registrationEnd:   course.registrationEnd,
        prerequisiteCount: prereqIds.length,
        missingPrereqCount: missingPrereqs.length,
        myStatus:          regRecord?.status ?? null,   // ENROLLED | DROPPED | WAITLISTED | null
        waitlistPosition:  waitRecord?.position ?? null,
        isFull:            course.filledSeats >= course.capacity,
      };
    });

    return res.status(200).json({ success: true, data: enriched });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch courses.';
    return res.status(500).json({ success: false, message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/my/registrations  –  Student's personal schedule (JWT-authenticated)
// ---------------------------------------------------------------------------
router.get('/my/registrations', async (req: Request, res: Response): Promise<any> => {
  const userId = req.user!.userId;

  try {
    const [registrations, waitlistEntries, user] = await Promise.all([
      prisma.registration.findMany({
        where: { userId, status: { in: ['ENROLLED', 'WAITLISTED'] } },
        include: {
          course: {
            select: {
              id: true, title: true, credits: true,
              startTime: true, endTime: true, daysOfWeek: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.waitlist.findMany({
        where: { userId },
        select: { courseId: true, position: true }
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, role: true, totalCredits: true }
      })
    ]);

    const enrolled  = registrations.filter(r => r.status === 'ENROLLED');
    const waitlisted = registrations.filter(r => r.status === 'WAITLISTED');
    const usedCredits = enrolled.reduce((sum, r) => sum + r.course.credits, 0);

    return res.status(200).json({
      success: true,
      data: {
        user,
        usedCredits,
        enrolled:  enrolled.map(r => ({
          registrationId: r.id,
          courseId:       r.course.id,
          title:          r.course.title,
          credits:        r.course.credits,
          startTime:      r.course.startTime,
          endTime:        r.course.endTime,
          daysOfWeek:     r.course.daysOfWeek,
          status:         r.status
        })),
        waitlisted: waitlisted.map(r => {
          const wl = waitlistEntries.find(w => w.courseId === r.course.id);
          return {
            registrationId:  r.id,
            courseId:        r.course.id,
            title:           r.course.title,
            credits:         r.course.credits,
            waitlistPosition: wl?.position ?? null,
            status:          r.status
          };
        })
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch registrations.';
    return res.status(500).json({ success: false, message });
  }
});

export { router as studentRouter };

