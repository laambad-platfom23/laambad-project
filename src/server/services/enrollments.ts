import { prisma, newId, now } from "@/lib/db";
import { ApiError, Err } from "@/lib/api/errors";
import { isVdoCipherConfigured, requestVdoCipherOtp, VdoCipherNotConfiguredError } from "@/server/vdocipher";
import { ser } from "@/server/serialize";
import { mapCourseList } from "./courses";
import type { AuthUser } from "@/lib/auth/request";
import * as coursesSvc from "./courses";
import { withLegacyPrice } from "@/server/legacy-prices";
import { fromMinor, toMinor } from "@/server/money";
import { decodeHtmlEntities } from "@/lib/html-entities";
import { completeCourseAndIssue } from "./misc";
import {
  ACCESS_STATUSES,
  apiEnrollmentStatus,
  apiPaymentStatus,
  findBestEnrollment,
  hasCourseAccess,
  sourceStatuses,
} from "@/server/enrollment-status";

async function activePricingAmount(courseId: string, couponCode?: string) {
  const pricing = withLegacyPrice(
    await prisma.coursePricing.findFirst({
      where: { courseId, isActive: true, deletedAt: null },
    })
  );
  if (!pricing) throw Err.notFound("pricing not found");
  let amount = pricing.isFree ? 0 : toMinor(pricing.discountPrice ?? pricing.price);
  if (couponCode?.trim()) {
    const preview = await coursesSvc.previewCoupon(courseId, couponCode);
    if (preview.valid) amount = preview.amount_minor;
  }
  return { amount, currency: pricing.currency };
}

export async function enroll(
  user: AuthUser,
  courseId: string,
  couponCode?: string
) {
  const course = await prisma.course.findFirst({
    where: { id: courseId, deletedAt: null },
  });
  if (!course || course.status !== "published") throw Err.notFound("course not found");

  const existing = await findBestEnrollment(user.user_id, courseId);
  if (existing && hasCourseAccess(existing)) throw Err.alreadyEnrolled();

  const { amount, currency } = await activePricingAmount(courseId, couponCode);
  if (amount > 0) throw Err.paymentRequired();

  const t = now();
  const enrollmentId = newId();
  await prisma.enrollment.create({
    data: {
      id: enrollmentId,
      userId: user.user_id,
      courseId,
      status: "active",
      paymentStatus: "paid",
      enrolledAt: t,
      createdAt: t,
      updatedAt: t,
    },
  });
  await prisma.payment.create({
    data: {
      id: newId(),
      userId: user.user_id,
      courseId,
      amount: fromMinor(0),
      currency,
      status: "paid",
      provider: "free",
      paidAt: t,
      createdAt: t,
      updatedAt: t,
    },
  });

  return {
    id: enrollmentId,
    course_id: courseId,
    user_id: user.user_id,
    enrolled_at: t.toISOString(),
    payment_status: "paid",
    status: "active",
  };
}

export async function myCourses(userId: string) {
  const rows = await prisma.enrollment.findMany({
    where: { userId, deletedAt: null },
    orderBy: { enrolledAt: "desc" },
    include: {
      course: {
        include: {
          instructor: { select: { id: true, name: true, email: true, avatarUrl: true } },
          category: true,
        },
      },
    },
  });
  // WordPress made one enrollment per order: show each course once, using its best enrollment.
  const best = new Map<string, (typeof rows)[number]>();
  for (const e of rows) {
    const cur = best.get(e.courseId);
    if (!cur || (!hasCourseAccess(cur) && hasCourseAccess(e))) best.set(e.courseId, e);
  }
  const picked = [...best.values()];
  // Batched (constant number of queries): a migrated student can have 70+ courses.
  const mapped = await mapCourseList(picked.filter((e) => e.course).map((e) => e.course!));
  const byId = new Map(mapped.map((c) => [(c as { id: string }).id, c]));
  const data = await Promise.all(
    picked.map(async (e) => ({
      id: e.id,
      user_id: e.userId,
      course_id: e.courseId,
      status: apiEnrollmentStatus(e),
      payment_status: apiPaymentStatus(e),
      enrolled_at: e.enrolledAt.toISOString(),
      completed_at: e.completedAt?.toISOString() ?? null,
      course: e.course ? byId.get(e.courseId) : undefined,
    }))
  );
  return ser(data);
}

