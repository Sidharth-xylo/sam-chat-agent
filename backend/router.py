from __future__ import annotations

import logging
from typing import Any

from backend.api_client import ApiClient
from backend.matchers import resolve_option
from backend.state import clear_keys, infer_time_of_day, public_booking_state

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Reply builders
# ---------------------------------------------------------------------------


def build_text_reply(message: str) -> dict[str, Any]:
    return {"message": message, "ui": {"type": "text", "data": None}}


def build_slot_summary(state: dict[str, Any]) -> dict[str, Any] | None:
    if not state.get("slotId"):
        return None
    return {
        "id": state.get("slotId"),
        "time": state.get("slotTime"),
        "price": state.get("slotPrice"),
        "courtId": state.get("slotCourtId"),
        "courtName": state.get("court"),
        "date": state.get("date"),
        "venueName": state.get("venue"),
        "sportName": state.get("sport"),
    }


def build_payment_payload(
    state: dict[str, Any], booking_result: dict[str, Any]
) -> dict[str, Any]:
    return {
        **booking_result,
        "date": state.get("date"),
        "time": state.get("slotTime"),
        "price": state.get("slotPrice"),
        "courtId": state.get("slotCourtId"),
        "courtName": state.get("court"),
        "venueName": state.get("venue"),
        "sportName": state.get("sport"),
    }


# ---------------------------------------------------------------------------
# API fetch helpers
# ---------------------------------------------------------------------------


async def ensure_venues(api_client: ApiClient) -> list[dict[str, Any]] | dict[str, Any]:
    return await api_client.get_venues()


async def ensure_sports(
    api_client: ApiClient, venue_id: int
) -> list[dict[str, Any]] | dict[str, Any]:
    return await api_client.get_sports_by_venue(venue_id)


async def ensure_courts(
    api_client: ApiClient, sport_id: int
) -> list[dict[str, Any]] | dict[str, Any]:
    return await api_client.get_courts_by_sport(sport_id)


# ---------------------------------------------------------------------------
# Flow helpers
# ---------------------------------------------------------------------------


def booking_is_active(state: dict[str, Any], extraction: dict[str, Any]) -> bool:
    if extraction.get("intent") in {"booking", "show_venues"}:
        return True
    if any(
        extraction.get(key)
        for key in ("venueQuery", "sportQuery", "courtQuery", "date", "timeOfDay", "preferredTime")
    ):
        return True
    return any(
        state.get(key)
        for key in (
            "venueId", "sportId", "courtId", "date",
            "timeOfDay", "preferredTime", "slotId",
        )
    )


async def build_discovery_reply(
    state: dict[str, Any],
    extraction: dict[str, Any],
    api_client: ApiClient,
) -> tuple[dict[str, Any], dict[str, Any]] | None:
    """Handle discover_sports and discover_venues intents. Returns None if not applicable."""
    if extraction.get("intent") == "discover_sports":
        sports = await api_client.get_all_sports()
        if isinstance(sports, dict) and sports.get("error"):
            return (
                build_text_reply(str(sports.get("message") or "I couldn't load sports right now.")),
                state,
            )
        simplified = [{"id": item.get("id"), "name": item.get("name")} for item in sports]
        state["_pendingSports"] = simplified
        return (
            {"message": "Here are the sports you can book.", "ui": {"type": "sports", "data": simplified}},
            state,
        )

    if extraction.get("intent") == "discover_venues" and extraction.get("sportQuery"):
        venues = await api_client.get_venues_by_sport(sport_name=extraction["sportQuery"])
        if isinstance(venues, dict) and venues.get("error"):
            return (
                build_text_reply(str(venues.get("message") or "I couldn't load venues right now.")),
                state,
            )
        state["_pendingVenues"] = venues
        return (
            {
                "message": f"Here are the venues for {extraction['sportQuery']}.",
                "ui": {"type": "venues", "data": venues},
            },
            state,
        )

    return None


# ---------------------------------------------------------------------------
# Main booking flow (FSM)
# ---------------------------------------------------------------------------


