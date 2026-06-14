import { prisma } from '../lib/prisma';
import { PrismaClient, AuditAction } from '@prisma/client';

// Extract the transaction client type from PrismaClient
type TxClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

// ---------------------------------------------------------------------------
// Guard: Is the student already ENROLLED in this course?
// ---------------------------------------------------------------------------
export const checkAlreadyEnrolled = async (userId: string, courseId: string) => {
  const existing = await prisma.registration.findUnique({
    where: { userId_courseId: { userId, courseId } }
  });

  if (existing && existing.status === 'ENROLLED') {
    return {
      success: false,
      message: 'You are already enrolled in this course.'
    };
  }

  return { success: true };
};

// ---------------------------------------------------------------------------
// Guard: Is the student already on the waitlist for this course?
// ---------------------------------------------------------------------------
export const checkAlreadyWaitlisted = async (userId: string, courseId: string) => {
  const existing = await prisma.waitlist.findUnique({
    where: { userId_courseId: { userId, courseId } }
  });

  if (existing) {
    return {
      success: false,
      message: `You are already on the waitlist for this course at position ${existing.position}.`
    };
  }

  return { success: true };
};

// ---------------------------------------------------------------------------
// Credit Limit Check
// ---------------------------------------------------------------------------
export const checkCreditLimit = async (userId: string, newCourseId: string) => {
  // Dynamic credit limit from SystemSettings (fallback to 18)
  const settings = await prisma.systemSettings.findUnique({ where: { id: 'default' } });
  const MAX_CREDITS = settings?.maxSemesterCredits ?? 18;

  // Fetch the user's ENROLLED registrations (waitlisted don't consume credits)
  const [user, newCourse] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      include: {
        registrations: {
          where: { status: 'ENROLLED' },
          include: { course: true }
        }
      }
    }),
    prisma.course.findUnique({ where: { id: newCourseId } })
  ]);

  if (!user || !newCourse) throw new Error('User or Course not found');

  const currentCredits = user.registrations.reduce((sum, reg) => sum + reg.course.credits, 0);
  const remainingBudget = MAX_CREDITS - currentCredits;

  if (currentCredits + newCourse.credits > MAX_CREDITS) {
    const suggestions = await prisma.course.findMany({
      where: { credits: { lte: remainingBudget } },
      select: { id: true, title: true, credits: true },
      take: 3
    });

    return {
      success: false,
      message: `Limit exceeded. You only have ${remainingBudget} credits left.`,
      fallbackOptions: suggestions
    };
  }

  return { success: true };
};

// ---------------------------------------------------------------------------
// Prerequisite Check
// ---------------------------------------------------------------------------
export const checkPrerequisites = async (userId: string, courseId: string) => {
  const requiredPrereqs = await prisma.prerequisite.findMany({
    where: { courseId },
    select: { prerequisiteId: true }
  });

  if (requiredPrereqs.length === 0) {
    return { success: true };
  }

  const requiredPrereqIds = requiredPrereqs.map(p => p.prerequisiteId);

  const studentCompletedCourses = await prisma.registration.findMany({
    where: {
      userId,
      courseId: { in: requiredPrereqIds },
      status: 'ENROLLED'
    },
    select: { courseId: true }
  });

  const studentCompletedIds = studentCompletedCourses.map(r => r.courseId);

  const missingPrereqs = requiredPrereqIds.filter(
    (requiredId) => !studentCompletedIds.includes(requiredId)
  );

  if (missingPrereqs.length > 0) {
    return {
      success: false,
      message: `Prerequisite check failed. You are missing ${missingPrereqs.length} required course(s).`,
      missingCourseIds: missingPrereqs
    };
  }

  return { success: true };
};

// ---------------------------------------------------------------------------
// Time Clash Check
// ---------------------------------------------------------------------------
export const checkTimeClash = async (userId: string, newCourseId: string) => {
  const [newCourse, studentSchedule] = await Promise.all([
    prisma.course.findUnique({
      where: { id: newCourseId },
      select: { id: true, title: true, startTime: true, endTime: true, daysOfWeek: true }
    }),
    prisma.registration.findMany({
      where: { userId, status: 'ENROLLED' },
      include: {
        course: {
          select: { title: true, startTime: true, endTime: true, daysOfWeek: true }
        }
      }
    })
  ]);

  if (!newCourse) throw new Error('Target course not found');

  const timeToMinutes = (date: Date): number => {
    return date.getUTCHours() * 60 + date.getUTCMinutes();
  };

  const newStart = timeToMinutes(newCourse.startTime);
  const newEnd = timeToMinutes(newCourse.endTime);
  const newDays = newCourse.daysOfWeek;

  for (const reg of studentSchedule) {
    const existingCourse = reg.course;
    const existingDays = existingCourse.daysOfWeek;

    const hasSharedDay = newDays.some(day => existingDays.includes(day));

    if (hasSharedDay) {
      const existStart = timeToMinutes(existingCourse.startTime);
      const existEnd = timeToMinutes(existingCourse.endTime);

      if (newStart < existEnd && newEnd > existStart) {
        return {
          success: false,
          message: `Schedule conflict! This course clashes with your enrolled class: "${existingCourse.title}".`,
          clashingCourse: existingCourse.title,
          conflictingSlot: `Days: ${existingCourse.daysOfWeek}`
        };
      }
    }
  }

  return { success: true };
};

// ---------------------------------------------------------------------------
// Shared Drop + Waitlist Promotion Logic (FOR UPDATE transactional)
// ---------------------------------------------------------------------------
export const executeDropWithPromotion = async (
  tx: TxClient,
  userId: string,
  courseId: string,
  auditAction: AuditAction
) => {
  // 1. Verify the student is currently ENROLLED
  const existingReg = await tx.registration.findUnique({
    where: { userId_courseId: { userId, courseId } }
  });

  if (!existingReg || existingReg.status !== 'ENROLLED') {
    throw new Error('Student is not currently enrolled in this course.');
  }

  // 2. Lock the course row with FOR UPDATE
  const courses: any[] = await tx.$queryRaw`
    SELECT * FROM "Course" WHERE id = ${courseId} FOR UPDATE
  `;

  if (!courses || courses.length === 0) {
    throw new Error('Course not found.');
  }

  // 3. Mark the registration as DROPPED
  await tx.registration.update({
    where: { id: existingReg.id },
    data: { status: 'DROPPED' }
  });

  await tx.auditLog.create({
    data: { userId: existingReg.userId, action: auditAction, courseId }
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
};
