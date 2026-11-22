import { NextRequest } from "next/server";
import { ApiError, Err } from "@/lib/api/errors";
import { json, publicJson, noContent, paginated, wrapped, handleError } from "@/lib/api/response";
import {
  requireAuth,
  requireRole,
  requirePerm,
  clientMeta,
  optionalAuth,
} from "@/lib/auth/request";
import * as auth from "@/server/services/auth";
import * as courses from "@/server/services/courses";
import * as enrollments from "@/server/services/enrollments";
import * as dashboard from "@/server/services/dashboard";
import * as siteSettings from "@/server/services/site-settings";
import * as uploads from "@/server/services/uploads";
import * as misc from "@/server/services/misc";
import * as quizzes from "@/server/services/quizzes";
import * as assignments from "@/server/services/assignments";
import * as publicStats from "@/server/services/public-stats";

function pageParams(url: URL) {
  const page = Number(url.searchParams.get("page") || 1);
  const pageSize = Number(url.searchParams.get("page_size") || 20);
  return { page, pageSize };
}

/** Small in-memory per-IP limiter for public auth endpoints (per server instance; the DB limits per user still apply). */
const ipHits = new Map<string, number[]>();
function ipLimit(key: string, max: number, windowMs: number) {
  const t = Date.now();
  const hits = (ipHits.get(key) ?? []).filter((x) => t - x < windowMs);
  if (hits.length >= max) {
    throw new ApiError(429, "too_many_requests", "Too many attempts. Please try again later.");
  }
  hits.push(t);
  ipHits.set(key, hits);
  if (ipHits.size > 5000) {
    for (const [k, v] of ipHits) if (!v.some((x) => t - x < windowMs)) ipHits.delete(k);
  }
}

async function readJson<T = Record<string, unknown>>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw Err.invalidJSON();
  }
}

