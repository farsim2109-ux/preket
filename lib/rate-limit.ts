import { createAdminClient } from "@/lib/supabase/admin";

export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("check_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("rate limit check failed:", error.message);
    // Fail closed for security-sensitive operations when the limiter is unavailable.
    return false;
  }
  return data as boolean;
}
