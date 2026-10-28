import { Router } from "express";
import { supabase } from "../utils/supabase.js";
import {
  canTouchBarangay, check, fullName, httpError, numericId,
  parseRef, PERSON_COLUMNS, placeOf, PLACE_SELECT, scopeToBarangay, toDay,
} from "../utils/helpers.js";
import { requireActiveAccount, requireAuth, requireStaff } from "../middleware/auth.js";
import { notifyAccount } from "../utils/notify.js";
import { LIVE_REPORT_STATUSES, MAX_ACTIVE } from "./moderation.js";

const router = Router();
const SELECT = `*, author:accounts!reports_account_id_fkey(${PERSON_COLUMNS}), ${PLACE_SELECT}`;
const STATUSES = ["Submitted", "Received", "In Progress", "Resolved", "Rejected"];

const toReport = (r) => {
  const a = r.author;
  return {
    id: r.report_id,
    ref: r.ref_no,
    category: r.category,
    title: r.title,
    description: r.description,
    location: r.location_details,
    status: r.status,
    rejection_reason: r.rejection_reason ?? "",
    created: toDay(r.created_at),
    updated: toDay(r.created_at),
    archived: Boolean(r.archived_at),
    name: fullName(a),
    email: a?.email ?? "",
    ...placeOf(r),
  };
};

const logUpdate = async (reportId, status, remark, accountId) =>
  check(
    await supabase
      .from("report_updates")
      .insert({
        status,
        remark,
        report_id: reportId,
        updated_by: accountId,
      })
      .select("update_id")
      .single(),
  );

// Resident: my own reports (archived ones included, residents can still track them)
router.get("/mine", requireAuth, async (req, res) => {
  const rows = check(
    await supabase
      .from("reports")
      .select(SELECT)
      .eq("account_id", req.account.account_id)
      .order("created_at", { ascending: false }),
  );
  res.json(rows.map(toReport));
});

router.get("/", requireAuth, requireStaff, async (req, res) => {
  const query = scopeToBarangay(
    supabase.from("reports").select(SELECT).order("created_at", { ascending: false }),
    req.account,
  );
  res.json(check(await query).map(toReport));
});

// Track one report by its reference number (dashes optional) or internal id. Only the owner or staff may
// read one. A -21- number is an update to a report: it opens that report.
router.get("/:id", requireAuth, async (req, res) => {
  const ref = parseRef(req.params.id);
  if (ref && !["20", "21"].includes(ref.kind)) throw httpError(404, "Report not found.");
  const lookup = ref
    ? supabase.from("reports").select(SELECT).eq("ref_no", `${ref.brgy}-20-${ref.year}-${ref.no}`)
    : supabase.from("reports").select(SELECT).eq("report_id", numericId(req.params.id, "Report"));
  const report = check(await lookup.maybeSingle());
  const allowed =
    report &&
    (report.account_id === req.account.account_id ||
      (req.isStaff && canTouchBarangay(req.account, report.brgy_id)));
  if (!allowed) throw httpError(404, "Report not found.");

  const id = report.report_id;
  const updates = check(
    await supabase.from("report_updates").select("*").eq("report_id", id).order("updated_at").order("update_id"),
  );
  res.json({
    ...toReport(report),
    updated: toDay(updates.at(-1)?.updated_at) || toDay(report.created_at),
    history: updates.map((u) => ({ ref: u.ref_no, status: u.status, remark: u.remark, date: toDay(u.updated_at) })),
  });
});

router.post("/", requireAuth, requireActiveAccount, async (req, res) => {
  const { category, location, description, brgy_id } = req.body ?? {};
  if (![category, location?.trim(), description?.trim(), brgy_id].every(Boolean)) {
    throw httpError(400, "Please fill in every field.");
  }
  const { count, error: countError } = await supabase
    .from("reports")
    .select("report_id", { count: "exact", head: true })
    .eq("account_id", req.account.account_id)
    .in("status", LIVE_REPORT_STATUSES);
  if (countError) throw httpError(500, countError.message);
  if (count >= MAX_ACTIVE) {
    throw httpError(
      400,
      `You already have ${MAX_ACTIVE} active concern reports. Wait until one is resolved or rejected.`,
    );
  }
  const created = check(
    await supabase
      .from("reports")
      .insert({
        category,
        title: category,
        description: description.trim(),
        location_details: location.trim(),
        status: "Submitted",
        account_id: req.account.account_id,
        brgy_id,
      })
      .select(SELECT)
      .single(),
  );
  await logUpdate(created.report_id, "Submitted", "Report submitted by resident.", req.account.account_id);
  res.status(201).json(toReport(created));
});

// Staff: change a report's status. Rejecting requires a reason (min 5 characters), which is stored on the
//        report (rejection_reason) and in the report's history (report_updates.remark).
router.patch("/:id/status", requireAuth, requireStaff, async (req, res) => {
  const id = numericId(req.params.id, "Report");
  const { status, remark, reason } = req.body ?? {};
  if (!STATUSES.includes(status)) throw httpError(400, "Unknown status.");

  const rejectReason = typeof reason === "string" ? reason.trim() : "";
  if (status === "Rejected" && rejectReason.length < 5) {
    throw httpError(400, "Please give a reason for the rejection (at least 5 characters).");
  }

  const existing = check(
    await supabase
      .from("reports")
      .select("report_id, brgy_id, account_id, status")
      .eq("report_id", id)
      .maybeSingle(),
  );
  if (!existing || !canTouchBarangay(req.account, existing.brgy_id)) {
    throw httpError(404, "Report not found.");
  }

  const updated = check(
    await supabase
      .from("reports")
      .update({ status, rejection_reason: status === "Rejected" ? rejectReason : null })
      .eq("report_id", id)
      .select(SELECT)
      .single(),
  );
  const logRemark =
    (status === "Rejected" ? rejectReason : remark?.trim()) || `Status changed to ${status}.`;
  const log = await logUpdate(id, status, logRemark, req.account.account_id);

  if (existing.status !== status) {
    await notifyAccount(
      existing.account_id,
      `Your report "${updated.category}" (${updated.ref_no}) is now ${status}.`,
      { updateId: log.update_id },
    );
  }
  const result = toReport(updated);
  result.updated = toDay(new Date().toISOString());
  res.json(result);
});

// Staff: move a report out of the active list (or back). Needs reports.archived_at (1.0.3 migration).
router.patch("/:id/archive", requireAuth, requireStaff, async (req, res) => {
  const id = numericId(req.params.id, "Report");
  const { archived } = req.body ?? {};
  if (typeof archived !== "boolean") throw httpError(400, "Send { archived: true } or { archived: false }.");

  const existing = check(
    await supabase.from("reports").select("report_id, brgy_id").eq("report_id", id).maybeSingle(),
  );
  if (!existing || !canTouchBarangay(req.account, existing.brgy_id)) {
    throw httpError(404, "Report not found.");
  }

  const updated = check(
    await supabase
      .from("reports")
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("report_id", id)
      .select(SELECT)
      .single(),
  );
  res.json(toReport(updated));
});

export default router;