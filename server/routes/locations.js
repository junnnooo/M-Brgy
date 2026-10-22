import { Router } from "express";
import { supabase } from "../utils/supabase.js";
import { check } from "../utils/helpers.js";

const router = Router();

// Location Dropdown: This endpoint provides a hierarchical list of provinces, their municipalities, 
//                    and the barangays within those municipalities. It is intended for public access, 
//                    such as on the sign-up page where users need to select their location.
router.get("/", async (req, res) => {
  const provinces = check(
    await supabase
      .from("provinces")
      .select("province_id, province_name, municipalities(municipality_id, municipality_name, barangays(brgy_id, brgy_name))")
      .order("province_name"),
  );
  for (const p of provinces) {
    p.municipalities.sort((a, b) => a.municipality_name.localeCompare(b.municipality_name));
    for (const m of p.municipalities) m.barangays.sort((a, b) => a.brgy_id - b.brgy_id);
  }
  res.json(provinces);
});

export default router;
