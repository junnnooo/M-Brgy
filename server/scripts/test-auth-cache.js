// Offline test for the Step 4 auth cache.
// It never contacts Supabase: the two database calls are replaced with counters, so it is safe to run
// any time and needs no login or real data.
//
// Run from the server folder:   node scripts/test-auth-cache.js
// Expected: every line says PASS and the last line says "All checks passed".
import "dotenv/config";
import { supabase } from "../utils/supabase.js";
import { invalidateAccount, requireAuth } from "../middleware/auth.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const makeToken = (id, exp = Math.floor(Date.now() / 1000) + 3600) =>
  `${b64({ alg: "none" })}.${b64({ exp, sub: id })}.sig`;

// ---- fake database -------------------------------------------------------------------------------
let currentUser = "u0";
let getUserFails = false;
let accountRow = null;
let getUserCalls = 0;
let accountCalls = 0;

supabase.auth.getUser = async () => {
  getUserCalls++;
  await sleep(20);
  return getUserFails
    ? { data: null, error: new Error("invalid token") }
    : { data: { user: { id: currentUser } }, error: null };
};

supabase.from = (table) => {
  if (table !== "accounts") throw new Error(`unexpected table: ${table}`);
  accountCalls++;
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => {
      const snapshot = accountRow ? structuredClone(accountRow) : null; // what the database held when asked
      await sleep(20);
      return { data: snapshot, error: null };
    },
  };
  return chain;
};

// ---- helpers -------------------------------------------------------------------------------------
const row = (over = {}) => ({
  account_id: currentUser,
  first_name: "Test",
  verification_status: "Verified",
  deactivated_at: null,
  brgy_id: "0402104008",
  roles: { role_name: "Resident", weight: 1 },
  barangays: { brgy_name: "Lantic (Barangay 13)" },
  ...over,
});

function scenario(id, over) {
  currentUser = id;
  getUserFails = false;
  accountRow = row(over);
  getUserCalls = 0;
  accountCalls = 0;
  return makeToken(id);
}

async function call(token, baseUrl = "/api/requests") {
  const req = { headers: { authorization: `Bearer ${token}` }, baseUrl };
  await requireAuth(req, {}, () => {});
  return req;
}

const errorOf = async (p) => {
  try {
    await p;
    return null;
  } catch (e) {
    return e;
  }
};

let failed = 0;
const check = (name, condition, detail = "") => {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!condition) failed++;
};

// ---- tests ---------------------------------------------------------------------------------------
{
  const t = scenario("burst");
  await Promise.all(Array.from({ length: 8 }, () => call(t)));
  check("8 simultaneous requests share one token check and one account lookup",
    getUserCalls === 1 && accountCalls === 1, `getUser=${getUserCalls}, account=${accountCalls}`);

  for (let i = 0; i < 5; i++) await call(t);
  check("5 follow-up requests make no database calls at all",
    getUserCalls === 1 && accountCalls === 1, `getUser=${getUserCalls}, account=${accountCalls}`);

  const req = await call(t);
  req.account.first_name = "CHANGED BY A ROUTE";
  const next = await call(t);
  check("one request changing its account does not leak into the next request", next.account.first_name === "Test");
}

{
  const t = scenario("invalidate");
  const before = await call(t);
  accountRow = row({ deactivated_at: "2026-10-28T00:00:00Z" });
  const stale = await call(t);
  invalidateAccount("invalidate");
  const after = await call(t);
  check("a deactivated account is blocked on the very next request after invalidateAccount",
    before.isDeactivated === false && after.isDeactivated === true && accountCalls === 2,
    `account lookups=${accountCalls}`);
  check("the token check is NOT repeated after invalidateAccount", getUserCalls === 1, `getUser=${getUserCalls}`);
  check("(before invalidating, the cached copy is still served: that is what the 30 s window means)",
    stale.isDeactivated === false);
}

{
  const t = scenario("profile");
  await call(t); // warms the token cache
  await call(t, "/api/auth");
  await call(t, "/api/auth");
  await call(t, "/api/auth");
  check("/api/auth/* always reads the account fresh, but still reuses the token check",
    accountCalls === 4 && getUserCalls === 1, `getUser=${getUserCalls}, account=${accountCalls}`);
}

{
  const t = scenario("badtoken");
  getUserFails = true;
  const e1 = await errorOf(call(t));
  const e2 = await errorOf(call(t));
  check("a rejected token answers 401 with the same message as before",
    e1?.status === 401 && e1.message === "Your session has expired. Please log in again.");
  check("failures are never cached (the second attempt asks Supabase again)", e2?.status === 401 && getUserCalls === 2,
    `getUser=${getUserCalls}`);
}

{
  const t = scenario("noprofile");
  accountRow = null;
  const e1 = await errorOf(call(t));
  const e2 = await errorOf(call(t));
  check("a login with no account profile answers 403 and is not cached",
    e1?.status === 403 && e2?.status === 403 && accountCalls === 2, `account=${accountCalls}`);
}

{
  const none = await errorOf(requireAuth({ headers: {}, baseUrl: "/api/requests" }, {}, () => {}));
  check("no token answers 401 'Please log in.'", none?.status === 401 && none.message === "Please log in.");
}

{
  const t = scenario("admin", { roles: { role_name: "Admin", weight: 100 } });
  const req = await call(t);
  check("role flags still work (admin => staff + admin + not deactivated)",
    req.isStaff && req.isAdmin && !req.isDeactivated && req.isVerified);
}

{
  const t = makeToken("expiry", Math.floor(Date.now() / 1000) + 1);
  currentUser = "expiry";
  accountRow = row();
  getUserCalls = 0;
  accountCalls = 0;
  await call(t);
  await sleep(1300);
  await call(t);
  check("the cache never outlives the token's own expiry", getUserCalls === 2, `getUser=${getUserCalls}`);
}

{
  const t = scenario("race");
  const first = call(t); // starts loading
  await sleep(30); // token check done, account lookup in progress
  accountRow = row({ deactivated_at: "2026-10-28T00:00:00Z" });
  invalidateAccount("race"); // the account changes WHILE that lookup is running
  await first;
  const second = await call(t);
  check("an account changed during a running lookup is not cached with the old data",
    second.isDeactivated === true && accountCalls === 2, `account=${accountCalls}`);
}

console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll checks passed");
process.exitCode = failed ? 1 : 0;