export async function getProgress(user: AuthUser, courseId: string) {
  const enrollment = await findBestEnrollment(user.user_id, courseId);
  if (!enrollment || !ACCESS_STATUSES.includes(enrollment.status.toLowerCase())) {
    throw Err.notFound("enrollment not found");
  }

  const lessons = await prisma.lesson.findMany({
    where: { deletedAt: null, section: { courseId, deletedAt: null } },
    orderBy: [{ section: { sortOrder: "asc" } }, { sortOrder: "asc" }],
  });
  // G7: migrated progress belongs to the user + lesson (35 rows have no enrollment), not to one enrollment.
  const progress = await prisma.lessonProgress.findMany({
    where: { userId: user.user_id, lessonId: { in: lessons.map((l) => l.id) }, deletedAt: null },
  });
  const byLesson = new Map(progress.map((p) => [p.lessonId, p]));
  const lessonRows = lessons.map((l) => {
    const p = byLesson.get(l.id);
    return {
      lesson_id: l.id,
      title: l.title,
      completed: !!p?.completed,
      completed_percent: Number(p?.completedPercent ?? 0),
      completed_at: p?.completedAt?.toISOString() ?? null,
    };
  });
  const completedLessons = lessonRows.filter((l) => l.completed).length;
  const total = lessons.length;
  return {
    course_id: courseId,
    enrollment_id: enrollment.id,
    total_lessons: total,
    completed_lessons: completedLessons,
    completion_percent: total ? (completedLessons / total) * 100 : 0,
    lessons: lessonRows,
  };
}

export async function updateLessonProgress(
  user: AuthUser,
  lessonId: string,
  input: { completed?: boolean; completed_percent?: number }
) {
  if (input.completed === undefined && input.completed_percent === undefined) {
    throw Err.invalidInput("completed or completed_percent required");
  }
  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, deletedAt: null },
    include: { section: true },
  });
  if (!lesson) throw Err.notFound("lesson not found");

  const enrollment = await findBestEnrollment(user.user_id, lesson.section.courseId);
  if (!enrollment || !ACCESS_STATUSES.includes(enrollment.status.toLowerCase())) throw Err.forbidden();
  if (!hasCourseAccess(enrollment) && user.role !== "admin" && user.role !== "instructor") {
    throw Err.forbidden();
  }

  let completed = input.completed;
  let pct = input.completed_percent;
  if (completed === true) pct = 100;
  if (completed === false) pct = 0;
  if (pct === undefined) pct = completed ? 100 : 0;
  completed = pct >= 100;

  // G7: one progress row per (user, lesson) — unique in the approved schema.
  const existing = await prisma.lessonProgress.findUnique({
    where: { userId_lessonId: { userId: user.user_id, lessonId } },
  });
  const t = now();
  if (existing) {
    await prisma.lessonProgress.update({
      where: { id: existing.id },
      data: {
        deletedAt: null,
        enrollmentId: existing.enrollmentId ?? enrollment.id,
        completed,
        completedPercent: BigInt(Math.max(0, Math.min(100, Math.floor(pct)))),
        completedAt: completed ? t : null,
        updatedAt: t,
      },
    });
  } else {
    await prisma.lessonProgress.create({
      data: {
        id: newId(),
        userId: user.user_id,
        enrollmentId: enrollment.id,
        lessonId,
        completed,
        completedPercent: BigInt(Math.max(0, Math.min(100, Math.floor(pct)))),
        completedAt: completed ? t : null,
        createdAt: t,
        updatedAt: t,
      },
    });
  }

  // Last lesson done → complete the course and issue the certificate automatically.
  if (completed) {
    try {
      const cert = await completeCourseAndIssue(user.user_id, lesson.section.courseId);
      return { course_completed: true, certificate_id: cert?.id ?? null };
    } catch {
      // not all lessons done yet (or no access to a certificate): nothing to do
    }
  }
  return { course_completed: false, certificate_id: null };
}

/**
 * G5: OTP + playbackInfo for a VdoCipher lesson. Allowed for students with course access, the course
 * instructor and admins. Answers 503 vdocipher_not_configured until the API secret is provided.
 */
