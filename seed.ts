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

  // 2. Create an Introductory Course (no prerequisites)
  const introCourse = await prisma.course.create({
    data: {
      title: 'Intro to Computer Science',
      capacity: 30,
      credits: 3,
      // Use proper ISO 8601 DateTime strings
      startTime: '2026-09-01T09:00:00.000Z',  // 9:00 AM UTC
      endTime:   '2026-09-01T10:30:00.000Z',  // 10:30 AM UTC
      daysOfWeek: [1, 3]  // Mon, Wed
    }
  });

  // 3. Create an Advanced Course (requires the intro course as prerequisite)
  const advancedCourse = await prisma.course.create({
    data: {
      title: 'Advanced Backend Engineering',
      capacity: 5,       // Small capacity to test waitlist easily
      credits: 4,
      startTime: '2026-09-01T11:00:00.000Z',  // 11:00 AM UTC
      endTime:   '2026-09-01T12:30:00.000Z',  // 12:30 PM UTC
      daysOfWeek: [1, 3]  // Mon, Wed
    }
  });

  // 4. Create a Lab Course that time-clashes with the Advanced Course (same slot)
  const labCourse = await prisma.course.create({
    data: {
      title: 'Systems Lab',
      capacity: 15,
      credits: 2,
      startTime: '2026-09-01T11:00:00.000Z',  // Deliberately clashes with Advanced
      endTime:   '2026-09-01T12:00:00.000Z',
      daysOfWeek: [1, 3]
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
  console.log(`📚 Intro Course ID    : ${introCourse.id}  (no prerequisites, 30 seats)`);
  console.log(`📚 Advanced Course ID : ${advancedCourse.id}  (requires Intro, 5 seats – easy to fill for waitlist tests)`);
  console.log(`📚 Lab Course ID      : ${labCourse.id}  (time-clashes with Advanced)`);
  console.log('\n-------------------------------------------------');
  console.log('Test flow:');
  console.log('  1. Enroll student1 in Intro (prerequisite for Advanced)');
  console.log('  2. Enroll student1 in Advanced – should succeed');
  console.log('  3. Fill Advanced to capacity, then try student2 – should land on waitlist');
  console.log('  4. Have student1 drop Advanced – waitlisted student2 should auto-promote');
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
