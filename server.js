require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const { runAgent }              = require("./agent/agent");
const { setSession, clearSession } = require("./agent/apiClient");

const app = express();
app.use(cors());
app.use(express.json());

const sessions = new Map();

app.post("/chat", async (req, res) => {
  const { sessionId, message, authToken, userId } = req.body;

  // Inject user token so create_booking can use it
  if (authToken && userId) {
    setSession(authToken, Number(userId));
    console.log("[Server] session injected | userId:", userId);
  }

  if (!message) return res.status(400).json({ error: "message is required" });

  const sid     = sessionId || `s_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const history = sessions.get(sid) || [];

  try {
    const { reply, history: updated } = await runAgent(message, history);
    sessions.set(sid, updated);
    res.json({ reply, sessionId: sid });
  } catch(err) {
    console.error("[Error]", err);
    res.status(500).json({
      reply: { message: "Server error. Please try again.", ui: { type: "text", data: null } },
      sessionId: sid
    });
  }
});

app.delete("/chat/:sid", (req, res) => {
  sessions.delete(req.params.sid);
  clearSession();
  res.json({ success: true });
});

app.get("/health", (req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`\n🏸 KSA-SAM Agent on http://localhost:${PORT}\n`));