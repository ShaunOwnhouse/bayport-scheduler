// ================================================
// Bayport Callback Scheduler WITH HTTP TRIGGER (FINAL VERSION)
// - Runs every 1 minute automatically
// - Fires ONLY at the exact callback time (HH:MM)
// - Keeps instance alive via UptimeRobot pings
// ================================================

import fetch from "node-fetch";
import http from "http";

const BASE_URL = "https://6925457482b59600d722efdb.mockapi.io/Calllist";
const CHECK_INTERVAL_MINUTES = 1; // Check every 1 minute for near-real-time precision
const TZ_OFFSET_HOURS = 2; // Johannesburg (+2)

// ==================== CORE FUNCTION ====================
async function resetDueCallbacks() {
  console.log("🕓 [Scheduler] Checking for due callbacks...");

  try {
    const response = await fetch(BASE_URL);
    if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
    const data = await response.json();

    const now = new Date();
    const localNow = new Date(now.getTime() + TZ_OFFSET_HOURS * 60 * 60 * 1000);
    const currentTime = localNow.toTimeString().slice(0, 5); // "HH:MM"

    for (const record of data) {
      const { id, firstName, callUser, callBackTime } = record;

      if (callUser === 1 && callBackTime) {
        const normalizedTime = callBackTime.trim().substring(0, 5); // "HH:MM"

        // ✅ Trigger only when times match exactly
        if (normalizedTime === currentTime) {
          console.log(
            `✅ [Scheduler] Resetting callUser for ${firstName || "ID"} ${id} (callback time: ${callBackTime})`
          );

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

// ==================== INTERVAL & STARTUP ====================
resetDueCallbacks(); // run immediately on startup
setInterval(resetDueCallbacks, CHECK_INTERVAL_MINUTES * 60 * 1000); // repeat every 1 min

console.log("🚀 [Scheduler] Bayport callback service started (checks every 1 minute)");

// ==================== HTTP SERVER FOR MANUAL TRIGGER ====================
const PORT = process.env.PORT || 10000;

const server = http.createServer(async (req, res) => {
  if (req.url === "/run-callback-check") {
    console.log("🌐 [HTTP] Manual trigger /run-callback-check");
    await resetDueCallbacks();
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Callback check executed.\n");
  } else {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Bayport scheduler is running and checking every 1 minute.\n");
  }
});

server.listen(PORT, () => {
  console.log(`[HTTP] Server listening on port ${PORT}`);
});
