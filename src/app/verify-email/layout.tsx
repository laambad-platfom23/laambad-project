import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Verify e-mail",
  description: "Confirm your e-mail address with the code we sent you.",
};

export default function VerifyEmailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
