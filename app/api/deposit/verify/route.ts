import { createClient } from "@/lib/supabase/server";
import { handleDepositVerifyRequest } from "@/lib/deposit/verify-handler";

/** Alias route matching deposit-flow spec (`POST /api/deposit/verify`). */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return handleDepositVerifyRequest(request, user?.id);
}
