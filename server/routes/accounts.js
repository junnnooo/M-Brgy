import { Router } from "express";
import { supabase } from "../utils/supabase.js";
import {
  accountsById, canTouchBarangay, check, fullName, httpError, numericId, PENDING, PLACE_SELECT, placeOf, VERIFIED,
  scopeToBarangay, toDay,
} from "../utils/helpers.js";
import { invalidateAccount, requireAuth, requireSection, requireStaff } from "../middleware/auth.js";
import { notifyAccount } from "../utils/notify.js";
import { MAX_WARNINGS, standingFields, standingOf } from "./moderation.js";

const router = Router();
const RESIDENT_ROLE_ID = 1;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// The staff list only shows these; everything else on the row is not downloaded.
const LIST_COLUMNS =
  "account_id, first_name, middle_name, last_name, email, address, contact_number, verification_status, deactivated_at, deactivation_reason";

const toProfile = (a, standing) => ({
  id: a.account_id,
  name: fullName(a),
  email: a.email,
  address: a.address ?? "",
  contact: a.contact_number ?? "",
  verified: a.verification_status === VERIFIED,
  ...standingFields(a, standing),
});

const profileOf = async (account) => toProfile(account, (await standingOf([account]))[account.account_id]);

// A resident of the staff member's barangay, or a 404
async function residentFor(req, columns = "*") {
  if (!UUID.test(String(req.params.id))) throw httpError(404, "Resident not found."); // not an id at all
  const account = check(
    await supabase
      .from("accounts")
      .select(columns)
      .eq("account_id", req.params.id)
      .eq("role_id", RESIDENT_ROLE_ID)
      .is("deleted_at", null)
      .maybeSingle(),
  );
  if (!account || !canTouchBarangay(req.account, account.brgy_id)) throw httpError(404, "Resident not found.");
  return account;
}

// A warning that stops counting is cleared, not erased (it stays in the history until staff delete it there).
// cleared_by / cleared_reason say who and why: 'reactivated' (the account was reactivated) or 'lifted' (staff lifted it).
// Databases from before 3.0.0-d don't have those two columns yet: they only get cleared_at.
async function clearWarnings(apply, byId, reason) {
  const now = new Date().toISOString();
  let result = await apply({ cleared_at: now, cleared_by: byId, cleared_reason: reason });
  if (result.error) result = await apply({ cleared_at: now });
  return check(result);
}

function cleanReason(value, min = 5) {
  const reason = typeof value === "string" ? value.trim() : "";
  if (reason.length < min) throw httpError(400, `Please write a reason (at least ${min} characters).`);
  return reason.slice(0, 300);
}

async function deactivate(account, reason) {
  const updated = check(
    await supabase
      .from("accounts")
      .update({ deactivated_at: new Date().toISOString(), deactivation_reason: reason })
      .eq("account_id", account.account_id)
      .select()
      .single(),
  );
  invalidateAccount(account.account_id); // the resident is blocked on their very next request
  return updated;
}

// Staff: resident accounts in their barangay (accounts deleted by the Super Admin are not listed)
router.get("/", requireAuth, requireStaff, requireSection("residents"), async (req, res) => {
  const query = scopeToBarangay(
    supabase.from("accounts").select(LIST_COLUMNS).eq("role_id", RESIDENT_ROLE_ID).is("deleted_at", null).order("created_at", { ascending: false }),
    req.account,
  );
  const rows = check(await query);
  const standing = await standingOf(rows);
  res.json(rows.map((a) => toProfile(a, standing[a.account_id])));
});

// Staff: the full details of ONE resident (the ">" at the far right of a resident row): the account, where they
// live, their standing (verification, deactivation, active warnings, appeal) and how much they used the portal.
router.get("/:id", requireAuth, requireStaff, requireSection("residents"), async (req, res) => {
  const account = await residentFor(req, `*, ${PLACE_SELECT}`);
  const countOf = async (table, column) => {
    const { count, error } = await supabase
      .from(table)
      .select(column, { count: "exact", head: true })
      .eq(column, account.account_id);
    if (error) throw httpError(500, error.message);
    return count ?? 0;
  };
  const [profile, requests, reports] = await Promise.all([
    profileOf(account),
    countOf("requests", "submitted_by"),
    countOf("reports", "account_id"),
  ]);
  res.json({
    ...profile,
    first_name: account.first_name,
    middle_name: account.middle_name ?? "",
    last_name: account.last_name,
    created: toDay(account.created_at),
    verified_at: toDay(account.verified_at),
    brgy_id: account.brgy_id,
    ...placeOf(account),
    requests_count: requests,
    reports_count: reports,
  });
});

