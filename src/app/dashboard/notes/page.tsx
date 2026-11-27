"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { NotebookPen, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { NoteItem } from "@/components/learning/notes-panel";
import { notesApi, type Note } from "@/services/api/course-extras";
import { cn } from "@/lib/utils";

/** The student's notebook: every note written under a lesson video, course by course. */
export default function NotebookPage() {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [course, setCourse] = useState<string>("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isLoading } = useQuery({
    queryKey: ["notes", "all", search],
    queryFn: () => notesApi.list(search ? { q: search } : {}).then((r) => r.data.data),
  });
  const all = data ?? [];
  const courses = useMemo(() => {
    const m = new Map<string, { id: string; title: string; n: number }>();
    for (const n of all) {
      const c = m.get(n.course.id) ?? { id: n.course.id, title: n.course.title, n: 0 };
      c.n++;
      m.set(n.course.id, c);
    }
    return [...m.values()];
  }, [all]);
  const shown = course ? all.filter((n) => n.course.id === course) : all;

  // course → lesson groups, most recent note first
  const groups = useMemo(() => {
    const out: { course: Note["course"]; lessons: { lesson: Note["lesson"]; notes: Note[] }[] }[] = [];
    for (const n of shown) {
      let g = out.find((x) => x.course.id === n.course.id);
      if (!g) out.push((g = { course: n.course, lessons: [] }));
      let l = g.lessons.find((x) => x.lesson.id === n.lesson.id);
      if (!l) g.lessons.push((l = { lesson: n.lesson, notes: [] }));
      l.notes.push(n);
    }
    return out;
  }, [shown]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <NotebookPen className="h-7 w-7 text-primary" /> My notebook
        </h1>
        <p className="mt-1 text-muted-foreground">
          Every note you wrote under a lesson video, with the video time. Write new ones in the <strong>Notes</strong> tab of a lesson.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your notes" className="pl-9" />
        </div>
        {courses.length > 1 ? (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setCourse("")}
              className={cn("rounded-full border px-3 py-1.5 text-sm font-medium", !course ? "border-brand bg-brand text-white" : "hover:bg-muted")}
            >
              All courses ({all.length})
            </button>
            {courses.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCourse(c.id)}
                className={cn(
                  "max-w-[260px] truncate rounded-full border px-3 py-1.5 text-sm font-medium",
                  course === c.id ? "border-brand bg-brand text-white" : "hover:bg-muted"
                )}
                title={c.title}
              >
                {c.title} ({c.n})
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : !shown.length ? (
        <Card className="border-dashed">
          <CardContent className="py-14 text-center text-sm text-muted-foreground">
            <NotebookPen className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            {search ? "No note matches your search." : "No notes yet — open a lesson and use the Notes tab under the video."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.course.id} className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="min-w-0 truncate text-lg font-bold">{g.course.title}</h2>
                <Link href={`/learn/${encodeURIComponent(g.course.slug)}`} className="shrink-0 text-sm font-semibold text-brand hover:underline">
                  Open course
                </Link>
              </div>
              {g.lessons.map((l) => (
                <div key={l.lesson.id} className="space-y-2 rounded-2xl border bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-2 px-1">
                    <p className="min-w-0 truncate text-sm font-semibold">
                      <span className="text-muted-foreground">{l.lesson.section_title} › </span>
                      {l.lesson.title}
                    </p>
                    {!l.lesson.deleted ? (
                      <Link
                        href={`/learn/${encodeURIComponent(g.course.slug)}?lesson=${l.lesson.id}&tab=notes`}
                        className="shrink-0 text-xs font-semibold text-brand hover:underline"
                      >
                        Go to lesson
                      </Link>
                    ) : null}
                  </div>
                  <ul className="space-y-2">
                    {l.notes.map((n) => (
                      <NoteItem key={n.id} n={n} />
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
