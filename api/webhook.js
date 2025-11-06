// Webhook endpoint for Farcaster Mini App notifications
// This endpoint receives events from Farcaster clients when users add/remove the app
// and when notifications are enabled/disabled

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // TODO: Verify webhook signature using @farcaster/miniapp-node
    // For now, we'll log the event
    const event = req.body;
    
    console.log('[webhook] Received event:', event);
    
    // In a production app, you would:
    // 1. Verify the signature
    // 2. Parse the event (miniapp_added, notifications_enabled, etc.)
    // 3. Store notification tokens in database
    // 4. Send notifications when matches are accepted
    
    // For now, just return 200 OK
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Error handling webhook:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
}



