import { supabase } from "./supabase.js";

export async function notifyAccount(accountId, message, { requestId = null, updateId = null } = {}) {
  if (!accountId) return;
  const row = { account_id: accountId, message, is_read: false, request_id: requestId };
  if (updateId) row.update_id = updateId;

  let { error } = await supabase.from("notifications").insert(row);
  if (error && updateId) {
    // notifications.update_id may not exist yet (see server/migrations): keep the message, drop the link
    delete row.update_id;
    ({ error } = await supabase.from("notifications").insert(row));
  }
  if (error) console.error("Couldn't create notification:", error.message);
}
