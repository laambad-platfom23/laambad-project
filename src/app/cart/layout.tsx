import { MarketingSiteHeader } from "@/components/landing/marketing-site-header";

export default function CartLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <MarketingSiteHeader showPromo={false} />
      {children}
    </div>
  );
}
