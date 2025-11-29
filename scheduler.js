// =======================================================
// AUTOMATED OUTBOUND CAMPAIGN DATE CHECKER (RENDER VERSION)
// =======================================================

require("dotenv").config();
const express = require("express");
const axios = require("axios");
const dayjs = require("dayjs");
const cron = require("node-cron");

const app = express();
const PORT = process.env.PORT || 10000;

// =======================================================
// 🌍 EXPRESS KEEP-ALIVE + STATUS API
// =======================================================
let stats = {
  lastRun: null,
  totalChecked: 0,
  totalWeekend: 0,
  totalWeekday: 0,
  totalSkipped: 0,
  totalErrors: 0,
};

// --- Root route (simple view) ---
app.get("/", (req, res) => {
  res.send(`
    <h2>✅ Bayport Scheduler is running fine!</h2>
    <p>Environment loaded at ${dayjs().format("YYYY-MM-DD HH:mm:ss")}</p>
    <p>Last cron executed: ${stats.lastRun || "Pending first run..."}</p>
    <p><a href="/status/json">View JSON Status</a> | <a href="/trigger">Run Now</a></p>
  `);
});

// --- JSON status endpoint ---
app.get("/status/json", (req, res) => {
  res.json({
    service: "Bayport Scheduler",
    lastRun: stats.lastRun,
    totals: {
      checked: stats.totalChecked,
      weekend: stats.totalWeekend,
      weekday: stats.totalWeekday,
      skipped: stats.totalSkipped,
      errors: stats.totalErrors,
    },
    currentTime: dayjs().format("YYYY-MM-DD HH:mm:ss"),
  });
});

// --- Manual trigger route ---
app.get("/trigger", async (req, res) => {
  try {
    await runCheck("Manual Trigger");
    res.json({ status: "✅ Manual check executed successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Start web server ---
app.listen(PORT, () => {
  console.log(`🌍 Web server running on port ${PORT}`);
});

// =======================================================
// 🔗 CONFIG
// =======================================================
const PAYEE_API = process.env.PAYEE_API;
const CALLLIST_API = process.env.CALLLIST_API;

console.log("🚀 Scheduler started — environment loaded successfully.");

// =======================================================
// 🔁 MAIN CHECK FUNCTION
// =======================================================
async function runCheck(label = "Daily") {
  stats.totalChecked = 0;
  stats.totalWeekend = 0;
  stats.totalWeekday = 0;
  stats.totalSkipped = 0;
  stats.totalErrors = 0;
  stats.lastRun = `${label} check at ${dayjs().format("YYYY-MM-DD HH:mm")}`;

  console.log(`🕒 Running ${label} Bayport payment check at`, dayjs().format("YYYY-MM-DD HH:mm"));

  try {
    const { data: customers } = await axios.get(PAYEE_API);
    const today = dayjs();

    for (const customer of customers) {
      stats.totalChecked++;
      const paymentDate = dayjs(customer.paymentduedate, ["D MMMM YYYY"]);
      if (!paymentDate.isValid()) {
        console.log(`⚠️ Invalid payment date for ${customer.customerfullname}`);
        stats.totalErrors++;
        continue;
      }

      const reminderDate = paymentDate.subtract(5, "day");
      const reminderDay = reminderDate.format("dddd");

      console.log(
        `➡️ Checking ${customer.customerfullname} | Due: ${paymentDate.format("YYYY-MM-DD")} | Reminder: ${reminderDate.format("YYYY-MM-DD")} (${reminderDay})`
      );

      if (reminderDate.isBefore(today, "day")) {
        console.log(`⏩ Skipping ${customer.customerfullname} (reminder date already past)`);
        stats.totalSkipped++;
        continue;
      }

      if (reminderDay === "Saturday" || reminderDay === "Sunday") {
        stats.totalWeekend++;
        console.log(`⚠️ ${customer.customerfullname} reminder falls on weekend (${reminderDay})`);

        const { data: callListEntry } = await axios.get(`${CALLLIST_API}?uniqueId=${customer.id}`);

        if (callListEntry.length > 0) {
          const entry = callListEntry[0];
          await axios.put(`${CALLLIST_API}/${entry.id}`, {
            ...entry,
            voiceCallPaused: true,
            smsRequired: true,
          });
          console.log(`🔇 Paused voice call + marked SMS required for ${customer.customerfullname}`);
        } else {
          console.log(`⚠️ No matching calllist entry found for ${customer.customerfullname}`);
        }
      } else {
        stats.totalWeekday++;
        console.log(`✅ ${customer.customerfullname}: Reminder on weekday (${reminderDay})`);
      }
    }

    console.log(`✅ ${label} weekend check completed successfully.\n`);
  } catch (err) {
    stats.totalErrors++;
    console.error(`❌ Error during ${label} check:`, err.message);
  }
}

// =======================================================
// 🧪 Immediate + Scheduled
// =======================================================
(async () => {
  await runCheck("Immediate");
})();
cron.schedule("0 0 * * *", async () => {
  await runCheck("Daily");
});
