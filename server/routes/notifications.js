import { Router } from "express";
import { supabase } from "../utils/supabase.js";
import { check, toDay } from "../utils/helpers.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  const rows = check(
    await supabase
      .from("notifications")
      .select("*")
      .eq("account_id", req.account.account_id)
      .eq("is_read", false)
      .order("created_at", { ascending: false }),
  );
  res.json(rows.map((n) => ({ id: n.notification_id, message: n.message, date: toDay(n.created_at) })));
});

router.post("/dismiss", requireAuth, async (req, res) => {
  check(
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("account_id", req.account.account_id)
      .eq("is_read", false),
  );
  res.status(204).end();
});

export default router;
