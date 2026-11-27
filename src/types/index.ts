import type { ContentBlock } from "@/lib/wp-content";
// ── Auth ──
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  /** Unique login handle; mirrors backend `username` */
  username: string;
  phone: string;
  gender: string;
}

export interface TokenResponse {
  access_token: string;
  token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  username?: string;
  phone?: string;
  gender?: string;
  avatar_url?: string;
  /** GET /api/v1/me returns role slug as `role` */
  role?: string;
  permissions?: string[];
  role_slug?: string;
  is_active?: boolean;
  /** GET /api/v1/me: false until the e-mail code was entered (students must verify before buying / learning) */
  email_verified?: boolean;
  created_at?: string;
  updated_at?: string;
}

// ── Paginated Response ──
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  page_size?: number;
}

export interface DataResponse<T> {
  data: T;
}

// ── Course catalog categories (managed under Dashboard → Course categories) ──
export interface CourseCategory {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** GET /api/course-categories — categories that have published courses. */
export interface PublicCourseCategory {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  course_count: number;
}

/** Active row from GET/PATCH /api/v1/courses/:id/pricing */
export interface CoursePricing {
  course_id: string;
  currency: string;
  is_free: boolean;
  /** Minor units (e.g. cents) */
  price: number;
  discount_price?: number | null;
  effective_amount: number;
  start_date?: string | null;
  end_date?: string | null;
}

// ── Course ──
export interface Course {
  /** A5 */
  sequential_lessons?: boolean;
  certificate_template_id?: string | null;
  review_note?: string | null;
  submitted_at?: string | null;
  prerequisites?: { id: string; title: string; slug: string }[];
  id: string;
  title: string;
  slug: string;
  description: string;
  /** Backend lifecycle: draft | published | archived */
  status?: string;
  /** Derived: true when status is published */
  is_published?: boolean;
  /** @deprecated Prefer is_published / status */
  published?: boolean;
  /** Active catalog price when returned on list/detail */
  active_pricing?: CoursePricing | null;
  instructor_id: string;
  instructor_name?: string;
  /** Instructor photo (uploaded avatar or migrated Tutor profile photo). */
  instructor_avatar_url?: string | null;
  /** Course Builder details (Tutor fields) */
  excerpt?: string;
  level?: string;
  price_type?: string;
  benefits?: string;
  requirements?: string;
  target_audience?: string;
  materials?: string;
  is_public?: boolean;
  /** staff list counts */
  quiz_count?: number;
  assignment_count?: number;
  category_id?: string | null;
  category?: CourseCategory | null;
  /** All categories of the course (migrated WordPress courses can have several), primary first. */
  categories?: { id: string; name: string; slug: string; is_primary: boolean }[];
  /** Dedicated cover image (migrated featured image). Falls back to the first image in description. */
  cover_image_url?: string | null;
  /** A8: cover chosen in this app (staff responses; null = old-site featured image / none) */
  cover_url?: string | null;
  /** Migrated WordPress HTML description as safe render blocks (see `@/lib/wp-content`). */
  description_blocks?: ContentBlock[];
  /** Plain-text summary of an HTML description. */
  summary?: string;
  /** Real rating from approved reviews (course detail endpoint only). */
  rating?: { average: number; count: number };
  sections?: Section[];
  /** Populated on list/catalog API responses */
  section_count?: number;
  lesson_count?: number;
  enrollment_count?: number;
  attachment_count?: number;
  created_at: string;
  updated_at: string;
}

export interface Section {
  id: string;
  course_id: string;
  title: string;
  sort_order: number;
  lessons?: Lesson[];
}

export interface LessonAttachment {
  name: string;
  url: string;
}

export interface Lesson {
  id: string;
  section_id: string;
  title: string;
  description?: string;
  content?: string;
  video_provider?: string;
  video_url?: string;
  /** Migrated lesson whose video is on VdoCipher (play via GET /api/v1/lessons/:id/vdocipher). */
  has_vdocipher?: boolean;
  /** Staff/editing responses only. */
  vdocipher_video_id?: string;
  duration_seconds?: number;
  is_preview?: boolean;
  /** A5: sequential course — complete the earlier lessons first */
  locked?: boolean;
  /** A5: no access to the course (not enrolled) */
  requires_enrollment?: boolean;
  attachments_json?: string;
  sort_order: number;
  duration_minutes?: number;
  /** Legacy API fields (optional) */
  content_type?: string;
  content_url?: string;
}

export interface CreateCourseInput {
  title: string;
  slug?: string;
  description?: string;
  published?: boolean;
  /** Set when classifying the course in the catalog; omit if none */
  category_id?: string;
}

// ── Enrollment ──
export interface Enrollment {
  id: string;
  course_id: string;
  user_id: string;
  enrolled_at: string;
  status?: string;
  payment_status?: string;
}

export interface CourseProgress {
  course_id: string;
  total_lessons: number;
  completed_lessons: number;
  percent: number;
  lessons: LessonProgress[];
}

export interface LessonProgress {
  lesson_id: string;
  completed: boolean;
  completed_percent: number;
}

// ── Assignment ──
export interface Assignment {
  id: string;
  course_id: string;
  title: string;
  description: string;
  due_at: string | null;
  max_points: number;
  published: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateAssignmentInput {
  title: string;
  description?: string;
  due_at?: string;
  max_points?: number;
  published?: boolean;
}

export interface Submission {
  id: string;
  assignment_id: string;
  user_id: string;
  file_url: string;
  grade?: number;
  feedback?: string;
  submitted_at: string;
  graded_at?: string;
}

// ── Research ──
export interface ResearchCategory {
  id: string;
  name: string;
  slug: string;
}

export interface ResearchPaper {
  id: string;
  title: string;
  abstract: string;
  pdf_url: string;
  status: "draft" | "submitted" | "in_review" | "approved" | "rejected";
  author_id: string;
  author_name?: string;
  categories?: ResearchCategory[];
  created_at: string;
  updated_at: string;
}

export interface CreatePaperInput {
  title: string;
  abstract?: string;
  pdf_url: string;
  category_ids?: string[];
}

// ── Notification ──
export interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  /** older shape; the API sends read_at */
  read?: boolean;
  read_at?: string | null;
  type?: string;
  /** e.g. { link: "/learn/<slug>?tab=announcements" } */
  meta?: { link?: string } | null;
  created_at: string;
}

// ── File / uploads ──
/** Response from POST /api/v1/files */
export interface UploadResult {
  id: string;
  url: string;
  content_type: string;
  size: number;
  original_filename?: string;
}

export interface FileRecord {
  id: string;
  original_name: string;
  content_type: string;
  size: number;
  url: string;
  uploaded_by: string;
  created_at: string;
}

// ── Audit ──
export interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  resource: string;
  details: string;
  ip: string;
  created_at: string;
}

