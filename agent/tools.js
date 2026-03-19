const tools = [
  {
    type: "function",
    function: {
      name: "get_venues",
      description: "Get all available sports venues.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "get_sports_by_venue",
      description: "Get sports available at a specific venue.",
      parameters: {
        type: "object",
        properties: {
          venueId: { type: "number", description: "The venue ID" }
        },
        required: ["venueId"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_courts_by_sport",
      description: "Get courts available for a specific sport.",
      parameters: {
        type: "object",
        properties: {
          sportId: { type: "number", description: "The sport ID" }
        },
        required: ["sportId"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_slots",
      description: "Get available time slots for a sport, court, venue and date.",
      parameters: {
        type: "object",
        properties: {
          sportId:  { type: "number" },
          courtId:  { type: "number" },
          venueId:  { type: "number" },
          date:     { type: "string", description: "YYYY-MM-DD format" }
        },
        required: ["sportId", "courtId", "venueId", "date"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_booking",
      description: "Create a booking after user is logged in. Returns Razorpay order details.",
      parameters: {
        type: "object",
        properties: {
          userId:    { type: "number" },
          slotIds:   { type: "array", items: { type: "number" } },
          bookedFor: { type: "string", enum: ["self", "other"] }
        },
        required: ["userId", "slotIds", "bookedFor"]
      }
    }
  }
];

module.exports = { tools };