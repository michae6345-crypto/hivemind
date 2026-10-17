import "server-only";
import { createClient } from "@supabase/supabase-js";

// Server-only Supabase client. Prefers the secret key; falls back to the publishable key for the hackathon
// (tables are granted to anon; access rules are enforced in our API routes).
export function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL + key)");
  return createClient(url, key, { auth: { persistSession: false } });
}
