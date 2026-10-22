import { Router } from "express";
import { supabase } from "../utils/supabase.js";
import { canTouchBarangay, check, httpError, numericId } from "../utils/helpers.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";

const router = Router();

// Barangay settings: name, hall address, office hours
router.patch("/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = numericId(req.params.id, "Barangay");
  if (!canTouchBarangay(req.account, id)) throw httpError(403, "You can only edit your own barangay.");

  const { brgy_name, address, office_hours } = req.body ?? {};
  if (!brgy_name?.trim()) throw httpError(400, "Barangay name is required.");

  const updated = check(
    await supabase
      .from("barangays")
      .update({
        brgy_name: brgy_name.trim(),
        address: address?.trim() ?? "",
        office_hours: office_hours?.trim() ?? "",
      })
      .eq("brgy_id", id)
      .select("brgy_name, address, office_hours")
      .single(),
  );
  res.json(updated);
});

export default router;
