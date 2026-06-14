import 'dotenv/config';
import { prisma } from './lib/prisma';

async function main() {
  console.log('🌱 Injecting dummy data into the engine...');

  // 1. Create Test Students
  const student1 = await prisma.user.create({
    data: {
      email: 'student_one@university.edu',
      name: 'John Doe',
      totalCredits: 0
    }
  });

  const student2 = await prisma.user.create({
    data: {
      email: 'student_two@university.edu',
      name: 'Jane Smith',
      totalCredits: 0
    }
  });

  // 2. Create an Introductory Course (no prerequisites) — registration OPEN now
  const introCourse = await prisma.course.create({
    data: {
      title: 'Intro to Computer Science',
      capacity: 10,
      credits: 16,
      startTime: '2026-09-01T09:00:00.000Z',  // 9:00 AM UTC
      endTime:   '2026-09-01T10:30:00.000Z',  // 10:30 AM UTC
      daysOfWeek: [1, 3],  // Mon, Wed
      registrationStart: '2026-01-01T00:00:00.000Z',  // Open since Jan 1
      registrationEnd:   '2026-12-31T23:59:59.000Z'   // Closes Dec 31
    }
  });

  // 3. Create an Advanced Course (requires the intro course as prerequisite) — registration OPEN now
  const advancedCourse = await prisma.course.create({
    data: {
      title: 'Advanced Backend Engineering',
      capacity: 10,       // Small capacity to test waitlist easily
      credits: 14,
      startTime: '2026-09-01T11:00:00.000Z',  // 11:00 AM UTC
      endTime:   '2026-09-01T12:30:00.000Z',  // 12:30 PM UTC
      daysOfWeek: [1, 3],  // Mon, Wed
      registrationStart: '2026-01-01T00:00:00.000Z',  // Open since Jan 1
      registrationEnd:   '2026-12-31T23:59:59.000Z'   // Closes Dec 31
    }
  });

  // 4. Create a Lab Course — registration NOT YET OPEN (tests the window guard)
  const labCourse = await prisma.course.create({
    data: {
      title: 'Systems Lab',
      capacity: 30,
      credits: 2,
      startTime: '2026-09-01T11:00:00.000Z',  // Deliberately clashes with Advanced
      endTime:   '2026-09-01T12:00:00.000Z',
      daysOfWeek: [1, 3],
      registrationStart: '2027-01-01T00:00:00.000Z',  // Opens next year
      registrationEnd:   '2027-06-30T23:59:59.000Z'   // Closes mid-2027
    }
  });

  // 5. Set up prerequisite relationship: Advanced requires Intro
  await prisma.prerequisite.create({
    data: {
      courseId: advancedCourse.id,
      prerequisiteId: introCourse.id
    }
  });

  console.log('✅ Database successfully seeded!\n');
  console.log('--- STUDENTS ---');
  console.log(`👤 Student 1 ID : ${student1.id}`);
  console.log(`👤 Student 2 ID : ${student2.id}`);
  console.log('\n--- COURSES ---');
  console.log(`📚 Intro Course ID    : ${introCourse.id}  (no prereqs, 10 seats, registration OPEN)`);
  console.log(`📚 Advanced Course ID : ${advancedCourse.id}  (requires Intro, 1 seat, registration OPEN)`);
  console.log(`📚 Lab Course ID      : ${labCourse.id}  (time-clashes with Advanced, registration NOT YET OPEN)`);
  console.log('\n-------------------------------------------------');
  console.log('Test flow:');
  console.log('  1. Enroll student1 in Intro (prerequisite for Advanced)');
  console.log('  2. Enroll student1 in Advanced – should succeed');
  console.log('  3. Try student2 for Advanced – should land on waitlist (capacity=1)');
  console.log('  4. Have student1 drop Advanced – waitlisted student2 should auto-promote');
  console.log('  5. Try registering for Lab Course – should fail (window not open)');
  console.log('  6. Check AuditLog table – should show REGISTER, WAITLIST, DROP, PROMOTE');
  console.log('-------------------------------------------------');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
