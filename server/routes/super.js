import { Router } from "express";
import { randomInt } from "node:crypto";
import { supabase } from "../utils/supabase.js";
import { PLACE_SELECT, VERIFIED, check, fullName, httpError, placeOf, toDay } from "../utils/helpers.js";
import { invalidateAccount, requireAuth, requireSuper } from "../middleware/auth.js";
import { notifyAccount } from "../utils/notify.js";

// Super Admin only (the "Admin" role). Account modification: list, create staff, reset password, delete.
// A Super Admin works inside their own barangay only. Only the Owner (req.isAdmin) sees every barangay.
const router = Router();
const RESIDENT_ROLE_ID = 1;
const STAFF_ROLE_ID = 2;
const LIMIT = 100;
const BAN_FOREVER = "876000h"; // about 100 years: a deleted login can never be used again
// What the accounts table shows as the email of a deleted account. The database function
// purge_deleted_logins() looks for it, so a deleted login can be removed from the auth table.
const DELETED_EMAIL = "Deleted Account";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Password: temporary one, no look-alike characters (I, l, O, 0, 1)
const TEMP_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const tempPassword = (length = 10) =>
  Array.from({ length }, () => TEMP_CHARS[randomInt(TEMP_CHARS.length)]).join("");

const LIST_COLUMNS =
  `account_id, first_name, middle_name, last_name, email, verification_status, deactivated_at, created_at, ${PLACE_SELECT}`;

const toRow = (a) => ({
  id: a.account_id,
  name: fullName(a),
  email: a.email,
  verified: a.verification_status === VERIFIED,
  deactivated: Boolean(a.deactivated_at),
  created: toDay(a.created_at),
  ...placeOf(a),
});

// Search: letters, numbers and email characters only, so it can never break the filter below
const cleanSearch = (value) =>
  String(value ?? "").trim().slice(0, 60).replace(/[^\p{L}\p{N}@.\-_ ]/gu, "");

// Barangay scope: the Owner can touch any barangay, a Super Admin only their own
const inScope = (req, brgyId) => req.isAdmin || (Boolean(req.account.brgy_id) && req.account.brgy_id === brgyId);

// A resident or staff account of this barangay that is not deleted, or a 404. Super Admins and the Owner can't be touched here.
async function targetFor(req) {
  const id = String(req.params.id);
  if (!UUID.test(id)) throw httpError(404, "Account not found.");
  const account = check(
    await supabase
      .from("accounts")
      .select("account_id, first_name, last_name, email, role_id, brgy_id, deleted_at")
      .eq("account_id", id)
      .maybeSingle(),
  );
  if (
    !account ||
    account.deleted_at ||
    ![RESIDENT_ROLE_ID, STAFF_ROLE_ID].includes(account.role_id) ||
    !inScope(req, account.brgy_id)
  ) {
    throw httpError(404, "Account not found.");
  }
  return account;
}