// Staff: the whole warning history of a resident: the active warnings and the ones that were cleared
// (when the account was reactivated), oldest first, with who sent each one.
router.get("/:id/warnings", requireAuth, requireStaff, requireSection("residents"), async (req, res) => {
  const account = await residentFor(req);
  const load = (columns) =>
    supabase
      .from("account_warnings")
      .select(columns)
      .eq("account_id", account.account_id)
      .order("issued_at")
      .order("warning_id");
  let result = await load("warning_id, reason, issued_at, issued_by, seen_at, cleared_at, cleared_by, cleared_reason");
  if (result.error) result = await load("warning_id, reason, issued_at, issued_by, seen_at, cleared_at"); // before 3.0.0-d
  const rows = check(result);

  const people = await accountsById(rows.flatMap((w) => [w.issued_by, w.cleared_by]));
  res.json(
    rows.map((w) => ({
      id: w.warning_id,
      reason: w.reason,
      date: toDay(w.issued_at),
      issued_by: fullName(people[w.issued_by]),
      seen: Boolean(w.seen_at),
      status: !w.cleared_at ? "Active" : ["lifted", "deleted"].includes(w.cleared_reason) ? "Lifted" : "Cleared",
      cleared: toDay(w.cleared_at),
      cleared_by: fullName(people[w.cleared_by]),
    })),
  );
});

// Staff: lift a warning (for example it was a mistake). It is not erased: it stays in the history as "Lifted"
// (who and when), it stops counting toward the 3 and the resident is told. This does NOT reactivate a
// deactivated account: use Reactivate for that.
router.post("/:id/warnings/:warningId/lift", requireAuth, requireStaff, requireSection("residents"), async (req, res) => {
  const account = await residentFor(req);
  const warningId = numericId(req.params.warningId, "Warning");

  const lifted = await clearWarnings(
    (fields) =>
      supabase
        .from("account_warnings")
        .update(fields)
        .eq("warning_id", warningId)
        .eq("account_id", account.account_id)
        .is("cleared_at", null) // only an active warning, and only once
        .select("warning_id"),
    req.account.account_id,
    "lifted",
  );
  if (!lifted.length) throw httpError(404, "That warning wasn't found, or it was already cleared.");

  const profile = await profileOf(account);
  await notifyAccount(
    account.account_id,
    `A warning was lifted from your account. You now have ${profile.warnings.length} of ${MAX_WARNINGS} warnings.`,
  );
  res.json(profile);
});

// Staff: delete a warning from the history for good. Only a warning that is no longer active (Lifted or Cleared)
// can be deleted: lift an active one first. This cannot be undone.
router.delete("/:id/warnings/:warningId", requireAuth, requireStaff, requireSection("residents"), async (req, res) => {
  const account = await residentFor(req);
  const warningId = numericId(req.params.warningId, "Warning");

  const gone = check(
    await supabase
      .from("account_warnings")
      .delete()
      .eq("warning_id", warningId)
      .eq("account_id", account.account_id)
      .not("cleared_at", "is", null)
      .select("warning_id"),
  );
  if (!gone.length) {
    const still = check(
      await supabase
        .from("account_warnings")
        .select("warning_id, cleared_at")
        .eq("warning_id", warningId)
        .eq("account_id", account.account_id)
        .maybeSingle(),
    );
    if (still && !still.cleared_at) throw httpError(400, "This warning is still active. Lift it first, then it can be deleted.");
    throw httpError(404, "That warning wasn't found.");
  }
  res.status(204).end();
});

// Resident: send an appeal while deactivated
router.post("/me/appeal", requireAuth, async (req, res) => {
  if (!req.isDeactivated) throw httpError(400, "Only deactivated accounts can send an appeal.");
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (message.length < 10) throw httpError(400, "Please explain your appeal (at least 10 characters).");

  const current = (await standingOf([req.account]))[req.account.account_id];
  if (current.appeal?.status === "Pending") throw httpError(400, "You already have an appeal waiting for review.");

  check(
    await supabase
      .from("account_appeals")
      .insert({ account_id: req.account.account_id, message: message.slice(0, 500) })
      .select("appeal_id")
      .single(),
  );
  res.status(201).json({ appeal: (await standingOf([req.account]))[req.account.account_id].appeal });
});

// Resident: "I understand" on the warning pop-up
router.post("/me/warnings/seen", requireAuth, async (req, res) => {
  check(
    await supabase
      .from("account_warnings")
      .update({ seen_at: new Date().toISOString() })
      .eq("account_id", req.account.account_id)
      .is("cleared_at", null)
      .is("seen_at", null)
      .select("warning_id"),
  );
  res.status(204).end();
});

