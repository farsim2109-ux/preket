import { createClient } from "@/lib/supabase/server";
import { syncAndGetProfile } from "@/lib/get-profile";
import { Navbar } from "./Navbar";

export const dynamic = "force-dynamic";

export async function NavbarShell() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  if (user?.email) {
    profile = await syncAndGetProfile({ id: user.id, email: user.email });
  }

  return <Navbar initialLoggedIn={!!user} initialProfile={profile} />;
}
