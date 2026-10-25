import { Router } from "express";
import { supabase } from "../utils/supabase.js";
import { check, httpError, numericId, toDay, canTouchBarangay, scopeToBarangay } from "../utils/helpers.js";
import { requireAuth, requireStaff } from "../middleware/auth.js";

const router = Router();

const toAnnouncement = (a) => ({
  id: a.announcement_id,
  kind: "announcement",
  title: a.title,
  type: a.category,
  body: a.content,
  date: toDay(a.published_at),
  archived: Boolean(a.archived_at),
});

// Public: GET /api/announcements?brgy_id=0402104015  (archived announcements are never returned here)
router.get("/", async (req, res) => {
  let query = supabase
    .from("announcements")
    .select("*")
    .is("archived_at", null)
    .order("published_at", { ascending: false });
  if (req.query.brgy_id) query = query.eq("brgy_id", String(req.query.brgy_id));
  res.json(check(await query).map(toAnnouncement));
});

// Staff: archived announcements of their barangay (hidden from residents)
router.get("/archived", requireAuth, requireStaff, async (req, res) => {
  const query = scopeToBarangay(
    supabase
      .from("announcements")
      .select("*")
      .not("archived_at", "is", null)
      .order("published_at", { ascending: false }),
    req.account,
  );
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

// Staff: move an announcement off the public board (or back). Needs announcements.archived_at.
router.patch("/:id/archive", requireAuth, requireStaff, async (req, res) => {
  const id = numericId(req.params.id, "Announcement");
  const { archived } = req.body ?? {};
  if (typeof archived !== "boolean") throw httpError(400, "Send { archived: true } or { archived: false }.");

  const existing = check(
    await supabase.from("announcements").select("announcement_id, brgy_id").eq("announcement_id", id).maybeSingle(),
  );
  if (!existing || !canTouchBarangay(req.account, existing.brgy_id)) {
    throw httpError(404, "Announcement not found.");
  }

  const updated = check(
    await supabase
      .from("announcements")
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("announcement_id", id)
      .select()
      .single(),
  );
  res.json(toAnnouncement(updated));
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