// ============================================================
// BAYPORT SA - Outbound Voice Reminder Scheduler (Final Version)
// ============================================================

require('dotenv').config();
const axios = require('axios');
const express = require('express');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 10000;
const CALLLIST_API = process.env.CALLLIST_API;

console.log("🚀 Bayport Voice Scheduler starting...");

// ============================================================
// 📅 Function: Check MockAPI and update callUser flag
// ============================================================
async function checkAndUpdateCallList() {
  console.log(`🕒 Running 5-day-before reminder check at ${new Date().toLocaleString()}`);
  console.log(`🔎 Polling from: ${CALLLIST_API}`);

  try {
    // 1️⃣ Get all contacts
    const { data: customers } = await axios.get(CALLLIST_API);

    // 2️⃣ Filter valid contacts
    const valid = customers.filter(c => c.wrongNumber === false);

    // 3️⃣ Loop and update those 5 days before due date
    for (const cust of valid) {
      const { id, firstName, lastName, paymentduedate, callUser } = cust;
      if (!paymentduedate) continue;

      const due = new Date(paymentduedate);
      const now = new Date();
      const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));

      if (diffDays === 5 && callUser === true) {
        console.log(`📞 Eligible: ${firstName} ${lastName} (${diffDays} days before due)`);

        await axios.put(`${CALLLIST_API}/${id}`, {
          ...cust,
          callUser: false, // Kore.ai will detect this
        });

        console.log(`✅ Updated callUser=false for ${firstName} ${lastName}`);
      } else {
        console.log(`⏩ Skipping ${firstName} ${lastName} — due in ${diffDays} days`);
      }
    }
  } catch (err) {
    console.error(`❌ Polling error: ${err.message}`);
  }
}

// ============================================================
// 🧪 Manual Test Route
// ============================================================
app.get("/trigger-now", async (req, res) => {
  console.log("🧪 Manual trigger route activated");
  await checkAndUpdateCallList();
  res.json({ status: "Manual scheduler triggered" });
});

// ============================================================
// 🕒 Daily Scheduler - Runs 08:00 AM
// ============================================================
cron.schedule("0 8 * * *", () => {
  console.log("🚨 Daily voice reminder scheduler running...");
  checkAndUpdateCallList();
});

// ============================================================
// 🌍 Server Start
// ============================================================
app.listen(PORT, () => {
  console.log(`✅ Voice Scheduler running on port ${PORT}`);
  console.log(`🌐 Available at: https://bayport-scheduler.onrender.com`);
});
