import { Router } from "express";
import { supabase } from "../utils/supabase.js";
import {
  canTouchBarangay, check, fullName, httpError, PENDING, VERIFIED, scopeToBarangay,
} from "../utils/helpers.js";
import { requireAuth, requireStaff } from "../middleware/auth.js";

const router = Router();
const RESIDENT_ROLE_ID = 1;

const toProfile = (a) => ({
  id: a.account_id,
  name: fullName(a),
  email: a.email,
  address: a.address ?? "",
  contact: a.contact_number ?? "",
  verified: a.verification_status === VERIFIED,
});

// Staff: resident accounts in their barangay
router.get("/", requireAuth, requireStaff, async (req, res) => {
  const query = scopeToBarangay(
    supabase.from("accounts").select("*").eq("role_id", RESIDENT_ROLE_ID).order("created_at", { ascending: false }),
    req.account,
  );
  res.json(check(await query).map(toProfile));
});

router.patch("/:id/verification", requireAuth, requireStaff, async (req, res) => {
  const { verified } = req.body ?? {};
  if (typeof verified !== "boolean") throw httpError(400, "Send { verified: true } or { verified: false }.");

  const existing = check(
    await supabase.from("accounts").select("account_id, brgy_id").eq("account_id", req.params.id).maybeSingle(),
  );
  if (!existing || !canTouchBarangay(req.account, existing.brgy_id)) {
    throw httpError(404, "Resident not found.");
  }

  const updated = check(
    await supabase
      .from("accounts")
      .update({
        verification_status: verified ? VERIFIED : PENDING,
        verified_at: verified ? new Date().toISOString() : null,
      })
      .eq("account_id", existing.account_id)
      .select()
      .single(),
  );
  res.json(toProfile(updated));
});

export default router;
