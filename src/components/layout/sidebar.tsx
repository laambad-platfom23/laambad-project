"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  Tags,
  GraduationCap,
  ClipboardList,
  Bell,
  Upload,
  Settings,
  ChevronLeft,
  ChevronDown,
  LogOut,
  BrainCircuit,
  Award,
  CreditCard,
  MessageSquare,
  Library,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Logo } from "@/components/ui/logo";
import { useAuthStore } from "@/store/auth-store";
import {
  defaultDashboardPathForUser,
  isAdminUser,
  isStaffUser,
  type AuthLikeUser,
} from "@/lib/auth-routing";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** When set, item is shown only if the predicate returns true. */
  visible?: (user: AuthLikeUser) => boolean;
  children?: { label: string; href: string; icon: React.ComponentType<{ className?: string }> }[];
};

/** Learners: My Learning first — no institute-wide admin stats or staff tools. */
const studentNavItems: NavItem[] = [
  // flat list (the former "My Learning" group's tabs are top-level items)
  { label: "My Learning", href: "/dashboard/my-learning", icon: GraduationCap },
  { label: "My courses", href: "/dashboard/my-courses", icon: BookOpen },
  { label: "Browse catalog", href: "/courses", icon: Library },
  { label: "Quizzes", href: "/dashboard/quizzes", icon: BrainCircuit },
  { label: "Assignments", href: "/dashboard/assignments", icon: ClipboardList },
  { label: "Certificates", href: "/dashboard/certificates", icon: Award },
  { label: "Payments", href: "/dashboard/payments", icon: CreditCard },
  { label: "Notifications", href: "/dashboard/notifications", icon: Bell },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
];

/**
 * Staff nav — filtered by role/permissions.
 * Admin-only: Users, institute Enrollments (cancel/approve). Instructors share courses/content tools.
 */
const staffNavItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  {
    label: "Payments",
    href: "/dashboard/payments",
    icon: CreditCard,
    // Instructors may open the page but see only their own; admin sees institute list.
  },
  { label: "Courses", href: "/dashboard/courses", icon: BookOpen },
  {
    label: "Course categories",
    href: "/dashboard/course-categories",
    icon: Tags,
    visible: (u) => isAdminUser(u),
  },
  {
    label: "Site CMS",
    href: "/dashboard/site",
    icon: ImageIcon,
    visible: (u) => isAdminUser(u),
  },
  {
    label: "Enrollments",
    href: "/dashboard/enrollments",
    icon: GraduationCap,
    visible: (u) => isAdminUser(u),
  },
  { label: "Assignments", href: "/dashboard/assignments", icon: ClipboardList },
  { label: "Reviews", href: "/dashboard/reviews", icon: MessageSquare },
  {
    label: "Users",
    href: "/dashboard/users",
    icon: Users,
    visible: (u) => isAdminUser(u),
  },
  { label: "Notifications", href: "/dashboard/notifications", icon: Bell },
  { label: "Files", href: "/dashboard/files", icon: Upload },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
];

/** Exact index vs nested paths (e.g. /dashboard/research vs /dashboard/research/categories). */
function pathMatchesChild(pathname: string, childHref: string): boolean {
  if (pathname === childHref) return true;
  if (childHref === "/dashboard/research") return false;
  return pathname.startsWith(`${childHref}/`);
}

interface SidebarProps {
  onLogout: () => void;
  /** Desktop: narrow icon rail (state lives in DashboardLayout so the content margin follows). */
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Mobile (< lg): off-canvas drawer. */
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const navInactive =
  "text-white/85 hover:bg-white/15 hover:text-white";
const navActive =
  "bg-white font-semibold text-[#0B1F3A] shadow-md";
const subNavInactive = "text-white/75 hover:bg-white/12 hover:text-white";
const subNavActive =
  "bg-white font-semibold text-[#0B1F3A] shadow-sm";
const parentOpenStyle =
  "border border-white/25 bg-white/15 text-white shadow-inner";

export function Sidebar({ onLogout, collapsed: collapsedDesktop, onToggleCollapsed, mobileOpen, onCloseMobile }: SidebarProps) {
  const user = useAuthStore((s) => s.user);
  const navItems = (isStaffUser(user) ? staffNavItems : studentNavItems).filter(
    (item) => !item.visible || item.visible(user),
  );
  const logoHref = defaultDashboardPathForUser(user);

  // The drawer on mobile is always full width; the icon rail only exists on desktop.
  const [isDesktop, setIsDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  const collapsed = isDesktop && collapsedDesktop;
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});
  const pathname = usePathname();

