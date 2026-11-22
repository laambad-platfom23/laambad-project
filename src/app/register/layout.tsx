import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create a Laambad account and start learning.",
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
