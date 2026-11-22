import { Suspense } from "react";
import { LoginForm } from "./login-form";
import { Skeleton } from "@/components/ui/skeleton";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100dvh] items-center justify-center bg-[#F3F5F8] p-4 dark:bg-[#030A14]">
          <Skeleton className="h-[26rem] w-full max-w-[360px] rounded-[1.75rem] dark:bg-white/10" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
