import { Router } from "express";
import { supabase } from "../utils/supabase.js";
import { check, httpError, numericId, toDay, canTouchBarangay } from "../utils/helpers.js";
import { requireAuth, requireStaff } from "../middleware/auth.js";

const router = Router();

const toAnnouncement = (a) => ({
  id: a.announcement_id,
  kind: "announcement",
  title: a.title,
  type: a.category,
  body: a.content,
  date: toDay(a.published_at),
});

// Public: GET /api/announcements?brgy_id=4
router.get("/", async (req, res) => {
  let query = supabase.from("announcements").select("*").order("published_at", { ascending: false });
  if (req.query.brgy_id) query = query.eq("brgy_id", Number(req.query.brgy_id));
  res.json(check(await query).map(toAnnouncement));
});

router.post("/", requireAuth, requireStaff, async (req, res) => {
  const { title, type, body, date } = req.body ?? {};
  if (!title?.trim() || !body?.trim()) throw httpError(400, "Title and message are required.");
  if (!req.account.brgy_id) throw httpError(400, "Your account isn't assigned to a barangay.");

  const created = check(
    await supabase
      .from("announcements")
      .insert({
        title: title.trim(),
        content: body.trim(),
        category: type || "Announcement",
        published_at: date || new Date().toISOString(),
        brgy_id: req.account.brgy_id,
        posted_by: req.account.account_id,
      })
      .select()
      .single(),
  );
  res.status(201).json(toAnnouncement(created));
});

router.delete("/:id", requireAuth, requireStaff, async (req, res) => {
  const id = numericId(req.params.id, "Announcement");
  const existing = check(
    await supabase.from("announcements").select("announcement_id, brgy_id").eq("announcement_id", id).maybeSingle(),
  );
  if (!existing || !canTouchBarangay(req.account, existing.brgy_id)) {
    throw httpError(404, "Announcement not found.");
  }
  check(await supabase.from("announcements").delete().eq("announcement_id", id));
  res.status(204).end();
});

export default router;
