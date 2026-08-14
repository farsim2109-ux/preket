import { createClient } from "@/lib/supabase/server";
import { syncAndGetProfile } from "@/lib/get-profile";
import { redirect } from "next/navigation";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const profile = await syncAndGetProfile({ id: user.id, email: user.email ?? undefined });

  if (profile?.role !== "admin") {
    redirect("/");
  }

  return <>{children}</>;
}
