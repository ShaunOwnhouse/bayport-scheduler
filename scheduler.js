// ======================================================================
//  Bayport SA – Outbound Voice Reminder Scheduler (Voice Only)
//  Uses MockAPI + Twilio Voice API
//  Logic:
//    - callUser: false → Eligible, trigger call
//    - callUser: true  → Already called or skip
//    - wrongNumber: true → Skip entirely
//    - 5 days before paymentduedate → Voice call
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
// DATE HELPER
// ----------------------------------------------------------------------
function isFiveDaysBefore(paymentDate) {
  const today = dayjs().startOf('day');
  const targetDate = dayjs(paymentDate).subtract(5, 'day').startOf('day');
  return today.isSame(targetDate);
}

// ----------------------------------------------------------------------
// TWILIO VOICE FUNCTION
// ----------------------------------------------------------------------
async function makeVoiceCall(user) {
  try {
    const call = await client.calls.create({
      to: user.phoneNumber,
      from: process.env.TWILIO_FROM,
      url: process.env.TWILIO_VOICE_URL // TwiML Bin or Kore.ai webhook
    });

    console.log(`📞 Voice call triggered for ${user.firstName} (${user.phoneNumber}) - SID: ${call.sid}`);

    // Update user in MockAPI after successful call
    await axios.put(`${CALLLIST_API}/${user.id}`, { callUser: true });
    console.log(`✅ Updated ${user.firstName}'s record → callUser: true`);
  } catch (err) {
    console.error(`❌ Voice call error for ${user.phoneNumber}:`, err.message);
  }
}

// ----------------------------------------------------------------------
// MAIN SCHEDULER FUNCTION
// ----------------------------------------------------------------------
async function runScheduler() {
  console.log('🔁 Running Bayport SA – Voice Reminder Scheduler...');

  try {
    const { data } = await axios.get(CALLLIST_API);

    // Filter: only valid, eligible customers
    const customers = data.filter(
      c => !c.wrongNumber && c.callUser === false
    );

    if (customers.length === 0) {
      console.log('ℹ️ No eligible customers found today.');
      return;
    }

    for (const user of customers) {
      if (isFiveDaysBefore(user.paymentduedate)) {
        await makeVoiceCall(user);
      } else {
        console.log(`⏳ Not yet 5 days before due date for ${user.firstName}`);
      }
    }

    console.log('✅ Daily voice reminder job completed successfully.');
  } catch (error) {
    console.error('❌ Scheduler error:', error.message);
  }
}

// ----------------------------------------------------------------------
// CRON JOB (Runs Daily at 08:00 South Africa Time)
// ----------------------------------------------------------------------
cron.schedule('0 8 * * *', runScheduler);

// Optional: Manual test endpoint
app.get('/trigger-now', async (req, res) => {
  await runScheduler();
  res.json({ status: 'manual trigger complete' });
});

// ----------------------------------------------------------------------
// EXPRESS SERVER (for Render deployment)
// ----------------------------------------------------------------------
app.listen(process.env.PORT || 10000, () => {
  console.log(`🚀 Voice Scheduler running on port ${process.env.PORT || 10000}`);
});
