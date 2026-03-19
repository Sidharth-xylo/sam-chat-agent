require("dotenv").config();
const OpenAI = require("openai");
const { SYSTEM_PROMPT } = require("./prompt");
const { tools }         = require("./tools");
const { executeTool }   = require("./apiClient");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL  = process.env.OPENAI_MODEL || "gpt-4o-mini";

// ── Token logger ──────────────────────────────────────────────────
let sessionTokens = { input: 0, output: 0, calls: 0 };

function logTokens(usage) {
  if (!usage) return;
  sessionTokens.input  += usage.prompt_tokens;
  sessionTokens.output += usage.completion_tokens;
  sessionTokens.calls  += 1;
  const cost = (sessionTokens.input/1e6*0.15 + sessionTokens.output/1e6*0.60).toFixed(6);
  console.log(`[Tokens] in:${usage.prompt_tokens} out:${usage.completion_tokens} | total: $${cost}`);
}

// ── Safe history trim — never break tool_call / tool pairs ────────
function trimHistory(history) {
  const MAX = 12;
  if (history.length <= MAX) return history;
  const trimmed = history.slice(-MAX);
  // Find first safe starting point (user message)
  const start = trimmed.findIndex(m => m.role === "user");
  return start > 0 ? trimmed.slice(start) : trimmed;
}

// ── Main agent loop ───────────────────────────────────────────────
async function runAgent(userMessage, history = []) {
  sessionTokens = { input: 0, output: 0, calls: 0 };

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...trimHistory(history),
    { role: "user", content: userMessage }
  ];

  const MAX_ITER = 8;
  let iter = 0;

  while (iter < MAX_ITER) {
    iter++;

    const response = await openai.chat.completions.create({
      model:           MODEL,
      messages,
      tools,
      tool_choice:     "auto",
      response_format: { type: "json_object" }, // always force JSON
    });

    logTokens(response.usage);

    const msg = response.choices[0].message;
    messages.push(msg);

    // ── No tool calls → agent produced final JSON response ────────
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      let parsed;
      try {
        parsed = JSON.parse(msg.content);
      } catch(e) {
        // Fallback if JSON parse fails
        parsed = {
          message: msg.content || "Something went wrong. Please try again.",
          ui: { type: "text", data: null }
        };
      }
      return { reply: parsed, history: messages.slice(1) };
    }

    // ── Execute tool calls ────────────────────────────────────────
    const toolResults = await Promise.all(
      msg.tool_calls.map(async (tc) => {
        let args = {};
        try { args = JSON.parse(tc.function.arguments); } catch {}
        console.log(`[Tool] ${tc.function.name}`, args);
        const result = await executeTool(tc.function.name, args);
        console.log(`[Tool] result:`, JSON.stringify(result).slice(0, 200));
        return {
          role:         "tool",
          tool_call_id: tc.id,
          content:      JSON.stringify(result)
        };
      })
    );

    messages.push(...toolResults);
  }

  return {
    reply: { message: "Sorry, I could not complete that. Please try again.", ui: { type: "text", data: null } },
    history: messages.slice(1)
  };
}

module.exports = { runAgent };