router.get("/accounts", requireAuth, requireSuper, async (req, res) => {
  const roleId = req.query.kind === "resident" ? RESIDENT_ROLE_ID : STAFF_ROLE_ID;
  const search = cleanSearch(req.query.search);

  let query = supabase
    .from("accounts")
    .select(LIST_COLUMNS, { count: "exact" })
    .eq("role_id", roleId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (search) query = query.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
  if (!req.isAdmin) {
    if (!req.account.brgy_id) throw httpError(403, "Your account has no barangay assigned.");
    query = query.eq("brgy_id", req.account.brgy_id);
  }

  const { data, error, count } = await query;
  if (error) throw httpError(500, error.message);
  res.json({ total: count ?? data.length, accounts: data.map(toRow) });
});

// Create staff account (super admin lng): this only ever creates a Staff account.
router.post("/staff", requireAuth, requireSuper, async (req, res) => {
  const { first_name, last_name, email, brgy_id } = req.body ?? {};
  if (!first_name?.trim() || !last_name?.trim() || !email?.trim()) {
    throw httpError(400, "Please fill in the first name, last name and email.");
  }
  // A Super Admin can only create staff for their own barangay (whatever the request says). The Owner picks one.
  if (!req.isAdmin && !req.account.brgy_id) throw httpError(403, "Your account has no barangay assigned.");
  const brgyId = req.isAdmin ? String(brgy_id ?? "").trim() : req.account.brgy_id;
  if (!/^\d{10}$/.test(brgyId)) throw httpError(400, "Please choose the barangay this staff member works in.");
  const barangay = check(
    await supabase.from("barangays").select("brgy_id").eq("brgy_id", brgyId).maybeSingle(),
  );
  if (!barangay) throw httpError(400, "That barangay doesn't exist.");

  const cleanEmail = email.trim().toLowerCase();
  const password = tempPassword();
  const { data, error } = await supabase.auth.admin.createUser({
    email: cleanEmail,
    password,
    email_confirm: true,
  });
  if (error) {
    const exists = error.code === "email_exists" || /already/i.test(error.message);
    throw httpError(400, exists ? "An account with this email already exists." : error.message);
  }

  // upsert, not insert: a database trigger on auth.users may already have created this row
  const { data: row, error: profileError } = await supabase
    .from("accounts")
    .upsert(
      {
        account_id: data.user.id,
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        email: cleanEmail,
        address: "",
        contact_number: "",
        verification_status: VERIFIED,
        verified_at: new Date().toISOString(),
        brgy_id: brgyId,
        role_id: STAFF_ROLE_ID,
        must_change_password: true,
      },
      { onConflict: "account_id" },
    )
    .select(LIST_COLUMNS)
    .single();
  if (profileError) {
    await supabase.auth.admin.deleteUser(data.user.id); // don't leave a login with no profile
    throw httpError(400, `Couldn't create the account: ${profileError.message}`);
  }
  res.status(201).json({ account: toRow(row), temp_password: password });
});

// Temporary reset password: the old password stops working right away. The new one is returned once,
//                           and the account has to change it at the next log in (must_change_password).
router.post("/accounts/:id/reset-password", requireAuth, requireSuper, async (req, res) => {
  const account = await targetFor(req);
  const password = tempPassword();

  const { error } = await supabase.auth.admin.updateUserById(account.account_id, { password });
  if (error) throw httpError(400, `Couldn't reset the password: ${error.message}`);

  check(
    await supabase.from("accounts").update({ must_change_password: true }).eq("account_id", account.account_id).select("account_id"),
  );
  if (account.role_id === RESIDENT_ROLE_ID) {
    await notifyAccount(
      account.account_id,
      "The barangay reset your account password. Please contact the barangay office for your temporary password. You will be asked to choose a new password when you log in.",
    );
  }
  invalidateAccount(account.account_id);
  res.json({ temp_password: password });
});

// Delete account: the login is closed and the email is freed (the person can sign up again), the address,
//                 contact and the private records are wiped. The row itself stays with the person's name (for the records) and
//                 the email "Deleted Account", so the requests, reports and updates that point to it stay in the barangay records.
//                 The closed login is then removed from the auth table by the database function purge_deleted_logins().
router.delete("/accounts/:id", requireAuth, requireSuper, async (req, res) => {
  const account = await targetFor(req);
  const id = account.account_id;
  const placeholder = `deleted-${id}@deleted.invalid`;

  const { error } = await supabase.auth.admin.updateUserById(id, {
    email: placeholder,
    email_confirm: true,
    ban_duration: BAN_FOREVER,
  });
  if (error) throw httpError(400, `Couldn't delete the account: ${error.message}`);

  check(
    await supabase
      .from("accounts")
      .update({
        email: DELETED_EMAIL, // the name stays for the records, the email is what marks the row as deleted
        address: "",
        contact_number: "",
        deleted_at: new Date().toISOString(),
      })
      .eq("account_id", id)
      .select("account_id"),
  );
  check(await supabase.from("notifications").delete().eq("account_id", id));
  check(await supabase.from("account_warnings").delete().eq("account_id", id));
  check(await supabase.from("account_appeals").delete().eq("account_id", id));

  invalidateAccount(id);

  // Remove the closed logins from the auth table. Best effort: the account is already blocked, so if the
  // function isn't installed yet (or fails) the banned login just stays until the next run.
  const { error: purgeError } = await supabase.rpc("purge_deleted_logins");
  if (purgeError) console.error("purge_deleted_logins:", purgeError.message);

  res.status(204).end();
});

export default router;
