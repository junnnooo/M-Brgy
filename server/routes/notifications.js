import { Router } from "express";
import { supabase } from "../utils/supabase.js";
import { check, httpError, toDay } from "../utils/helpers.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const LIMIT = 50;

const TITLES = {
  document: "Document request",
  report: "Concern report",
  alert: "Emergency alert",
  account: "Account update",
};

// Notification:
const toNotification = (n) => {
  const reportId = n.report_updates?.report_id;
  const kind = n.request_id ? "document" : reportId ? "report" : n.alert_id ? "alert" : "account";
  return {
    id: n.notification_id,
    kind,
    ref: n.request_id ? `DOC-${n.request_id}` : reportId ? `REP-${reportId}` : "",
    title: TITLES[kind],
    message: n.message,
    read: Boolean(n.is_read),
    created: n.created_at,
    date: toDay(n.created_at),
  };
};

// The Bell List: newest first, read and unread
router.get("/", requireAuth, async (req, res) => {
  const list = (columns) =>
    supabase
      .from("notifications")
      .select(columns)
      .eq("account_id", req.account.account_id)
      .order("created_at", { ascending: false })
      .limit(LIMIT);

  let result = await list("*, report_updates(report_id)");
  if (result.error) result = await list("*");
  res.json(check(result).map(toNotification));
});

router.post("/read-all", requireAuth, async (req, res) => {
  check(
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("account_id", req.account.account_id)
      .eq("is_read", false),
  );
  res.status(204).end();
});

router.post("/:id/read", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  if (!/^[\w-]{1,64}$/.test(id)) throw httpError(404, "Notification not found.");
  check(
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("notification_id", id)
      .eq("account_id", req.account.account_id), // never touch someone else's notification
  );
  res.status(204).end();
});

// "Clear" in the bell
router.delete("/", requireAuth, async (req, res) => {
  check(await supabase.from("notifications").delete().eq("account_id", req.account.account_id));
  res.status(204).end();
});

export default router;