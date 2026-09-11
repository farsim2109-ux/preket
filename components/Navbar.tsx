"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatUsd } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Search, Wallet, LogOut, UserRound, Bell, Menu } from "lucide-react";

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
  const router = useRouter();
  const supabase = createClient();
  const [loggedIn, setLoggedIn] = useState(initialLoggedIn);
  const [profile, setProfile] = useState(initialProfile);

  useEffect(() => {
    setLoggedIn(initialLoggedIn);
    setProfile(initialProfile);
  }, [initialLoggedIn, initialProfile]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") { setLoggedIn(false); setProfile(null); }
      else if (event === "SIGNED_IN") router.refresh();
    });
    return () => subscription.unsubscribe();
  }, [supabase, router]);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  const isAdmin = profile?.role === "admin";
  const displayName = profile?.display_name || profile?.username || profile?.email?.split("@")[0] || "User";
  const avatarInitials = displayName.slice(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800/80 bg-[#0b0b0f]/95 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-4 px-4 sm:px-6">
        <Link href="/events" className="flex shrink-0 items-center gap-2 text-[19px] font-extrabold tracking-tight text-white">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-black text-sm">P</span>
          Preket
        </Link>

        <form action="/events" method="get" className="hidden min-w-0 flex-1 md:block md:max-w-xl lg:ml-2">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
            <input name="q" placeholder="Search markets..." aria-label="Search markets" className="h-10 w-full rounded-xl border border-zinc-800 bg-zinc-900/70 pl-10 pr-10 text-sm text-white outline-none placeholder:text-zinc-600 transition focus:border-zinc-600 focus:bg-zinc-900" />
            <kbd className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-600 lg:block">/</kbd>
          </div>
        </form>

        <nav className="hidden items-center gap-1 xl:flex">
          <Link href="/events" className={cn("rounded-lg px-3 py-2 text-sm font-semibold transition", pathname.startsWith("/events") ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-white")}>Markets</Link>
          {loggedIn && <Link href="/dashboard" className={cn("rounded-lg px-3 py-2 text-sm font-semibold transition", pathname.startsWith("/dashboard") ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-white")}>Portfolio</Link>}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {loggedIn ? (
            <>
              <Link href="/dashboard" className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200 sm:flex">
                <span>Portfolio</span>
              </Link>
              <div className="hidden items-center gap-1.5 border-l border-zinc-800 pl-3 sm:flex">
                <span className="text-[10px] uppercase tracking-wide text-zinc-600">Cash</span>
                <span className="text-xs font-semibold tabular-nums text-emerald-400">{formatUsd(Number(profile?.balance_usd ?? 0))}</span>
              </div>
              <Link href="/deposit" className="rounded-lg bg-white px-3.5 py-2 text-xs font-bold text-black transition hover:bg-zinc-200">Deposit</Link>
              <Link href="/profile" className="hidden h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-zinc-700 bg-zinc-800 sm:flex" aria-label="Profile">
                {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : <span className="text-[11px] font-bold text-zinc-200">{avatarInitials}</span>}
              </Link>
              <Link href="/profile" className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-900 hover:text-white sm:hidden"><UserRound className="h-4 w-4" /></Link>
              <button onClick={signOut} className="hidden h-9 w-9 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-900 hover:text-white lg:flex" aria-label="Sign out"><LogOut className="h-4 w-4" /></button>
              {isAdmin && <Link href="/admin" className="hidden" aria-hidden="true">Admin</Link>}
            </>
          ) : (
            <>
              <Link href="/auth/login" className="rounded-lg px-3 py-2 text-sm font-semibold text-zinc-400 hover:text-white">Log in</Link>
              <Link href="/auth/signup" className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-black hover:bg-zinc-200">Sign up</Link>
            </>
          )}
          <Bell className="hidden h-4 w-4 text-zinc-700 sm:block" />
          <Menu className="h-5 w-5 text-zinc-500 xl:hidden" />
        </div>
      </div>
    </header>
  );
}

export function LoadingSpinner() {
  return <div className="flex items-center justify-center p-8"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" /></div>;
}
