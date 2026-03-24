# KSA-SAM AI Booking Agent

An AI-powered chat agent that lets users book sports courts via natural language.
The backend is now implemented in Python, while the React frontend in `ksa-react/` stays the same.

## Project Structure

```text
ksa-sam-agent/
|-- backend/
|   |-- agent.py
|   |-- api_client.py
|   |-- prompt.py
|   `-- tools.py
|-- cli.py
|-- server.py
|-- requirements.txt
|-- .env.example
`-- ksa-react/
```

## Backend Quick Start

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

Run the HTTP API:

```bash
uvicorn server:app --host 0.0.0.0 --port 3000 --reload
```

Run the CLI:

```bash
python cli.py
```

## Frontend

The frontend contract is unchanged and still uses:

- `POST /chat`
- `DELETE /chat/{sessionId}`
- `GET /health`

To run the React app:

```bash
cd ksa-react
npm install
npm run dev
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `OPENAI_API_KEY` | Yes | - | OpenAI API key |
| `OPENAI_MODEL` | No | `gpt-4o-mini` | Model used by the agent |
| `SAM_BASE_URL` | No | `https://sam-be.idzone.app/api/v2` | KSA-SAM backend base URL |
| `SAM_SERVICE_TOKEN` | Usually | empty | Bearer token used for service-side reads |
| `PORT` | No | `3000` | Preferred backend port |
| `LOG_LEVEL` | No | `INFO` | Backend logging level |

## Notes

- Session history is still stored in memory, so restarting the backend clears active chats.
- The frontend login and payment verification flows still call the existing SAM APIs directly.
- The Python backend keeps auth state per chat session instead of using one global token.
