import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncAndGetProfile } from "@/lib/get-profile";
import { redirect } from "next/navigation";
import { AdminPanel } from "@/components/AdminPanel";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect("/auth/login");

  // Use the same bootstrap-admin logic as the navbar/proxy. This keeps the
  // configured admin email authoritative even if the users row is stale or
  // RLS would hide it from the browser session.
  const profile = await syncAndGetProfile({ id: user.id, email: user.email });
  if (profile?.role !== "admin") redirect("/");

  // Admin-only dashboard data is read with service_role so RLS cannot make
  // the admin panel appear empty while the authenticated admin is valid.
  const admin = createAdminClient();
  const { data: events } = await admin
    .from("events")
    .select("*")
    .order("created_at", { ascending: false });
  const { data: withdrawals } = await admin
    .from("withdrawals")
    .select("*, users(email)")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>
      <AdminPanel events={events ?? []} withdrawals={withdrawals ?? []} />
    </div>
  );
}
