import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const publicKey = process.env.SUPABASE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;

if (!url || !publicKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_KEY in server/.env");
}
if (!serviceKey) {
  console.warn(
    "SUPABASE_SERVICE_KEY is not set. Sign-up and most writes will fail until you add it to server/.env",
  );
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };

// Supabase: The Shared Client for all thoughout the system
export const supabase = createClient(url, serviceKey || publicKey, options);

// Safety Net (for now): Fresh client for ever login/refresh, so no leaks happen to our shared client.
export const createAuthClient = () => createClient(url, publicKey, options);