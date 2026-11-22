"use client";

import { useQuery } from "@tanstack/react-query";
import { coursesApi } from "@/services/api/courses";
import type { PublicCourseCategory } from "@/types";

/** Real course categories from the database (only those with published courses), most courses first. */
export function usePublicCategories() {
  return useQuery<PublicCourseCategory[]>({
    queryKey: ["public-course-categories"],
    queryFn: () => coursesApi.publicCategories().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });
}
