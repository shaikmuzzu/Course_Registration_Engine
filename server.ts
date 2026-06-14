import express, { Request, Response } from 'express';
import 'dotenv/config';
import { prisma, pool } from './lib/prisma';
import {
  checkCreditLimit,
  checkPrerequisites,
  checkTimeClash,
  checkAlreadyEnrolled,
  checkAlreadyWaitlisted
} from './services/validation.service';

// Custom error class for client-facing errors with explicit status codes
class AppError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}

// Initialize Express App
const app = express();
app.use(express.json());

app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'success', message: 'Engine is LIVE.' });
});

// ---------------------------------------------------------------------------
// POST /api/register  –  Master Registration Endpoint
// ---------------------------------------------------------------------------
app.post('/api/register', async (req: Request, res: Response): Promise<any> => {
  const { userId, courseId } = req.body;

  if (!userId || !courseId) {
    return res.status(400).json({ success: false, message: 'Missing userId or courseId' });
  }

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
        // Atomically calculate the next position
        const maxPosResult: any[] = await tx.$queryRaw`
          SELECT COALESCE(MAX(position), 0)::int AS max_pos
          FROM "Waitlist"
          WHERE "courseId" = ${courseId}
        `;
        const nextPosition: number = Number(maxPosResult[0].max_pos) + 1;

        const waitlistEntry = await tx.waitlist.create({
          data: { userId, courseId, position: nextPosition }
        });

        // Track the waitlist intent in the Registration table as well
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
        data: {
          userId,
          action: 'REGISTER',
          courseId
        }
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
    const message = error instanceof Error
      ? error.message
      : 'An unexpected error occurred during registration.';
    return res.status(500).json({ success: false, message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/drop  –  Drop a Course + Event-Driven Waitlist Promotion
// ---------------------------------------------------------------------------
app.post('/api/drop', async (req: Request, res: Response): Promise<any> => {
  const { userId, courseId } = req.body;

  if (!userId || !courseId) {
    return res.status(400).json({ success: false, message: 'Missing userId or courseId' });
  }

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
        data: {
          userId: existingReg.userId,
          action: 'DROP',
          courseId
        }
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

        // The promoted student may already have a WAITLISTED registration row
        const existingWaitlistedReg = await tx.registration.findUnique({
          where: { userId_courseId: { userId: nextStudent.userId, courseId } }
        });

        if (existingWaitlistedReg) {
          // Flip the existing WAITLISTED row to ENROLLED
          promotedStudent = await tx.registration.update({
            where: { id: existingWaitlistedReg.id },
            data: { status: 'ENROLLED' }
          });
        } else {
          // Create a fresh ENROLLED registration
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
    const message = error instanceof Error
      ? error.message
      : 'An unexpected error occurred during drop.';
    return res.status(500).json({ success: false, message });
  }
});

// ---------------------------------------------------------------------------
// Graceful Shutdown – close Prisma + PG pool on SIGTERM / SIGINT
// ---------------------------------------------------------------------------
const gracefulShutdown = async () => {
  console.log('\nShutting down gracefully...');
  await prisma.$disconnect();
  await pool.end();
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Engine running flawlessly on http://localhost:${PORT}`);
});
