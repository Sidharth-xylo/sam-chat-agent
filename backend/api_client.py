from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
from typing import Any

import requests
from dotenv import load_dotenv


load_dotenv(override=True)

logger = logging.getLogger(__name__)


def get_base_url() -> str:
    return os.getenv("SAM_BASE_URL", "https://sam-be.idzone.app/api/v2").rstrip("/")


def _decode_service_user_id(token: str) -> int | None:
    """Extract userId from the service token JWT payload (no signature check needed)."""
    try:
        segment = token.split(".")[1]
        # Add padding so base64 doesn't error
        padded = segment + "=" * (4 - len(segment) % 4)
        payload = json.loads(base64.b64decode(padded))
        uid = payload.get("userId") or payload.get("id") or payload.get("sub")
        return int(uid) if uid is not None else None
    except Exception:
        return None


def payload_data(value: Any) -> Any:
    if isinstance(value, dict) and "data" in value:
        return value["data"]
    return value


def is_error_result(value: Any) -> bool:
    return isinstance(value, dict) and value.get("error") is True


def normalize_path(path: str) -> str:
    return "/" + path.lstrip("/")


def strip_base64(value: Any) -> Any:
    if isinstance(value, str):
        if value.startswith("data:image") or (
            len(value) > 200
            and value.replace("+", "").replace("/", "").replace("=", "").isalnum()
        ):
            return "[image]"
        return value
    if isinstance(value, list):
        return [strip_base64(item) for item in value]
    if isinstance(value, dict):
        return {k: strip_base64(v) for k, v in value.items()}
    return value


def format_time(start: str = "", end: str = "") -> str:
    def to_hhmm(raw: str) -> str:
        if not raw:
            return "??:??"
        parts = raw.strip().split(" ")[0].split(":")
        return f"{parts[0].zfill(2)}:{parts[1].zfill(2) if len(parts) > 1 else '00'}"

    return f"{to_hhmm(start)}-{to_hhmm(end)}"


