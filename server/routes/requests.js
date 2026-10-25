import { Router } from "express";
import { supabase } from "../utils/supabase.js";
import {
  accountsById, canTouchBarangay, check, formatTime, fullName, httpError,
  numericId, parseRef, placeOf, PLACE_SELECT, scopeToBarangay, toDay,
} from "../utils/helpers.js";
import { requireActiveAccount, requireAuth, requireStaff } from "../middleware/auth.js";
import { notifyAccount } from "../utils/notify.js";
import { LIVE_REQUEST_STATUSES, MAX_ACTIVE, docLimitFor } from "./moderation.js";

const router = Router();
const SELECT = `*, service_types(service_name, fee), ${PLACE_SELECT}`;
const STATUSES = ["Pending", "Approved", "Ready for Pickup", "Completed", "Rejected"];
const STATUS_MESSAGES = {
  Pending: "is back to pending review.",
  Approved: "has been approved.",
  "Ready for Pickup": "is ready. Please visit the barangay hall to pick it up.",
  Completed: "has been completed.",
  Rejected: "was rejected. Visit the barangay hall for details.",
};

const toRequest = (r, people = {}) => {
  const a = people[r.submitted_by];
  return {
    id: r.request_id,
    ref: r.ref_no,
    type: r.service_types?.service_name ?? "",
    fee: r.service_types?.fee ?? 0,
    purpose: r.purpose,
    date: r.appointment_date,
    time: formatTime(r.appointment_time),
    status: r.status,
    rejection_reason: r.rejection_reason ?? "",
    created: toDay(r.created_at),
    updated: toDay(r.updated_at ?? r.ready_at ?? r.created_at),
    archived: Boolean(r.archived_at),
    name: fullName(a),
    email: a?.email ?? "",
    contact: a?.contact_number ?? "",
    ...placeOf(r),
  };
};

const withPeople = async (rows) => {
  const people = await accountsById(rows.map((r) => r.submitted_by));
  return rows.map((r) => toRequest(r, people));
};

// Resident: my own requests (archived ones included, residents can still track them)
router.get("/mine", requireAuth, async (req, res) => {
  const rows = check(
    await supabase
      .from("requests")
      .select(SELECT)
      .eq("submitted_by", req.account.account_id)
      .order("created_at", { ascending: false }),
  );
  res.json(await withPeople(rows));
});

// Staff: everything in their barangay
router.get("/", requireAuth, requireStaff, async (req, res) => {
  const query = scopeToBarangay(
    supabase.from("requests").select(SELECT).order("created_at", { ascending: false }),
    req.account,
  );
  res.json(await withPeople(check(await query)));
});

// Track a Request by its reference number (e.g. 0402104008-10-2026-00001, dashes optional) or its
// internal id. Anyone can look one up, but only the submitter or staff of the barangay can see it.
router.get("/:id", requireAuth, async (req, res) => {
  const ref = parseRef(req.params.id);
  if (ref && (ref.kind !== "10" || ref.update)) throw httpError(404, "Request not found.");
  const lookup = ref
    ? supabase.from("requests").select(SELECT).eq("ref_no", ref.base)
    : supabase.from("requests").select(SELECT).eq("request_id", numericId(req.params.id, "Request"));
  const request = check(await lookup.maybeSingle());
  const allowed =
    request &&
    (request.submitted_by === req.account.account_id ||
      (req.isStaff && canTouchBarangay(req.account, request.brgy_id)));
  if (!allowed) throw httpError(404, "Request not found.");
  res.json((await withPeople([request]))[0]);
});

