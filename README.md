# KSA-SAM AI Booking Agent 🏸

An AI-powered chat agent that lets users book sports courts via natural language.
Built with **Node.js** + **OpenAI GPT-4o-mini** function calling.

---

## Project Structure

```
ksa-sam-agent/
├── index.js          ← CLI chat interface (terminal)
├── server.js         ← Express HTTP API (for frontend/web)
├── package.json
├── .env.example      ← Copy this to .env and fill in your keys
│
└── agent/
    ├── agent.js      ← Core agent loop (OpenAI + tool execution)
    ├── prompt.js     ← System prompt / agent instructions
    ├── tools.js      ← OpenAI function definitions
    └── apiClient.js  ← KSA-SAM API calls + session/token storage
```

---

## Quick Start

### 1. Install Dependencies
```bash
cd ksa-sam-agent
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env and add your OpenAI API key
```

### 3a. Run as CLI (Terminal Chat)
```bash
npm start
```

### 3b. Run as HTTP API (for Frontend)
```bash
node server.js
```

---

## Booking Flow the Agent Handles

```
User says "book a badminton court"
        ↓
1. Agent asks for email + password → calls login()
2. Fetches all venues            → shows list to user
3. User picks venue              → fetches sports for that venue
4. User picks sport              → fetches courts
5. User picks court + date       → fetches available slots
6. Shows slots (time | price)    → user picks slot(s)
7. Confirms details              → calls create_booking()
8. Returns razorpay_order_id     → user completes payment on frontend
```

---

## HTTP API Usage (server.js)

### Send a Message
```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{ "message": "I want to book a badminton court", "sessionId": "user_123" }'
```

**Response:**
```json
{
  "reply": "Sure! Let me help you book a court. Could you please share your email and password to get started?",
  "sessionId": "user_123"
}
```

### Continue Conversation (same sessionId keeps context)
```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{ "message": "my email is test@example.com password Welcome@123", "sessionId": "user_123" }'
```

### Clear a Session
```bash
curl -X DELETE http://localhost:3000/chat/user_123
```

---

## Environment Variables

| Variable         | Required | Default             | Description                          |
|-----------------|----------|---------------------|--------------------------------------|
| OPENAI_API_KEY  | ✅ Yes   | —                   | Your OpenAI API key                  |
| OPENAI_MODEL    | No       | gpt-4o-mini         | OpenAI model to use                  |
| SAM_BASE_URL    | No       | https://sam-be...   | KSA-SAM backend base URL             |
| MAX_HISTORY_TURNS | No     | 20                  | Max conversation turns to keep       |
| PORT            | No       | 3000                | HTTP server port                     |

---

## Payment Flow Note

The agent handles everything up to **creating the booking** and returning the `razorpay_order_id`.

Payment completion is handled on your **frontend** using the Razorpay SDK:
```
1. Agent returns → razorpay_order_id
2. Frontend opens Razorpay checkout
3. User pays → Razorpay returns payment_id + signature
4. Call POST /api/v2/bookings/verify-payment with those values
```

The agent supports `verify_payment()` if you pass those values back to it via chat.

---

## Cost Estimate (GPT-4o-mini)

| Usage                  | Approx. Cost  |
|------------------------|---------------|
| 1 full booking (~2K tokens) | ~$0.0003 |
| 1,000 bookings/day     | ~$0.30/day    |
| 10,000 bookings/day    | ~$3.00/day    |

---

## Production Upgrades (TODO)

- [ ] Replace in-memory session `Map` with **Redis**
- [ ] Add per-user auth token storage (not global variable)
- [ ] Add rate limiting (e.g., `express-rate-limit`)
- [ ] Add input sanitization / validation middleware
- [ ] Deploy on **Railway / Render / EC2**
- [ ] Stream responses using `stream: true` for better UX
