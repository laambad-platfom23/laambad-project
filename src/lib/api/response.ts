import { NextResponse } from "next/server";
import { ApiError } from "./errors";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

/**
 * Anonymous, public data only (never per-user data): the Vercel CDN serves it for `sMaxAge` seconds
 * and then refreshes it in the background, so most visitors never reach the database.
 */
export function publicJson(data: unknown, sMaxAge = 300) {
  return NextResponse.json(data, {
    status: 200,
    headers: {
      "Cache-Control": `public, max-age=60, s-maxage=${sMaxAge}, stale-while-revalidate=${sMaxAge * 6}`,
    },
  });
}

/**
 * A public route whose answer changes once the visitor is signed in (owned flags, progress …):
 * guests share the CDN copy, but a signed-in request must never get that guest copy back from the
 * browser or CDN cache — hence "Vary: Authorization" (Phase 2 test: "My books" came back empty).
 */
export function publicJsonVary(data: unknown, sMaxAge = 300) {
  const res = publicJson(data, sMaxAge);
  res.headers.set("Vary", "Authorization");
  return res;
}

/** The signed-in answer of such a route: only for this visitor, never stored by a cache. */
export function personalJson(data: unknown) {
  return NextResponse.json(data, { status: 200, headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } });
}

export function noContent() {
  return new NextResponse(null, { status: 204 });
}

export function paginated<T>(data: T[], total: number, page: number) {
  return json({ data, total, page });
}

export function wrapped<T>(data: T) {
  return json({ data });
}

export function handleError(err: unknown, requestId?: string) {
  if (err instanceof ApiError) {
    return NextResponse.json(
      {
        error: {
          code: err.code,
          message: err.message,
          request_id: requestId,
          details: err.details,
        },
      },
      { status: err.status }
    );
  }
  console.error("[api]", err);
  return NextResponse.json(
    {
      error: {
        code: "internal_error",
        message: "internal server error",
        request_id: requestId,
      },
    },
    { status: 500 }
  );
}