router.patch("/:id/verification", requireAuth, requireStaff, requireSection("residents"), async (req, res) => {
  const { verified } = req.body ?? {};
  if (typeof verified !== "boolean") throw httpError(400, "Send { verified: true } or { verified: false }.");

  const existing = check(
    await supabase
      .from("accounts")
      .select("account_id, brgy_id, verification_status")
      .eq("account_id", req.params.id)
      .is("deleted_at", null)
      .maybeSingle(),
  );
  if (!existing || !canTouchBarangay(req.account, existing.brgy_id)) {
    throw httpError(404, "Resident not found.");
  }

  const updated = check(
    await supabase
      .from("accounts")
      .update({
        verification_status: verified ? VERIFIED : PENDING,
        verified_at: verified ? new Date().toISOString() : null,
      })
      .eq("account_id", existing.account_id)
      .select()
      .single(),
  );
  
// New verification status: applies on their next request
  invalidateAccount(existing.account_id); 

  if ((existing.verification_status === VERIFIED) !== verified) {
    await notifyAccount(
      existing.account_id,
      verified
        ? "Your resident account has been verified. You can now request documents."
        : "Your resident verification was revoked. Please visit the barangay hall.",
    );
  }
  res.json(await profileOf(updated));
});

// Staff: send a warning. The MAX_WARNINGS-th active warning deactivates the account automatically.
router.post("/:id/warnings", requireAuth, requireStaff, requireSection("residents"), async (req, res) => {
  const account = await residentFor(req);
  if (account.deactivated_at) throw httpError(400, "This account is already deactivated.");
  const reason = cleanReason(req.body?.reason);

  check(
    await supabase
      .from("account_warnings")
      .insert({ account_id: account.account_id, reason, issued_by: req.account.account_id })
      .select("warning_id")
      .single(),
  );
  const { warnings } = (await standingOf([account]))[account.account_id];
  const n = warnings.length;

  let current = account;
  if (n >= MAX_WARNINGS) {
    const why = `Reached ${MAX_WARNINGS} of ${MAX_WARNINGS} warnings. Latest warning: ${reason}`;
    current = await deactivate(account, why);
    await notifyAccount(account.account_id, `Account deactivated. ${why}`);
  } else {
    await notifyAccount(
      account.account_id,
      `Account warning ${n} of ${MAX_WARNINGS}: ${reason} — ${MAX_WARNINGS - n} more warning(s) will deactivate your account.`,
    );
  }
  res.status(201).json(await profileOf(current));
});

router.post("/:id/deactivate", requireAuth, requireStaff, requireSection("residents"), async (req, res) => {
  const account = await residentFor(req);
  if (account.deactivated_at) throw httpError(400, "This account is already deactivated.");
  const reason = cleanReason(req.body?.reason);

  const updated = await deactivate(account, reason);
  await notifyAccount(account.account_id, `Account deactivated. ${reason}`);
  res.json(await profileOf(updated));
});

// Restores the account, clears its warnings (kept in the table as history) and approves a pending appeal.
router.post("/:id/reactivate", requireAuth, requireStaff, requireSection("residents"), async (req, res) => {
  const account = await residentFor(req);
  if (!account.deactivated_at) throw httpError(400, "This account isn't deactivated.");
  const now = new Date().toISOString();

  const updated = check(
    await supabase
      .from("accounts")
      .update({ deactivated_at: null, deactivation_reason: null })
      .eq("account_id", account.account_id)
      .select()
      .single(),
  );
  invalidateAccount(account.account_id); // Reactivated: lifts the block on their next request
  await clearWarnings(
    (fields) =>
      supabase
        .from("account_warnings")
        .update(fields)
        .eq("account_id", account.account_id)
        .is("cleared_at", null)
        .select("warning_id"),
    req.account.account_id,
    "reactivated",
  );
  check(
    await supabase
      .from("account_appeals")
      .update({ status: "Approved", responded_at: now, responded_by: req.account.account_id })
      .eq("account_id", account.account_id)
      .eq("status", "Pending")
      .select("appeal_id"),
  );
  await notifyAccount(
    account.account_id,
    "Your resident account has been restored and your warnings were cleared. Please follow the barangay rules.",
  );
  res.json(await profileOf(updated));
});

router.post("/:id/appeal/deny", requireAuth, requireStaff, requireSection("residents"), async (req, res) => {
  const account = await residentFor(req);
  const reason = cleanReason(req.body?.reason);

  const pending = check(
    await supabase
      .from("account_appeals")
      .select("appeal_id")
      .eq("account_id", account.account_id)
      .eq("status", "Pending")
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
  if (!pending) throw httpError(400, "There is no pending appeal to deny.");

  check(
    await supabase
      .from("account_appeals")
      .update({
        status: "Denied",
        response: reason,
        responded_at: new Date().toISOString(),
        responded_by: req.account.account_id,
      })
      .eq("appeal_id", pending.appeal_id)
      .select("appeal_id")
      .single(),
  );
  await notifyAccount(account.account_id, `Appeal denied. ${reason}`);
  res.json(await profileOf(account));
});

export default router;