async def route_booking_flow(
    state: dict[str, Any],
    extraction: dict[str, Any],
    api_client: ApiClient,
    auth_token: str | None,
    user_id: int | None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    # --- discovery intents --------------------------------------------------
    discovery = await build_discovery_reply(state, extraction, api_client)
    if discovery is not None:
        return discovery

    # --- explicit venue-list / change-venue request -------------------------
    if extraction.get("intent") == "show_venues":
        # Reset venue and all venue-dependent state so the user starts fresh.
        # Keep desiredSportQuery, date, timeOfDay — those preferences survive a venue change.
        clear_keys(
            state,
            (
                "venueId", "venue", "sportId", "sport", "courtId", "court",
                "slotId", "slotTime", "slotCourtId", "slotPrice",
                "_pendingSports", "_pendingCourts", "_pendingSlots",
                "_courtsVerified", "_paymentData",
            ),
        )
        # If a sport preference exists, show only venues that offer it.
        desired_sport = state.get("desiredSportQuery")
        if desired_sport:
            sport_venues = await api_client.get_venues_by_sport(sport_name=desired_sport)
            if isinstance(sport_venues, list) and sport_venues:
                state["_pendingVenues"] = sport_venues
                return (
                    {
                        "message": f"Here are venues that offer {desired_sport}. Pick one to continue.",
                        "ui": {"type": "venues", "data": sport_venues},
                    },
                    state,
                )
        venues = await ensure_venues(api_client)
        if isinstance(venues, dict) and venues.get("error"):
            return (
                build_text_reply(str(venues.get("message") or "I couldn't load venues right now.")),
                state,
            )
        state["_pendingVenues"] = venues
        return (
            {"message": "Pick a venue to continue.", "ui": {"type": "venues", "data": venues}},
            state,
        )

    # --- venue resolution ---------------------------------------------------
    if extraction.get("venueQuery"):
        venues_source = state.get("_pendingVenues") or await ensure_venues(api_client)
        if isinstance(venues_source, dict) and venues_source.get("error"):
            return (
                build_text_reply(str(venues_source.get("message") or "I couldn't load venues right now.")),
                state,
            )
        venues = list(venues_source)
        resolved, candidates = resolve_option(extraction["venueQuery"], venues, ("name", "city"))
        if resolved:
            if state.get("venueId") != resolved.get("venueId"):
                clear_keys(
                    state,
                    ("sportId", "sport", "courtId", "court", "slotId", "slotTime", "slotCourtId"),
                )
            state["venueId"] = resolved.get("venueId")
            state["venue"] = resolved.get("name")
            clear_keys(state, ("_pendingVenues", "_pendingSports", "_pendingCourts", "_pendingSlots", "_paymentData"))
        elif candidates:
            state["_pendingVenues"] = candidates
            return (
                {"message": "I found a few matching venues. Pick one.", "ui": {"type": "venues", "data": candidates}},
                state,
            )
        else:
            state["_pendingVenues"] = venues
            return (
                {"message": "I couldn't match that venue. Pick one from the list.", "ui": {"type": "venues", "data": venues}},
                state,
            )

    # --- ensure venue is set ------------------------------------------------
    if not state.get("venueId"):
        if booking_is_active(state, extraction):
            # When the desired sport is known, only show venues that offer it.
            desired_sport = extraction.get("sportQuery") or state.get("desiredSportQuery")
            if desired_sport:
                sport_venues = await api_client.get_venues_by_sport(sport_name=desired_sport)
                if isinstance(sport_venues, list) and sport_venues:
                    state["_pendingVenues"] = sport_venues
                    return (
                        {
                            "message": f"Here are venues that offer {desired_sport}. Pick one to continue.",
                            "ui": {"type": "venues", "data": sport_venues},
                        },
                        state,
                    )
            venues = await ensure_venues(api_client)
            if isinstance(venues, dict) and venues.get("error"):
                return (
                    build_text_reply(str(venues.get("message") or "I couldn't load venues right now.")),
                    state,
                )
            state["_pendingVenues"] = venues
            return (
                {"message": "Pick a venue to get started.", "ui": {"type": "venues", "data": venues}},
                state,
            )
        return (
            build_text_reply("Tell me what you'd like to book, and I'll guide you step by step."),
            state,
        )

    # --- sport resolution ---------------------------------------------------
    if extraction.get("sportQuery"):
        sports_source = state.get("_pendingSports") or await ensure_sports(
            api_client, int(state["venueId"])
        )
        if isinstance(sports_source, dict) and sports_source.get("error"):
            return (
                build_text_reply(str(sports_source.get("message") or "I couldn't load sports right now.")),
                state,
            )
        sports = list(sports_source)
        resolved, candidates = resolve_option(extraction["sportQuery"], sports, ("name",))
        if resolved:
            if state.get("sportId") != resolved.get("id"):
                clear_keys(
                    state,
                    ("courtId", "court", "slotId", "slotTime", "slotCourtId", "slotPrice", "_slotCourts", "_paymentData", "_courtsVerified"),
                )
            state["sportId"] = resolved.get("id")
            state["sport"] = resolved.get("name")
            clear_keys(state, ("_pendingSports", "_pendingCourts", "_pendingSlots", "_paymentData"))
        elif candidates:
            state["_pendingSports"] = candidates
            return (
                {"message": "Pick a sport for this venue.", "ui": {"type": "sports", "data": candidates}},
                state,
            )
        else:
            # Sport not at this venue — find venues that do offer it.
            sport_venues = await api_client.get_venues_by_sport(sport_name=extraction["sportQuery"])
            if isinstance(sport_venues, list) and sport_venues:
                clear_keys(state, ("venueId", "venue", "sportId", "sport", "_pendingSports", "_pendingCourts", "_pendingSlots", "_courtsVerified"))
                state["_pendingVenues"] = sport_venues
                return (
                    {
                        "message": f"'{extraction['sportQuery']}' isn't at this venue. Here are venues that offer it:",
                        "ui": {"type": "venues", "data": sport_venues},
                    },
                    state,
                )
            state["_pendingSports"] = sports
            return (
                {
                    "message": f"'{extraction['sportQuery']}' isn't available at any venue. Here are sports at this venue:",
                    "ui": {"type": "sports", "data": sports},
                },
                state,
            )

    # --- ensure sport is set ------------------------------------------------
    # Sport IDs are venue-scoped: the same sport name (e.g. "Badminton") has a
    # different ID at each venue.  Always fetch from the selected venue.
    if not state.get("sportId"):
        sports = await ensure_sports(api_client, int(state["venueId"]))
        if isinstance(sports, dict) and sports.get("error"):
            return (
                build_text_reply(str(sports.get("message") or "I couldn't load sports right now.")),
                state,
            )
        if len(sports) == 1:
            state["sportId"] = sports[0].get("id")
            state["sport"] = sports[0].get("name")
        else:
            # Try to auto-match against the sport the user originally asked for.
            # This fires when a venue picker event clears sportId but leaves
            # desiredSportQuery intact.
            desired = state.get("desiredSportQuery")
            if desired:
                resolved, _ = resolve_option(desired, sports, ("name",))
                if resolved:
                    state["sportId"] = resolved.get("id")
                    state["sport"] = resolved.get("name")
                    clear_keys(state, ("_pendingSports",))
                else:
                    # desiredSportQuery not at this venue — cross-search.
                    sport_venues = await api_client.get_venues_by_sport(sport_name=desired)
                    if isinstance(sport_venues, list) and sport_venues:
                        clear_keys(state, ("venueId", "venue", "_pendingSports", "_pendingCourts", "_pendingSlots", "_courtsVerified"))
                        state["_pendingVenues"] = sport_venues
                        return (
                            {
                                "message": f"'{desired}' isn't at this venue. Here are venues that offer it:",
                                "ui": {"type": "venues", "data": sport_venues},
                            },
                            state,
                        )
                    state["_pendingSports"] = sports
                    return (
                        {
                            "message": f"'{desired}' isn't available at any venue. Pick a sport:",
                            "ui": {"type": "sports", "data": sports},
                        },
                        state,
                    )
            else:
                state["_pendingSports"] = sports
                return (
                    {"message": "Pick a sport for this venue.", "ui": {"type": "sports", "data": sports}},
                    state,
                )

    # --- verify courts exist for the selected sport (runs once per sport) ---
    # Some venues list a sport but have no courts configured for it.
    # Catching this early avoids sending the user through date/time pickers
    # only to hit a dead end at slots.
    if not state.get("_courtsVerified"):
        courts_check = await ensure_courts(api_client, int(state["sportId"]))
        if isinstance(courts_check, dict) and courts_check.get("error"):
            return (
                build_text_reply(str(courts_check.get("message") or "Couldn't load courts right now.")),
                state,
            )
        if not courts_check:
            sport_name = state.get("sport", "that sport")
            clear_keys(state, ("sportId", "sport", "desiredSportQuery", "_pendingSports", "_pendingCourts", "_pendingSlots", "_courtsVerified"))
            sports = await ensure_sports(api_client, int(state["venueId"]))
            if isinstance(sports, dict) and sports.get("error"):
                return (build_text_reply(str(sports.get("message") or "Couldn't load sports.")), state)
            if not isinstance(sports, list) or not sports:
                # Venue has no bookable sports at all — go back to venue picker
                clear_keys(state, ("venueId", "venue"))
                venues = await ensure_venues(api_client)
                if isinstance(venues, list):
                    state["_pendingVenues"] = venues
                return (
                    {
                        "message": "This venue has no bookable sports. Please pick a different venue.",
                        "ui": {"type": "venues", "data": venues if isinstance(venues, list) else []},
                    },
                    state,
                )
            state["_pendingSports"] = sports
            return (
                {
                    "message": f"'{sport_name}' has no courts at this venue. Please pick a different sport.",
                    "ui": {"type": "sports", "data": sports},
                },
                state,
            )
        state["_courtsVerified"] = True

    # --- court resolution (optional) ----------------------------------------
    if extraction.get("courtQuery"):
        courts_source = state.get("_pendingCourts") or await ensure_courts(
            api_client, int(state["sportId"])
        )
        if isinstance(courts_source, dict) and courts_source.get("error"):
            return (
                build_text_reply(str(courts_source.get("message") or "I couldn't load courts right now.")),
                state,
            )
        courts = list(courts_source)
        resolved, candidates = resolve_option(extraction["courtQuery"], courts, ("name", "type"))
        if resolved:
            if state.get("courtId") != resolved.get("id"):
                clear_keys(
                    state,
                    ("slotId", "slotTime", "slotCourtId", "slotPrice", "_slotCourts", "_paymentData"),
                )
            state["courtId"] = resolved.get("id")
            state["court"] = resolved.get("name")
            clear_keys(state, ("_pendingCourts", "_pendingSlots", "_paymentData"))
        elif candidates:
            state["_pendingCourts"] = candidates
            return (
                {"message": "Pick a court to narrow the slots.", "ui": {"type": "courts", "data": candidates}},
                state,
            )

    # --- date ---------------------------------------------------------------
    if not state.get("date"):
        return (
            {"message": "Pick a date for your booking.", "ui": {"type": "datepicker", "data": None}},
            state,
        )

    # --- time of day --------------------------------------------------------
    if not state.get("timeOfDay"):
        return (
            {"message": "Choose a time of day.", "ui": {"type": "timeofday", "data": None}},
            state,
        )

    # --- slots --------------------------------------------------------------
    if not state.get("slotId"):
        slots_result = await api_client.get_slots(
            sport_id=int(state["sportId"]),
            venue_id=int(state["venueId"]),
            date=str(state["date"]),
            court_id=int(state["courtId"]) if state.get("courtId") is not None else None,
            preferred_time=state.get("preferredTime"),
        )
        if isinstance(slots_result, dict) and slots_result.get("error"):
            return (
                build_text_reply(str(slots_result.get("message") or "I couldn't load slots right now.")),
                state,
            )

        courts = slots_result.get("courts") or []
        auto_selected = slots_result.get("autoSelectedSlot")

        if auto_selected:
            state["slotId"] = auto_selected.get("id")
            state["slotTime"] = auto_selected.get("time")
            state["slotCourtId"] = auto_selected.get("courtId")
            matched_court = next(
                (c for c in courts if c.get("id") == auto_selected.get("courtId")), None
            )
            if matched_court is not None:
                state["courtId"] = matched_court.get("id")
                state["court"] = matched_court.get("name")
            clear_keys(state, ("_pendingSlots", "_paymentData"))
        else:
            slots = slots_result.get("slots") or []
            if not slots:
                # No slots at all for this date — clear the date so the user
                # can pick a new one without restarting the whole flow.
                date_tried = state.get("date")
                clear_keys(state, ("date", "timeOfDay", "preferredTime", "_pendingSlots"))
                msg = (
                    f"No slots found for {date_tried}. " if date_tried else "No slots found. "
                ) + "Please pick a different date."
                return (
                    {"message": msg, "ui": {"type": "datepicker", "data": None}},
                    state,
                )
            state["_pendingSlots"] = slots
            state["_slotCourts"]   = courts
            unavailable_notice = None
            message = "Here are the available slots."
            if state.get("preferredTime"):
                unavailable_notice = f"{state['preferredTime']} isn't available."
                message = f"{state['preferredTime']} isn't available — here are the closest options."
            return (
                {
                    "message": message,
                    "ui": {
                        "type": "slots",
                        "data": {
                            "courts": courts,
                            "slots": slots,
                            "preferredPeriod": state.get("timeOfDay"),
                            "preferredTime": state.get("preferredTime"),
                            "preferredCourtId": state.get("courtId"),
                            "autoSelectedSlot": None,
                            "unavailableNotice": unavailable_notice,
                        },
                    },
                },
                state,
            )

    # --- login check --------------------------------------------------------
    resolved_user_id = user_id or state.get("userId")
    logged_in = bool(auth_token and resolved_user_id) or bool(state.get("loggedIn"))
    pending_registration = bool(state.get("pendingRegistration") and state.get("pendingGuestMobile"))

    state["loggedIn"] = logged_in
    if resolved_user_id is not None:
        state["userId"] = resolved_user_id

    if not logged_in and not pending_registration:
        login_data = build_slot_summary(state)
        return (
            {"message": "Let's confirm your booking.", "ui": {"type": "login", "data": login_data}},
            state,
        )

    # --- payment (cached) ---------------------------------------------------
    if state.get("_paymentData"):
        return (
            {"message": "Your booking is ready for payment.", "ui": {"type": "payment", "data": state["_paymentData"]}},
            state,
        )

    # --- create booking -----------------------------------------------------
    if pending_registration:
        booking_result = await api_client.create_booking_as_guest(
            slot_ids=[int(state["slotId"])],
            guest_name=str(state.get("pendingGuestName") or "Guest"),
            guest_email=str(state.get("pendingGuestEmail") or ""),
            guest_mobile=str(state.get("pendingGuestMobile") or ""),
        )
    else:
        booking_result = await api_client.create_booking(
            slot_ids=[int(state["slotId"])],
            booked_for="self",
            user_id=resolved_user_id,
        )
    if isinstance(booking_result, dict) and booking_result.get("error"):
        return (
            build_text_reply(str(booking_result.get("message") or "I couldn't create the booking right now.")),
            state,
        )

    payment_payload = build_payment_payload(state, booking_result)
    state["_paymentData"] = payment_payload
    return (
        {"message": "Your booking is ready for payment.", "ui": {"type": "payment", "data": payment_payload}},
        state,
    )