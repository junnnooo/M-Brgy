// Step 3 check (read-only: it only runs SELECT queries, nothing is changed).
// Compares the OLD way of attaching people (a second query through accountsById) with the NEW way
// (the account embedded in the same query), for the requests and reports in your database.
//
// Run from the server folder:   node scripts/verify-step3.js
// Expected result: "MATCH" for both tables, and the script exits normally.
// It never prints names or emails, only row ids.
import "dotenv/config";
import { supabase } from "../utils/supabase.js";
import { accountsById, check, PERSON_COLUMNS } from "../utils/helpers.js";

const FIELDS = PERSON_COLUMNS.split(",").map((s) => s.trim());
const LIMIT = 2000;

const same = (a, b) => FIELDS.every((k) => (a?.[k] ?? null) === (b?.[k] ?? null));

async function compare({ table, idColumn, ownerColumn, embed }) {
  let rows;
  try {
    rows = check(await supabase.from(table).select(`${idColumn}, ${ownerColumn}, ${embed}`).limit(LIMIT));
  } catch (err) {
    console.log(`${table}: the new embedded query FAILED -> ${err.message}`);
    console.log("   (If this says it can't find a relationship, the foreign key name in routes/*.js needs fixing.)");
    return false;
  }
  if (!rows.length) {
    console.log(`${table}: no rows yet, nothing to compare.`);
    return true;
  }

  const oldWay = await accountsById(rows.map((r) => r[ownerColumn])); // the old second query
  const alias = embed.split(":")[0];
  const bad = rows.filter((r) => !same(r[alias], oldWay[r[ownerColumn]]));

  if (bad.length) {
    console.log(`${table}: MISMATCH on ${bad.length} of ${rows.length} rows. First ids: ${bad.slice(0, 5).map((r) => r[idColumn]).join(", ")}`);
    return false;
  }
  console.log(`${table}: MATCH (${rows.length} rows checked)`);
  return true;
}

const results = [
  await compare({
    table: "requests",
    idColumn: "request_id",
    ownerColumn: "submitted_by",
    embed: `submitter:accounts!requests_submitted_by_fkey(${PERSON_COLUMNS})`,
  }),
  await compare({
    table: "reports",
    idColumn: "report_id",
    ownerColumn: "account_id",
    embed: `author:accounts!reports_account_id_fkey(${PERSON_COLUMNS})`,
  }),
];

if (!results.every(Boolean)) process.exitCode = 1;
