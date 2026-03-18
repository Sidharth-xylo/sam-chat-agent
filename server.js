require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { runAgent } = require("./agent/agent");
const { clearSession } = require("./agent/apiClient");

const app = express();
app.use(cors());
app.use(express.json());

// ── In-memory session store (swap with Redis for production) ──────
// Map of sessionId → conversationHistory
const sessions = new Map();

/**
 * POST /chat
 * Body: { sessionId: string, message: string }
 * Response: { reply: string, sessionId: string }
 */
app.post("/chat", async (req, res) => {
  const { sessionId, message, authToken, userId } = req.body;

  const { setSession } = require("./agent/apiClient");
  if (authToken && userId) {
    setSession(authToken, Number(userId));
    console.log('[Server] session injected | userId:', userId);
  }

  if (!message) return res.status(400).json({ error: "message is required" });

  const sid = sessionId || `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const history = sessions.get(sid) || [];

  try {
    const { reply, history: updatedHistory } = await runAgent(message, history);
    sessions.set(sid, updatedHistory);
    res.json({ reply, sessionId: sid });
  } catch (err) {
    console.error("[Server Error]", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /chat/:sessionId
 * Clears conversation history and auth session
 */
app.delete("/chat/:sessionId", (req, res) => {
  sessions.delete(req.params.sessionId);
  clearSession();
  res.json({ success: true, message: "Session cleared" });
});

/**
 * GET /health
 */
app.get("/health", (req, res) => res.json({ status: "ok", model: process.env.OPENAI_MODEL }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🏸  KSA-SAM Booking Agent API running on http://localhost:${PORT}`);
  console.log(`POST /chat         → send a message`);
  console.log(`DELETE /chat/:id   → clear a session`);
  console.log(`GET  /health       → health check\n`);
});
