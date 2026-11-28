/**
 * A6 — quizzes, assignments and resources inside a course's curriculum (learn page, Course Builder,
 * dashboard pages) + the direct file upload used for resources, assignment briefs and answers.
 */
import apiClient from "./client";
import type { CourseQuiz } from "./quiz-play";

// ───────────────────────── shared shapes ─────────────────────────

export type FileRef = { name: string; url: string; size: number | null; mime: string | null };

export type ResourceFile = {
  id: string;
  name: string;
  mime: string;
  size: number | null;
  /** API path that answers the file's address (members only) */
  download: string;
  source: "old_site" | "builder";
};
export type ResourceLink = { id?: string; name: string; url: string };
export type CourseResourcesView = {
  course: ResourceFile[];
  course_links: ResourceLink[];
  lessons: {
    lesson_id: string;
    lesson_title: string;
    section_id: string;
    section_title: string;
    files: ResourceFile[];
    links: ResourceLink[];
  }[];
  total: number;
};

export type AssignmentStatus = "not_submitted" | "submitted" | "graded";

export type LearnAssignment = {
  id: string;
  course_id: string;
  section_id: string | null;
  section_title: string | null;
  lesson_id: string | null;
  lesson_title: string | null;
  /** shared order with the quizzes of the same lesson */
  sort_order: number;
  title: string;
  due_at: string | null;
  max_points: number;
  pass_points: number | null;
  status: AssignmentStatus;
  submitted_at: string | null;
  grade: number | null;
  passed: boolean | null;
  locked: boolean;
};

export type LearnQuiz = CourseQuiz & {
  section_title: string | null;
  lesson_id: string | null;
  lesson_title: string | null;
  locked: boolean;
  sort_order: number;
};

export type LearningItems = {
  course_id: string;
  sequential: boolean;
  is_staff: boolean;
  quizzes: LearnQuiz[];
  assignments: LearnAssignment[];
  resources: CourseResourcesView;
  /** A7 */
  announcement_count: number;
};

export type ContentBlockLike = import("@/lib/wp-content").ContentBlock;

export type SubmissionView = {
  id: string;
  body: string | null;
  files: FileRef[];
  submitted_at: string;
  late: boolean;
  grade: number | null;
  feedback: string | null;
  graded_at: string | null;
  passed: boolean | null;
};

export type AssignmentDetail = {
  id: string;
  course: { id: string; slug: string; title: string };
  section_id: string | null;
  section_title: string | null;
  lesson_id: string | null;
  lesson_title: string | null;
  title: string;
  description_blocks: ContentBlockLike[] | null;
  description_text: string | null;
  due_at: string | null;
  max_points: number;
  pass_points: number | null;
  files: FileRef[];
  locked: boolean;
  is_staff: boolean;
  status: AssignmentStatus;
  submission: SubmissionView | null;
  /** staff only */
  description?: string;
  published?: boolean;
};

// ───────────────────────── Course Builder shapes ─────────────────────────

export type BuilderQuiz = {
  id: string;
  title: string;
  section_id: string | null;
  lesson_id: string | null;
  sort_order: number;
  placed: boolean;
  published: boolean;
  question_count: number;
  attempt_count: number;
  time_limit_secs: number;
  pass_percent: number;
  max_attempts: number;
  is_legacy: boolean;
};

export type BuilderAssignment = {
  id: string;
  title: string;
  section_id: string | null;
  lesson_id: string | null;
  sort_order: number;
  placed: boolean;
  published: boolean;
  due_at: string | null;
  max_points: number;
  pass_points: number | null;
  file_count: number;
  submission_count: number;
  ungraded_count: number;
  is_legacy: boolean;
};

export type BuilderResource = {
  id: string;
  course_id: string;
  lesson_id: string | null;
  title: string;
  kind: "file" | "link";
  url: string;
  file_name: string | null;
  mime: string | null;
  size: number | null;
  sort_order: number;
  created_at: string;
};

