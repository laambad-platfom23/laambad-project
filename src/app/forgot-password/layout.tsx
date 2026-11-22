import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reset password",
  description: "Reset your Laambad password with a code sent to your e-mail.",
};

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
