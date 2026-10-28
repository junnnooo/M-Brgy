import { createHash } from "node:crypto";
import { supabase } from "../utils/supabase.js";
import { check, httpError, VERIFIED } from "../utils/helpers.js";

export const STAFF_WEIGHT = 50;
export const ADMIN_WEIGHT = 100;

export const ACCOUNT_SELECT =
  "*, roles(role_name, weight), barangays(brgy_name, address, office_hours)";
const TOKEN_TTL_MS = 60 * 1000;
const ACCOUNT_TTL_MS = 30 * 1000;
const MAX_ENTRIES = 5000;

const tokenCache = new Map();
const accountCache = new Map();
const tokenLookups = new Map();
const accountLookups = new Map();
const versions = new Map();

const hashToken = (token) => createHash("sha256").update(token).digest("base64url");

// The token was already validated by Supabase; this only reads its expiry so we never trust it for longer.
function tokenExpiryMs(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    return typeof payload.exp === "number" ? payload.exp * 1000 : Infinity;
  } catch {
    return Infinity;
  }
}

function fresh(map, key) {
  const hit = map.get(key);
  if (!hit) return null;
  if (hit.expires > Date.now()) return hit;
  map.delete(key);
  return null;
}

function remember(map, key, value) {
  if (map.size >= MAX_ENTRIES) {
    const now = Date.now();
    for (const [k, v] of map) if (v.expires <= now) map.delete(k);
    if (map.size >= MAX_ENTRIES) map.delete(map.keys().next().value);
  }
  map.delete(key);
  map.set(key, value);
}

function shared(inFlight, key, load) {
  const running = inFlight.get(key);
  if (running) return running;
  const p = load().finally(() => {
    if (inFlight.get(key) === p) inFlight.delete(key);
  });
  inFlight.set(key, p);
  return p;
}

const loadAccount = async (userId) =>
  check(await supabase.from("accounts").select(ACCOUNT_SELECT).eq("account_id", userId).maybeSingle());

function userIdFor(token, key) {
  const hit = fresh(tokenCache, key);
  if (hit) return hit.userId;
  return shared(tokenLookups, key, async () => {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      throw httpError(401, "Your session has expired. Please log in again.");
    }
    const expires = Math.min(Date.now() + TOKEN_TTL_MS, tokenExpiryMs(token));
    remember(tokenCache, key, { userId: data.user.id, expires });
    return data.user.id;
  });
}

async function accountFor(userId, skipCache) {
  if (skipCache) {
    accountCache.delete(userId);
    return loadAccount(userId);
  }
  const hit = fresh(accountCache, userId);
  if (hit) return hit.account;

  return shared(accountLookups, userId, async () => {
    const version = versions.get(userId) ?? 0;
    const account = await loadAccount(userId);
    if (account && (versions.get(userId) ?? 0) === version) {
      remember(accountCache, userId, { account, expires: Date.now() + ACCOUNT_TTL_MS });
    }
    return account;
  });
}

// Call this right after the app changes an account row (verification, deactivation, reactivation),
// so the very next request from that person sees the change.
export function invalidateAccount(accountId) {
  if (!accountId) return;
  versions.set(accountId, (versions.get(accountId) ?? 0) + 1);
  accountCache.delete(accountId);
  accountLookups.delete(accountId);
}

// Reads "Authorization: Bearer <supabase access token>", loads the account and role.
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw httpError(401, "Please log in.");

  const userId = await userIdFor(token, hashToken(token));
  const cached = await accountFor(userId, req.baseUrl === "/api/auth");
  if (!cached) throw httpError(403, "This login has no kaBRGY account profile.");

  const account = structuredClone(cached); // this request's own copy
  const weight = account.roles?.weight ?? 0;
  req.account = account;
  req.isVerified = account.verification_status === VERIFIED;
  req.isStaff = weight >= STAFF_WEIGHT;
  req.isAdmin = weight >= ADMIN_WEIGHT;
  req.isDeactivated = !req.isStaff && Boolean(account.deactivated_at);
  next();
}

export function requireStaff(req, res, next) {
  if (!req.isStaff) throw httpError(403, "Barangay staff access only.");
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.isAdmin) throw httpError(403, "Admin access only.");
  next();
}

export function requireActiveAccount(req, res, next) {
  if (req.isDeactivated) {
    throw httpError(403, "Your account is deactivated. You can't submit new requests or reports.");
  }
  next();
}