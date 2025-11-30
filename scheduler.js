// ======================================================================
//  Bayport SA – Combined SMS + Voice Outbound Reminder Scheduler
//  Uses MockAPI, Twilio, and Kore.ai integration
//  Logic:
//    - callUser: false → Eligible, trigger call
//    - callUser: true  → Already called or skip
//    - wrongNumber: true → Skip entirely
//    - 5 days before paymentduedate → Voice call
//    - Weekend → SMS fallback
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
const PAYEE_API = process.env.PAYEE_API;

// ----------------------------------------------------------------------
// DATE HELPERS
// ----------------------------------------------------------------------
function isWeekend(date = dayjs()) {
  const day = date.day();
  return day === 0 || day === 6;
}

function isFiveDaysBefore(paymentDate) {
  const today = dayjs().startOf('day');
  const targetDate = dayjs(paymentDate).subtract(5, 'day').startOf('day');
  return today.isSame(targetDate);
}

// ----------------------------------------------------------------------
// TWILIO FUNCTIONS
// ----------------------------------------------------------------------
async function sendSMS(user, message) {
  try {
    const sms = await client.messages.create({
      body: message,
      to: user.phoneNumber,
      from: process.env.TWILIO_FROM
    });
    console.log(`📩 SMS sent to ${user.firstName} (${user.phoneNumber}) - SID: ${sms.sid}`);
  } catch (err) {
    console.error(`❌ SMS error for ${user.phoneNumber}:`, err.message);
  }
}

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
  console.log('🔁 Running Bayport SA – Outbound Reminder Scheduler...');

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
        if (isWeekend()) {
          // Weekend SMS fallback
          const message = `Bayport SA: Hello ${user.firstName}, your loan payment is due on ${user.paymentduedate}. Please reply to confirm or call 0860 123 456.`;
          await sendSMS(user, message);
          console.log(`🕐 Weekend — Sent SMS to ${user.firstName}`);
        } else {
          // Weekday → trigger voice call
          await makeVoiceCall(user);
        }
      } else {
        console.log(`⏳ Not yet 5 days before due date for ${user.firstName}`);
      }
    }

    console.log('✅ Daily reminder job completed successfully.');
  } catch (error) {
    console.error('❌ Scheduler error:', error.message);
  }
}

// ----------------------------------------------------------------------
// CRON JOB (Runs Daily at 08:00 South Africa Time)
// ----------------------------------------------------------------------
cron.schedule('0 8 * * *', runScheduler);

// Optional: allow manual trigger for testing
app.get('/trigger-now', async (req, res) => {
  await runScheduler();
  res.json({ status: 'manual trigger complete' });
});

// ----------------------------------------------------------------------
// EXPRESS SERVER (for Render deployment)
// ----------------------------------------------------------------------
app.listen(process.env.PORT || 10000, () => {
  console.log(`🚀 Scheduler running on port ${process.env.PORT || 10000}`);
});
