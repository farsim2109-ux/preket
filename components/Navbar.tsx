"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatUsd } from "@/lib/types";
import { cn } from "@/lib/utils";
import { TrendingUp, Wallet, LogOut } from "lucide-react";

interface Profile {
  id: string;
  email: string;
  balance_usd: number;
  role: string;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
}

interface NavbarProps {
  initialLoggedIn: boolean;
  initialProfile: Profile | null;
}

export function Navbar({ initialLoggedIn, initialProfile }: NavbarProps) {
  const pathname = usePathname();
  const supabase = createClient();
  const [loggedIn, setLoggedIn] = useState(initialLoggedIn);
  const [profile, setProfile] = useState(initialProfile);

  useEffect(() => {
    setLoggedIn(initialLoggedIn);
    setProfile(initialProfile);
  }, [initialLoggedIn, initialProfile]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setLoggedIn(false);
        setProfile(null);
      } else if (event === "SIGNED_IN") {
        window.location.reload();
      }
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  const isAdmin = profile?.role === "admin";

  const links = [
    { href: "/events", label: "Markets" },
    ...(loggedIn
      ? [
          { href: "/dashboard", label: "Portfolio" },
          { href: "/profile", label: "Profile" },
          { href: "/deposit", label: "Deposit" },
          { href: "/withdraw", label: "Withdraw" },
          ...(isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
        ]
      : []),
  ];

  const displayName =
    profile?.display_name || profile?.username || profile?.email?.split("@")[0] || "User";
  const avatarInitials = displayName.slice(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--card-border)] bg-[var(--background)]/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg">
          <TrendingUp className="h-5 w-5 text-[var(--accent)]" />
          Preket
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "text-sm transition-colors hover:text-white",
                pathname.startsWith(link.href) ? "text-white" : "text-[var(--muted)]"
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          {loggedIn ? (
            <>
              <Link
                href="/profile"
                className="hidden sm:flex items-center gap-2 rounded-lg bg-[var(--card)] px-2 py-1.5 text-sm border border-[var(--card-border)] hover:border-zinc-500 transition-colors"
              >
                {profile?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.avatar_url}
                    alt=""
                    className="h-7 w-7 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-700 text-xs font-bold">
                    {avatarInitials}
                  </span>
                )}
                <span className="max-w-[100px] truncate text-zinc-300">{displayName}</span>
              </Link>
              <div className="hidden sm:flex items-center gap-2 rounded-lg bg-[var(--card)] px-3 py-1.5 text-sm border border-[var(--card-border)]">
                <Wallet className="h-4 w-4 text-[var(--accent)]" />
                <span>{formatUsd(Number(profile?.balance_usd ?? 0))}</span>
              </div>
              <button
                onClick={signOut}
                className="flex items-center gap-1 text-sm text-[var(--muted)] hover:text-white"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/auth/login"
                className="text-sm text-[var(--muted)] hover:text-white px-3 py-1.5"
              >
                Log in
              </Link>
              <Link
                href="/auth/signup"
                className="text-sm bg-[var(--accent)] hover:bg-blue-600 text-white px-4 py-1.5 rounded-lg"
              >
                Sign up
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
    </div>
  );
}
