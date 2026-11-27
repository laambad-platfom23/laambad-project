-- A6 — quizzes, assignments and resources under a lesson (Course Builder + the learn page tabs).
-- Additive only and idempotent: new nullable / defaulted columns, one new table, and the old site's
-- placement written into the NEW columns only (rows whose lesson / topic is already set are left alone).
-- Apply BEFORE deploying the code that uses it:
--   node scripts/apply-app-sql.mjs prisma/app-sql/A6-lesson-items.sql [--dry-run]

-- ── Quiz under a lesson (NULL = topic-level quiz, shown at the top of its topic) ──
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS lesson_id uuid NULL REFERENCES lessons(id);
-- order of the quizzes / assignments under the same lesson (one shared sequence, like Tutor's menu_order)
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS quizzes_lesson_idx ON quizzes (lesson_id);

-- ── Assignment placement: topic + lesson (an assignment with no topic is not shown to students) ──
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS section_id uuid NULL REFERENCES sections(id);
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS lesson_id uuid NULL REFERENCES lessons(id);
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS assignments_course_idx ON assignments (course_id);
CREATE INDEX IF NOT EXISTS assignments_lesson_idx ON assignments (lesson_id);

-- ── Resources added in the Course Builder: a file (Vercel Blob) or a link, under a lesson or for the whole course ──
CREATE TABLE IF NOT EXISTS course_resources (
  id          uuid PRIMARY KEY,
  course_id   uuid          NOT NULL REFERENCES courses(id),
  lesson_id   uuid          NULL REFERENCES lessons(id),
  title       varchar(255)  NOT NULL,
  kind        varchar(8)    NOT NULL DEFAULT 'file',   -- file | link
  url         varchar(2048) NOT NULL,
  file_name   varchar(255)  NULL,
  mime        varchar(128)  NULL,
  size        bigint        NULL,
  sort_order  integer       NOT NULL DEFAULT 0,
  created_by  uuid          NULL REFERENCES users(id),
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now(),
  deleted_at  timestamptz   NULL
);
CREATE INDEX IF NOT EXISTS course_resources_course_idx ON course_resources (course_id, lesson_id);

-- ── Old site (Tutor) order. Every quiz of the old site: (quiz legacy id, the lesson it followed in its
--    topic or NULL when it was first in the topic, Tutor menu_order). 240 go under a lesson; the other
--    21 were first in their topic (mostly "final exam" topics without lessons) and stay topic-level.
UPDATE quizzes q
   SET lesson_id  = l.id,
       sort_order = v.menu_order
  FROM (VALUES
  (4235,3487,7), (4237,3500,11), (4249,3503,2), (4239,3511,8), (4241,4183,3), (4250,15837,5), (4875,4490,5), (4877,4524,4),
  (6472,6072,4), (6500,6080,5), (6501,6086,5), (6503,6092,5), (6504,6097,4), (6506,6101,3), (6507,6108,6), (6545,6113,4),
  (6546,6118,4), (6549,6125,6), (6550,6131,5), (6552,6137,5), (6681,6142,4), (6683,6146,3), (6685,6152,4), (7644,7539,3),
  (7646,7547,6), (7648,7550,3), (7650,7554,2), (7652,7571,6), (9351,8268,8), (8870,8278,9), (8872,8284,5), (8874,8292,5),
  (9353,8297,4), (9171,8303,6), (9174,8310,6), (8885,8316,5), (9334,8326,9), (9336,8335,8), (9338,8340,4), (9340,8344,3),
  (9342,8349,4), (9345,8354,4), (9347,8358,3), (9349,8370,11), (9151,8909,9), (9153,8919,9), (9155,8930,10), (9157,8939,8),
  (9159,8945,5), (9161,8952,6), (9163,8958,5), (9165,8967,8), (9195,8987,7), (9197,8994,5), (9199,8999,4), (9201,9004,4),
  (9203,9010,5), (9205,9022,11), (9587,9360,8), (9589,9366,5), (9591,9374,7), (9599,9598,6), (9601,9391,7), (9603,9399,6),
  (9605,9404,3), (9608,9411,6), (9610,9416,4), (9612,9428,10), (9629,9455,8), (9631,9461,5), (9633,9469,7), (9635,9477,7),
  (9637,9484,6), (9639,9490,5), (9641,9496,5), (9643,9502,5), (9644,9506,3), (9646,9515,8), (15266,15179,4), (15268,15181,2),
  (15280,15187,3), (15273,15188,1), (15278,15193,5), (16207,16147,3), (16214,16152,5), (25190,24687,7), (25194,24697,9), (25199,24701,4),
  (24837,24709,8), (25203,24721,7), (25205,24730,7), (25010,NULL,0), (27618,25516,8), (27689,25528,9), (27774,25544,8), (27778,25556,11),
  (27780,25560,4), (27782,25573,12), (27784,25586,9), (27787,25595,8), (27791,25602,7), (27795,25612,10), (27799,26382,11), (27819,26385,3),
  (27823,26395,9), (27828,26402,7), (27830,26403,1), (27832,26413,9), (27835,26416,3), (27914,26427,8), (27934,27218,9), (28013,27256,9),
  (28033,27265,9), (28035,27269,4), (28037,27279,10), (41023,28384,5), (41024,28389,4), (41025,28396,6), (32188,31463,9), (32189,31471,8),
  (32190,31481,9), (32192,31490,9), (32275,31495,5), (32283,31503,7), (32302,31511,7), (32304,31522,5), (32317,31548,8), (32318,31559,10),
  (32320,31568,8), (32326,31571,3), (32327,31573,2), (32334,31587,9), (32335,31596,9), (32613,31901,13), (32614,31918,8), (32616,31936,5),
  (32627,31948,7), (32628,31955,7), (32634,32058,7), (32617,31939,3), (32637,32216,10), (32638,32223,7), (32639,32238,7), (32640,32245,7),
  (32641,32254,8), (32642,32263,9), (32643,32271,8), (32644,32282,7), (32784,NULL,1), (32795,NULL,1), (32811,NULL,1), (38081,35376,4),
  (38084,35381,5), (38087,35384,3), (38089,35388,4), (38184,35393,5), (38185,35396,3), (38187,35402,6), (38188,35406,4), (38196,35419,5),
  (38197,35424,5), (38198,35430,6), (38199,35436,6), (38211,35441,5), (38213,35446,5), (38190,35414,7), (38214,35492,5), (38215,35497,5),
  (38216,35501,4), (38217,35508,7), (38218,35514,6), (38221,35523,5), (38228,35528,5), (38229,35532,4), (38230,35537,5), (38232,35544,7),
  (38234,35550,6), (38235,35558,8), (38236,35565,7), (38237,35570,5), (39964,35596,9), (40236,35603,7), (40237,35608,5), (40242,35611,3),
  (40297,35615,4), (40300,35623,7), (40301,35627,4), (40305,35633,6), (40500,35645,7), (40502,35650,6), (40551,35656,6), (40552,35660,4),
  (40553,35663,3), (40495,35639,5), (41026,37535,6), (40954,39055,6), (40969,39059,4), (40970,39065,6), (40971,39071,6), (40973,39077,6),
  (40974,39083,6), (40975,39089,6), (40976,39094,5), (40977,39100,6), (40978,39105,5), (40979,39111,6), (40980,39117,6), (40991,39123,6),
  (40994,39128,5), (40995,39134,6), (41000,39297,5), (41002,39303,6), (41007,39311,8), (41014,39318,7), (41015,39324,6), (41016,39329,5),
  (41017,39335,6), (41020,39341,6), (41021,39346,5), (40652,39497,6), (40653,39503,6), (40682,39509,6), (40685,39516,6), (40703,39522,6),
  (40704,39528,6), (40707,39534,6), (40710,39540,6), (40713,39546,6), (40714,39552,6), (40729,39558,6), (40734,39564,6), (40735,39570,6),
  (40767,39576,6), (40786,39582,6), (41028,NULL,1), (41030,NULL,1), (41032,NULL,1), (41036,NULL,1), (41951,NULL,1), (42070,NULL,1),
  (45875,NULL,1), (45882,NULL,2), (45887,NULL,3), (45889,NULL,4), (45891,NULL,5), (45901,NULL,6), (45931,NULL,7), (45932,NULL,8),
  (45957,NULL,1), (45959,NULL,2), (45960,NULL,3), (46173,46084,1), (49697,48954,5), (49701,48959,4), (49703,48966,8), (49719,48970,4),
  (49720,48976,6), (49721,48982,6), (49722,48988,5), (49723,48994,6), (49726,49002,6)
  ) AS v(quiz_wp, lesson_wp, menu_order)
  LEFT JOIN lessons l ON l.legacy_wp_id = v.lesson_wp::bigint AND l.deleted_at IS NULL
 WHERE q.legacy_wp_id = v.quiz_wp::bigint
   AND q.lesson_id IS NULL
   AND (l.id IS NULL OR l.section_id = q.section_id);

-- ── The 25 assignments that were in this course's curriculum on the old site (they hold all 4,617
--    submissions): (assignment legacy id, topic legacy id, previous lesson legacy id or NULL, menu_order).
--    The other 38 sat in topics of deleted courses, were never visible to students and keep no topic.
UPDATE assignments a
   SET section_id = s.id,
       lesson_id  = l.id,
       sort_order = v.menu_order
  FROM (VALUES
  (7654,7535,7539,4), (7655,7540,7547,7), (7656,7548,7550,4), (7658,7551,7554,3), (7659,7555,7558,3), (7660,7566,7571,7),
  (7663,7573,15024,4), (7664,7577,7584,4), (15282,15175,15197,2), (16216,16134,16167,3), (16217,16135,16179,10), (16301,16140,16184,1),
  (20959,20957,NULL,1), (20964,20962,NULL,0), (20967,20965,NULL,1), (20971,20969,NULL,1), (25729,25449,25712,3), (25715,25449,25712,4),
  (25724,25449,25712,5), (25732,25451,25469,2), (25738,25451,25469,3), (25743,25452,25471,2), (25746,25453,25473,2), (25749,25454,26332,7),
  (28626,28193,28586,16)
  ) AS v(assignment_wp, topic_wp, lesson_wp, menu_order)
  JOIN sections s ON s.legacy_wp_id = v.topic_wp::bigint AND s.deleted_at IS NULL
  LEFT JOIN lessons l ON l.legacy_wp_id = v.lesson_wp::bigint AND l.section_id = s.id AND l.deleted_at IS NULL
 WHERE a.legacy_wp_id = v.assignment_wp::bigint
   AND s.course_id = a.course_id
   AND a.section_id IS NULL
   AND a.lesson_id IS NULL;
