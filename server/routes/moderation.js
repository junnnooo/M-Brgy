import { supabase } from "../utils/supabase.js";
import { check, toDay } from "../utils/helpers.js";

export const MAX_WARNINGS = 3;
export const MAX_ACTIVE = 3;

export const LIVE_REQUEST_STATUSES = ["Pending", "Approved", "Ready for Pickup"];
export const LIVE_REPORT_STATUSES = ["Submitted", "Received", "In Progress"];

// Documents allowed in one submission. Barangay 1 to 8 allow 2, every other barangay allows 3.
// The number is read from the barangay name, e.g. "Lantic (Barangay 13)".
export function docLimitFor(brgyName) {
  const n = Number(String(brgyName ?? "").match(/barangay\s*(\d+)/i)?.[1]);
  return n >= 1 && n <= 8 ? 2 : 3;
}

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

const CHUNK = 100;
const chunks = (list, size = CHUNK) =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

// Better Loading: Runs one query per chunk, all at the same time, and joins the rows (each account is in exactly one chunk,
//                 so the order of its own rows is kept).
const inParts = async (ids, run) => (await Promise.all(chunks(ids).map(run))).flatMap((result) => check(result));

export async function standingOf(accounts) {
  const list = accounts.filter(Boolean);
  const out = Object.fromEntries(list.map((a) => [a.account_id, { warnings: [], appeal: null }]));
  if (!list.length) return out;

  // Appeal Panel: An appeal is only ever shown for a deactivated account, and only if it was sent after the deactivation.
  //               So only those accounts are asked about, and appeals older than the earliest deactivation are never downloaded.
  const deactivated = list.filter((a) => a.deactivated_at);
  const since = Object.fromEntries(deactivated.map((a) => [a.account_id, a.deactivated_at]));
  const earliest = deactivated.length
    ? new Date(Math.min(...deactivated.map((a) => new Date(a.deactivated_at).getTime()))).toISOString()
    : null;

  const [warnings, appeals] = await Promise.all([
    inParts(
      list.map((a) => a.account_id),
      (ids) =>
        supabase
          .from("account_warnings")
          .select("warning_id, account_id, reason, issued_at, seen_at")
          .in("account_id", ids)
          .is("cleared_at", null)
          .order("issued_at")
          .order("warning_id"),
    ),
    inParts(
      deactivated.map((a) => a.account_id),
      (ids) =>
        supabase
          .from("account_appeals")
          .select("appeal_id, account_id, message, submitted_at, status, response")
          .in("account_id", ids)
          .gte("submitted_at", earliest)
          .order("submitted_at", { ascending: false })
          .order("appeal_id", { ascending: false }),
    ),
  ]);

  for (const w of warnings) out[w.account_id].warnings.push(toWarning(w));
  for (const ap of appeals) {
    const slot = out[ap.account_id];
    if (slot.appeal || !since[ap.account_id]) continue;
    if (new Date(ap.submitted_at) < new Date(since[ap.account_id])) continue;
    slot.appeal = toAppeal(ap);
  }
  return out;
}

export const standingFields = (account, standing) => ({
  deactivated: isDeactivated(account),
  deactivation_reason: account.deactivation_reason ?? "",
  deactivated_at: toDay(account.deactivated_at),
  warnings: standing?.warnings ?? [],
  appeal: standing?.appeal ?? null,
});