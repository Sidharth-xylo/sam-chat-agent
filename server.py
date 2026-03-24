from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from typing import Any
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from backend.agent import run_agent


load_dotenv()

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)


@dataclass
class SessionState:
    history: list[dict[str, Any]] = field(default_factory=list)
    booking_state: dict[str, Any] = field(default_factory=dict)
    auth_token: str | None = None
    user_id: int | None = None


class ChatRequest(BaseModel):
    sessionId: str | None = None
    message: str | None = None
    pickerEvent: dict | None = None
    authToken: str | None = None
    userId: int | None = None


app = FastAPI(title="KSA-SAM Booking Agent", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

sessions: dict[str, SessionState] = {}


@app.post("/chat")
async def chat(request: ChatRequest) -> dict[str, Any]:
    if not request.message and not request.pickerEvent:
        raise HTTPException(status_code=400, detail="message or pickerEvent is required")

    session_id = request.sessionId or f"s_{uuid4().hex}"
    state = sessions.setdefault(session_id, SessionState())

    if request.authToken and request.userId is not None:
        state.auth_token = request.authToken
        state.user_id = int(request.userId)
        state.booking_state["loggedIn"] = True
        state.booking_state["userId"] = state.user_id
        logger.info("session injected for userId=%s", state.user_id)

    try:
        result = await run_agent(
            request.message or "",
            history=state.history,
            auth_token=state.auth_token,
            user_id=state.user_id,
            booking_state=state.booking_state,
            picker_event=request.pickerEvent,
        )
        state.history = result["history"]
        state.booking_state = result.get("booking_state", state.booking_state)
        logger.info("reply ui.type=%s booking_state=%s", result["reply"].get("ui", {}).get("type"), state.booking_state)
        return {"reply": result["reply"], "sessionId": session_id}
    except Exception as exc:  # pragma: no cover - defensive fallback
        logger.exception("chat request failed")
        return JSONResponse(
            status_code=500,
            content={
                "reply": {
                    "message": "Server error. Please try again.",
                    "ui": {"type": "text", "data": None},
                },
                "sessionId": session_id,
                "error": str(exc),
            },
        )


@app.delete("/chat/{session_id}")
async def clear_chat(session_id: str) -> dict[str, bool]:
    sessions.pop(session_id, None)
    return {"success": True}


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