// ── Quiz & Assessment ──
export interface Quiz {
  id: string;
  course_id: string;
  section_id?: string;
  title: string;
  description?: string;
  time_limit_secs: number;
  pass_percent: number;
  max_attempts: number;
  shuffle_questions: boolean;
  published: boolean;
  required_for_cert: boolean;
  questions?: Question[];
  created_at: string;
  updated_at: string;
}

export interface QuestionOption {
  label: string;
  value: string;
  is_correct?: boolean;
}

export interface Question {
  id: string;
  quiz_id: string;
  type: "multiple_choice" | "true_false" | "short_answer";
  text: string;
  explanation?: string;
  points: number;
  sort_order: number;
  options?: QuestionOption[];
  correct_answer?: string;
  created_at: string;
}

export interface QuizAttempt {
  id: string;
  quiz_id: string;
  user_id: string;
  started_at: string;
  finished_at?: string;
  score: number;
  max_score: number;
  percent: number;
  passed: boolean;
  attempt_num: number;
  answers?: AttemptAnswer[];
}

export interface AttemptAnswer {
  id: string;
  attempt_id: string;
  question_id: string;
  answer: string;
  is_correct: boolean;
  points_awarded: number;
}

export interface StartAttemptResponse {
  attempt: QuizAttempt;
  questions: Question[];
}

export interface SubmitAnswerInput {
  question_id: string;
  answer: string;
}

