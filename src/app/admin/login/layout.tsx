import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Staff sign in",
  description: "Administrators and teachers — sign in to the Laambad dashboard.",
};

export default function AdminLoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
