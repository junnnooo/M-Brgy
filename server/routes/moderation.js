import { supabase } from "../utils/supabase.js";
import { check, toDay } from "../utils/helpers.js";

// Account moderation + per-resident limits (ported from the beta).
export const MAX_WARNINGS = 3; // the 3rd active warning deactivates the account
export const MAX_ACTIVE = 3; // active document requests / concern reports per resident

// Only in-progress items count; a final status frees a slot.
export const LIVE_REQUEST_STATUSES = ["Pending", "Approved", "Ready for Pickup"];
export const LIVE_REPORT_STATUSES = ["Submitted", "Received", "In Progress"];

// Documents allowed in one submission. Barangay 1 to 8 allow 2, every other barangay allows 3.
// The number is read from the barangay name, e.g. "Lantic (Barangay 13)".
export function docLimitFor(brgyName) {
  const n = Number(String(brgyName ?? "").match(/barangay\s*(\d+)/i)?.[1]);
  return n >= 1 && n <= 8 ? 2 : 3;
}

// A deactivated resident can still log in (to read the reason and appeal) but can't use the services.
export const isDeactivated = (account) => Boolean(account?.deactivated_at);

const toWarning = (w) => ({
  id: w.warning_id,
  reason: w.reason,
  date: toDay(w.issued_at),
  seen: Boolean(w.seen_at),
});

const toAppeal = (a) => ({
  id: a.appeal_id,
  message: a.message,
  date: toDay(a.submitted_at),
  status: a.status,
  response: a.response ?? "",
});

// { [accountId]: { warnings: [...active warnings], appeal: latest appeal of the current deactivation | null } }
export async function standingOf(accounts) {
  const list = accounts.filter(Boolean);
  const out = Object.fromEntries(list.map((a) => [a.account_id, { warnings: [], appeal: null }]));
  if (!list.length) return out;
  const ids = list.map((a) => a.account_id);

  const warnings = check(
    await supabase
      .from("account_warnings")
      .select("*")
      .in("account_id", ids)
      .is("cleared_at", null)
      .order("issued_at")
      .order("warning_id"),
  );
  for (const w of warnings) out[w.account_id].warnings.push(toWarning(w));

  const appeals = check(
    await supabase
      .from("account_appeals")
      .select("*")
      .in("account_id", ids)
      .order("submitted_at", { ascending: false })
      .order("appeal_id", { ascending: false }),
  );
  const since = Object.fromEntries(list.map((a) => [a.account_id, a.deactivated_at]));
  for (const ap of appeals) {
    const slot = out[ap.account_id];
    // newest first: keep the first one, and only if it belongs to the current deactivation
    if (slot.appeal || !since[ap.account_id]) continue;
    if (new Date(ap.submitted_at) < new Date(since[ap.account_id])) continue;
    slot.appeal = toAppeal(ap);
  }
  return out;
}

// The fields the client needs to render an account's standing
export const standingFields = (account, standing) => ({
  deactivated: isDeactivated(account),
  deactivation_reason: account.deactivation_reason ?? "",
  deactivated_at: toDay(account.deactivated_at),
  warnings: standing?.warnings ?? [],
  appeal: standing?.appeal ?? null,
});