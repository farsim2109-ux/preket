import { createClient } from "@/lib/supabase/server";
import { syncAndGetProfile } from "@/lib/get-profile";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ user: null, profile: null });
  }

  const profile = await syncAndGetProfile({ id: user.id, email: user.email });

  return NextResponse.json({
    user: { id: user.id, email: user.email },
    profile,
  });
}
