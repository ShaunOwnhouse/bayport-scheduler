// ================================================
// Bayport Callback Scheduler (FINAL VERSION)
// Checks every 5 minutes for due callbacks and
// resets callUser back to 0 so the VA can call again.
// ================================================

import fetch from "node-fetch";

const BASE_URL = "https://6925457482b59600d722efdb.mockapi.io/Calllist";
const CHECK_INTERVAL_MINUTES = 5;
const TZ_OFFSET_HOURS = 2; // Johannesburg (+2)

async function resetDueCallbacks() {
  console.log("🕓 [Scheduler] Checking for due callbacks...");

  try {
    const response = await fetch(BASE_URL);
    if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
    const data = await response.json();

    const now = new Date();
    const localNow = new Date(now.getTime() + TZ_OFFSET_HOURS * 60 * 60 * 1000);
    const currentTime = localNow.toTimeString().slice(0, 5); // e.g. "14:30"

    for (const record of data) {
      const { id, firstName, callUser, callBackTime } = record;

      if (callUser === 1 && callBackTime) {
        const normalizedTime = callBackTime.trim().substring(0, 5);

        if (normalizedTime <= currentTime) {
          console.log(`✅ [Scheduler] Resetting callUser for ${firstName || "ID"} ${id} (callback time: ${callBackTime})`);

          const putRes = await fetch(`${BASE_URL}/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ callUser: 0 })
          });

          if (!putRes.ok) {
            console.error(`❌ Failed to reset ID ${id}: ${putRes.status}`);
          }
        }
      }
    }

    console.log(`✅ [Scheduler] Completed check at ${currentTime}`);

  } catch (error) {
    console.error("❌ [Scheduler] Error:", error);
  }
}

// Run immediately and repeat every 5 minutes
resetDueCallbacks();
setInterval(resetDueCallbacks, CHECK_INTERVAL_MINUTES * 60 * 1000);