export type BuilderItems = {
  course_id: string;
  quizzes: BuilderQuiz[];
  assignments: BuilderAssignment[];
  resources: BuilderResource[];
  legacy_resources: { course: ResourceFile[]; lessons: { lesson_id: string; files: ResourceFile[] }[] };
};

export type QuestionType = "single_choice" | "multiple_choice" | "true_false" | "short_answer";
export type EditorQuestion = {
  id?: string;
  type: QuestionType;
  text: string;
  explanation: string | null;
  points: number;
  options: { text: string; correct: boolean }[];
};
export type StaffQuiz = {
  id: string;
  course_id: string;
  section_id: string | null;
  lesson_id: string | null;
  title: string;
  description: string;
  time_limit_secs: number;
  pass_percent: number;
  max_attempts: number;
  shuffle_questions: boolean;
  published: boolean;
  attempt_count: number;
  is_legacy: boolean;
  questions: EditorQuestion[];
};
export type SaveQuizPayload = {
  course_id?: string;
  lesson_id?: string | null;
  section_id?: string | null;
  title: string;
  description?: string;
  time_limit_secs: number;
  pass_percent: number;
  max_attempts: number;
  shuffle_questions: boolean;
  published: boolean;
  questions: EditorQuestion[];
};

export type StaffAssignment = {
  id: string;
  course_id: string;
  section_id: string | null;
  lesson_id: string | null;
  title: string;
  description: string;
  due_at: string | null;
  max_points: number;
  pass_points: number | null;
  files: FileRef[];
  published: boolean;
  is_legacy: boolean;
};
export type AssignmentPayload = {
  lesson_id?: string | null;
  title?: string;
  description?: string;
  due_at?: string | null;
  max_points?: number;
  pass_points?: number | null;
  published?: boolean;
  files?: FileRef[];
};

export type StaffAssignmentRow = StaffAssignment & {
  course: { id: string; title: string; slug: string };
  section_title: string | null;
  lesson_title: string | null;
  placed: boolean;
  submission_count: number;
  ungraded_count: number;
};

export type StaffSubmission = SubmissionView & {
  student: { id: string; name: string; email: string };
  student_id: string;
};

export type MyAssignmentRow = {
  id: string;
  course: { id: string; title: string; slug: string };
  section_title: string | null;
  lesson_title: string | null;
  title: string;
  due_at: string | null;
  max_points: number;
  pass_points: number | null;
  status: AssignmentStatus;
  submitted_at: string | null;
  grade: number | null;
  passed: boolean | null;
};

// ───────────────────────── calls ─────────────────────────

export const courseItemsApi = {
  learning: (courseId: string) => apiClient.get<LearningItems>(`/api/v1/courses/${courseId}/learning-items`),
  builder: (courseId: string) => apiClient.get<BuilderItems>(`/api/v1/courses/${courseId}/builder-items`),
  resources: (courseId: string) => apiClient.get<CourseResourcesView>(`/api/v1/courses/${courseId}/resources`),
  /** the address of one file (members of the course only) */
  resourceLink: (downloadPath: string) => apiClient.get<{ url: string; name: string }>(downloadPath),
};

export const staffQuizApi = {
  get: (quizId: string) => apiClient.get<StaffQuiz>(`/api/v1/quizzes/${quizId}`),
  create: (data: SaveQuizPayload) => apiClient.post<StaffQuiz>("/api/v1/quizzes", data),
  save: (quizId: string, data: SaveQuizPayload) => apiClient.put<StaffQuiz>(`/api/v1/quizzes/${quizId}`, data),
  setPublished: (quizId: string, published: boolean) => apiClient.patch(`/api/v1/quizzes/${quizId}`, { published }),
  remove: (quizId: string) => apiClient.delete(`/api/v1/quizzes/${quizId}`),
};

