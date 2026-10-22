import { Router } from "express";
import { supabase } from "../utils/supabase.js";
import {
  accountsById, canTouchBarangay, check, fullName, httpError, numericId,
  placeOf, PLACE_SELECT, scopeToBarangay, toDay,
} from "../utils/helpers.js";
import { requireAuth, requireStaff } from "../middleware/auth.js";

const router = Router();
const SELECT = `*, ${PLACE_SELECT}`;
const STATUSES = ["Submitted", "Received", "In Progress", "Resolved"];

const toReport = (r, people = {}) => ({
  id: r.report_id,
  ref: `REP-${r.report_id}`,
  category: r.category,
  title: r.title,
  description: r.description,
  location: r.location_details,
  status: r.status,
  created: toDay(r.created_at),
  updated: toDay(r.created_at),
  name: fullName(people[r.account_id]),
  ...placeOf(r),
});

const withPeople = async (rows) => {
  const people = await accountsById(rows.map((r) => r.account_id));
  return rows.map((r) => toReport(r, people));
};

const logUpdate = async (reportId, status, remark, accountId) =>
  check(
    await supabase.from("report_updates").insert({
      status,
      remark,
      report_id: reportId,
      updated_by: accountId,
    }),
  );

router.get("/mine", requireAuth, async (req, res) => {
  const rows = check(
    await supabase
      .from("reports")
      .select(SELECT)
      .eq("account_id", req.account.account_id)
      .order("created_at", { ascending: false }),
  );
  res.json(await withPeople(rows));
});

router.get("/", requireAuth, requireStaff, async (req, res) => {
  const query = scopeToBarangay(
    supabase.from("reports").select(SELECT).order("created_at", { ascending: false }),
    req.account,
  );
  res.json(await withPeople(check(await query)));
});

// Track one report: Reference numbers are sequential, so only the owner or staff may read one.
router.get("/:id", requireAuth, async (req, res) => {
  const id = numericId(req.params.id, "Report");
  const report = check(await supabase.from("reports").select(SELECT).eq("report_id", id).maybeSingle());
  const allowed =
    report &&
    (report.account_id === req.account.account_id ||
      (req.isStaff && canTouchBarangay(req.account, report.brgy_id)));
  if (!allowed) throw httpError(404, "Report not found.");

  const updates = check(
    await supabase.from("report_updates").select("*").eq("report_id", id).order("updated_at"),
  );
  const people = await accountsById([report.account_id]);
  res.json({
    ...toReport(report, people),
    updated: toDay(updates.at(-1)?.updated_at) || toDay(report.created_at),
    history: updates.map((u) => ({ status: u.status, remark: u.remark, date: toDay(u.updated_at) })),
  });
});

router.post("/", requireAuth, async (req, res) => {
  const { category, location, description, brgy_id } = req.body ?? {};
  if (![category, location?.trim(), description?.trim(), brgy_id].every(Boolean)) {
    throw httpError(400, "Please fill in every field.");
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
  res.status(201).json((await withPeople([created]))[0]);
});

router.patch("/:id/status", requireAuth, requireStaff, async (req, res) => {
  const id = numericId(req.params.id, "Report");
  const { status, remark } = req.body ?? {};
  if (!STATUSES.includes(status)) throw httpError(400, "Unknown status.");

  const existing = check(
    await supabase.from("reports").select("report_id, brgy_id").eq("report_id", id).maybeSingle(),
  );
  if (!existing || !canTouchBarangay(req.account, existing.brgy_id)) {
    throw httpError(404, "Report not found.");
  }

  const updated = check(
    await supabase.from("reports").update({ status }).eq("report_id", id).select(SELECT).single(),
  );
  await logUpdate(id, status, remark?.trim() || `Status changed to ${status}.`, req.account.account_id);
  const result = (await withPeople([updated]))[0];
  result.updated = toDay(new Date().toISOString());
  res.json(result);
});

export default router;
