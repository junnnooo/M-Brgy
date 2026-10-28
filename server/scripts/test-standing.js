// Offline regression test for Step 5. It never contacts Supabase: the two tables are replaced with
// in-memory fakes, so it is safe to run any time and needs no login or real data.
//
// It runs the OLD version of standingOf (copied below, as it was before Step 5) and the NEW one on the same
// data, and checks that the results are identical, while the new one makes fewer queries, at the same time.
//
// Run from the server folder:   node scripts/test-standing.js
// Expected: every line says PASS and the last line says "All checks passed".
import "dotenv/config";
import { supabase } from "../utils/supabase.js";
import { check as unwrap, toDay } from "../utils/helpers.js";
import { standingOf } from "../routes/moderation.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- fake tables ---------------------------------------------------------------------------------
const calls = []; // { table, ids, startedAt }
const tables = { account_warnings: [], account_appeals: [] };

function builder(table) {
  let wanted = null;
  const filters = [];
  const orders = [];
  let ids = [];
  const b = {
    select(cols) { wanted = cols === "*" ? null : cols.split(",").map((s) => s.trim()); return b; },
    in(col, values) { ids = values; filters.push((r) => values.includes(r[col])); return b; },
    is(col, v) { filters.push((r) => (r[col] ?? null) === v); return b; },
    gte(col, v) { filters.push((r) => new Date(r[col]) >= new Date(v)); return b; },
    order(col, opts = {}) { orders.push([col, opts.ascending === false ? -1 : 1]); return b; },
    then(resolve, reject) {
      calls.push({ table, ids, startedAt: Date.now() });
      sleep(25).then(() => {
        let rows = tables[table].filter((r) => filters.every((f) => f(r)));
        for (const [col, dir] of [...orders].reverse()) {
          rows = [...rows].sort((x, y) => (x[col] < y[col] ? -dir : x[col] > y[col] ? dir : 0));
        }
        // Only the selected columns come back, exactly like the real database
        const data = rows.map((r) => (wanted ? Object.fromEntries(wanted.map((c) => [c, r[c]])) : { ...r }));
        resolve({ data, error: null });
      }).catch(reject);
    },
  };
  return b;
}
supabase.from = (table) => builder(table);

// ---- the OLD standingOf, exactly as it was before Step 5 (kept here only for comparison) ---------
const toWarning = (w) => ({ id: w.warning_id, reason: w.reason, date: toDay(w.issued_at), seen: Boolean(w.seen_at) });
const toAppeal = (a) => ({ id: a.appeal_id, message: a.message, date: toDay(a.submitted_at), status: a.status, response: a.response ?? "" });

async function oldStandingOf(accounts) {
  const list = accounts.filter(Boolean);
  const out = Object.fromEntries(list.map((a) => [a.account_id, { warnings: [], appeal: null }]));
  if (!list.length) return out;
  const ids = list.map((a) => a.account_id);
  const warnings = unwrap(
    await supabase.from("account_warnings").select("*").in("account_id", ids).is("cleared_at", null).order("issued_at").order("warning_id"),
  );
  for (const w of warnings) out[w.account_id].warnings.push(toWarning(w));
  const appeals = unwrap(
    await supabase.from("account_appeals").select("*").in("account_id", ids).order("submitted_at", { ascending: false }).order("appeal_id", { ascending: false }),
  );
  const since = Object.fromEntries(list.map((a) => [a.account_id, a.deactivated_at]));
  for (const ap of appeals) {
    const slot = out[ap.account_id];
    if (slot.appeal || !since[ap.account_id]) continue;
    if (new Date(ap.submitted_at) < new Date(since[ap.account_id])) continue;
    slot.appeal = toAppeal(ap);
  }
  return out;
}

// ---- test data -----------------------------------------------------------------------------------
let n = 0;
const acct = (id, deactivated_at = null) => ({ account_id: id, deactivated_at });
const warn = (account_id, issued_at, over = {}) =>
  tables.account_warnings.push({ warning_id: ++n, account_id, reason: `reason ${n}`, issued_at, seen_at: null, cleared_at: null, ...over });
