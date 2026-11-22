import { prisma } from "@/lib/db";
import { decodeHtmlEntities } from "@/lib/html-entities";
import { userPhotoUrl } from "@/server/legacy-uploads";

/**
 * Public, real numbers for the home page (no hard-coded "10,000+ / 100+ / 30+").
 * Cached in memory for a few minutes: these change slowly and the database is remote.
 */
const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}


export type PublicInstructor = {
  id: string;
  name: string;
  avatar_url: string | null;
  course_count: number;
  student_count: number;
};

/** Instructors with at least one published course, most courses first. */
export async function publicInstructors(page = 1, pageSize = 6) {
  const all = await cached("instructors", async () => {
    const grouped = await prisma.course.groupBy({
      by: ["instructorId"],
      where: { status: "published", deletedAt: null },
      _count: { _all: true },
    });
    const ids = grouped.map((g) => g.instructorId);
    const [users, learners] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: ids }, deletedAt: null, isActive: true },
        select: { id: true, name: true, avatarUrl: true },
      }),
      // distinct students per instructor (across that instructor's published courses)
      prisma.$queryRaw<{ instructor_id: string; n: bigint }[]>`
        SELECT c.instructor_id, count(DISTINCT e.user_id) AS n
        FROM enrollments e JOIN courses c ON c.id = e.course_id
        WHERE c.status = 'published' AND c.deleted_at IS NULL AND e.deleted_at IS NULL
        GROUP BY c.instructor_id`,
    ]);
    const count = new Map(grouped.map((g) => [g.instructorId, g._count._all]));
    const students = new Map(learners.map((l) => [l.instructor_id, Number(l.n)]));
    return users
      .map(
        (u): PublicInstructor => ({
          id: u.id,
          name: decodeHtmlEntities(u.name),
          avatar_url: userPhotoUrl(u.id, u.avatarUrl),
          course_count: count.get(u.id) ?? 0,
          student_count: students.get(u.id) ?? 0,
        })
      )
      .sort((a, b) => b.course_count - a.course_count || a.name.localeCompare(b.name));
  });
  const size = Math.min(Math.max(pageSize, 1), 24);
  const total = all.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(page, 1), pages);
  return { data: all.slice((p - 1) * size, p * size), total, page: p, pages };
}

/** Headline numbers for the home page, all counted from the database. */
export async function publicStats() {
  return cached("stats", async () => {
    const [students, courses, instructors, firstUser, certificates] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null, role: { slug: "user" } } }),
      prisma.course.count({ where: { status: "published", deletedAt: null } }),
      prisma.course
        .groupBy({ by: ["instructorId"], where: { status: "published", deletedAt: null } })
        .then((r) => r.length),
      prisma.user.aggregate({ _min: { legacyRegisteredAt: true, createdAt: true } }),
      prisma.certificate.count({ where: { deletedAt: null } }),
    ]);
    const since = firstUser._min.legacyRegisteredAt ?? firstUser._min.createdAt ?? new Date();
    const years = Math.max(1, new Date().getFullYear() - since.getFullYear());
    return {
      students,
      courses,
      instructors,
      certificates,
      years,
      since_year: since.getFullYear(),
    };
  });
}
