import { redirect } from "next/navigation";

/** Legacy URL — administrators sign in at `/admin`. */
export default function AdminLoginPage() {
  redirect("/admin");
}
