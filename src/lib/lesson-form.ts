import type { Lesson, LessonAttachment } from "@/types";

export function parseLessonAttachments(json: string | undefined): LessonAttachment[] {
  if (!json?.trim()) return [];
  try {
    const arr = JSON.parse(json) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x) => x && typeof x === "object")
      .map((x) => {
        const o = x as Record<string, unknown>;
        return {
          name: String(o.name ?? ""),
          url: String(o.url ?? ""),
        };
      });
  } catch {
    return [];
  }
}

export type LessonFormRow = LessonAttachment & { clientId: string };

export function attachmentsToRows(attachments: LessonAttachment[]): LessonFormRow[] {
  return attachments.map((a) => ({
    clientId: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    name: a.name,
    url: a.url,
  }));
}

export function rowsToPayload(rows: LessonFormRow[]): LessonAttachment[] {
  return rows
    .map(({ name, url }) => ({ name: name.trim(), url: url.trim() }))
    .filter((a) => a.name || a.url);
}

export function lessonSnapshot(lesson: Lesson): string {
  return JSON.stringify({
    title: lesson.title,
    description: lesson.description ?? "",
    content: lesson.content ?? "",
    video_provider: lesson.video_provider ?? "",
    video_url: lesson.video_url ?? "",
    attachments: parseLessonAttachments(lesson.attachments_json),
    sort_order: lesson.sort_order,
  });
}