class ApiClient:
    def __init__(self, auth_token: str | None = None, current_user_id: int | None = None):
        self.auth_token = auth_token
        self.current_user_id = current_user_id
        self.base_url = get_base_url()
        # Read once at init, not on every request
        self._service_token = os.getenv("SAM_SERVICE_TOKEN")
        self._service_user_id = _decode_service_user_id(self._service_token or "")
        self._session = requests.Session()
        self._session.headers.update({"Content-Type": "application/json"})

    async def aclose(self) -> None:
        await asyncio.to_thread(self._session.close)

    def _decode_json(self, response: requests.Response) -> Any:
        try:
            return response.json()
        except ValueError:
            return {"message": response.text or "Request failed"}

    async def service_get(self, path: str) -> Any:
        headers = {}
        if self._service_token:
            headers["Authorization"] = f"Bearer {self._service_token}"

        url = f"{self.base_url}{normalize_path(path)}"
        try:
            response = await asyncio.to_thread(
                self._session.get, url, headers=headers, timeout=30
            )
        except requests.RequestException as exc:
            logger.exception("service_get failed url=%s", url)
            return {"error": True, "message": f"Unable to reach SAM backend: {exc}"}

        data = self._decode_json(response)
        if not response.ok:
            return {"error": True, "message": data.get("message", "Request failed")}
        return strip_base64(data)

    async def get_venues(self) -> Any:
        data = await self.service_get("/venues")
        if is_error_result(data):
            return data
        venues = payload_data(data)
        if not isinstance(venues, list):
            return {"error": True, "message": "Venue API did not return a list."}
        return [
            {
                "venueId": v.get("venueId") or v.get("id"),
                "name": v.get("name") or v.get("venueName"),
                "city": v.get("city", ""),
            }
            for v in venues
        ]

    async def get_sports_by_venue(self, venue_id: int) -> Any:
        data = await self.service_get(f"/sports/by-venue?venueId={venue_id}")
        if is_error_result(data):
            return data
        sports = payload_data(data)
        if not isinstance(sports, list):
            return {"error": True, "message": "Sports API did not return a list."}
        return [
            {"id": s.get("id"), "name": s.get("name") or s.get("sportName")}
            for s in sports
        ]

    async def get_courts_by_sport(self, sport_id: int) -> Any:
        data = await self.service_get(f"/courts/sport/{sport_id}")
        if is_error_result(data):
            return data
        courts = payload_data(data)
        if not isinstance(courts, list):
            return {"error": True, "message": "Courts API did not return a list."}
        return [
            {
                "id": c.get("courtId") or c.get("id"),
                "name": (
                    c.get("courtName")
                    or c.get("name")
                    or f"Court {c.get('courtId') or c.get('id')}"
                ),
                "type": c.get("courtType") or c.get("type") or "",
            }
            for c in courts
        ]

    async def get_slots(
        self,
        sport_id: int,
        venue_id: int,
        date: str,
        court_id: int | None = None,
        preferred_time: str | None = None,
    ) -> dict[str, Any]:
        """
        Returns {"courts": [...], "slots": [...], "autoSelectedSlot": ...} in one call.
        Fetches courts internally so the model only needs one tool call for the slots step.
        """
        if court_id is not None:
            courts = [{"id": court_id}]
        else:
            courts = await self.get_courts_by_sport(sport_id=sport_id)

        if is_error_result(courts):
            return courts  # type: ignore[return-value]

        if not courts:
            logger.info("get_slots -> no courts for sportId=%s", sport_id)
            return {"courts": [], "slots": [], "autoSelectedSlot": None}

        tasks = [
            self.service_get(
                f"/slots?sportId={sport_id}&courtId={c['id']}&date={date}&venueId={venue_id}"
            )
            for c in courts
        ]
        per_court = await asyncio.gather(*tasks)

        all_slots: list[dict[str, Any]] = []
        for court, slot_data in zip(courts, per_court):
            if is_error_result(slot_data):
                return slot_data  # type: ignore[return-value]
            slots = payload_data(slot_data)
            if not isinstance(slots, list):
                continue
            for slot in slots:
                all_slots.append(
                    {
                        "id": slot.get("slotId") or slot.get("id"),
                        "courtId": slot.get("courtId") or court["id"],
                        "time": format_time(slot.get("startTime", ""), slot.get("endTime", "")),
                        "price": f"INR {slot.get('rate', slot.get('price', 0))}",
                        "available": slot.get("availabilityStatus") == "available",
                    }
                )

        auto_selected = None
        if preferred_time:
            # Find first available slot whose start time matches preferred_time.
            for slot in all_slots:
                slot_start = slot["time"].split("-")[0]
                if slot_start == preferred_time and slot["available"]:
                    auto_selected = slot
                    break

        logger.info("get_slots -> %s courts, %s slots", len(courts), len(all_slots))
        return {
            "courts": courts,
            "slots": all_slots,
            "autoSelectedSlot": auto_selected,
        }

    async def get_all_sports(self) -> Any:
        venues_data = await self.service_get("/venues")
        if is_error_result(venues_data):
            return venues_data
        venues = payload_data(venues_data)
        if not isinstance(venues, list):
            return {"error": True, "message": "Venue API did not return a list."}

        venue_meta = [
            (
                v.get("venueId") or v.get("id"),
                v.get("name") or v.get("venueName") or f"Venue {v.get('venueId') or v.get('id')}",
            )
            for v in venues
        ]
        results = await asyncio.gather(
            *(self.service_get(f"/sports/by-venue?venueId={vid}") for vid, _ in venue_meta)
        )

        seen: dict[str, dict[str, Any]] = {}
        for (venue_id, venue_name), sports_data in zip(venue_meta, results):
            if is_error_result(sports_data):
                return sports_data
            sports = payload_data(sports_data)
            if not isinstance(sports, list):
                continue
            for s in sports:
                key = (s.get("name") or s.get("sportName") or "").strip().lower()
                if key and key not in seen:
                    seen[key] = {
                        "id": s.get("id"),
                        "name": s.get("name") or s.get("sportName"),
                        "venueId": venue_id,
                        "venueName": venue_name,
                    }
        return list(seen.values())

    async def get_venues_by_sport(
        self, sport_id: int | None = None, sport_name: str | None = None
    ) -> Any:
        venues_data = await self.service_get("/venues")
        if is_error_result(venues_data):
            return venues_data
        venues = payload_data(venues_data)
        if not isinstance(venues, list):
            return {"error": True, "message": "Venue API did not return a list."}

        results = await asyncio.gather(
            *(
                self.service_get(f"/sports/by-venue?venueId={v.get('venueId') or v.get('id')}")
                for v in venues
            )
        )

        matches: list[dict[str, Any]] = []
        for venue, sports_data in zip(venues, results):
            if is_error_result(sports_data):
                return sports_data
            sports = payload_data(sports_data)
            if not isinstance(sports, list):
                continue
            sport = next(
                (
                    s for s in sports
                    if (sport_id is not None and s.get("id") == sport_id)
                    or (
                        sport_name
                        and sport_name.lower() in (s.get("name") or s.get("sportName") or "").lower()
                    )
                ),
                None,
            )
            if sport:
                venue_id = venue.get("venueId") or venue.get("id")
                matches.append(
                    {
                        "venueId": venue_id,
                        "name": venue.get("name") or venue.get("venueName") or f"Venue {venue_id}",
                        "city": venue.get("city", ""),
                        "sportId": sport.get("id"),
                        "sportName": sport.get("name") or sport.get("sportName"),
                    }
                )
        return matches

    async def create_booking(
        self,
        slot_ids: list[int],
        booked_for: str,
        user_id: int | None = None,
    ) -> dict[str, Any]:
        resolved_user_id = user_id or self.current_user_id
        if not resolved_user_id or not self.auth_token:
            return {"error": True, "message": "Not authenticated."}

        url = f"{self.base_url}{normalize_path('/bookings/book-now')}"
        try:
            response = await asyncio.to_thread(
                self._session.post,
                url,
                headers={"Authorization": f"Bearer {self.auth_token}"},
                json={"userId": resolved_user_id, "slotIds": slot_ids, "bookedFor": booked_for},
                timeout=30,
            )
        except requests.RequestException as exc:
            logger.exception("create_booking failed")
            return {"error": True, "message": f"Unable to reach booking API: {exc}"}

        data = self._decode_json(response)
        if not response.ok:
            return {"error": True, "message": data.get("message", "Booking failed")}

        return {
            "success": data.get("success"),
            "razorpayOrderId": data.get("razorpayOrderId"),
            "keyId": data.get("keyId"),
            "amount": data.get("amount", 0),
            "bookingRef": data.get("bookingRef"),
        }

    async def create_booking_as_guest(
        self,
        slot_ids: list[int],
        guest_name: str,
        guest_email: str,
        guest_mobile: str,
    ) -> dict[str, Any]:
        """
        Book on behalf of a new (unregistered) user using the chatbot service account.
        Uses bookedFor='guest' so no real User account is needed yet.
        The service token's userId acts as the booking owner; guest details are stored
        in the GuestUser table until the user registers after payment.
        """
        if not self._service_token or not self._service_user_id:
            return {"error": True, "message": "Service token not configured or has no userId claim."}

        url = f"{self.base_url}{normalize_path('/bookings/book-now')}"
        try:
            response = await asyncio.to_thread(
                self._session.post,
                url,
                headers={"Authorization": f"Bearer {self._service_token}"},
                json={
                    "userId":      self._service_user_id,
                    "slotIds":     slot_ids,
                    "bookedFor":   "guest",
                    "guestName":   guest_name,
                    "guestEmail":  guest_email,
                    "guestMobile": guest_mobile,
                },
                timeout=30,
            )
        except requests.RequestException as exc:
            logger.exception("create_booking_as_guest failed")
            return {"error": True, "message": f"Unable to reach booking API: {exc}"}

        data = self._decode_json(response)
        if not response.ok:
            return {"error": True, "message": data.get("message", "Booking failed")}

        logger.info("create_booking_as_guest -> razorpayOrderId=%s", data.get("razorpayOrderId"))
        return {
            "razorpayOrderId": data.get("razorpayOrderId"),
            "keyId":           data.get("keyId"),
            "amount":          data.get("amount", 0),
            "bookingRef":      data.get("bookingRef"),
        }

    async def execute_tool(self, name: str, args: dict[str, Any]) -> Any:
        try:
            if name == "get_venues":
                return await self.get_venues()
            if name == "get_sports_by_venue":
                return await self.get_sports_by_venue(venue_id=int(args["venueId"]))
            if name == "get_courts_by_sport":
                return await self.get_courts_by_sport(sport_id=int(args["sportId"]))
            if name == "get_slots":
                return await self.get_slots(
                    sport_id=int(args["sportId"]),
                    venue_id=int(args["venueId"]),
                    date=str(args["date"]),
                    court_id=int(args["courtId"]) if args.get("courtId") is not None else None,
                    preferred_time=args.get("preferredTime"),
                )
            if name == "create_booking":
                return await self.create_booking(
                    slot_ids=[int(i) for i in args.get("slotIds", [])],
                    booked_for=str(args["bookedFor"]),
                    user_id=int(args["userId"]) if args.get("userId") is not None else None,
                )
            if name == "get_all_sports":
                return await self.get_all_sports()
            if name == "get_venues_by_sport":
                return await self.get_venues_by_sport(
                    sport_id=args.get("sportId"), sport_name=args.get("sportName")
                )
        except Exception as exc:
            return {"error": True, "message": str(exc)}

        return {"error": True, "message": f"Unknown tool: {name}"}
