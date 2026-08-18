import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function getSafeRedirect(redirectTo: string | null): string {
  if (!redirectTo || !redirectTo.startsWith("/") || redirectTo.startsWith("//")) {
    return "/dashboard";
  }

  try {
    const url = new URL(redirectTo, "http://localhost");
    if (url.origin !== "http://localhost") return "/dashboard";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/dashboard";
  }
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirectTo = getSafeRedirect(searchParams.get("redirect"));

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL(redirectTo, origin));
}
