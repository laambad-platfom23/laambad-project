"use client";

import { useTheme } from "next-themes";
import { Bell, Menu, Moon, Sun, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn, getInitials } from "@/lib/utils";
import type { User } from "@/types";

interface NavbarProps {
  user: User | null;
  onLogout: () => void;
  /** Opens the sidebar drawer on small screens. */
  onOpenMenu?: () => void;
}

export function Navbar({ user, onLogout, onOpenMenu }: NavbarProps) {
  const { setTheme, theme } = useTheme();

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-16 items-center gap-4 border-b px-4 backdrop-blur-md sm:px-6",
        "border-[#0B1F3A]/12 bg-white/95",
        "shadow-[0_1px_0_0_rgba(11,31,58,0.06)]",
        "dark:border-white/20 dark:bg-[#030A14]/98",
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 rounded-full text-[#0B1F3A] hover:bg-[#0B1F3A]/10 dark:text-white dark:hover:bg-white/15 lg:hidden"
        onClick={onOpenMenu}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </Button>
      {/* Search */}
      <div className="relative min-w-0 max-w-md flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#0B1F3A]/50 dark:text-white/70" />
        <Input
          placeholder="Search..."
          className={cn(
            "border border-[#0B1F3A]/10 bg-white/80 pl-9 shadow-sm",
            "placeholder:text-muted-foreground/80",
            "focus-visible:border-[#0B1F3A]/25 focus-visible:ring-2 focus-visible:ring-[#E84A27]/45",
            "dark:border-white/30 dark:bg-[#061528] dark:text-white dark:placeholder:text-white/50",
          )}
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* Theme Toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="rounded-full text-[#0B1F3A] hover:bg-[#0B1F3A]/10 dark:text-white dark:hover:bg-white/15"
        >
          <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>

        {/* Notifications */}
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-full text-[#0B1F3A] hover:bg-[#0B1F3A]/10 dark:text-white dark:hover:bg-white/15"
        >
          <Bell className="h-5 w-5" />
          <span className="sr-only">Notifications</span>
        </Button>

        {/* Profile */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="relative h-9 w-9 rounded-full ring-2 ring-[#0B1F3A]/15 ring-offset-2 hover:ring-[#E84A27]/40 dark:ring-white/40 dark:ring-offset-[#030A14]"
            >
              <Avatar className="h-9 w-9">
                {user?.avatar_url ? (
                  <AvatarImage src={user.avatar_url} alt={user.name} className="object-cover" />
                ) : null}
                <AvatarFallback className="bg-[#0B1F3A] text-sm font-semibold text-white dark:bg-white dark:text-[#0B1F3A]">
                  {user ? getInitials(user.name) : "U"}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{user?.name || "User"}</p>
                <p className="text-xs text-muted-foreground">{user?.email || ""}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onLogout} className="text-destructive cursor-pointer">
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
