from __future__ import annotations

import asyncio
import logging
import os

from dotenv import load_dotenv

from backend.agent import run_agent


load_dotenv()
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))


async def main() -> None:
    print("\nKSA-SAM Booking Agent")
    print("---------------------")
    print('Type your message to start booking a court. Type "exit" to quit.\n')

    history = []

    while True:
        user_input = (await asyncio.to_thread(input, "You: ")).strip()
        if not user_input:
            continue
        if user_input.lower() == "exit":
            print("\nGoodbye!\n")
            return

        try:
            result = await run_agent(user_input, history=history)
            history = result["history"]
            print(f"\nAgent: {result['reply'].get('message', '')}\n")
        except Exception as exc:  # pragma: no cover - defensive fallback
            print(f"\n[Error]: {exc}\n")


if __name__ == "__main__":
    asyncio.run(main())
