                                    Course Registration Engine

A high-concurrency, transactional backend engine designed for university-scale course management. This system ensures data integrity, fair resource allocation, and policy enforcement in environments with heavy load.

🚀 Key Features
Atomic Registration Engine: Built on Prisma 7 transactions with FOR UPDATE pessimistic locking, guaranteeing zero race conditions during high-demand enrollment.

Intelligent Waitlisting: Automated, first-come-first-served queue system with instantaneous atomic promotion when seats become available.

Temporal Policy Enforcement: Built-in "Window Guards" that strictly enforce registration start and end times, preventing unauthorized access.

Academic Guardrails: Real-time credit limit validation (Semester Cap: 18 credits) and prerequisite dependency verification.

Immutable Audit Trail: A full-lifecycle AuditLog system that records every state change (REGISTER, WAITLIST, DROP, PROMOTE) within the database transaction, providing a perfect source of truth for administrative forensics.

🏗 System Architecture
The system utilizes an ACID-compliant transaction model to maintain data integrity across complex state transitions.

🛠 Tech Stack

Runtime: Node.js / TypeScriptDatabase: PostgreSQL
ORM: Prisma 7 (Pessimistic Locking strategy)
Architecture: Express.js with custom Middleware and Guard patterns.

📊 Database Schema 
Highlights
Model                                Purpose
Registration      Manages active student-course enrollments.
Waitlist          Handles queue position and auto-promotion logic.
AuditLog          Immutable record of system events for accountability.
Course            Tracks capacity, credit weight, and temporal availability.


🧪 Testing & Validation

The system is built to handle edge cases, including:

Temporal Rejection: Attempts to register for closed courses return 403 Forbidden with detailed window diagnostics.

Over-Enrollment Prevention: Credit limit guards intercept requests exceeding semester caps before database lock.

Atomic Promotion: Ensures that a dropped seat is immediately and securely transferred to the next waitlisted student without latency.