export async function dispatch(req: NextRequest, pathParts: string[]) {
  const requestId = crypto.randomUUID();
  try {
    const method = req.method.toUpperCase();
    const path = pathParts.join("/");
    const url = new URL(req.url);
    const meta = clientMeta(req);

    // ── Auth ──
    if (path === "auth/register" && method === "POST") {
      const body = await readJson<{
        name: string;
        email: string;
        username?: string;
        phone?: string;
        address?: string;
        gender?: string;
        password: string;
      }>(req);
      return json(await auth.register({ ...body, ...meta }), 201);
    }
    if (path === "auth/login" && method === "POST") {
      const body = await readJson<{ email: string; password: string }>(req);
      return json(await auth.login({ ...body, ...meta }));
    }
    if (path === "auth/refresh" && method === "POST") {
      const body = await readJson<{ refresh_token: string }>(req);
      return json(await auth.refresh(body.refresh_token, meta.ip, meta.userAgent));
    }
    if (path === "auth/logout" && method === "POST") {
      const body = await readJson<{ refresh_token: string }>(req);
      await auth.logout(body.refresh_token);
      return noContent();
    }
    // password reset by e-mail code (public; same answer whether or not the account exists)
    if (path === "auth/forgot-password" && method === "POST") {
      ipLimit(`forgot:${meta.ip}`, 10, 3_600_000);
      const body = await readJson<{ email?: string }>(req);
      return json(await auth.forgotPassword({ email: body?.email ?? "", ip: meta.ip, origin: req.headers.get("origin") ?? undefined }));
    }
    if (path === "auth/reset-password" && method === "POST") {
      ipLimit(`reset:${meta.ip}`, 20, 3_600_000);
      const body = await readJson<{ email?: string; code?: string; password?: string }>(req);
      return json(await auth.resetPassword({ email: body?.email ?? "", code: body?.code ?? "", password: body?.password ?? "" }));
    }

    // ── Public courses ──
    if (path === "courses" && method === "GET") {
      const { page, pageSize } = pageParams(url);
      const result = await courses.publicList(page, pageSize);
      return publicJson({ data: result.data, total: result.total, page: result.page }, 120);
    }
    // ── Public home-page data (real numbers from the database) ──
    // These answers are the same for every visitor, so the CDN caches them (publicJson) and the
    // database only sees ~1 request per few minutes per URL instead of one per visitor.
    if (path === "public/instructors" && method === "GET") {
      const { page, pageSize } = pageParams(url);
      return publicJson(await publicStats.publicInstructors(page, url.searchParams.get("page_size") ? pageSize : 6), 600);
    }
    if (path === "public/stats" && method === "GET") {
      return publicJson(await publicStats.publicStats(), 600);
    }
    if (path === "course-categories" && method === "GET") {
      return publicJson(await courses.publicCategories(), 600);
    }
    if (path.startsWith("courses/by-slug/") && method === "GET") {
      const slug = decodeURIComponent(path.slice("courses/by-slug/".length));
      return publicJson(await courses.publicBySlug(slug), 120);
    }

    // ── Public research / certificates / lesson QA / site settings ──
    if (path === "research" && method === "GET") {
      const { page, pageSize } = pageParams(url);
      const result = await misc.publicResearch(page, pageSize);
      return publicJson({ data: result.data, total: result.total, page: result.page }, 300);
    }
    if (path.startsWith("certificates/verify/") && method === "GET") {
      const id = decodeURIComponent(path.slice("certificates/verify/".length));
      return publicJson(await misc.verifyCertificate(id), 3600);
    }
    if (path.match(/^lessons\/[^/]+\/questions$/) && method === "GET") {
      const lessonId = path.split("/")[1];
      return wrapped(await misc.listLessonQuestions(lessonId));
    }
    if (path === "v1/public/site-settings" && method === "GET") {
      return wrapped(await siteSettings.getMap());
    }

    // ── Users (under /api/users) ──
    if (path === "users" && method === "GET") {
      const user = await requireAuth(req);
      requirePerm(user, "users.read");
      const { page, pageSize } = pageParams(url);
      const result = await misc.listUsers(page, pageSize, {
        q: url.searchParams.get("q") ?? undefined,
        role: url.searchParams.get("role") ?? undefined,
      });
      return paginated(result.data, result.total, result.page);
    }
    if (path.match(/^users\/[^/]+$/) && method === "GET") {
      const user = await requireAuth(req);
      requirePerm(user, "users.read");
      return json(await misc.getUser(path.split("/")[1]));
    }
    if (path.match(/^users\/[^/]+\/role$/) && method === "PATCH") {
      const user = await requireAuth(req);
      requirePerm(user, "users.write");
      const body = await readJson<{ role: string; role_slug?: string }>(req);
      return json(
        await misc.updateUserRole(path.split("/")[1], body.role_slug || body.role)
      );
    }
    if (path.match(/^users\/[^/]+\/active$/) && method === "PATCH") {
      const user = await requireAuth(req);
      requirePerm(user, "users.write");
      const body = await readJson<{ active?: boolean; is_active?: boolean }>(req);
      return json(
        await misc.setUserActive(
          path.split("/")[1],
          body.active ?? body.is_active ?? true
        )
      );
    }

    if (path.match(/^users\/[^/]+\/password$/) && method === "PATCH") {
      const user = await requireAuth(req);
      requirePerm(user, "users.write");
      const body = await readJson<{ password?: string }>(req);
      return json(await misc.setUserPassword(path.split("/")[1], body.password));
    }

    // ── Notifications public-ish ──
    if (path === "notifications" && method === "GET") {
      const user = await optionalAuth(req);
      if (!user) return json([]);
      return json(await misc.listNotifications(user.user_id));
    }

    // Everything below typically under v1
    if (!path.startsWith("v1/")) throw Err.notFound(`route not found: /api/${path}`);
    const v1 = path.slice(3);

    // me
    if (v1 === "me" && method === "GET") {
      const user = await requireAuth(req);
      return json(await auth.me(user.user_id));
    }
    if (v1 === "me/verify-email/send" && method === "POST") {
      const user = await requireAuth(req);
      return json(await auth.sendVerificationCode(user.user_id, meta.ip));
    }
    if (v1 === "me/verify-email" && method === "POST") {
      const user = await requireAuth(req);
      ipLimit(`verify:${meta.ip}`, 30, 3_600_000);
      const body = await readJson<{ code?: string }>(req);
      return json(await auth.verifyEmail(user.user_id, body?.code ?? ""));
    }
    if (v1 === "me" && method === "PATCH") {
      const user = await requireAuth(req);
      const body = await readJson<{ name?: string; phone?: string; avatar_url?: string }>(req);
      return json(await auth.updateMe(user.user_id, body));
    }

    // dashboard
    if (v1 === "dashboard" && method === "GET") {
      const user = await requireAuth(req);
      return json(await dashboard.overview(user.user_id, url.searchParams.get("course_slug")));
    }
    if (v1 === "dashboard/institute-stats" && method === "GET") {
      const user = await requireAuth(req);
      return json(await dashboard.instituteStats(user));
    }

    // my-courses
    if (v1 === "my-courses" && method === "GET") {
      const user = await requireAuth(req);
      return wrapped(await enrollments.myCourses(user.user_id));
    }

    // uploads
    if (v1 === "uploads/media" && method === "POST") {
      const user = await requireAuth(req);
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) throw Err.invalidInput("file required");
      const folder = String(form.get("folder") || "assets");
      return json(await uploads.uploadMedia(user, file, folder));
    }

    // course categories
    if (v1 === "course-categories" && method === "GET") {
      await requireAuth(req);
      return json(await misc.listCourseCategories());
    }
    if (v1 === "course-categories" && method === "POST") {
      const user = await requireAuth(req);
      requireRole(user, "admin", "instructor");
      const body = await readJson<{ name: string; slug?: string; sort_order?: number }>(req);
      return json(await misc.createCourseCategory(body), 201);
    }
    if (v1.match(/^course-categories\/[^/]+$/) && method === "PATCH") {
      const user = await requireAuth(req);
      requireRole(user, "admin");
      const body = await readJson<{ name?: string; slug?: string; sort_order?: number }>(req);
      return json(await misc.updateCourseCategory(v1.split("/")[1], body));
    }
    if (v1.match(/^course-categories\/[^/]+$/) && method === "DELETE") {
      const user = await requireAuth(req);
      requireRole(user, "admin");
      await misc.deleteCourseCategory(v1.split("/")[1]);
      return noContent();
    }

    // admin
    if (v1 === "admin/ping" && method === "GET") {
      const user = await requireAuth(req);
      requireRole(user, "admin");
      return json({ status: "ok" });
    }
    // Which database is this app connected to? (identity only, never the connection string)
    if (v1 === "admin/db-info" && method === "GET") {
      const user = await requireAuth(req);
      requireRole(user, "admin");
      const { prisma } = await import("@/lib/db");
      const rows = await prisma.$queryRaw<
        { db: string; branch: string | null; endpoint: string | null; project: string | null; users: bigint; courses: bigint }[]
      >`SELECT current_database() AS db,
               current_setting('neon.branch_id', true) AS branch,
               current_setting('neon.endpoint_id', true) AS endpoint,
               current_setting('neon.project_id', true) AS project,
               (SELECT count(*) FROM users) AS users,
               (SELECT count(*) FROM courses) AS courses`;
      const r = rows[0];
      return json({
        target: process.env.LAAMBAD_DB_TARGET ?? "env-file",
        database: r.db,
        neon: r.branch ? { project: r.project, branch: r.branch, endpoint: r.endpoint } : null,
        users: Number(r.users),
        courses: Number(r.courses),
      });
    }
    if (v1 === "admin/site-settings" && method === "GET") {
      const user = await requireAuth(req);
      requireRole(user, "admin");
      const data = await siteSettings.getMap();
      return json({ data, keys: Object.keys(data) });
    }
    if (v1 === "admin/site-settings" && method === "PUT") {
      const user = await requireAuth(req);
      requireRole(user, "admin");
      const body = await readJson<{ settings?: Record<string, string> }>(req);
      const settings =
        body.settings && typeof body.settings === "object"
          ? body.settings
          : (body as unknown as Record<string, string>);
      const data = await siteSettings.upsertImages(settings);
      return json({ data });
    }
    if (v1 === "admin/site-images/upload" && method === "POST") {
      const user = await requireAuth(req);
      requireRole(user, "admin");
      const form = await req.formData();
      const file = form.get("file");
      const key = String(form.get("key") || form.get("setting_key") || "");
      if (!(file instanceof File) || !key) throw Err.invalidInput("file and key required");
      const buf = Buffer.from(await file.arrayBuffer());
      const url = await siteSettings.uploadSiteImage(
        key,
        file.name,
        file.type || "image/jpeg",
        buf
      );
      return json({ url, key });
    }
    if (v1 === "admin/enrollments" && method === "GET") {
      const user = await requireAuth(req);
      requireRole(user, "admin");
      const { page, pageSize } = pageParams(url);
      const result = await enrollments.adminList(page, pageSize);
      return paginated(result.data, result.total, result.page);
    }
    if (v1.match(/^admin\/enrollments\/[^/]+\/cancel$/) && method === "POST") {
      const user = await requireAuth(req);
      requireRole(user, "admin");
      await enrollments.adminCancel(v1.split("/")[2]);
      return noContent();
    }
    if (v1.match(/^admin\/enrollments\/[^/]+$/) && method === "DELETE") {
      const user = await requireAuth(req);
      requireRole(user, "admin");
      await enrollments.adminDelete(v1.split("/")[2]);
      return noContent();
    }
    if (v1.match(/^admin\/enrollments\/[^/]+\/reactivate$/) && method === "POST") {
      const user = await requireAuth(req);
      requireRole(user, "admin");
      await enrollments.adminReactivate(v1.split("/")[2]);
      return noContent();
    }
    if (v1.match(/^admin\/enrollments\/[^/]+\/approve-offline$/) && method === "POST") {
      const user = await requireAuth(req);
      requireRole(user, "admin");
      return json(await misc.approveOfflineEnrollment(v1.split("/")[2]));
    }
    if (v1 === "admin/payments" && method === "GET") {
      const user = await requireAuth(req);
      requireRole(user, "admin");
      const { page, pageSize } = pageParams(url);
      const result = await misc.adminListPayments(page, pageSize);
      return paginated(result.data, result.total, result.page);
    }
    if (v1 === "admin/coupons" && method === "GET") {
      const user = await requireAuth(req);
      requireRole(user, "admin");
      return json(await misc.listCoupons());
    }
    if (v1 === "admin/coupons" && method === "POST") {
      const user = await requireAuth(req);
      requireRole(user, "admin");
      const body = await readJson<{
        code: string;
        discount_percent: number;
        expires_at?: string | null;
        usage_limit?: number | null;
      }>(req);
      return json(await misc.createCoupon(body), 201);
    }
    if (v1 === "admin/audit-logs" && method === "GET") {
      const user = await requireAuth(req);
      requireRole(user, "admin");
      const { page, pageSize } = pageParams(url);
      const result = await misc.listAuditLogs(page, pageSize);
      return paginated(result.data, result.total, result.page);
    }

    // courses CRUD
    if (v1 === "courses" && method === "GET") {
      const user = await requireAuth(req);
      requirePerm(user, "courses.read");
      const { page, pageSize } = pageParams(url);
      const mine = url.searchParams.get("mine") === "1";
      const publishedOnly = url.searchParams.get("published_only") === "1";
      const result = await courses.listAuth(user, page, pageSize, mine, publishedOnly, {
        q: url.searchParams.get("q"),
        status: url.searchParams.get("status"),
      });
      return paginated(result.data, result.total, result.page);
    }
    if (v1 === "courses" && method === "POST") {
      const user = await requireAuth(req);
      const body = await readJson<{
        title: string;
        slug?: string;
        description?: string;
        category_id?: string;
      }>(req);
      return json(await courses.create(user, body), 201);
    }
    if (v1.match(/^courses\/slug\/[^/]+$/) && method === "GET") {
      await requireAuth(req);
      const slug = decodeURIComponent(v1.slice("courses/slug/".length));
      return json(await courses.getBySlugAuth(slug));
    }
    if (v1.match(/^courses\/[^/]+\/enroll$/) && method === "POST") {
      const user = await requireAuth(req);
      const courseId = v1.split("/")[1];
      let coupon: string | undefined;
      try {
        const body = await readJson<{ coupon_code?: string }>(req);
        coupon = body.coupon_code || url.searchParams.get("coupon_code") || undefined;
      } catch {
        coupon = url.searchParams.get("coupon_code") || undefined;
      }
      await auth.requireVerifiedEmail(user);
      return json(await enrollments.enroll(user, courseId, coupon), 201);
    }
    if (v1.match(/^courses\/[^/]+\/coupon-preview$/) && method === "POST") {
      await requireAuth(req);
      const courseId = v1.split("/")[1];
      const body = await readJson<{ code: string }>(req);
      return json(await courses.previewCoupon(courseId, body.code));
    }
    if (v1.match(/^courses\/[^/]+\/pricing$/) && method === "GET") {
      await requireAuth(req);
      return json(await courses.getPricing(v1.split("/")[1]));
    }
    if (
      (v1.match(/^courses\/[^/]+\/pricing$/) && method === "PATCH") ||
      (v1.match(/^courses\/[^/]+\/pricing$/) && method === "POST")
    ) {
      const user = await requireAuth(req);
      const body = await readJson<{
        is_free: boolean;
        price: number;
        currency: string;
        discount_price?: number | null;
        start_date?: string | null;
        end_date?: string | null;
      }>(req);
      return json(await courses.updatePricing(user, v1.split("/")[1], body));
    }
    if (v1.match(/^courses\/[^/]+\/progress$/) && method === "GET") {
      const user = await requireAuth(req);
      return json(await enrollments.getProgress(user, v1.split("/")[1]));
    }
    if (v1.match(/^courses\/[^/]+\/status$/) && method === "POST") {
      const user = await requireAuth(req);
      const body = await readJson<{ status: string }>(req);
      return json(await courses.setStatus(user, v1.split("/")[1], body.status));
    }
    if (v1.match(/^courses\/[^/]+\/publish$/) && method === "POST") {
      const user = await requireAuth(req);
      return json(await courses.publish(user, v1.split("/")[1]));
    }
    if (v1.match(/^courses\/[^/]+\/unpublish$/) && method === "POST") {
      const user = await requireAuth(req);
      return json(await courses.unpublish(user, v1.split("/")[1]));
    }
    if (v1.match(/^courses\/[^/]+\/approve$/) && method === "POST") {
      const user = await requireAuth(req);
      return json(await courses.approve(user, v1.split("/")[1]));
    }
    if (v1.match(/^courses\/[^/]+\/reject$/) && method === "POST") {
      const user = await requireAuth(req);
      return json(await courses.reject(user, v1.split("/")[1]));
    }
    if (v1.match(/^courses\/[^/]+\/sections$/) && method === "POST") {
      const user = await requireAuth(req);
      const body = await readJson<{ title: string; sort_order?: number }>(req);
      return json(await courses.addSection(user, v1.split("/")[1], body), 201);
    }
    if (v1.match(/^courses\/[^/]+\/assignments$/) && method === "GET") {
      await requireAuth(req);
      return json(await assignments.listForCourse(v1.split("/")[1]));
    }
    if (v1.match(/^courses\/[^/]+\/assignments$/) && method === "POST") {
      const user = await requireAuth(req);
      const body = await readJson<{
        title: string;
        description?: string;
        due_at?: string | null;
        max_points?: number;
        published?: boolean;
      }>(req);
      return json(await assignments.createForCourse(user, v1.split("/")[1], body), 201);
    }
    if (v1.match(/^courses\/[^/]+\/quizzes$/) && method === "GET") {
      await requireAuth(req);
      return json(await quizzes.listByCourse(v1.split("/")[1]));
    }
    if (v1.match(/^courses\/[^/]+\/certificate$/) && method === "POST") {
      const user = await requireAuth(req);
      return json(await misc.issueCertificate(user, v1.split("/")[1]), 201);
    }
    if (v1.match(/^courses\/[^/]+\/payments$/) && method === "POST") {
      const user = await requireAuth(req);
      const body = await readJson<{ coupon_code?: string; provider?: string; sender_phone?: string; reference?: string }>(req);
      await auth.requireVerifiedEmail(user);
      return json(await misc.createPayment(user, v1.split("/")[1], body), 201);
    }
    // WaafiPay USSD purchase: blocks until the payer confirms with the PIN on the phone (≈ up to 1–2 min)
    if (v1.match(/^courses\/[^/]+\/payments\/waafi$/) && method === "POST") {
      const user = await requireAuth(req);
      const body = await readJson<{ phone?: string; coupon_code?: string }>(req);
      await auth.requireVerifiedEmail(user);
      return json(await misc.payWithWaafi(user, v1.split("/")[1], body ?? {}));
    }
    if (v1.match(/^courses\/[^/]+\/reviews$/) && method === "GET") {
      await requireAuth(req);
      return json(await misc.listReviews(v1.split("/")[1]));
    }
    if (v1.match(/^courses\/[^/]+\/reviews$/) && method === "POST") {
      const user = await requireAuth(req);
      const body = await readJson<{ rating: number; comment?: string }>(req);
      return json(await misc.createReview(user, v1.split("/")[1], body), 201);
    }
    if (v1.match(/^courses\/[^/]+\/reviews\/stats$/) && method === "GET") {
      await requireAuth(req);
      return json(await misc.reviewStats(v1.split("/")[1]));
    }
    if (v1.match(/^courses\/[^/]+$/) && method === "GET") {
      await requireAuth(req);
      return json(await courses.getById(v1.split("/")[1]));
    }
    if (v1.match(/^courses\/[^/]+$/) && method === "PATCH") {
      const user = await requireAuth(req);
      const body = await readJson<Parameters<typeof courses.update>[2]>(req);
      return json(await courses.update(user, v1.split("/")[1], body));
    }
    if (v1.match(/^courses\/[^/]+$/) && method === "DELETE") {
      const user = await requireAuth(req);
      await courses.remove(user, v1.split("/")[1]);
      return noContent();
    }

    // enrollments create
    if (v1 === "enrollments" && method === "POST") {
      const user = await requireAuth(req);
      const body = await readJson<{ course_id: string; coupon_code?: string }>(req);
      await auth.requireVerifiedEmail(user);
      return json(await enrollments.enroll(user, body.course_id, body.coupon_code), 201);
    }

    // sections / lessons
    if (v1.match(/^sections\/[^/]+\/lessons$/) && method === "POST") {
      const user = await requireAuth(req);
      const body = await readJson<{
        title: string;
        description?: string;
        content?: string;
        video_provider?: string;
        video_url?: string;
        attachments?: { name: string; url: string }[];
        sort_order?: number;
      }>(req);
      return json(await courses.addLesson(user, v1.split("/")[1], body), 201);
    }
    if (v1.match(/^sections\/[^/]+$/) && method === "PATCH") {
      const user = await requireAuth(req);
      const body = await readJson<{ title?: string; sort_order?: number }>(req);
      return json(await courses.updateSection(user, v1.split("/")[1], body));
    }
    if (v1.match(/^sections\/[^/]+$/) && method === "DELETE") {
      const user = await requireAuth(req);
      await courses.deleteSection(user, v1.split("/")[1]);
      return noContent();
    }
    if (v1.match(/^lessons\/[^/]+\/progress$/) && method === "PATCH") {
      const user = await requireAuth(req);
      const body = await readJson<{ completed?: boolean; completed_percent?: number }>(req);
      return json(await enrollments.updateLessonProgress(user, v1.split("/")[1], body));
    }
    if (v1.match(/^lessons\/[^/]+\/vdocipher$/) && method === "GET") {
      const user = await requireAuth(req);
      // the page that embeds the player: its hostname goes into the OTP as the allowed domain
      let host: string | undefined;
      try {
        const ref = req.headers.get("referer") || req.headers.get("origin");
        host = ref ? new URL(ref).hostname : (req.headers.get("host") ?? "").split(":")[0] || undefined;
      } catch {
        host = undefined;
      }
      await auth.requireVerifiedEmail(user);
      return json(await enrollments.vdocipherPlayback(user, v1.split("/")[1], host));
    }
    if (v1.match(/^lessons\/[^/]+\/questions$/) && method === "POST") {
      const user = await requireAuth(req);
      const body = await readJson<{ body: string }>(req);
      return json({ data: await misc.createLessonQuestion(user, v1.split("/")[1], body.body) }, 201);
    }
    if (v1.match(/^lessons\/[^/]+$/) && method === "PATCH") {
      const user = await requireAuth(req);
      const body = await readJson<Parameters<typeof courses.updateLesson>[2]>(req);
      return json(await courses.updateLesson(user, v1.split("/")[1], body));
    }
    if (v1.match(/^lessons\/[^/]+$/) && method === "DELETE") {
      const user = await requireAuth(req);
      await courses.deleteLesson(user, v1.split("/")[1]);
      return noContent();
    }
    if (v1.match(/^lesson-questions\/[^/]+$/) && method === "PATCH") {
      const user = await requireAuth(req);
      // the Q&A panel sends { answer }; older callers sent { answer_body }
      const body = await readJson<{ answer?: string; answer_body?: string }>(req);
      return wrapped(await misc.answerLessonQuestion(user, v1.split("/")[1], body.answer ?? body.answer_body ?? ""));
    }

    // assignments
    if (v1.match(/^assignments\/[^/]+\/submissions\/me$/) && method === "GET") {
      const user = await requireAuth(req);
      return json(await assignments.mySubmission(user, v1.split("/")[1]));
    }
    if (v1.match(/^assignments\/[^/]+\/submissions$/) && method === "POST") {
      const user = await requireAuth(req);
      const body = await readJson<{ file_url: string }>(req);
      return json(await assignments.submit(user, v1.split("/")[1], body.file_url), 201);
    }
    if (v1.match(/^assignments\/[^/]+\/submissions$/) && method === "GET") {
      const user = await requireAuth(req);
      return json(await assignments.listSubmissions(user, v1.split("/")[1]));
    }
    if (v1.match(/^assignments\/[^/]+$/) && method === "GET") {
      await requireAuth(req);
      return json(await assignments.getAssignment(v1.split("/")[1]));
    }
    if (v1.match(/^assignments\/[^/]+$/) && method === "PATCH") {
      const user = await requireAuth(req);
      const body = await readJson<{
        title?: string;
        description?: string;
        due_at?: string | null;
        max_points?: number;
        published?: boolean;
      }>(req);
      return json(await assignments.updateAssignment(user, v1.split("/")[1], body));
    }
    if (v1.match(/^assignments\/[^/]+$/) && method === "DELETE") {
      const user = await requireAuth(req);
      await assignments.deleteAssignment(user, v1.split("/")[1]);
      return noContent();
    }
    if (v1.match(/^submissions\/[^/]+\/grade$/) && method === "PATCH") {
      const user = await requireAuth(req);
      const body = await readJson<{ grade: number; feedback?: string }>(req);
      return json(await assignments.gradeSubmission(user, v1.split("/")[1], body));
    }

    // quizzes
    if (v1 === "quizzes" && method === "POST") {
      const user = await requireAuth(req);
      const body = await readJson<{
        course_id: string;
        section_id?: string;
        title: string;
        description?: string;
        time_limit_secs?: number;
        pass_percent?: number;
        max_attempts?: number;
        shuffle_questions?: boolean;
        published?: boolean;
        required_for_cert?: boolean;
      }>(req);
      return json(await quizzes.createQuiz(user, body), 201);
    }
    if (v1.match(/^quizzes\/[^/]+\/questions$/) && method === "POST") {
      const user = await requireAuth(req);
      const body = await readJson<{
        type: string;
        text: string;
        explanation?: string;
        points?: number;
        sort_order?: number;
        options_json?: unknown;
        correct_answer?: string;
      }>(req);
      return json(await quizzes.addQuestion(user, v1.split("/")[1], body), 201);
    }
    if (v1.match(/^quizzes\/[^/]+\/attempts$/) && method === "POST") {
      const user = await requireAuth(req);
      return json(await quizzes.startAttempt(user, v1.split("/")[1]), 201);
    }
    if (v1.match(/^quizzes\/[^/]+\/attempts$/) && method === "GET") {
      const user = await requireAuth(req);
      return json(await quizzes.listAttempts(user, v1.split("/")[1]));
    }
    if (v1.match(/^quizzes\/[^/]+$/) && method === "GET") {
      await requireAuth(req);
      return json(await quizzes.getQuiz(v1.split("/")[1]));
    }
    if (v1.match(/^quizzes\/[^/]+$/) && method === "PATCH") {
      const user = await requireAuth(req);
      const body = await readJson<Record<string, unknown>>(req);
      return json(await quizzes.updateQuiz(user, v1.split("/")[1], body as never));
    }
    if (v1.match(/^quizzes\/[^/]+$/) && method === "DELETE") {
      const user = await requireAuth(req);
      await quizzes.deleteQuiz(user, v1.split("/")[1]);
      return noContent();
    }
    if (v1.match(/^questions\/[^/]+$/) && method === "PATCH") {
      const user = await requireAuth(req);
      const body = await readJson<Record<string, unknown>>(req);
      return json(await quizzes.updateQuestion(user, v1.split("/")[1], body as never));
    }
    if (v1.match(/^questions\/[^/]+$/) && method === "DELETE") {
      const user = await requireAuth(req);
      await quizzes.deleteQuestion(user, v1.split("/")[1]);
      return noContent();
    }
    if (v1.match(/^attempts\/[^/]+\/submit$/) && method === "POST") {
      const user = await requireAuth(req);
      const body = await readJson<{ answers: { question_id: string; answer: string }[] }>(req);
      return json(await quizzes.submitAttempt(user, v1.split("/")[1], body.answers || []));
    }
    if (v1.match(/^attempts\/[^/]+$/) && method === "GET") {
      const user = await requireAuth(req);
      return json(await quizzes.getAttempt(user, v1.split("/")[1]));
    }

    // certificates
    if (v1 === "certificates" && method === "GET") {
      const user = await requireAuth(req);
      return wrapped(await misc.listCertificates(user.user_id));
    }
    if (v1.match(/^certificates\/[^/]+$/) && method === "GET") {
      const user = await requireAuth(req);
      return json(await misc.getCertificate(user.user_id, v1.split("/")[1]));
    }

    // payments
    if (v1 === "payments" && method === "GET") {
      const user = await requireAuth(req);
      return json(await misc.listMyPayments(user.user_id));
    }
    if (v1.match(/^payments\/[^/]+\/complete$/) && method === "POST") {
      const user = await requireAuth(req);
      requireRole(user, "admin");
      const body = await readJson<{ reference?: string }>(req).catch(() => ({ reference: undefined }));
      return json(await misc.completePayment(v1.split("/")[1], body?.reference));
    }
    if (v1.match(/^payments\/[^/]+\/reject$/) && method === "POST") {
      const user = await requireAuth(req);
      requireRole(user, "admin");
      const body = await readJson<{ reason?: string }>(req).catch(() => ({ reason: undefined }));
      return json(await misc.rejectPayment(v1.split("/")[1], body?.reason));
    }
    if (v1.match(/^payments\/[^/]+\/refund$/) && method === "POST") {
      const user = await requireAuth(req);
      requireRole(user, "admin");
      const body = await readJson<{ reason?: string }>(req).catch(() => ({ reason: undefined }));
      return json(await misc.refundPayment(v1.split("/")[1], body.reason));
    }

    // notifications
    if (v1 === "notifications" && method === "GET") {
      const user = await requireAuth(req);
      return json(await misc.listNotifications(user.user_id));
    }
    if (v1.match(/^notifications\/[^/]+\/read$/) && method === "PATCH") {
      const user = await requireAuth(req);
      await misc.markNotificationRead(user.user_id, v1.split("/")[1]);
      return noContent();
    }
    if (v1 === "notifications/read-all" && method === "POST") {
      const user = await requireAuth(req);
      await misc.markAllNotificationsRead(user.user_id);
      return noContent();
    }

    // research
    if (v1 === "research/categories" && method === "GET") {
      await requireAuth(req);
      return json(await misc.listResearchCategories());
    }
    if (v1 === "research/categories" && method === "POST") {
      const user = await requireAuth(req);
      requirePerm(user, "research.moderate");
      const body = await readJson<{ name: string; slug?: string }>(req);
      return json(await misc.createResearchCategory(body), 201);
    }
    if (v1.match(/^research\/categories\/[^/]+$/) && method === "PATCH") {
      const user = await requireAuth(req);
      requirePerm(user, "research.moderate");
      const body = await readJson<{ name?: string; slug?: string }>(req);
      return json(await misc.updateResearchCategory(v1.split("/")[2], body));
    }
    if (v1.match(/^research\/categories\/[^/]+$/) && method === "DELETE") {
      const user = await requireAuth(req);
      requirePerm(user, "research.moderate");
      await misc.deleteResearchCategory(v1.split("/")[2]);
      return noContent();
    }
    if (v1 === "research/papers" && method === "GET") {
      await requireAuth(req);
      const { page, pageSize } = pageParams(url);
      const result = await misc.listResearchPapers(page, pageSize);
      return paginated(result.data, result.total, result.page);
    }
    if (v1 === "research/papers" && method === "POST") {
      const user = await requireAuth(req);
      const body = await readJson<{
        title: string;
        abstract?: string;
        pdf_url: string;
        category_ids?: string[];
      }>(req);
      return json(await misc.createResearchPaper(user, body), 201);
    }
    if (v1.match(/^research\/papers\/[^/]+\/submit$/) && method === "POST") {
      const user = await requireAuth(req);
      return json(await misc.submitResearchPaper(user, v1.split("/")[2]));
    }
    if (v1.match(/^research\/papers\/[^/]+\/status$/) && method === "PATCH") {
      const user = await requireAuth(req);
      requirePerm(user, "research.moderate");
      const body = await readJson<{ status: string }>(req);
      return json(await misc.setResearchPaperStatus(v1.split("/")[2], body.status));
    }
    if (v1.match(/^research\/papers\/[^/]+\/reviews$/) && method === "POST") {
      const user = await requireAuth(req);
      requirePerm(user, "research.review");
      const body = await readJson<{ comment: string; rating?: number }>(req);
      return json(await misc.addResearchReview(user, v1.split("/")[2], body), 201);
    }
    if (v1.match(/^research\/papers\/[^/]+$/) && method === "GET") {
      await requireAuth(req);
      return json(await misc.getResearchPaper(v1.split("/")[2]));
    }
    if (v1.match(/^research\/papers\/[^/]+$/) && method === "PATCH") {
      const user = await requireAuth(req);
      const body = await readJson<{ title?: string; abstract?: string; pdf_url?: string }>(req);
      return json(await misc.updateResearchPaper(user, v1.split("/")[2], body));
    }

    // reviews delete/update
    if (v1.match(/^reviews\/[^/]+$/) && method === "PATCH") {
      const user = await requireAuth(req);
      const body = await readJson<{ rating?: number; comment?: string }>(req);
      return json(await misc.updateReview(user, v1.split("/")[1], body));
    }
    if (v1.match(/^reviews\/[^/]+$/) && method === "DELETE") {
      const user = await requireAuth(req);
      await misc.deleteReview(user, v1.split("/")[1]);
      return noContent();
    }

    // files
    if (v1 === "files" && method === "POST") {
      const user = await requireAuth(req);
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) throw Err.invalidInput("file required");
      return json(await misc.uploadFile(user, file), 201);
    }
    if (v1.match(/^files\/[^/]+$/) && method === "GET") {
      await requireAuth(req);
      return json(await misc.getFile(v1.split("/")[1]));
    }

    throw Err.notFound(`route not found: /api/${path}`);
  } catch (err) {
    return handleError(err, requestId);
  }
}
