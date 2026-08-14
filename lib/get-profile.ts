import { createAdminClient } from "@/lib/supabase/admin";

interface AuthUser {
  id: string;
  email?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  balance_usd: number;
  role: string;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
}

export async function syncAndGetProfile(user: AuthUser): Promise<UserProfile | null> {
  if (!user.email) return null;

  const admin = createAdminClient();
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const isBootstrapAdmin = adminEmails.includes(user.email.toLowerCase());

  const { data: rows } = await admin.from("users").select("*").eq("email", user.email);

  const isAdmin = isBootstrapAdmin || (rows?.some((r) => r.role === "admin") ?? false);
  const authRow = rows?.find((r) => r.id === user.id);
  const role = isAdmin ? "admin" : (authRow?.role ?? "user");
  const balance = Number(authRow?.balance_usd ?? rows?.[0]?.balance_usd ?? 0);

  // Remove duplicate rows with wrong ids
  if ((rows?.length ?? 0) > 1) {
    await admin.from("users").delete().eq("email", user.email).neq("id", user.id);
  }

  const { data: profile, error } = await admin
    .from("users")
    .upsert({ id: user.id, email: user.email, role, balance_usd: balance }, { onConflict: "id" })
    .select()
    .single();

  if (error) {
    console.error("[syncAndGetProfile]", error.message);
    const { data: fallback } = await admin.from("users").select("*").eq("id", user.id).single();
    return fallback ? { ...fallback, ...(await fetchPublicProfile(admin, user.id)) } : null;
  }

  const publicProfile = await fetchPublicProfile(admin, user.id);
  return { ...profile, ...publicProfile };
}

async function fetchPublicProfile(
  admin: ReturnType<typeof createAdminClient>,
  userId: string
) {
  const { data } = await admin
    .from("profiles")
    .select("username, display_name, avatar_url, bio")
    .eq("id", userId)
    .maybeSingle();
  return data ?? {};
}
