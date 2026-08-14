import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AdminPanel } from "@/components/AdminPanel";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/");

  const { data: events } = await supabase.from("events").select("*").order("created_at", { ascending: false });
  const { data: withdrawals } = await supabase
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
