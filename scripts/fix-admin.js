/**
 * One-time fix: create/sync admin profile for bootstrap admin email.
 * Run: npm.cmd run fix-admin
 */
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env.local");
  const env = fs.readFileSync(envPath, "utf8");
  const get = (key) => {
    const match = env.match(new RegExp(`^${key}=(.+)$`, "m"));
    if (!match) throw new Error(`Missing ${key} in .env.local`);
    return match[1].trim();
  };
  return {
    url: get("NEXT_PUBLIC_SUPABASE_URL"),
    serviceKey: get("SUPABASE_SERVICE_ROLE_KEY"),
    adminEmails: (get("ADMIN_EMAILS") || "")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean),
  };
}

async function main() {
  const { url, serviceKey, adminEmails } = loadEnv();
  const admin = createClient(url, serviceKey);

  console.log("Checking Supabase...");

  for (const email of adminEmails) {
    const { data: authData, error: authErr } = await admin.auth.admin.listUsers();
    if (authErr) throw authErr;

    const authUser = authData.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!authUser) {
      console.log(`❌ No auth account for ${email} — sign up in the app first`);
      continue;
    }

    const { data: profile, error: upsertErr } = await admin
      .from("users")
      .upsert(
        {
          id: authUser.id,
          email: authUser.email,
          role: "admin",
          balance_usd: 100,
        },
        { onConflict: "id" }
      )
      .select()
      .single();

    if (upsertErr) {
      console.log(`❌ Failed for ${email}:`, upsertErr.message);
      continue;
    }

    console.log(`✅ Admin profile ready for ${email}`);
    console.log(`   id: ${profile.id}`);
    console.log(`   role: ${profile.role}`);
    console.log(`   balance: $${profile.balance_usd}`);
  }

  console.log("\nDone. Restart dev server, sign out, sign in, then check /admin");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