  const toggleMenu = (label: string) => {
    setOpenMenus((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <>
    {/* mobile backdrop */}
    <div
      className={cn(
        "fixed inset-0 z-30 bg-black/50 backdrop-blur-[2px] transition-opacity lg:hidden",
        mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
      )}
      onClick={onCloseMobile}
      aria-hidden
    />
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 flex h-[100dvh] flex-col border-r transition-all duration-300 ease-in-out",
        mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        "border-[#061528] bg-[#0B1F3A]",
        "shadow-[6px_0_32px_-12px_rgba(11,31,58,0.55)]",
        "dark:border-white/10 dark:bg-[#061528]",
        collapsed ? "w-[70px]" : "w-[268px]",
      )}
    >
      <div
        className={cn(
          "flex h-16 items-center justify-between px-4",
          "border-b border-white/10 dark:border-white/10",
        )}
      >
        {/* collapsed: the header only holds the centred expand arrow (the logo would collide with it) */}
        {!collapsed ? <Logo size="sm" href={logoHref} variant="dark" /> : null}
        {/* mobile: close the drawer */}
        <button
          type="button"
          onClick={onCloseMobile}
          className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white lg:hidden"
          aria-label="Close menu"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      </div>

      {/* desktop: collapse / expand handle on the sidebar edge, level with the header line */}
      <button
        type="button"
        onClick={onToggleCollapsed}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className={cn(
          "absolute top-[18px] z-50 hidden h-7 w-7 items-center justify-center rounded-md lg:flex",
          collapsed ? "left-1/2 -translate-x-1/2" : "right-2",
          "text-white/60 transition-colors duration-200 hover:text-brand-orange-bright",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50",
        )}
      >
        <ChevronLeft className={cn("h-5 w-5 transition-transform duration-300", collapsed && "rotate-180")} />
      </button>

      <Separator className="bg-white/10 dark:bg-white/10" />

      <nav className="flex-1 space-y-1.5 overflow-y-auto overscroll-contain px-3 py-4">
        {navItems.map((item) => {
          const isParentActive = item.children
            ? item.children.some((ch) => pathMatchesChild(pathname, ch.href)) ||
              pathname.startsWith(`${item.href}/`)
            : item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

          const isOpen = !!openMenus[item.label];

          if (item.children) {
            return (
              <div key={item.label}>
                <button
                  type="button"
                  onClick={() => {
                    if (!collapsed) toggleMenu(item.label);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    collapsed && "justify-center px-2",
                    isOpen && !collapsed ? parentOpenStyle : navInactive,
                    isParentActive && !isOpen && "text-white ring-1 ring-white/40",
                  )}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left">{item.label}</span>
                      <ChevronDown
                        className={cn("h-4 w-4 shrink-0 transition-transform duration-200", isOpen && "rotate-180")}
                      />
                    </>
                  )}
                </button>
                {!collapsed && isOpen && (
                  <div className="ml-3 mt-1.5 space-y-0.5 border-l-2 border-[#0B1F3A]/55 pl-3 pt-0.5">
                    {item.children.map((child) => {
                      const isChildActive = pathMatchesChild(pathname, child.href);
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={cn(
                            "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-200",
                            isChildActive ? subNavActive : subNavInactive,
                          )}
                        >
                          <child.icon className="h-4 w-4 shrink-0" />
                          <span>{child.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                isParentActive ? navActive : navInactive,
                collapsed && "justify-center px-2",
              )}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <Separator className="bg-white/10 dark:bg-white/10" />

      <div className="space-y-2 p-3">
        <Button
          variant="ghost"
          className={cn(
            "w-full justify-start gap-3 rounded-xl text-white/80 hover:bg-white/10 hover:text-white dark:text-white/75",
            collapsed && "justify-center px-2",
          )}
          onClick={onLogout}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {!collapsed && <span>Logout</span>}
        </Button>

      </div>
    </aside>
    </>
  );
}
