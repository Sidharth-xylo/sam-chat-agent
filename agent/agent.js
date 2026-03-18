require("dotenv").config();
const OpenAI = require("openai");
const { SYSTEM_PROMPT } = require("./prompt");
const { tools } = require("./tools");
const { executeTool } = require("./apiClient");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// ── Token logger ──────────────────────────────────────────────────
let sessionTokens = { input: 0, output: 0, calls: 0 };

function logTokens(usage, label = '') {
  if (!usage) return;
  sessionTokens.input  += usage.prompt_tokens;
  sessionTokens.output += usage.completion_tokens;
  sessionTokens.calls  += 1;

  const inputCost  = (usage.prompt_tokens     / 1_000_000 * 0.15).toFixed(5);
  const outputCost = (usage.completion_tokens / 1_000_000 * 0.60).toFixed(5);
  const totalCost  = (parseFloat(inputCost) + parseFloat(outputCost)).toFixed(5);

  console.log(`\n[Tokens]${label ? ' ' + label : ''}`);
  console.log(`  This call  → input: ${usage.prompt_tokens} | output: ${usage.completion_tokens} | cost: $${totalCost}`);
  console.log(`  Session    → input: ${sessionTokens.input} | output: ${sessionTokens.output} | calls: ${sessionTokens.calls}`);
  console.log(`  Session $  → $${(sessionTokens.input / 1_000_000 * 0.15 + sessionTokens.output / 1_000_000 * 0.60).toFixed(5)}`);
}

// ── History trimmer ───────────────────────────────────────────────
function trimHistory(history) {
  const MAX_TURNS = 10;
  if (history.length <= MAX_TURNS * 2) return history;

  const trimmed = history.slice(-MAX_TURNS * 2);

  // Find the first index that is safe to start from —
  // never start mid tool_call/tool_result pair
  let startIdx = 0;
  for (let i = 0; i < trimmed.length; i++) {
    // If this is a tool result, skip back until we find
    // its matching assistant tool_calls message
    if (trimmed[i].role === 'tool') {
      // unsafe start — move forward
      startIdx = i + 1;
    } else if (trimmed[i].role === 'assistant' && trimmed[i].tool_calls?.length) {
      // this assistant message has tool calls — safe to start here
      // only if all its tool results follow
      startIdx = i;
      break;
    } else if (trimmed[i].role === 'user') {
      startIdx = i;
      break;
    }
  }

  return trimmed.slice(startIdx);
}

// ── Main agent loop ───────────────────────────────────────────────
async function runAgent(userMessage, history = []) {
  sessionTokens = { input: 0, output: 0, calls: 0 };

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...trimHistory(history),
    { role: "user", content: userMessage },
  ];

  const MAX_ITERATIONS = 10;
  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages,
      tools,
      tool_choice: "auto",
    });

    const message = response.choices[0].message;
    logTokens(response.usage, `iteration ${iterations}`);
    messages.push(message);

    if (!message.tool_calls || message.tool_calls.length === 0) {
      return { reply: message.content, history: messages.slice(1) };
    }

    const toolResults = await Promise.all(
      message.tool_calls.map(async (toolCall) => {
        const name = toolCall.function.name;
        let args;
        try { args = JSON.parse(toolCall.function.arguments); }
        catch { args = {}; }

        console.log(`[Tool] Calling: ${name}`, args);
        const result = await executeTool(name, args);
        console.log(`[Tool] Result:`, JSON.stringify(result).slice(0, 300));

        return {
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        };
      })
    );

    messages.push(...toolResults);
  }

  return {
    reply: "Sorry, I could not complete the request. Please try again.",
    history: messages.slice(1),
  };
}

module.exports = { runAgent };