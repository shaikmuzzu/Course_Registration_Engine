import 'dotenv/config';
import { PrismaClient, Role, RegistrationStatus, AuditAction } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { faker } from '@faker-js/faker';
import bcrypt from 'bcrypt';

// Prisma v7 connection requirement
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const SALT_ROUNDS = 10;

async function main() {
    console.log('🌱 Starting the Ultimate Data Generator...');

    // 1. Wipe old data completely clean
    await prisma.auditLog.deleteMany({});
    await prisma.registration.deleteMany({});
    await prisma.waitlist.deleteMany({});
    await prisma.prerequisite.deleteMany({});
    await prisma.course.deleteMany({});
    await prisma.user.deleteMany({});

    console.log('🧹 Cleaned up old data.');

    // ---------------------------------------------------------------------------
    // 2. Pre-hash passwords (do this before bulk creates for efficiency)
    // ---------------------------------------------------------------------------
    const [adminHash, student1Hash, student2Hash, defaultHash] = await Promise.all([
        bcrypt.hash('Admin@123',   SALT_ROUNDS),
        bcrypt.hash('Student@123', SALT_ROUNDS),
        bcrypt.hash('Student@123', SALT_ROUNDS),
        bcrypt.hash('Default@123', SALT_ROUNDS)
    ]);

    // ---------------------------------------------------------------------------
    // 3. Create Admin User (known credentials for testing)
    // ---------------------------------------------------------------------------
    const admin = await prisma.user.create({
        data: {
            email:    'admin@university.edu',
            name:     'Alice Admin',
            password: adminHash,
            role:     Role.ADMIN
        },
    });
    console.log(`🛡️  Admin created: ${admin.email}  (password: Admin@123)`);

    // ---------------------------------------------------------------------------
    // 4. Create two named Student Users (known credentials for testing)
    // ---------------------------------------------------------------------------
    const student1 = await prisma.user.create({
        data: {
            email:    'student1@university.edu',
            name:     'John Doe',
            password: student1Hash,
            role:     Role.STUDENT
        }
    });

    const student2 = await prisma.user.create({
        data: {
            email:    'student2@university.edu',
            name:     'Jane Smith',
            password: student2Hash,
            role:     Role.STUDENT
        }
    });

    console.log(`👤 Student 1 created: ${student1.email}  (password: Student@123)`);
    console.log(`👤 Student 2 created: ${student2.email}  (password: Student@123)`);

    // ---------------------------------------------------------------------------
    // 5. Generate 48 additional random students (with hashed default password)
    // ---------------------------------------------------------------------------
    const fakeStudents = Array.from({ length: 48 }).map((_, index) => ({
        email:        `student${index + 3}_${faker.internet.email()}`,
        name:         faker.person.fullName(),
        password:     defaultHash,
        role:         Role.STUDENT,
        totalCredits: faker.number.int({ min: 0, max: 100 }),
    }));

    await prisma.user.createMany({ data: fakeStudents });
    const createdStudents = await prisma.user.findMany({ where: { role: Role.STUDENT } });
    console.log(`👥 Generated ${createdStudents.length} total students (2 named + 48 random).`);

    // ---------------------------------------------------------------------------
    // 6. Generate 20 Random Courses
    // ---------------------------------------------------------------------------
    const subjects = ['Computer Science', 'Mathematics', 'Physics', 'Biology', 'History', 'English', 'Art'];

    const fakeCourses = Array.from({ length: 20 }).map(() => {
        const subject    = faker.helpers.arrayElement(subjects);
        const courseCode = faker.number.int({ min: 100, max: 499 });
        const startTime  = faker.date.future({ years: 0.5 });
        const endTime    = new Date(startTime.getTime() + 90 * 60000); // 90-min classes

        return {
            title:       `${subject} ${courseCode}`,
            capacity:    faker.number.int({ min: 15, max: 50 }),
            filledSeats: 0,
            credits:     faker.number.int({ min: 3, max: 4 }),
            startTime,
            endTime,
            daysOfWeek:  faker.helpers.arrayElements([1, 2, 3, 4, 5], 2),
        };
    });

    await prisma.course.createMany({ data: fakeCourses });
    const createdCourses = await prisma.course.findMany();
    console.log(`📚 Generated ${createdCourses.length} Fake Courses.`);

    // ---------------------------------------------------------------------------
    // 7. Link Prerequisites (Make the first 5 courses require the next 5)
    // ---------------------------------------------------------------------------
    const prerequisiteLinks = [];
    for (let i = 0; i < 5; i++) {
        prerequisiteLinks.push({
            courseId:       createdCourses[i].id,
            prerequisiteId: createdCourses[i + 5].id
        });
    }
    await prisma.prerequisite.createMany({ data: prerequisiteLinks });
    console.log('🔗 Generated Fake Prerequisites.');

    // ---------------------------------------------------------------------------
    // 8. Register students for courses & Create Audit Logs
    // ---------------------------------------------------------------------------
    let registrationCount = 0;

    for (const student of createdStudents) {
        const randomCourses = faker.helpers.arrayElements(createdCourses, 3);

        for (const course of randomCourses) {
            await prisma.registration.create({
                data: {
                    userId:   student.id,
                    courseId: course.id,
                    status:   RegistrationStatus.ENROLLED,
                }
            });
            registrationCount++;

            await prisma.course.update({
                where: { id: course.id },
                data: { filledSeats: { increment: 1 } }
            });

            if (registrationCount % 2 === 0) {
                await prisma.auditLog.create({
                    data: {
                        userId:   student.id,
                        action:   AuditAction.REGISTER,
                        courseId: course.id,
                        details:  { message: 'System auto-enrolled via seeding.' }
                    }
                });
            }
        }
    }
    console.log(`📝 Generated ${registrationCount} Course Registrations & Audit Logs.`);

    // ---------------------------------------------------------------------------
    // 9. Seed Waitlists (Force 5 random students onto the waitlist for the first course)
    // ---------------------------------------------------------------------------
    const waitlistData = [];
    for (let i = 0; i < 5; i++) {
        waitlistData.push({
            userId:   createdStudents[i].id,
            courseId: createdCourses[0].id,
            position: i + 1
        });
    }
    await prisma.waitlist.createMany({ data: waitlistData });
    console.log('⏳ Generated Fake Waitlist Entries.');

    console.log('\n✅ SEEDING 100% COMPLETE!');
    console.log('\n=== TEST CREDENTIALS ===');
    console.log(`🛡️  Admin:     admin@university.edu     / Admin@123`);
    console.log(`👤 Student 1: student1@university.edu  / Student@123`);
    console.log(`👤 Student 2: student2@university.edu  / Student@123`);
    console.log('========================\n');
}

main()
    .catch((e) => {
        console.error('❌ Error while seeding:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });