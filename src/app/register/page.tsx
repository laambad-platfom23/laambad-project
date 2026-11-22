import { Suspense } from "react";
import { RegisterForm } from "./register-form";
import { Skeleton } from "@/components/ui/skeleton";

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100dvh] items-center justify-center bg-gray-50 p-4 dark:bg-[#030A14]">
          <Skeleton className="h-[28rem] w-full max-w-xl rounded-xl dark:bg-white/10" />
        </div>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
