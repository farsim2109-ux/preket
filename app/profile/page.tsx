import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { syncAndGetProfile } from "@/lib/get-profile";
import { ProfileForm } from "@/components/ProfileForm";
import { formatUsd } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const profile = await syncAndGetProfile({ id: user.id, email: user.email ?? undefined });
  if (!profile) redirect("/auth/login");

  const { data: publicProfile } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, bio")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1">Profile</h1>
        <p className="text-zinc-500 text-sm">
          Customize how you appear on Preket · Balance {formatUsd(Number(profile.balance_usd))}
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 md:p-8">
        <ProfileForm
          email={user.email ?? ""}
          initial={{
            id: user.id,
            username: publicProfile?.username ?? null,
            display_name: publicProfile?.display_name ?? null,
            avatar_url: publicProfile?.avatar_url ?? null,
            bio: publicProfile?.bio ?? null,
          }}
        />
      </div>
    </div>
  );
}
