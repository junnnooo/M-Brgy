import { Router } from "express";
import { supabase, createAuthClient } from "../utils/supabase.js";
import { check, httpError, PENDING, VERIFIED } from "../utils/helpers.js";
import { ACCOUNT_SELECT, STAFF_WEIGHT, requireAuth } from "../middleware/auth.js";

const router = Router();
const RESIDENT_ROLE_ID = 1;

export const toMe = (a) => ({
  id: a.account_id,
  first_name: a.first_name,
  middle_name: a.middle_name ?? "",
  last_name: a.last_name,
  email: a.email,
  address: a.address ?? "",
  contact_number: a.contact_number ?? "",
  verified: a.verification_status === VERIFIED,
  brgy_id: a.brgy_id,
  barangay: a.barangays ?? null,
  role: a.roles?.role_name ?? "",
  is_staff: (a.roles?.weight ?? 0) >= STAFF_WEIGHT,
});

const tokens = (session) => ({
  access_token: session.access_token,
  refresh_token: session.refresh_token,
});

async function signIn(email, password) {
  const { data, error } = await createAuthClient().auth.signInWithPassword({ email, password });
  if (error || !data.session) throw httpError(401, "Incorrect email or password.");
  return tokens(data.session);
}

router.post("/signup", async (req, res) => {
  const { first_name, last_name, email, password, brgy_id } = req.body ?? {};
  if (!first_name?.trim() || !last_name?.trim() || !email?.trim() || !password) {
    throw httpError(400, "Please fill in every field.");
  }
  if (password.length < 6) throw httpError(400, "Use a password with at least 6 characters.");
  if (!Number.isInteger(Number(brgy_id))) throw httpError(400, "Please choose your barangay.");

  const cleanEmail = email.trim().toLowerCase();
  const { data, error } = await supabase.auth.admin.createUser({
    email: cleanEmail,
    password,
    email_confirm: true, // skip the confirmation email; the real check is on-site verification
  });
  if (error) {
    const exists = error.code === "email_exists" || /already/i.test(error.message);
    throw httpError(400, exists ? "An account with this email already exists. Log in instead." : error.message);
  }

  // upsert, not insert: a database trigger on auth.users may already have created this row
  const { error: profileError } = await supabase.from("accounts").upsert(
    {
      account_id: data.user.id,
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      email: cleanEmail,
      address: "",
      contact_number: "",
      verification_status: PENDING,
      brgy_id: Number(brgy_id),
      role_id: RESIDENT_ROLE_ID,
    },
    { onConflict: "account_id" },
  );
  if (profileError) {
    await supabase.auth.admin.deleteUser(data.user.id); // don't leave a login with no profile
    throw httpError(400, `Couldn't create your profile: ${profileError.message}`);
  }

  res.status(201).json(await signIn(cleanEmail, password));
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) throw httpError(400, "Enter your email and password.");
  res.json(await signIn(email.trim().toLowerCase(), password));
});

router.post("/refresh", async (req, res) => {
  const { refresh_token } = req.body ?? {};
  if (!refresh_token) throw httpError(400, "Missing refresh token.");
  const { data, error } = await createAuthClient().auth.refreshSession({ refresh_token });
  if (error || !data.session) throw httpError(401, "Your session has expired. Please log in again.");
  res.json(tokens(data.session));
});

router.get("/me", requireAuth, (req, res) => {
  res.json(toMe(req.account));
});

router.patch("/me", requireAuth, async (req, res) => {
  const { first_name, middle_name, last_name, address, contact_number } = req.body ?? {};
  if (!first_name?.trim() || !last_name?.trim()) {
    throw httpError(400, "First and last name are required.");
  }
  const updated = check(
    await supabase
      .from("accounts")
      .update({
        first_name: first_name.trim(),
        middle_name: middle_name?.trim() || null,
        last_name: last_name.trim(),
        address: address?.trim() ?? "",
        contact_number: contact_number?.trim() ?? "",
      })
      .eq("account_id", req.account.account_id)
      .select(ACCOUNT_SELECT)
      .single(),
  );
  res.json(toMe(updated));
});

export default router;