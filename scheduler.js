// =======================================================
// AUTOMATED OUTBOUND CAMPAIGN DATE CHECKER (RENDER VERSION)
// =======================================================

require("dotenv").config(); // Load .env variables
const axios = require("axios");
const dayjs = require("dayjs");
const cron = require("node-cron");

// Read API endpoints from environment variables
const PAYEE_API = process.env.PAYEE_API;
const CALLLIST_API = process.env.CALLLIST_API;

console.log("🚀 Scheduler started — environment loaded successfully.");

// =======================================================
// 🔁 Main Function: runCheck()
// =======================================================
async function runCheck(label = "Daily") {
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
      const reminderDay = reminderDate.format("dddd"); // Monday, Tuesday, etc.

      console.log(`➡️ Checking ${customer.customerfullname} | Due: ${paymentDate.format("YYYY-MM-DD")} | Reminder: ${reminderDate.format("YYYY-MM-DD")} (${reminderDay})`);

      // Skip reminders in the past
      if (reminderDate.isBefore(today, "day")) {
        console.log(`⏩ Skipping ${customer.customerfullname} (reminder date already past)`);
        continue;
      }

      // 2️⃣ Handle weekend logic
      if (reminderDay === "Saturday" || reminderDay === "Sunday") {
        console.log(`⚠️ ${customer.customerfullname} reminder falls on weekend (${reminderDay})`);

        // Find calllist entry using uniqueId
        const { data: callListEntry } = await axios.get(`${CALLLIST_API}?uniqueId=${customer.id}`);

        if (callListEntry.length > 0) {
          const entry = callListEntry[0];

          // Update calllist record
          await axios.put(`${CALLLIST_API}/${entry.id}`, {
            ...entry,
            voiceCallPaused: true,
            smsRequired: true
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
// 🧪 Run immediate check (for logs on Render startup)
// =======================================================
(async () => {
  await runCheck("Immediate");
})();

// =======================================================
// 🕛 Daily schedule (00:00 midnight)
// =======================================================
cron.schedule("0 0 * * *", async () => {
  await runCheck("Daily");
});
