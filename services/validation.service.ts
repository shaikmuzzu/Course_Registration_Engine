import { prisma } from '../lib/prisma';

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
  const MAX_CREDITS = 24;

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
