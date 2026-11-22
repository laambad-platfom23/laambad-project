const { PrismaClient } = require("@prisma/client");

const p = new PrismaClient();

async function main() {
  // Truncate all app tables (schema stays). Cascade clears dependents.
  await p.$executeRawUnsafe(`
    TRUNCATE TABLE
      quiz_attempt_answers,
      quiz_attempts,
      quiz_questions,
      quizzes,
      research_reviews,
      research_paper_categories,
      research_papers,
      research_categories,
      lesson_questions,
      lesson_progresses,
      submissions,
      assignments,
      certificates,
      payments,
      coupons,
      course_reviews,
      enrollments,
      lessons,
      sections,
      course_pricing,
      courses,
      course_categories,
      notifications,
      uploaded_files,
      audit_logs,
      sessions,
      role_permissions,
      permissions,
      users,
      roles,
      site_settings
    RESTART IDENTITY CASCADE
  `);

  console.log(JSON.stringify({ emptied: true }));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
