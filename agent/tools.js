const tools = [
  {
    type: "function",
    function: {
      name: "register",
      description: "DO NOT CALL THIS. Registration is handled by the UI form only.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "login",
      description: "DO NOT CALL THIS. Login is handled by the UI form only. Never call this with guessed credentials.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "send_otp",
      description: "DO NOT CALL THIS. OTP is handled by the UI form only.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "verify_otp",
      description: "DO NOT CALL THIS. OTP verification is handled by the UI form only.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "get_venues",
      description: "Fetch all available sports venues.",
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
        properties: { venueId: { type: "number" } },
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
        properties: { sportId: { type: "number" } },
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
          sportId: { type: "number" },
          courtId: { type: "number" },
          venueId: { type: "number" },
          date:    { type: "string", description: "YYYY-MM-DD" }
        },
        required: ["sportId","courtId","venueId","date"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_booking",
      description: "Book slots for the user. Only call this AFTER the user has logged in successfully.",
      parameters: {
        type: "object",
        properties: {
          userId:    { type: "number" },
          slotIds:   { type: "array", items: { type: "number" } },
          bookedFor: { type: "string", enum: ["self","other"] }
        },
        required: ["userId","slotIds","bookedFor"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "verify_payment",
      description: "Verify Razorpay payment after user completes it.",
      parameters: {
        type: "object",
        properties: {
          razorpay_order_id:   { type: "string" },
          razorpay_payment_id: { type: "string" },
          razorpay_signature:  { type: "string" },
          paymentMethod:       { type: "string" }
        },
        required: ["razorpay_order_id","razorpay_payment_id","razorpay_signature"]
      }
    }
  }
];

module.exports = { tools };