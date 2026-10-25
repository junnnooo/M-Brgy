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
  const update = n.report_updates;
  const kind = n.request_id ? "document" : update ? "report" : n.alert_id ? "alert" : "account";
  return {
    id: n.notification_id,
    kind,
    ref: n.requests?.ref_no ?? update?.reports?.ref_no ?? "",
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

  // Join the request / report so each notification can show its reference number.
  // Older databases without notifications.update_id fall back to the simpler selects.
  let result;
  for (const columns of [
    "*, requests(ref_no), report_updates(report_id, reports(ref_no))",
    "*, requests(ref_no)",
    "*",
  ]) {
    result = await list(columns);
    if (!result.error) break;
  }
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