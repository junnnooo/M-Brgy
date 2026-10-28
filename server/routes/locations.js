import { Router } from "express";
import { createHash } from "node:crypto";
import { supabase } from "../utils/supabase.js";
import { check } from "../utils/helpers.js";

const router = Router();

const SERVER_TTL_MS = 10 * 60 * 1000;
const BROWSER_MAX_AGE_S = 5 * 60;
const RETRY_AFTER_ERROR_MS = 30 * 1000;
let cached = null;
let inFlight = null;

async function buildLocations() {
  const provinces = check(
    await supabase
      .from("provinces")
      .select("province_id, province_name, municipalities(municipality_id, municipality_name, barangays(brgy_id, brgy_name))")
      .order("province_name"),
  );

  const num = (b) => Number(b.brgy_name.match(/\d+/)?.[0] ?? Infinity);
  for (const p of provinces) {
    p.municipalities.sort((a, b) => a.municipality_name.localeCompare(b.municipality_name));
    for (const m of p.municipalities) {
      m.barangays.sort((a, b) => num(a) - num(b) || a.brgy_name.localeCompare(b.brgy_name));
    }
  }

  const body = JSON.stringify(provinces);
  const etag = `W/"${createHash("sha1").update(body).digest("base64url")}"`;
  return { body, etag, expires: Date.now() + SERVER_TTL_MS };
}

function getLocations() {
  if (cached && cached.expires > Date.now()) return Promise.resolve(cached);

  // 50 visitors on a cold cache share ONE Supabase query instead of starting 50.
  if (!inFlight) {
    inFlight = buildLocations()
      .then((fresh) => (cached = fresh))
      .catch((err) => {
        if (cached) {
          cached.expires = Date.now() + RETRY_AFTER_ERROR_MS;
          return cached;
        }
        throw err;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

router.get("/", async (req, res) => {
  const { body, etag } = await getLocations();
  res.set("Cache-Control", `public, max-age=${BROWSER_MAX_AGE_S}`);
  res.set("ETag", etag);
  res.type("application/json").send(body);
});

getLocations().catch(() => {});

export default router;