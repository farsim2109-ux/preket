import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ALLOWED_FUNCTIONS = new Set([
  "create_event",
  "resolve_event",
  "cancel_event",
  "admin_add_liquidity",
  "approve_withdrawal",
  "reject_withdrawal",
]);

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { fn?: string; params?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { fn, params } = body;
  if (!fn || !ALLOWED_FUNCTIONS.has(fn)) {
    return NextResponse.json({ error: "Unknown or disallowed function" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc(fn, params ?? {});

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data });
}
