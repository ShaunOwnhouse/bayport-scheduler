// ======================================================================
//  Bayport SA – Outbound Voice Reminder Scheduler (Voice Only)
//  Uses MockAPI + Twilio Voice API + Kore.ai Integration
//  Logic:
//    • Automatic call 5 days before paymentduedate
//    • Manual trigger when callUser changes from true → false
//    • /trigger-now endpoint for instant demo
//    • Demo override: allows manual triggers anytime
// ======================================================================

require('dotenv').config();
const axios = require('axios');
const dayjs = require('dayjs');
const cron = require('node-cron');
const twilio = require('twilio');
const express = require('express');

const app = express();
const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH);

// ----------------------------------------------------------------------
// ENVIRONMENT VARIABLES
// ----------------------------------------------------------------------
const CALLLIST_API = process.env.CALLLIST_API;

// ----------------------------------------------------------------------
// HELPER FUNCTIONS
// ----------------------------------------------------------------------

// Check if today is 5 days before the due date
function isFiveDaysBefore(paymentDate) {
  const today = dayjs().startOf('day');
  const target = dayjs(paymentDate).subtract(5, 'day').startOf('day');
  return today.isSame(target);
}

// Trigger Twilio voice call
async function makeVoiceCall(user, triggerType = "auto") {
  try {
    console.log(`📞 Initiating ${triggerType} voice call for ${user.firstName} (${user.phoneNumber})`);

    const call = await client.calls.create({
      to: user.phoneNumber,
      from: process.env.TWILIO_FROM,
      url: process.env.TWILIO_VOICE_URL // TwiML Bin or Kore.ai webhook URL
    });

    console.log(`✅ Twilio call started (SID: ${call.sid})`);

    // Update record in MockAPI
    await axios.put(`${CALLLIST_API}/${user.id}`, { callUser: true });
    console.log(`✅ Updated ${user.firstName}'s record → callUser: true`);
  } catch (err) {
    console.error(`❌ Voice call error for ${user.firstName}:`, err.message);
  }
}

// ----------------------------------------------------------------------
// 1️⃣ DAILY SCHEDULER — automatic 5-days-before payment due
// ----------------------------------------------------------------------
async function runScheduler() {
  console.log('🔁 Running daily 5-day-before voice reminder check...');

  try {
    const { data: customers } = await axios.get(
      `${CALLLIST_API}?wrongNumber=false&callUser=false`
    );

    if (!customers || customers.length === 0) {
      console.log('ℹ️ No eligible customers found today.');
      return;
    }

    for (const user of customers) {
      if (isFiveDaysBefore(user.paymentduedate)) {
        await makeVoiceCall(user, "scheduled");
      } else {
        console.log(`⏳ ${user.firstName} is not yet within 5-day window.`);
      }
    }

    console.log('✅ Daily scheduler completed.');
  } catch (err) {
    console.error('❌ Scheduler error:', err.message);
  }
}

// Schedule every day at 08:00 AM South Africa time
cron.schedule('0 8 * * *', runScheduler);

// ----------------------------------------------------------------------
// 2️⃣ POLLING LOOP — manual/demo trigger when callUser flips true→false
// ----------------------------------------------------------------------
let lastSnapshot = [];

async function pollForManualTriggers() {
  try {
    const { data: current } = await axios.get(
      `${CALLLIST_API}?wrongNumber=false&callUser=false`
    );

    // Detect new manual triggers (callUser reset to false)
    const newTriggers = current.filter(
      u => !lastSnapshot.find(prev => prev.id === u.id)
    );

    for (const user of newTriggers) {
      console.log(`🚨 Manual trigger detected for ${user.firstName}`);

      // DEMO OVERRIDE: Always trigger even if not 5 days before
      await makeVoiceCall(user, "manual-demo");
    }

    lastSnapshot = current;
  } catch (err) {
    console.error('⚠️ Polling error:', err.message);
  }
}

// Poll MockAPI every 60 seconds
setInterval(pollForManualTriggers, 60 * 1000);

// ----------------------------------------------------------------------
// 3️⃣ MANUAL ROUTE — instant run for demos or testing
// ----------------------------------------------------------------------
app.get('/trigger-now', async (req, res) => {
  console.log('⚡ Manual trigger-now route activated');
  await runScheduler();
  res.json({ status: 'manual 5-day scheduler triggered' });
});

// ----------------------------------------------------------------------
// EXPRESS SERVER (Render deployment)
// ----------------------------------------------------------------------
app.listen(process.env.PORT || 10000, () => {
  console.log(`🚀 Voice Scheduler running on port ${process.env.PORT || 10000}`);
});
