"use client";

import "./globals.css";

/**
 * Replaces the root layout when active — must import globals here or the UI is unstyled.
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/global-error
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-8">
          <h1 className="text-xl font-semibold tracking-tight">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {error.message || "The app hit a fatal error. Try reloading the page."}
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
