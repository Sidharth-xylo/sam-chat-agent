const readline = require("readline");
const { runAgent } = require("./agent/agent");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

let conversationHistory = [];

console.log("\n🏸  KSA-SAM Booking Agent");
console.log("─────────────────────────────");
console.log('Type your message to start booking a court. Type "exit" to quit.\n');

function askQuestion() {
  rl.question("You: ", async (input) => {
    const userInput = input.trim();
    if (!userInput) return askQuestion();
    if (userInput.toLowerCase() === "exit") {
      console.log("\nGoodbye! 👋");
      rl.close();
      process.exit(0);
    }

    try {
      const { reply, history } = await runAgent(userInput, conversationHistory);
      conversationHistory = history;
      console.log(`\nAgent: ${reply}\n`);
    } catch (err) {
      console.error("\n[Error]:", err.message, "\n");
    }

    askQuestion();
  });
}

askQuestion();
