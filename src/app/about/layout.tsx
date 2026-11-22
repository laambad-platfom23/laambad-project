import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About Us — Laambad E-learning platform",
  description:
    "Learn about Laambad — an e-learning platform with practical courses taught by experienced instructors.",
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
