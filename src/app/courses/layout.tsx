import { MarketingSiteHeader } from "@/components/landing/marketing-site-header";
import { SiteFooter } from "@/components/landing/site-footer";

export default function CoursesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-background">
      <MarketingSiteHeader showPromo={false} />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