// Resident: request one or more documents from one barangay. Send service_type_ids (an array), or the older
// single service_type_id. Every document becomes its own request with its own reference number.
// Limits: the barangay's documents-per-submission cap, and MAX_ACTIVE active requests per resident.
router.post("/", requireAuth, requireActiveAccount, async (req, res) => {
  const { brgy_id, purpose, appointment_date, appointment_time } = req.body ?? {};
  const many = Array.isArray(req.body?.service_type_ids);
  const typeIds = [...new Set((many ? req.body.service_type_ids : [req.body?.service_type_id]).filter(Boolean))];
  if (![brgy_id, purpose?.trim(), appointment_date, appointment_time].every(Boolean) || !typeIds.length) {
    throw httpError(400, "Please fill in every field.");
  }
  if (!req.isVerified) throw httpError(403, "Only verified residents can request documents.");

  const barangay = check(
    await supabase.from("barangays").select("brgy_id, brgy_name").eq("brgy_id", brgy_id).maybeSingle(),
  );
  if (!barangay) throw httpError(400, "That barangay doesn't exist.");
  const perSubmission = docLimitFor(barangay.brgy_name);
  if (typeIds.length > perSubmission) {
    throw httpError(400, `${barangay.brgy_name} allows up to ${perSubmission} documents per request.`);
  }

  const { count, error: countError } = await supabase
    .from("requests")
    .select("request_id", { count: "exact", head: true })
    .eq("submitted_by", req.account.account_id)
    .in("status", LIVE_REQUEST_STATUSES);
  if (countError) throw httpError(500, countError.message);
  if (count + typeIds.length > MAX_ACTIVE) {
    throw httpError(
      400,
      `You can have at most ${MAX_ACTIVE} active document requests (you have ${count}). Wait until one is completed or rejected.`,
    );
  }

  const services = check(
    await supabase
      .from("service_types")
      .select("service_type_id")
      .in("service_type_id", typeIds)
      .eq("brgy_id", brgy_id)
      .eq("is_alive", true),
  );
  if (services.length !== typeIds.length) {
    throw httpError(400, "One of those documents isn't offered by the selected barangay.");
  }

  const created = [];
  for (const service_type_id of typeIds) {
    created.push(
      check(
        await supabase
          .from("requests")
          .insert({
            purpose: purpose.trim(),
            appointment_date,
            appointment_time,
            status: "Pending",
            submitted_by: req.account.account_id,
            brgy_id,
            service_type_id,
          })
          .select(SELECT)
          .single(),
      ),
    );
  }
  const result = await withPeople(created);
  res.status(201).json(many ? result : result[0]);
});

// Staff: change a request's status. Rejecting requires a reason (min 5 characters), stored in
// requests.rejection_reason and cleared again if the request later moves to another status.
router.patch("/:id/status", requireAuth, requireStaff, async (req, res) => {
  const id = numericId(req.params.id, "Request");
  const { status, reason } = req.body ?? {};
  if (!STATUSES.includes(status)) throw httpError(400, "Unknown status.");

  const rejectReason = typeof reason === "string" ? reason.trim() : "";
  if (status === "Rejected" && rejectReason.length < 5) {
    throw httpError(400, "Please give a reason for the rejection (at least 5 characters).");
  }

  const existing = check(
    await supabase
      .from("requests")
      .select("request_id, brgy_id, submitted_by, status")
      .eq("request_id", id)
      .maybeSingle(),
  );
  if (!existing || !canTouchBarangay(req.account, existing.brgy_id)) {
    throw httpError(404, "Request not found.");
  }

  const changed = existing.status !== status;
  const patch = {
    status,
    processed_by: req.account.account_id,
    rejection_reason: status === "Rejected" ? rejectReason : null,
  };
  if (changed && status === "Ready for Pickup") patch.ready_at = new Date().toISOString();

  const updated = check(
    await supabase.from("requests").update(patch).eq("request_id", id).select(SELECT).single(),
  );

  if (changed) {
    await notifyAccount(
      existing.submitted_by,
      `${updated.service_types?.service_name ?? "Your document"} (${updated.ref_no}) ${STATUS_MESSAGES[status]}`,
      { requestId: id },
    );
  }
  res.json((await withPeople([updated]))[0]);
});

// Staff: move a request out of the active list (or back). Needs requests.archived_at (1.0.3 migration).
router.patch("/:id/archive", requireAuth, requireStaff, async (req, res) => {
  const id = numericId(req.params.id, "Request");
  const { archived } = req.body ?? {};
  if (typeof archived !== "boolean") throw httpError(400, "Send { archived: true } or { archived: false }.");

  const existing = check(
    await supabase.from("requests").select("request_id, brgy_id").eq("request_id", id).maybeSingle(),
  );
  if (!existing || !canTouchBarangay(req.account, existing.brgy_id)) {
    throw httpError(404, "Request not found.");
  }

  const updated = check(
    await supabase
      .from("requests")
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("request_id", id)
      .select(SELECT)
      .single(),
  );
  res.json((await withPeople([updated]))[0]);
});

export default router;