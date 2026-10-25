import { Router } from "express";
import { supabase } from "../utils/supabase.js";
import {
  canTouchBarangay, check, fullName, httpError, PENDING, VERIFIED, scopeToBarangay,
} from "../utils/helpers.js";
import { requireAuth, requireStaff } from "../middleware/auth.js";
import { notifyAccount } from "../utils/notify.js";
import { MAX_WARNINGS, standingFields, standingOf } from "./moderation.js";

const router = Router();
const RESIDENT_ROLE_ID = 1;

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
async function residentFor(req) {
  const account = check(
    await supabase
      .from("accounts")
      .select("*")
      .eq("account_id", req.params.id)
      .eq("role_id", RESIDENT_ROLE_ID)
      .maybeSingle(),
  );
  if (!account || !canTouchBarangay(req.account, account.brgy_id)) throw httpError(404, "Resident not found.");
  return account;
}

function cleanReason(value, min = 5) {
  const reason = typeof value === "string" ? value.trim() : "";
  if (reason.length < min) throw httpError(400, `Please write a reason (at least ${min} characters).`);
  return reason.slice(0, 300);
}

async function deactivate(account, reason) {
  return check(
    await supabase
      .from("accounts")
      .update({ deactivated_at: new Date().toISOString(), deactivation_reason: reason })
      .eq("account_id", account.account_id)
      .select()
      .single(),
  );
}

// Staff: resident accounts in their barangay
router.get("/", requireAuth, requireStaff, async (req, res) => {
  const query = scopeToBarangay(
    supabase.from("accounts").select("*").eq("role_id", RESIDENT_ROLE_ID).order("created_at", { ascending: false }),
    req.account,
  );
  const rows = check(await query);
  const standing = await standingOf(rows);
  res.json(rows.map((a) => toProfile(a, standing[a.account_id])));
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

router.patch("/:id/verification", requireAuth, requireStaff, async (req, res) => {
  const { verified } = req.body ?? {};
  if (typeof verified !== "boolean") throw httpError(400, "Send { verified: true } or { verified: false }.");

  const existing = check(
    await supabase
      .from("accounts")
      .select("account_id, brgy_id, verification_status")
      .eq("account_id", req.params.id)
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
router.post("/:id/warnings", requireAuth, requireStaff, async (req, res) => {
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

router.post("/:id/deactivate", requireAuth, requireStaff, async (req, res) => {
  const account = await residentFor(req);
  if (account.deactivated_at) throw httpError(400, "This account is already deactivated.");
  const reason = cleanReason(req.body?.reason);

  const updated = await deactivate(account, reason);
  await notifyAccount(account.account_id, `Account deactivated. ${reason}`);
  res.json(await profileOf(updated));
});

// Restores the account, clears its warnings (kept in the table as history) and approves a pending appeal.
router.post("/:id/reactivate", requireAuth, requireStaff, async (req, res) => {
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
  check(
    await supabase
      .from("account_warnings")
      .update({ cleared_at: now })
      .eq("account_id", account.account_id)
      .is("cleared_at", null)
      .select("warning_id"),
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

router.post("/:id/appeal/deny", requireAuth, requireStaff, async (req, res) => {
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