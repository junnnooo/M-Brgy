import { Router } from "express";
import { supabase } from "../utils/supabase.js";
import { check, httpError, numericId, toDay, canTouchBarangay } from "../utils/helpers.js";
import { requireAuth, requireStaff } from "../middleware/auth.js";

const router = Router();

// Emergency notices: The client decides which are currently active (starts_at / expires_at).
const toAlert = (a) => ({
  id: a.alert_id,
  kind: "alert",
  title: a.title,
  body: a.message,
  type: "Emergency",
  severity: a.severity,
  starts_at: a.starts_at,
  expires_at: a.expires_at,
  date: toDay(a.starts_at),
});

router.get("/", async (req, res) => {
  let query = supabase.from("alerts").select("*").order("starts_at", { ascending: false });
  if (req.query.brgy_id) query = query.eq("brgy_id", Number(req.query.brgy_id));
  res.json(check(await query).map(toAlert));
});

router.post("/", requireAuth, requireStaff, async (req, res) => {
  const { title, body } = req.body ?? {};
  if (!title?.trim() || !body?.trim()) throw httpError(400, "Title and message are required.");
  if (!req.account.brgy_id) throw httpError(400, "Your account isn't assigned to a barangay.");

  const created = check(
    await supabase
      .from("alerts")
      .insert({
        title: title.trim(),
        message: body.trim(),
        severity: "Emergency",
        starts_at: new Date().toISOString(),
        brgy_id: req.account.brgy_id,
        sent_by: req.account.account_id,
      })
      .select()
      .single(),
  );
  res.status(201).json(toAlert(created));
});

router.delete("/:id", requireAuth, requireStaff, async (req, res) => {
  const id = numericId(req.params.id, "Alert");
  const existing = check(
    await supabase.from("alerts").select("alert_id, brgy_id").eq("alert_id", id).maybeSingle(),
  );
  if (!existing || !canTouchBarangay(req.account, existing.brgy_id)) {
    throw httpError(404, "Alert not found.");
  }
  // notifications.alert_id may point at this alert
  check(await supabase.from("notifications").delete().eq("alert_id", id));
  check(await supabase.from("alerts").delete().eq("alert_id", id));
  res.status(204).end();
});

export default router;
