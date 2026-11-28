"use client";

/**
 * Phase 2: quizzes and assignments belong to a topic. Where in the topic: right after one of its
 * lessons, or at the end of the topic. Value: "l:<lessonId>" or "s:<sectionId>".
 */
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";

export type TopicOption = { id: string; title: string; lessons: { id: string; title: string }[] };

export function positionValue(item: { lesson_id?: string | null; section_id?: string | null } | null | undefined) {
  if (item?.lesson_id) return `l:${item.lesson_id}`;
  if (item?.section_id) return `s:${item.section_id}`;
  return "";
}

/** what the API wants for a position value */
export function positionPayload(value: string) {
  if (value.startsWith("l:")) return { lesson_id: value.slice(2) };
  if (value.startsWith("s:")) return { lesson_id: null, section_id: value.slice(2) };
  return null;
}

export function PositionSelect({ value, onChange, topics }: { value: string; onChange: (v: string) => void; topics: TopicOption[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Choose the topic and the position" />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {topics.map((t) => (
          <SelectGroup key={t.id}>
            <SelectLabel className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.title}</SelectLabel>
            {t.lessons.map((l) => (
              <SelectItem key={l.id} value={`l:${l.id}`}>
                After “{l.title}”
              </SelectItem>
            ))}
            <SelectItem value={`s:${t.id}`}>At the end of “{t.title}”</SelectItem>
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
