// ================================================
// Bayport Callback Scheduler — FINAL VERSION
// - Runs every 1 minute automatically
// - Handles 12-hour AM/PM times correctly
// - Fires 30s BEFORE or up to 60s AFTER callback time
// - Manual trigger: /run-callback-check
// - Force trigger: /force-reset-callbacks
// ================================================
import fetch from "node-fetch";
import http from "http";

const BASE_URL = "https://6925457482b59600d722efdb.mockapi.io/Calllist";
const CHECK_INTERVAL_MINUTES = 1;        // Check every minute
const TZ_OFFSET_HOURS = 2;               // Johannesburg (+2)
const EARLY_TRIGGER_SECONDS = 30;        // Fire up to 30s before
const LATE_GRACE_SECONDS = 60;           // Allow up to 60s after

// ==================== CORE SCHEDULED CHECK ====================
async function resetDueCallbacks() {
  console.log("🕓 [Scheduler] Checking for due callbacks...");

  try {
    const response = await fetch(BASE_URL);
    if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
    const data = await response.json();

    const now = new Date();
    const localNow = new Date(now.getTime() + TZ_OFFSET_HOURS * 60 * 60 * 1000);
    const nowSeconds =
      localNow.getHours() * 3600 +
      localNow.getMinutes() * 60 +
      localNow.getSeconds();
    const currentTime = localNow.toTimeString().slice(0, 8);

    for (const record of data) {
      const { id, firstName, callUser, callBackTime, isCallback } = record;

      console.log(
        `Processing record: ID ${id}, isCallback: ${isCallback}, callUser: ${callUser}, callBackTime: ${callBackTime}`
      );

      if (callUser === 1 && callBackTime && isCallback === "true") {
        // --- Parse time safely ---
        let [time, modifier] = callBackTime.trim().split(" ");
        let [cbHour, cbMinute] = time
          .split(":")
          .map((n) => parseInt(n, 10));

        // --- Convert to 24-hour format ---
        if (modifier?.toLowerCase() === "pm" && cbHour < 12) cbHour += 12;
        if (modifier?.toLowerCase() === "am" && cbHour === 12) cbHour = 0;

        const callbackSeconds = cbHour * 3600 + cbMinute * 60;
        const diff = callbackSeconds - nowSeconds;

        console.log(`Callback time diff: ${diff} seconds`);

        // ✅ Trigger if within 30s BEFORE or 60s AFTER callback time
        if (diff <= EARLY_TRIGGER_SECONDS && diff >= -LATE_GRACE_SECONDS) {
          console.log(
            `✅ [Scheduler] Time window hit; updating isCallback for ${
              firstName || "record"
            } (ID ${id}, time: ${callBackTime}, diff: ${diff}s)`
          );

          await updateIsCallbackFalse(id);
        }
      }
    }

    console.log(`✅ [Scheduler] Completed check at ${currentTime}`);
  } catch (error) {
    console.error("❌ [Scheduler] Error in resetDueCallbacks():", error);
  }
}

// ==================== FORCE RESET ====================
// This ignores time windows and just flips ALL isCallback:"true" -> "false"
async function forceResetCallbacks() {
  console.log("⚠️ [Force] FORCING reset of all callbacks (isCallback 'true' -> 'false')");

  try {
    const response = await fetch(BASE_URL);
    if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
    const data = await response.json();

    for (const record of data) {
      const { id, firstName, isCallback } = record;
      console.log(`Force-processing record: ID ${id}, isCallback: ${isCallback}`);

      if (isCallback === "true") {
        console.log(`⚠️ [Force] Updating isCallback for ${firstName || "ID"} ${id} to "false"`);
        await updateIsCallbackFalse(id);
      }
    }

    console.log("✅ [Force] Completed force reset of callbacks");
  } catch (error) {
    console.error("❌ [Force] Error in forceResetCallbacks():", error);
  }
}

// ==================== HELPER FUNCTION ====================
async function updateIsCallbackFalse(id) {
  try {
    const putRes = await fetch(`${BASE_URL}/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isCallback: "false" }),
    });

    if (!putRes.ok) {
      const errorBody = await putRes.text();
      console.error(`❌ Failed to update ID ${id}: ${putRes.status} ${errorBody}`);
    } else {
      console.log(`✅ Successfully updated record ${id} (isCallback -> "false")`);
    }
  } catch (putError) {
    console.error(`❌ Error updating record ${id}:`, putError);
  }
}

// ==================== AUTO CHECK + SERVER ====================
resetDueCallbacks(); // Run immediately
setInterval(resetDueCallbacks, CHECK_INTERVAL_MINUTES * 60 * 1000);

console.log(
  "🚀 [Scheduler] Bayport callback service started (checks every 1 min, triggers 30s early / 60s late)"
);

// --- HTTP Server for manual / force triggers ---
const PORT = process.env.PORT || 10000;
const server = http.createServer(async (req, res) => {
  if (req.url === "/run-callback-check") {
    console.log("🌐 [HTTP] Manual trigger /run-callback-check");
    await resetDueCallbacks();
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Manual callback check executed.\n");
  } else if (req.url === "/force-reset-callbacks") {
    console.log("🌐 [HTTP] FORCE trigger /force-reset-callbacks");
    await forceResetCallbacks();
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end('Force reset executed: all "isCallback:true" set to "false".\n');
  } else {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(
      "Bayport Scheduler is running.\nAvailable routes:\n  • /run-callback-check\n  • /force-reset-callbacks\n"
    );
  }
});

server.listen(PORT, () => {
  console.log(`[HTTP] Server listening on port ${PORT}`);
});
