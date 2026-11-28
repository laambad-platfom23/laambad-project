import { MarketingSiteHeader } from "@/components/landing/marketing-site-header";
import { SiteFooter } from "@/components/landing/site-footer";

/** A12: public book pages (like /courses); the reader at /books/[slug]/read covers the whole screen. */
export default function BooksLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-background">
      <MarketingSiteHeader showPromo={false} />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