export const assignmentApi = {
  get: (id: string) => apiClient.get<AssignmentDetail>(`/api/v1/assignments/${id}`),
  submit: (id: string, data: { body: string; files: FileRef[] }) =>
    apiClient.post<AssignmentDetail>(`/api/v1/assignments/${id}/submissions`, data),
  mine: () => apiClient.get<{ data: MyAssignmentRow[] }>("/api/v1/my/assignments"),
  // staff
  create: (courseId: string, data: AssignmentPayload) => apiClient.post<StaffAssignment>(`/api/v1/courses/${courseId}/assignments`, data),
  update: (id: string, data: AssignmentPayload) => apiClient.patch<StaffAssignment>(`/api/v1/assignments/${id}`, data),
  remove: (id: string) => apiClient.delete(`/api/v1/assignments/${id}`),
  staffList: () => apiClient.get<{ data: StaffAssignmentRow[] }>("/api/v1/staff/assignments"),
  submissions: (id: string) =>
    apiClient.get<{
      assignment: { id: string; title: string; course: { id: string; title: string; slug: string }; max_points: number; pass_points: number | null; due_at: string | null };
      data: StaffSubmission[];
    }>(`/api/v1/assignments/${id}/submissions`),
  grade: (submissionId: string, data: { grade: number; feedback: string }) =>
    apiClient.patch(`/api/v1/submissions/${submissionId}/grade`, data),
};

export const resourceApi = {
  create: (courseId: string, data: { lesson_id: string | null; title: string; kind: "file" | "link"; url: string; file_name?: string; size?: number }) =>
    apiClient.post<BuilderResource>(`/api/v1/courses/${courseId}/resources`, data),
  update: (id: string, data: { title?: string; lesson_id?: string | null }) => apiClient.patch<BuilderResource>(`/api/v1/course-resources/${id}`, data),
  remove: (id: string) => apiClient.delete(`/api/v1/course-resources/${id}`),
};

// ───────────────────────── upload ─────────────────────────

export type UploadTarget = { purpose: "course-file"; course_id: string } | { purpose: "submission"; assignment_id: string };

type Ticket =
  | { mode: "blob"; pathname: string; token: string; content_type: string; max_bytes: number }
  | { mode: "server"; pathname: string; content_type: string; max_bytes: number };

/**
 * Upload one file: the server gives a one-file ticket, the browser sends the file straight to the
 * file storage (large files work), and the returned address is then saved with the item.
 */
export async function uploadFile(file: File, target: UploadTarget, onProgress?: (percent: number) => void): Promise<FileRef> {
  const { data: ticket } = await apiClient.post<Ticket>("/api/v1/uploads/ticket", { ...target, file_name: file.name, size: file.size });
  if (file.size > ticket.max_bytes) throw new Error(`The file is too large (max ${Math.round(ticket.max_bytes / 1048576)} MB)`);
  if (ticket.mode === "blob") {
    const { put } = await import("@vercel/blob/client");
    const blob = await put(ticket.pathname, file, {
      access: "public",
      token: ticket.token,
      contentType: ticket.content_type,
      multipart: file.size > 20 * 1024 * 1024,
      onUploadProgress: (p) => onProgress?.(p.percentage),
    });
    return { name: file.name, url: blob.url, size: file.size, mime: ticket.content_type };
  }
  const form = new FormData();
  form.append("file", file);
  form.append("purpose", target.purpose);
  if (target.purpose === "course-file") form.append("course_id", target.course_id);
  else form.append("assignment_id", target.assignment_id);
  const { data } = await apiClient.post<{ url: string; name: string; size: number; mime: string }>("/api/v1/uploads/file", form, {
    timeout: 600_000,
    onUploadProgress: (e) => onProgress?.(e.total ? (e.loaded / e.total) * 100 : 0),
  });
  return { name: file.name, url: data.url, size: data.size, mime: data.mime };
}

export const FILE_ACCEPT =
  ".pdf,.doc,.docx,.ppt,.pptx,.pps,.ppsx,.xls,.xlsx,.xlsm,.csv,.txt,.rtf,.odt,.ods,.odp,.epub,.zip,.rar,.7z,.png,.jpg,.jpeg,.gif,.webp,.mp3,.m4a,.wav,.sav,.dta,.mtw,.mpx,.do,.psd,.ai";
export const COURSE_FILE_ACCEPT = `${FILE_ACCEPT},.mp4,.webm`;
