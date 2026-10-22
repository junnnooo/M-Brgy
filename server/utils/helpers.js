import { supabase } from "./supabase.js";

export const VERIFIED = "Verified";
export const PENDING = "Pending";

// HTTP: Error helper to throw an error with a status code and message. 
//       This is used in the check function to throw errors from Supabase queries.
export const httpError = (status, message) =>
  Object.assign(new Error(message), { status });

// Supabase: Unwraps a Supabase data and error results or throws
export function check({ data, error }) {
  if (error) throw httpError(500, error.message);
  return data;
}

// Numeric ID: Validates that a value is a positive integer and returns it, or throws a 404 error if not.
export function numericId(value, label = "Record") {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw httpError(404, `${label} not found.`);
  return n;
}

// Full Name: Returns the full name of a person from their first, middle, and last names, or an empty string if not provided.
export const fullName = (a) =>
  a ? [a.first_name, a.middle_name, a.last_name].filter(Boolean).join(" ") : "";

// Date: Returns the date part of a timestamp string in YYYY-MM-DD format, or an empty string if not provided.
export const toDay = (ts) => (ts ? String(ts).slice(0, 10) : "");

// Time: Returns a formatted time string in 12-hour format with AM/PM, or an empty string if not provided.
export function formatTime(t) {
  if (!t) return "";
  const [h, m] = String(t).split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}


// Accounts by ID: Fetches account details for a list of account IDs and returns 
//                 an object mapping account IDs to account details.
export async function accountsById(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};
  const rows = check(
    await supabase
      .from("accounts")
      .select("account_id, first_name, middle_name, last_name, email, contact_number")
      .in("account_id", unique),
  );
  return Object.fromEntries(rows.map((a) => [a.account_id, a]));
}

// Barangay Scope: Adds a filter to a Supabase query to limit results to a 
//                 specific barangay based on the account's barangay ID.
export const scopeToBarangay = (query, account, column = "brgy_id") =>
  account.brgy_id ? query.eq(column, account.brgy_id) : query;

export const canTouchBarangay = (account, brgyId) =>
  !account.brgy_id || account.brgy_id === brgyId;


// Place Select Helper: Returns an object with the barangay, municipality, 
//                      and province names from a row, or empty strings if not available.
export const PLACE_SELECT =
  "barangays(brgy_name, municipalities(municipality_name, provinces(province_name)))";

export const placeOf = (row) => ({
  barangay: row.barangays?.brgy_name ?? "",
  municipality: row.barangays?.municipalities?.municipality_name ?? "",
  province: row.barangays?.municipalities?.provinces?.province_name ?? "",
});