export async function vdocipherPlayback(user: AuthUser, lessonId: string, playbackHost?: string) {
  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, deletedAt: null },
    include: { section: { include: { course: { select: { id: true, instructorId: true } } } } },
  });
  if (!lesson || !lesson.vdocipherVideoId) throw Err.notFound("lesson video not found");
  const course = lesson.section.course;
  const staff = user.role === "admin" || (user.role === "instructor" && course.instructorId === user.user_id);
  if (!staff && !lesson.isPreview) {
    const e = await findBestEnrollment(user.user_id, course.id);
    if (!e || !hasCourseAccess(e)) throw Err.forbidden();
  }
  if (!isVdoCipherConfigured()) {
    throw new ApiError(503, "vdocipher_not_configured", "VdoCipher API secret is not configured yet");
  }
  const viewer = await prisma.user.findFirst({ where: { id: user.user_id }, select: { name: true, email: true } });
  try {
    const r = await requestVdoCipherOtp(lesson.vdocipherVideoId, viewer ?? undefined, playbackHost);
    return { provider: "vdocipher", otp: r.otp, playback_info: r.playbackInfo };
  } catch (err) {
    if (err instanceof VdoCipherNotConfiguredError) {
      throw new ApiError(503, "vdocipher_not_configured", "VdoCipher API secret is not configured yet");
    }
    throw new ApiError(502, "vdocipher_error", "could not start the video, try again");
  }
}

export async function adminList(page = 1, pageSize = 20) {
  const take = Math.min(Math.max(pageSize, 1), 100);
  const skip = (Math.max(page, 1) - 1) * take;
  const where = { deletedAt: null };
  const [total, rows] = await Promise.all([
    prisma.enrollment.count({ where }),
    prisma.enrollment.findMany({
      where,
      skip,
      take,
      orderBy: { enrolledAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true } },
        course: {
          select: { id: true, title: true, slug: true, instructor: { select: { name: true } } },
        },
      },
    }),
  ]);
  // Latest payment per (user, course) of this page, in one query.
  const payments = rows.length
    ? await prisma.payment.findMany({
        where: {
          deletedAt: null,
          OR: rows.map((e) => ({ userId: e.userId, courseId: e.courseId })),
        },
        orderBy: { createdAt: "desc" },
        select: { userId: true, courseId: true, provider: true, status: true, amount: true, currency: true },
      })
    : [];
  const lastPay = new Map<string, (typeof payments)[number]>();
  for (const p of payments) {
    const k = `${p.userId}:${p.courseId}`;
    if (!lastPay.has(k)) lastPay.set(k, p);
  }
  return {
    // shape of AdminEnrollmentRow (dashboard/enrollments page)
    data: ser(
      rows.map((e) => {
        const p = lastPay.get(`${e.userId}:${e.courseId}`);
        return {
          id: e.id,
          enrollment_id: e.id,
          user_id: e.userId,
          user_name: e.user?.name ?? "",
          user_email: e.user?.email ?? "",
          course_id: e.courseId,
          course_title: e.course ? decodeHtmlEntities(e.course.title) : "",
          course_slug: e.course?.slug ?? "",
          instructor_name: e.course?.instructor?.name ?? "",
          enrollment_status: apiEnrollmentStatus(e),
          status: apiEnrollmentStatus(e),
          payment_status: apiPaymentStatus(e),
          ...sourceStatuses(e),
          payment_method: p?.provider ?? "",
          payment_row_status: p?.status,
          amount_minor: p ? toMinor(p.amount) : undefined,
          currency: p?.currency,
          enrolled_at: e.enrolledAt.toISOString(),
          completed_at: e.completedAt?.toISOString() ?? null,
        };
      })
    ),
    total,
    page: Math.max(page, 1),
  };
}

export async function adminCancel(id: string) {
  const e = await prisma.enrollment.findFirst({ where: { id, deletedAt: null } });
  if (!e) throw Err.notFound("enrollment not found");
  await prisma.enrollment.update({
    where: { id },
    // migrated vocabulary (both spellings are understood when reading)
    data: { status: "cancelled", updatedAt: now() },
  });
}

export async function adminDelete(id: string) {
  const e = await prisma.enrollment.findFirst({ where: { id, deletedAt: null } });
  if (!e) throw Err.notFound("enrollment not found");
  await prisma.enrollment.update({
    where: { id },
    data: { deletedAt: now(), updatedAt: now() },
  });
}

export async function adminReactivate(id: string) {
  const e = await prisma.enrollment.findFirst({ where: { id, deletedAt: null } });
  if (!e) throw Err.notFound("enrollment not found");
  await prisma.enrollment.update({
    where: { id },
    data: { status: "active", updatedAt: now() },
  });
}
