import { Router } from "express";
import { supabase, createAuthClient } from "../utils/supabase.js";
import { check, httpError, MIN_PASSWORD, PENDING, VERIFIED } from "../utils/helpers.js";
import { ACCOUNT_SELECT, ADMIN_WEIGHT, STAFF_WEIGHT, SUPER_WEIGHT, invalidateAccount, requireAuth } from "../middleware/auth.js";
import { standingFields, standingOf } from "./moderation.js";

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
  is_super: (a.roles?.weight ?? 0) >= SUPER_WEIGHT,
  is_owner: (a.roles?.weight ?? 0) >= ADMIN_WEIGHT,
  must_change_password: Boolean(a.must_change_password),
});

// toMe + the account's moderation standing (deactivation, active warnings, latest appeal)
export const toMeWithStanding = async (a) => {
  const me = toMe(a);
  if (me.is_staff) return { ...me, ...standingFields({}, null) };
  const standing = (await standingOf([a]))[a.account_id];
  return { ...me, ...standingFields(a, standing) };
};

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
  if (password.length < MIN_PASSWORD) {
    throw httpError(400, `Use a password with at least ${MIN_PASSWORD} characters.`);
  }

  // Location IDs are 10-digit codes that start with 0, so keep them as strings (never Number()).
  const brgyId = String(brgy_id ?? "").trim();
  if (!/^\d{10}$/.test(brgyId)) throw httpError(400, "Please choose your barangay.");

  const barangay = check(
    await supabase.from("barangays").select("brgy_id").eq("brgy_id", brgyId).maybeSingle(),
  );
  if (!barangay) throw httpError(400, "That barangay doesn't exist.");

  const cleanEmail = email.trim().toLowerCase();
  const { data, error } = await supabase.auth.admin.createUser({
    email: cleanEmail,
    password,
    email_confirm: true,
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
      brgy_id: brgyId,
      role_id: RESIDENT_ROLE_ID,
    },
    { onConflict: "account_id" },
  );
  if (profileError) {
    await supabase.auth.admin.deleteUser(data.user.id);
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

router.get("/me", requireAuth, async (req, res) => {
  res.json(await toMeWithStanding(req.account));
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
  res.json(await toMeWithStanding(updated));
});

// Change Password: needs the current (temporary) password first, then the new one.
//                  This is also what clears "must_change_password" after a reset by the Super Admin.
router.post("/change-password", requireAuth, async (req, res) => {
  const { current_password, new_password } = req.body ?? {};
  if (!current_password || !new_password) throw httpError(400, "Please fill in every field.");
  if (new_password.length < MIN_PASSWORD) {
    throw httpError(400, `Use a password with at least ${MIN_PASSWORD} characters.`);
  }
  if (new_password === current_password) {
    throw httpError(400, "Your new password must be different from the temporary password.");
  }

  // Check the current password the same way a log in does. 400, not 401: a wrong password is not an expired session.
  const attempt = await createAuthClient().auth.signInWithPassword({
    email: req.account.email,
    password: current_password,
  });
  if (attempt.error || !attempt.data.session) throw httpError(400, "The temporary password is incorrect.");

  const { error } = await supabase.auth.admin.updateUserById(req.account.account_id, { password: new_password });
  if (error) throw httpError(400, `Couldn't change the password: ${error.message}`);

  check(
    await supabase
      .from("accounts")
      .update({ must_change_password: false })
      .eq("account_id", req.account.account_id)
      .select("account_id"),
  );
  invalidateAccount(req.account.account_id);
  res.json(await signIn(req.account.email, new_password)); // fresh tokens for the new password
});

export default router;