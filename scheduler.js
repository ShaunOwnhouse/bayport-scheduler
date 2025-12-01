// ===============================================
// Bayport Voice Scheduler – Final Version
// Logic: Update callUser flag based on payment due date
// ===============================================

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');

// =====================================================
// CONFIGURATION
// =====================================================
const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 10000;
const API_URL = "https://6925457482b59600d722efdb.mockapi.io/Calllist";

// =====================================================
// HELPER FUNCTION
// =====================================================
async function checkAndUpdateCallList() {
  console.log("🕓 Running 5-day-before reminder check at", new Date().toLocaleString());

  try {
    const response = await axios.get(API_URL);
    const users = response.data;
    const now = new Date();

    if (!Array.isArray(users) || users.length === 0) {
      console.log("⚠️ No users found in MockAPI Calllist.");
      return;
    }

    for (const user of users) {
      try {
        const paymentDate = new Date(user.paymentduedate);
        const diffDays = Math.ceil((paymentDate - now) / (1000 * 60 * 60 * 24));

        // ✅ CASE 1: Payment due in 5 days or less
        if (
          diffDays <= 5 &&
          diffDays >= 0 &&
          (user.callUser === 1 || user.callUser === "1") &&
          user.wrongNumber === false
        ) {
          console.log(`📞 [TRIGGER] ${user.firstName} ${user.lastName} — due in ${diffDays} day(s).`);

          await axios.put(`${API_URL}/${user.id}`, {
            ...user,
            callUser: 0,
          });

          console.log(`✅ Updated ${user.firstName}: callUser → 0`);
        }

        // ✅ CASE 2: Payment date has passed → reset callUser
        else if (
          diffDays < 0 &&
          (user.callUser === 0 || user.callUser === "0")
        ) {
          console.log(`🔁 [RESET] ${user.firstName} — payment passed (${user.paymentduedate}).`);

          await axios.put(`${API_URL}/${user.id}`, {
            ...user,
            callUser: 1,
          });

          console.log(`✅ Reset ${user.firstName}: callUser → 1`);
        }

        // ⏭ CASE 3: Skip anything else
        else {
          console.log(`⏭ Skipping ${user.firstName} — due in ${diffDays} days or invalid record.`);
        }
      } catch (innerErr) {
        console.error(`❌ Error processing user ${user.id}:`, innerErr.message);
      }
    }

  } catch (error) {
    console.error("❌ Error fetching data from MockAPI:", error.message);
  }
}

// =====================================================
// SCHEDULER ROUTES
// =====================================================

// Manual trigger route (for testing)
app.get('/trigger-now', async (req, res) => {
  console.log("🚀 Manual trigger route activated");
  await checkAndUpdateCallList();
  res.json({ status: "Manual scheduler triggered" });
});

// Root endpoint
app.get('/', (req, res) => {
  res.send("✅ Bayport Scheduler is running.");
});

// =====================================================
// SERVER INITIALIZATION
// =====================================================
app.listen(PORT, () => {
  console.log("🚀 Bayport Voice Scheduler starting...");
  console.log(`✅ Voice Scheduler running on port ${PORT}`);
  console.log(`🌐 Available at: https://bayport-scheduler.onrender.com`);
  console.log("//////////////////////////////////////////////////////////");
  console.log("==> Your service is live 🎉");
  console.log("//////////////////////////////////////////////////////////");

  // Run every 6 hours
  setInterval(checkAndUpdateCallList, 6 * 60 * 60 * 1000);

  // Run immediately on startup
  checkAndUpdateCallList();
});
