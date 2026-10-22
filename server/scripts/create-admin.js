import "dotenv/config";
import { supabase } from "../utils/supabase.js";

// Parse Command Line: Arguments for email, password, first name, last name, 
//                     barangay ID, and optional role ID (defaulting to 3 for Admin)
const [email, password, firstName, lastName, brgyId, roleId = "3"] = process.argv.slice(2);

// Simple Logic: If any required argument is missing, print usage instructions and exit with an error code.
if (!email || !password || !firstName || !lastName || !brgyId) {
  console.error("Usage: node scripts/create-admin.js <email> <password> <first name> <last name> <brgy_id> [role_id]");
  process.exit(1);
}

// Supabase: Create a new user in Supabase Auth with the provided email and password, 
//           and confirm the email.
const { data, error } = await supabase.auth.admin.createUser({
  email: email.toLowerCase(),
  password,
  email_confirm: true,
});
if (error) {
  console.error("Could not create the login:", error.message);
  process.exit(1);
}

// Supabase: Insert a new row in the "accounts" table with the user's details, 
//           including their name, email, barangay ID, and role ID.
const { error: profileError } = await supabase.from("accounts").upsert(
  {
    account_id: data.user.id,
    first_name: firstName,
    last_name: lastName,
    email: email.toLowerCase(),
    address: "",
    contact_number: "",
    verification_status: "Verified",
    verified_at: new Date().toISOString(),
    brgy_id: Number(brgyId),
    role_id: Number(roleId),
  },
  { onConflict: "account_id" },
);
if (profileError) {
  await supabase.auth.admin.deleteUser(data.user.id);
  console.error("Could not create the account row:", profileError.message);
  process.exit(1);
}

// Success: Log a message indicating that the account was created successfully,
//          specifying whether it is an admin or staff account based on the role ID.
console.log(`Created ${Number(roleId) >= 3 ? "admin" : "staff"} account for ${email}`);