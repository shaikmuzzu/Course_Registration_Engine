import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from './lib/prisma';

async function main() {
  console.log('🌱 Injecting dummy data into the engine...');

  // Hash passwords (students: "password123", admin: "admin123")
  const studentPassword = await bcrypt.hash('password123', 10);
  const adminPassword = await bcrypt.hash('admin123', 10);

  // 1. Create Test Students
  const student1 = await prisma.user.create({
    data: {
      email: 'student_one@university.edu',
      name: 'John Doe',
      password: studentPassword,
      role: 'STUDENT',
      totalCredits: 0
    }
  });

  const student2 = await prisma.user.create({
    data: {
      email: 'student_two@university.edu',
      name: 'Jane Smith',
      password: studentPassword,
      role: 'STUDENT',
      totalCredits: 0
    }
  });

  // 2. Create Admin User
  const admin = await prisma.user.create({
    data: {
      email: 'admin@university.edu',
      name: 'Admin User',
      password: adminPassword,
      role: 'ADMIN',
      totalCredits: 0
    }
  });

  // 3. Create an Introductory Course (no prerequisites) — registration OPEN now
  const introCourse = await prisma.course.create({
    data: {
      title: 'Intro to Computer Science',
      capacity: 10,
      credits: 16,
      startTime: '2026-09-01T09:00:00.000Z',
      endTime:   '2026-09-01T10:30:00.000Z',
      daysOfWeek: [1, 3],  // Mon, Wed
      registrationStart: '2026-01-01T00:00:00.000Z',
      registrationEnd:   '2026-12-31T23:59:59.000Z'
    }
  });

  // 4. Create an Advanced Course (requires intro as prerequisite) — registration OPEN now
  const advancedCourse = await prisma.course.create({
    data: {
      title: 'Advanced Backend Engineering',
      capacity: 10,
      credits: 14,
      startTime: '2026-09-01T11:00:00.000Z',
      endTime:   '2026-09-01T12:30:00.000Z',
      daysOfWeek: [1, 3],  // Mon, Wed
      registrationStart: '2026-01-01T00:00:00.000Z',
      registrationEnd:   '2026-12-31T23:59:59.000Z'
    }
  });

  // 5. Create a Lab Course — registration NOT YET OPEN (tests the window guard)
  const labCourse = await prisma.course.create({
    data: {
      title: 'Systems Lab',
      capacity: 30,
      credits: 2,
      startTime: '2026-09-01T11:00:00.000Z',  // Deliberately clashes with Advanced
      endTime:   '2026-09-01T12:00:00.000Z',
      daysOfWeek: [1, 3],
      registrationStart: '2027-01-01T00:00:00.000Z',  // Opens next year
      registrationEnd:   '2027-06-30T23:59:59.000Z'
    }
  });

  // 6. Set up prerequisite relationship: Advanced requires Intro
  await prisma.prerequisite.create({
    data: {
      courseId: advancedCourse.id,
      prerequisiteId: introCourse.id
    }
  });

  // 7. Seed default SystemSettings
  await prisma.systemSettings.upsert({
    where: { id: 'default' },
    update: {},
    create: { id: 'default', maxSemesterCredits: 18 }
  });

  console.log('✅ Database successfully seeded!\n');
  console.log('--- USERS ---');
  console.log(`👤 Student 1  : ${student1.email}  (password: password123)`);
  console.log(`👤 Student 2  : ${student2.email}  (password: password123)`);
  console.log(`🔑 Admin      : ${admin.email}  (password: admin123)`);
  console.log('\n--- COURSES ---');
  console.log(`📚 Intro Course ID    : ${introCourse.id}  (no prereqs, registration OPEN)`);
  console.log(`📚 Advanced Course ID : ${advancedCourse.id}  (requires Intro, registration OPEN)`);
  console.log(`📚 Lab Course ID      : ${labCourse.id}  (time-clashes with Advanced, registration NOT YET OPEN)`);
  console.log('\n-------------------------------------------------');
  console.log('Auth flow:');
  console.log('  1. POST /api/auth/login  with { email, password }  → returns JWT token');
  console.log('  2. Attach header: Authorization: Bearer <token>');
  console.log('  3. POST /api/register   with { courseId }          → enroll/waitlist');
  console.log('  4. POST /api/drop       with { courseId }           → drop + promotion');
  console.log('  5. Admin routes: /api/admin/* require ADMIN role');
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
