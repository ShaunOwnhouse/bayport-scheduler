// ================================================
// Bayport Callback Scheduler WITH HTTP TRIGGER (FINAL BULLETPROOF VERSION)
// - Runs every 1 minute automatically
// - Fires 30 seconds BEFORE or up to 60 seconds AFTER callback time
// - Keeps instance alive via UptimeRobot pings
// ================================================
import fetch from "node-fetch";
import http from "http";

const BASE_URL = "https://6925457482b59600d722efdb.mockapi.io/Calllist";
const CHECK_INTERVAL_MINUTES = 1; // Check every minute
const TZ_OFFSET_HOURS = 2; // Johannesburg (+2)
const EARLY_TRIGGER_SECONDS = 30; // Fire up to 30s before
const LATE_GRACE_SECONDS = 60; // Allow up to 60s after (Render lag)

// ==================== CORE FUNCTION ====================
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
    const currentTime = localNow.toTimeString().slice(0, 8); // "HH:MM:SS"
    
    for (const record of data) {
      const { id, firstName, callUser, callBackTime, isCallback } = record;
      
      console.log(`Processing record: ID ${id}, isCallback: ${isCallback}, callUser: ${callUser}, callBackTime: ${callBackTime}`);
      
      if (callUser === 1 && callBackTime && isCallback === "true") {
        const [cbHour, cbMinute] = callBackTime
          .trim()
          .substring(0, 5)
          .split(":")
          .map((n) => parseInt(n, 10));
        
        const callbackSeconds = cbHour * 3600 + cbMinute * 60;
        const diff = callbackSeconds - nowSeconds;
        
        console.log(`Callback time diff: ${diff} seconds`);
        
        // ✅ Trigger if within 30s BEFORE or 60s AFTER callback time
        if (diff <= EARLY_TRIGGER_SECONDS && diff >= -LATE_GRACE_SECONDS) {
          console.log(
            `✅ [Scheduler] Updating isCallback for ${
              firstName || "ID"
            } ${id} (callback time: ${callBackTime}, trigger diff: ${diff}s)`
          );
          
          try {
            const putRes = await fetch(`${BASE_URL}/${id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ 
                isCallback: "false" 
              }),
            });
            
            if (!putRes.ok) {
              const errorBody = await putRes.text();
              console.error(`❌ Failed to update ID ${id}: ${putRes.status}`, errorBody);
            } else {
              console.log(`✅ Successfully updated record ${id}`);
            }
          } catch (putError) {
            console.error(`❌ Error updating record ${id}:`, putError);
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
setInterval(resetDueCallbacks, CHECK_INTERVAL_MINUTES * 60 * 1000); // repeat every minute
console.log(
  "🚀 [Scheduler] Bayport callback service started (checks every 1 minute, triggers 30s early / 60s late)"
);

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
    res.end(
      "Bayport scheduler is running (checks every 1 min, triggers 30s early / 60s late).\n"
    );
  }
});

server.listen(PORT, () => {
  console.log(`[HTTP] Server listening on port ${PORT}`);
});