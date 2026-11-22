"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { assignmentsApi } from "@/services/api/assignments";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardList, ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { Assignment } from "@/types";

export default function AssignmentsPage() {
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading } = useQuery({
    queryKey: ["assignments", page, pageSize],
    queryFn: () => assignmentsApi.listForCourse("all").then((r) => r.data),
  });

  const allAssignments: Assignment[] = data?.data || [];
  const total = allAssignments.length;
  const totalPages = Math.ceil(total / pageSize);
  const assignments = allAssignments.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Assignments</h1>
        <p className="text-muted-foreground">View and manage your assignments.</p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : assignments.length === 0 ? (
        <div className="text-center py-20">
          <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-lg font-medium text-muted-foreground">No assignments yet</p>
          <p className="text-sm text-muted-foreground mt-1">Assignments will appear here once created.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {assignments.map((assignment: Assignment) => (
            <Card key={assignment.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1">
                    <h3 className="font-semibold">{assignment.title}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-1">
                      {assignment.description || "No description"}
                    </p>
                    <div className="flex items-center gap-4 pt-2">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        Due: {formatDate(assignment.due_at || '')}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Max: {assignment.max_points} pts
                      </span>
                    </div>
                  </div>
                  <Badge variant="outline">{assignment.course_id ? "Active" : "Draft"}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
