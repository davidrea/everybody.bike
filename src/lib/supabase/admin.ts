import { createClient } from "@supabase/supabase-js";

// Server-only admin client with service role key.
// NEVER import this from client-side code.
export function createAdminClient() {
  return createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