// ── Certificate ──
export interface Certificate {
  /** A5: certificate builder design of the course (null = default) */
  design?: Partial<import("@/lib/certificate-render").CertificateDesign> | null;
  id: string;
  user_id: string;
  course_id: string;
  /** 16 hex chars (Tutor LMS format); also the public /verify/<id> address */
  verification_id: string;
  issued_at: string;
  /** when the course was completed (falls back to issued_at) */
  completed_at?: string;
  pdf_url?: string | null;
  student_name?: string;
  course_title?: string;
  /** e.g. "4 hours 30 minutes" (from the WordPress course duration) */
  duration?: string | null;
  user?: { id: string; name: string; email?: string };
  course?: { id: string; title: string; slug: string };
}

export interface CertificateVerifyResponse {
  valid: boolean;
  certificate: Certificate;
}

// ── Payment ──
export interface Payment {
  id: string;
  /** null for migrated guest-checkout payments (G11) */
  user_id: string | null;
  course_id: string;
  amount: number;
  currency: string;
  /** `paid` is what the database stores (migrated and app-created); success/completed are older names */
  status: "pending" | "paid" | "success" | "completed" | "failed" | "cancelled" | "refunded";
  provider: string;
  /** Provider transaction reference (replaces legacy provider_pay_id) */
  transaction_id?: string;
  provider_pay_id?: string;
  paid_at?: string;
  refunded_at?: string;
  refund_reason?: string;
  created_at: string;
  course_title?: string;
  course_slug?: string;
  /** Admin institute report only (GET /api/v1/admin/payments) */
  student_name?: string;
  student_email?: string;
  /** Admin Orders tab: the phone on the student's profile */
  student_phone?: string;
  /** WaafiPay payer / manual sender wallet number (admin: full, student: masked) */
  payer_phone?: string;
  /** why a payment failed (WaafiPay refusal or admin rejection) */
  note?: string;
}

// ── Course Review ──
export interface CourseReview {
  id: string;
  user_id: string;
  course_id: string;
  rating: number;
  comment?: string;
  user?: { id: string; name: string; email: string };
  created_at: string;
  updated_at: string;
}

export interface CourseRatingStats {
  average: number;
  count: number;
}

// ── Student Dashboard ──
export interface EnrolledCourseDTO {
  course_id: string;
  course_title: string;
  course_slug: string;
  /** Migrated featured image; preferred over the description image. */
  cover_image_url?: string;
  /** Markdown body; first `![...](url)` is treated as cover image (see course-cover helpers). */
  description?: string;
  instructor_name: string;
  /** uploaded avatar or migrated Tutor profile photo */
  instructor_avatar_url?: string;
  enrolled_at: string;
  status: string;
  /** paid = access granted (includes free courses); pending / failed = blocked */
  payment_status: string;
  completed_at?: string;
  total_lessons: number;
  completed_lessons: number;
  completion_percent: number;
  /** set when the student has this course's certificate */
  certificate_id?: string | null;
  /** all lessons done, certificate not issued yet: the student can claim it */
  certificate_available?: boolean;
}

export interface DashboardOverview {
  total_enrolled: number;
  active_courses: number;
  completed_courses: number;
  total_certificates: number;
  courses: EnrolledCourseDTO[];
}

/** GET /api/v1/dashboard/institute-stats — staff institute KPIs + charts. */
export interface InstituteStatsOverview {
  counts: {
    learners: number;
    programmes: number;
    research_papers: number;
    assignment_tasks: number;
  };
  enrollment_trend: { month: string; count: number }[];
  weekly_activity: { day: string; submissions: number; reviews: number }[];
  learners_mom_pct?: number;
}

/** GET /api/v1/admin/enrollments — all students (admin only). */
export interface AdminEnrollmentRow {
  enrollment_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  course_id: string;
  course_title: string;
  course_slug: string;
  instructor_name: string;
  enrolled_at: string;
  enrollment_status: string;
  payment_status: string;
  /** payments.provider: offline | stripe | wafi, or free */
  payment_method: string;
  payment_row_status?: string;
  amount_minor?: number;
  currency?: string;
}
