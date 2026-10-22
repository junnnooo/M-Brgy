import { Router } from "express";
import { supabase } from "../utils/supabase.js";
import { check } from "../utils/helpers.js";

const router = Router();

// Location dropdown: provinces -> municipalities -> barangays, for public pages like sign-up.
router.get("/", async (req, res) => {
  const provinces = check(
    await supabase
      .from("provinces")
      .select("province_id, province_name, municipalities(municipality_id, municipality_name, barangays(brgy_id, brgy_name))")
      .order("province_name"),
  );

  // Order barangays by the number in their name (Barangay 1, 2, ... 14), then by name.
  const num = (b) => Number(b.brgy_name.match(/\d+/)?.[0] ?? Infinity);
  for (const p of provinces) {
    p.municipalities.sort((a, b) => a.municipality_name.localeCompare(b.municipality_name));
    for (const m of p.municipalities) {
      m.barangays.sort((a, b) => num(a) - num(b) || a.brgy_name.localeCompare(b.brgy_name));
    }
  }
  res.json(provinces);
});

export default router;