const appeal = (account_id, submitted_at, status = "Pending") =>
  tables.account_appeals.push({ appeal_id: ++n, account_id, message: `appeal ${n}`, submitted_at, status, response: null, responded_at: null });

const A = acct("A"); // never deactivated: 2 active warnings, 1 cleared
warn("A", "2026-09-01T10:00:00Z"); warn("A", "2026-09-02T10:00:00Z"); warn("A", "2026-08-01T10:00:00Z", { cleared_at: "2026-08-20T00:00:00Z" });
appeal("A", "2026-07-01T00:00:00Z", "Denied"); // an old appeal from a past deactivation: must be ignored

const B = acct("B", "2026-10-01T00:00:00Z"); // deactivated: an older appeal (ignored) + denied + newer pending
warn("B", "2026-09-20T10:00:00Z"); warn("B", "2026-09-25T10:00:00Z"); warn("B", "2026-09-30T10:00:00Z");
appeal("B", "2026-09-15T00:00:00Z", "Denied"); appeal("B", "2026-10-02T00:00:00Z", "Denied"); appeal("B", "2026-10-03T00:00:00Z", "Pending");

const C = acct("C", "2026-10-10T00:00:00Z"); // deactivated, no appeal at all
const D = acct("D"); // never deactivated, no warnings, an old ignored appeal
appeal("D", "2026-06-01T00:00:00Z", "Approved");
const E = acct("E", "2026-10-20T00:00:00Z"); // deactivated later than B; appeal submitted BEFORE the deactivation: ignored
appeal("E", "2026-10-19T00:00:00Z", "Pending");
warn("E", "2026-10-05T10:00:00Z", { seen_at: "2026-10-06T00:00:00Z" });
const F = acct("F", "2026-10-21T00:00:00Z"); // deactivated, appeal submitted AFTER: shown
appeal("F", "2026-10-22T00:00:00Z", "Pending");

// ---- tests ---------------------------------------------------------------------------------------
let failed = 0;
const pass = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const take = () => calls.splice(0, calls.length);

for (const [label, list] of [
  ["all six accounts together", [A, B, C, D, E, F]],
  ["only never-deactivated accounts", [A, D]],
  ["only deactivated accounts", [B, C, E, F]],
  ["a single account (a profile / /auth/me call)", [B]],
  ["an empty list", []],
  ["a list with a null entry", [A, null, B]],
]) {
  take();
  const before = await oldStandingOf(list);
  const oldCalls = take();
  const after = await standingOf(list);
  const newCalls = take();
  pass(`same result as before: ${label}`, same(before, after), `queries ${oldCalls.length} -> ${newCalls.length}`);
}

{
  take();
  await standingOf([A, D]);
  const c = take();
  pass("no appeals query at all when nobody is deactivated", c.length === 1 && c[0].table === "account_warnings", `queries=${c.map((x) => x.table).join(", ")}`);
}

{
  take();
  await standingOf([A, B]);
  const c = take();
  const gap = Math.abs(c[0].startedAt - c[1].startedAt);
  pass("warnings and appeals are fetched at the same time", c.length === 2 && gap < 15, `start gap ${gap} ms (one after the other would be 25+ ms)`);
}

{
  // 250 residents: ids are split so no single request carries a huge list
  const big = Array.from({ length: 250 }, (_, i) => acct(`big${i}`, i % 50 === 0 ? "2026-10-01T00:00:00Z" : null));
  for (let i = 0; i < 250; i += 7) warn(`big${i}`, "2026-09-10T10:00:00Z");
  for (let i = 0; i < 250; i += 50) appeal(`big${i}`, "2026-10-05T00:00:00Z");
  take();
  const before = await oldStandingOf(big);
  take();
  const after = await standingOf(big);
  const c = take();
  const biggest = Math.max(...c.map((x) => x.ids.length));
  pass("250 residents: same result as before", same(before, after));
  pass("250 residents: never more than 100 ids in one query", biggest <= 100, `largest=${biggest}, queries=${c.length}`);
}

console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll checks passed");
process.exitCode = failed ? 1 : 0;
