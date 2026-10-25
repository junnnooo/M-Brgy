import { supabase } from "../utils/supabase.js";
import { check, httpError, VERIFIED } from "../utils/helpers.js";

export const STAFF_WEIGHT = 50;
export const ADMIN_WEIGHT = 100;

export const ACCOUNT_SELECT =
  "*, roles(role_name, weight), barangays(brgy_name, address, office_hours)";

// Reads "Authorization: Bearer <supabase access token>", loads the account and role.
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw httpError(401, "Please log in.");

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    throw httpError(401, "Your session has expired. Please log in again.");
  }

  const account = check(
    await supabase
      .from("accounts")
      .select(ACCOUNT_SELECT)
      .eq("account_id", data.user.id)
      .maybeSingle(),
  );
  if (!account) throw httpError(403, "This login has no kaBRGY account profile.");

  const weight = account.roles?.weight ?? 0;
  req.account = account;
  req.isVerified = account.verification_status === VERIFIED;
  req.isStaff = weight >= STAFF_WEIGHT;
  req.isAdmin = weight >= ADMIN_WEIGHT;
  // Deactivated residents can still log in (to read the reason and appeal), but can't use the services.
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

// Use on routes that file something new (document request, concern report).
export function requireActiveAccount(req, res, next) {
  if (req.isDeactivated) {
    throw httpError(403, "Your account is deactivated. You can't submit new requests or reports.");
  }
  next();
}