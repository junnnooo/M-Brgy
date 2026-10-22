import { Router } from "express";
import { supabase } from "../utils/supabase.js";
import {
  accountsById, canTouchBarangay, check, formatTime, fullName, httpError,
  numericId, placeOf, PLACE_SELECT, scopeToBarangay, toDay,
} from "../utils/helpers.js";
import { requireAuth, requireStaff } from "../middleware/auth.js";

const router = Router();
const SELECT = `*, service_types(service_name, fee), ${PLACE_SELECT}`;
const STATUSES = ["Pending", "Approved", "Ready for Pickup", "Completed", "Rejected"];

const toRequest = (r, people = {}) => {
  const a = people[r.submitted_by];
  return {
    id: r.request_id,
    ref: `DOC-${r.request_id}`,
    type: r.service_types?.service_name ?? "",
    fee: r.service_types?.fee ?? 0,
    purpose: r.purpose,
    date: r.appointment_date,
    time: formatTime(r.appointment_time),
    status: r.status,
    created: toDay(r.created_at),
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

// Resident: my own requests
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

router.post("/", requireAuth, async (req, res) => {
  const { service_type_id, brgy_id, purpose, appointment_date, appointment_time } = req.body ?? {};
  if (![service_type_id, brgy_id, purpose?.trim(), appointment_date, appointment_time].every(Boolean)) {
    throw httpError(400, "Please fill in every field.");
  }
  if (!req.isVerified) throw httpError(403, "Only verified residents can request documents.");

  const service = check(
    await supabase
      .from("service_types")
      .select("service_type_id")
      .eq("service_type_id", service_type_id)
      .eq("brgy_id", brgy_id)
      .eq("is_alive", true)
      .maybeSingle(),
  );
  if (!service) throw httpError(400, "That document isn't offered by the selected barangay.");

  const created = check(
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
  );
  res.status(201).json((await withPeople([created]))[0]);
});

router.patch("/:id/status", requireAuth, requireStaff, async (req, res) => {
  const id = numericId(req.params.id, "Request");
  const { status } = req.body ?? {};
  if (!STATUSES.includes(status)) throw httpError(400, "Unknown status.");

  const existing = check(
    await supabase.from("requests").select("request_id, brgy_id, submitted_by").eq("request_id", id).maybeSingle(),
  );
  if (!existing || !canTouchBarangay(req.account, existing.brgy_id)) {
    throw httpError(404, "Request not found.");
  }

  const patch = { status, processed_by: req.account.account_id };
  const ready = status === "Ready for Pickup";
  if (ready) patch.ready_at = new Date().toISOString();

  const updated = check(
    await supabase.from("requests").update(patch).eq("request_id", id).select(SELECT).single(),
  );

  if (ready) {
    check(
      await supabase.from("notifications").insert({
        message: `${updated.service_types?.service_name ?? "Your document"} (DOC-${id}) is ready. Please visit the barangay hall.`,
        is_read: false,
        account_id: existing.submitted_by,
        request_id: id,
      }),
    );
  }
  res.json((await withPeople([updated]))[0]);
});

export default router;
