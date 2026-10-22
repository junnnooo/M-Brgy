import { Router } from "express";
import { supabase } from "../utils/supabase.js";
import { check } from "../utils/helpers.js";

const router = Router();

// Documents a barangay currently offers: GET /api/services?brgy_id=4
router.get("/", async (req, res) => {
  const brgyId = Number(req.query.brgy_id);
  if (!Number.isInteger(brgyId)) return res.json([]);
  const rows = check(
    await supabase
      .from("service_types")
      .select("service_type_id, service_name, fee")
      .eq("brgy_id", brgyId)
      .eq("is_alive", true)
      .order("service_type_id"),
  );
  res.json(rows);
});

export default router;
