// =======================================================
// AUTOMATED OUTBOUND CAMPAIGN DATE CHECKER + TWILIO SMS
// =======================================================

require("dotenv").config();
const express = require("express");
const axios = require("axios");
const dayjs = require("dayjs");
const cron = require("node-cron");
const twilio = require("twilio");

const app = express();
app.use(express.json());
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
  totalSMSSent: 0,
};

// --- Root route ---
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
      smsSent: stats.totalSMSSent,
    },
    currentTime: dayjs().format("YYYY-MM-DD HH:mm:ss"),
  });
});

// --- Manual trigger ---
app.get("/trigger", async (req, res) => {
  try {
    await runCheck("Manual Trigger");
    res.json({ status: "✅ Manual check executed successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =======================================================
// 🔗 CONFIG
// =======================================================
const PAYEE_API = process.env.PAYEE_API;
const CALLLIST_API = process.env.CALLLIST_API;
const TWILIO_SID = process.env.TWILIO_SID;
const TWILIO_AUTH = process.env.TWILIO_AUTH;
const TWILIO_FROM = process.env.TWILIO_FROM;
const TEST_TOKEN = process.env.TEST_TOKEN || "bayport123"; // 🔐 optional access token
const twilioClient = twilio(TWILIO_SID, TWILIO_AUTH);

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
  stats.totalSMSSent = 0;
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

      // =============== Weekend Logic + SMS =================
      if (reminderDay === "Saturday" || reminderDay === "Sunday") {
        stats.totalWeekend++;
        console.log(`⚠️ ${customer.customerfullname} reminder falls on weekend (${reminderDay})`);

        // Pause voice call and mark for SMS
        const { data: callListEntry } = await axios.get(`${CALLLIST_API}?uniqueId=${customer.id}`);
        if (callListEntry.length > 0) {
          const entry = callListEntry[0];
          await axios.put(`${CALLLIST_API}/${entry.id}`, {
            ...entry,
            voiceCallPaused: true,
            smsRequired: true,
          });
          console.log(`🔇 Paused voice call + marked SMS required for ${customer.customerfullname}`);
        }

        // Send SMS via Twilio
        try {
          const smsText = `Hello ${customer.customerfirstname}, this is a reminder from Bayport that your payment is due on ${customer.paymentduedate}. Please ensure timely payment to avoid penalties.`;

          await twilioClient.messages.create({
            body: smsText,
            from: TWILIO_FROM,
            to: customer.customerphone,
          });

          stats.totalSMSSent++;
          console.log(`📨 SMS sent successfully to ${customer.customerfullname}`);
        } catch (smsErr) {
          stats.totalErrors++;
          console.error(`❌ SMS sending failed for ${customer.customerfullname}:`, smsErr.message);
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
// 📩 TWILIO SMS ENDPOINT — for Kore.ai direct use
// =======================================================
app.post("/send-sms", async (req, res) => {
  try {
    const { phone, name, message } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ error: "Missing phone or message" });
    }

    const smsBody =
      message || `Hello ${name || "Customer"}, this is a reminder from Bayport.`;

    const smsResponse = await twilioClient.messages.create({
      body: smsBody,
      from: TWILIO_FROM,
      to: phone,
    });

    console.log(`📤 SMS sent to ${phone}`);
    res.json({ status: "success", sid: smsResponse.sid });
  } catch (err) {
    console.error("❌ Error sending SMS:", err.message);
    res.status(500).json({ status: "error", message: err.message });
  }
});

// =======================================================
// 🧪 TEST-SMS ENDPOINT — Manual SMS via browser or Postman
// =======================================================
app.get("/test-sms", async (req, res) => {
  try {
    // 🔐 Optional simple protection
    const token = req.query.token;
    if (TEST_TOKEN && token !== TEST_TOKEN) {
      return res.status(403).send(`<h3>🚫 Unauthorized</h3><p>Missing or invalid token.</p>`);
    }

    const to = req.query.to || "+27682330163"; // default test number
    const name = req.query.name || "Shaun";
    const dueDate = dayjs().add(5, "day").format("D MMMM YYYY");

    const smsBody = `Hello ${name}, this is a test reminder from Bayport. Your next payment is due on ${dueDate}. (Test message sent at ${dayjs().format("HH:mm:ss")})`;

    const smsResponse = await twilioClient.messages.create({
      body: smsBody,
      from: TWILIO_FROM,
      to: to,
    });

    console.log(`📨 Test SMS sent to ${to}`);
    res.send(`
      <h3>✅ Test SMS sent successfully!</h3>
      <p><b>To:</b> ${to}</p>
      <p><b>Body:</b> ${smsBody}</p>
      <p><b>Twilio SID:</b> ${smsResponse.sid}</p>
    `);
  } catch (err) {
    console.error("❌ Error sending test SMS:", err.message);
    res.status(500).send(`<h3>❌ SMS Failed:</h3><pre>${err.message}</pre>`);
  }
});

// =======================================================
// 🧪 Immediate + Scheduled Run
// =======================================================
(async () => {
  await runCheck("Immediate");
})();
cron.schedule("0 0 * * *", async () => {
  await runCheck("Daily");
});

// =======================================================
// 🌍 Start Server
// =======================================================
app.listen(PORT, () => {
  console.log(`🌍 Web server running on port ${PORT}`);
});
