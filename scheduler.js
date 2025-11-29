// =======================================================
// AUTOMATED OUTBOUND CAMPAIGN DATE CHECKER (RENDER VERSION)
// =======================================================

require("dotenv").config(); // Load .env variables
const express = require("express");
const axios = require("axios");
const dayjs = require("dayjs");
const cron = require("node-cron");

const app = express();
const PORT = process.env.PORT || 10000;

// =======================================================
// 🌍 EXPRESS KEEP-ALIVE WEB SERVER
// =======================================================
app.get("/", (req, res) => {
  res.send(`
    <h2>✅ Bayport Scheduler is running fine!</h2>
    <p>Environment loaded successfully at ${dayjs().format("YYYY-MM-DD HH:mm:ss")}</p>
    <p>Last cron executed: ${global.lastCronRun || "Pending first run..."}</p>
  `);
});

app.listen(PORT, () => {
  console.log(`🌍 Web server running on port ${PORT}`);
});

// =======================================================
// 🔗 ENVIRONMENT CONFIGURATION
// =======================================================
const PAYEE_API = process.env.PAYEE_API;
const CALLLIST_API = process.env.CALLLIST_API;

console.log("🚀 Scheduler started — environment loaded successfully.");

// =======================================================
// 🔁 Main Function: runCheck()
// =======================================================
async function runCheck(label = "Daily") {
  global.lastCronRun = `${label} check at ${dayjs().format("YYYY-MM-DD HH:mm")}`;
  console.log(`🕒 Running ${label} Bayport payment check at`, dayjs().format("YYYY-MM-DD HH:mm"));

  try {
    // 1️⃣ Fetch all customers
    const { data: customers } = await axios.get(PAYEE_API);
    const today = dayjs();

    for (const customer of customers) {
      // Parse date safely
      const paymentDate = dayjs(customer.paymentduedate, ["D MMMM YYYY"]);
      if (!paymentDate.isValid()) {
        console.log(`⚠️ Invalid payment date for ${customer.customerfullname}`);
        continue;
      }

      const reminderDate = paymentDate.subtract(5, "day");
      const reminderDay = reminderDate.format("dddd");

      console.log(
        `➡️ Checking ${customer.customerfullname} | Due: ${paymentDate.format("YYYY-MM-DD")} | Reminder: ${reminderDate.format("YYYY-MM-DD")} (${reminderDay})`
      );

      // Skip reminders in the past
      if (reminderDate.isBefore(today, "day")) {
        console.log(`⏩ Skipping ${customer.customerfullname} (reminder date already past)`);
        continue;
      }

      // 2️⃣ Handle weekend logic
      if (reminderDay === "Saturday" || reminderDay === "Sunday") {
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
        console.log(`✅ ${customer.customerfullname}: Reminder on weekday (${reminderDay})`);
      }
    }

    console.log(`✅ ${label} weekend check completed successfully.\n`);
  } catch (err) {
    console.error(`❌ Error during ${label} check:`, err.message);
  }
}

// =======================================================
// 🧪 Immediate test run (for Render startup logs)
// =======================================================
(async () => {
  await runCheck("Immediate");
})();

// =======================================================
// 🕛 Daily schedule (runs every midnight)
// =======================================================
cron.schedule("0 0 * * *", async () => {
  await runCheck("Daily");
});
