import "dotenv/config";
import express from "express";
import cors from "cors";
import { supabase } from "./utils/supabase.js";
import authRouter from "./routes/auth.js";
import locationsRouter from "./routes/locations.js";
import servicesRouter from "./routes/services.js";
import announcementsRouter from "./routes/announcements.js";
import alertsRouter from "./routes/alerts.js";
import requestsRouter from "./routes/requests.js";
import reportsRouter from "./routes/reports.js";
import accountsRouter from "./routes/accounts.js";
import barangaysRouter from "./routes/barangays.js";
import notificationsRouter from "./routes/notifications.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173" }));
app.use(express.json());

// Health check: also confirms the database is reachable
app.get("/api/health", async (req, res) => {
  const { error } = await supabase.from("barangays").select("brgy_id").limit(1);
  res.status(error ? 500 : 200).json({
    server: "ok",
    database: error ? `error: ${error.message}` : "ok",
  });
});

app.use("/api/auth", authRouter);
app.use("/api/locations", locationsRouter);
app.use("/api/services", servicesRouter);
app.use("/api/announcements", announcementsRouter);
app.use("/api/alerts", alertsRouter);
app.use("/api/requests", requestsRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/accounts", accountsRouter);
app.use("/api/barangays", barangaysRouter);
app.use("/api/notifications", notificationsRouter);

app.use(express.static(path.join(__dirname, "../client")));

// Unknown routes
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Error handler
app.use((err, req, res, next) => {
  if (!err.status || err.status >= 500) console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Server error" });
});

app.listen(PORT, () => {
  console.log(`kaBRGY API running at http://localhost:${PORT}`);
});