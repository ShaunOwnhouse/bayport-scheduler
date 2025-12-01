// scheduler.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const bodyParser = require("body-parser");
const cron = require("node-cron");

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 10000;
const CALLLIST_API = process.env.CALLLIST_API;

// ---------- helpers ----------
function parsePaymentDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return d;
}

function daysBetween(start, end) {
  const msPerDay = 24 * 60 * 60 * 1000;
  const diff = end.setHours(0, 0, 0, 0) - start.setHours(0, 0, 0, 0);
  return Math.round(diff / msPerDay);
}

// ---------- core scheduler ----------
async function runFiveDayScheduler(triggerSource = "auto/cron") {
  const now = new Date();
  console.log(
    `\n📅 Running 5-day-before reminder check at ${now.toLocaleString()} (source: ${triggerSource})`
  );

  try {
    console.log(`🌐 Polling from: ${CALLLIST_API}`);
    const resp = await axios.get(CALLLIST_API);
    const customers = resp.data;

    if (!Array.isArray(customers) || customers.length === 0) {
      console.log("ℹ️ No customers in Calllist.");
      return;
    }

    for (const customer of customers) {
      const id = customer.id;
      const name =
        `${customer.firstName || ""} ${customer.lastName || ""}`.trim() ||
        `ID ${id}`;
      const dueStr = customer.paymentduedate;
      const wrongNumber = customer.wrongNumber;
      let callUser = Number(customer.callUser);

      const dueDate = parsePaymentDate(dueStr);
      if (!dueDate) {
        console.log(
          `⏭️ Skipping ${name} — missing or invalid paymentduedate (${dueStr})`
        );
        continue;
      }

      const today = new Date();
      const daysUntil = daysBetween(today, new Date(dueDate));

      if (isNaN(daysUntil)) {
        console.log(
          `⏭️ Skipping ${name} — could not compute daysUntil (value: ${daysUntil})`
        );
        continue;
      }

      // Always respect wrongNumber flag
      if (wrongNumber === true || wrongNumber === "true") {
        console.log(`🚫 Skipping ${name} — marked as wrong number`);
        continue;
      }

      // 🔁 RESET LOGIC:
      // If the due date has passed AND callUser is 0,
      // flip it back to 1 so the record is "clean"/re-usable.
      if (daysUntil < 0 && callUser === 0) {
        try {
          await axios.put(`${CALLLIST_API}/${id}`, {
            ...customer,
            callUser: 1,
          });
          console.log(
            `🔁 Reset ${name}: callUser 0 → 1 (payment date passed, daysUntil=${daysUntil})`
          );
        } catch (err) {
          console.error(
            `❌ Error resetting callUser for ${name} (ID ${id}):`,
            err.response?.data || err.message
          );
        }
        continue;
      }

      // 📞 TRIGGER LOGIC:
      // If due in 0–5 days AND callUser is NOT 0 → set to 0 (tell Kore to call)
      if (daysUntil >= 0 && daysUntil <= 5 && callUser !== 0) {
        console.log(`📞 [TRIGGER] ${name} — due in ${daysUntil} day(s).`);

        try {
          await axios.put(`${CALLLIST_API}/${id}`, {
            ...customer,
            callUser: 0,
          });
          console.log(`✅ Updated ${name}: callUser → 0`);
        } catch (err) {
          console.error(
            `❌ Error updating callUser for ${name} (ID ${id}):`,
            err.response?.data || err.message
          );
        }
      } else {
        console.log(
          `⏭️ Skipping ${name} — due in ${daysUntil} days or already processed (callUser=${callUser})`
        );
      }
    }

    console.log("✅ 5-day-before reminder check completed.\n");
  } catch (err) {
    console.error("❌ Scheduler error:", err.response?.data || err.message);
  }
}

// ---------- HTTP endpoints ----------

// Simple healthcheck
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Bayport Voice Scheduler running" });
});

// Manual trigger for testing / demos
app.get("/trigger-now", async (req, res) => {
  console.log("🚀 Manual trigger route activated");
  runFiveDayScheduler("manual");
  res.json({ status: "Manual scheduler triggered" });
});

// ---------- CRON: 8am Monday–Friday ----------
// NOTE: This is 06:00 UTC ≈ 08:00 South Africa time (GMT+2).
// If Render ever runs in a different timezone, adjust the hour here.
cron.schedule("0 6 * * 1-5", () => {
  console.log("⏰ Cron fired: Weekday 8am (local) 5-day scheduler");
  runFiveDayScheduler("cron 8am weekday");
});

// ---------- start server ----------
app.listen(PORT, () => {
  console.log(`🚀 Voice Scheduler running on port ${PORT}`);
});
