import { Suspense } from "react";
import type { Metadata } from "next";
import { CoursesCatalogSkeleton, CoursesCatalogView } from "@/components/courses/courses-catalog-view";

export const metadata: Metadata = {
  title: "All courses",
  description:
    "Browse published Laambad courses — search, filter by price and category, sort by title or cost.",
};

export default function CoursesIndexPage() {
  return (
    <Suspense fallback={<CoursesCatalogSkeleton />}>
      <CoursesCatalogView />
    </Suspense>
  );
}
