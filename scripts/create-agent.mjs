#!/usr/bin/env node
/**
 * Creates (or updates) the Voyager agent on ElevenLabs Conversational AI.
 *
 *   Create:  ELEVENLABS_API_KEY=xi_... node scripts/create-agent.mjs
 *   Update:  ELEVENLABS_API_KEY=xi_... AGENT_ID=<id> node scripts/create-agent.mjs
 */

const API = 'https://api.elevenlabs.io';
const key = process.env.ELEVENLABS_API_KEY;
if (!key) {
  console.error('Set ELEVENLABS_API_KEY first.');
  process.exit(1);
}

const SYSTEM_PROMPT = `You are Voyager, a real-time voice copilot for travel advisors.
The person you are talking to is a travel advisor on a live call with their client. You search live hotel and rental inventory across Booking.com, Expedia, Hotels.com and VRBO so they can work hands-free.

Your one tool is search_accommodations. Every search or refinement MUST go through it. Never invent properties, prices, ratings, or availability.

NEW vs REFINE:
- NEW search: the advisor names a destination or explicitly starts over. Call the tool with mode="new" and everything they gave you: address, checkin, checkout, adults, children, max_price_per_night, min_star_rating, property_type, etc.
- REFINE: the advisor reacts to current results ("too expensive", "closer to the beach", "only 4-star", "cheaper options"). Call the tool with mode="refine" and ONLY the changed parameters — the backend remembers the rest.
  - "too expensive" -> lower max_price_per_night by about 20-25%.
  - "closer to the beach" / "closer to X" -> replace address with a more specific district (e.g. "South Beach, Miami Beach, FL"), or use latitude/longitude with a smaller radius_meters if you are confident.
  - "cheaper 4-star options" -> lower max_price_per_night AND set min_star_rating=4.
  - "start over" with a new destination -> mode="new" with the new destination plus any restated constraints. If no new details are given, ask what they want.

DATES: use YYYY-MM-DD. If the advisor omits the year, use the nearest future occurrence (e.g. if today is August 2026 and they say "March 15 to 18", use 2027-03-15 and 2027-03-18). Real pricing needs both checkin and checkout — if dates are missing, ask once, briefly.

AVAILABLE FILTERS: location, dates, guests, per-night price range, star rating, guest rating, property type, supplier. Amenities (pool, gym, breakfast, parking) CANNOT be filtered — if the client wants one, acknowledge it ("pool noted — I'll flag likely options") but never claim you filtered by it.

TOOL RESULTS: the tool returns JSON with spoken_summary, cards (properties with per-supplier prices and booking links), and callouts (cross-supplier savings). Speak from spoken_summary in your own natural words:
- Mention at most 2-3 properties, each with price and one standout detail.
- ALWAYS surface callouts — cross-supplier savings are a core part of the value.
- Keep responses under about 3 sentences unless asked for more. No markdown, no long lists. Talk like a sharp human colleague on a call.

ERRORS: if the tool returns ok=false, relay the spoken message briefly and suggest the fix.

If the advisor is vague, ask one short clarifying question. Never ramble.`;

const FIRST_MESSAGE =
  "Voyager online — live inventory across Booking, Expedia, Hotels.com and VRBO. Where's your client headed, and when?";

const TOOL = {
  type: 'client',
  name: 'search_accommodations',
  description:
    'Search live accommodation inventory across Booking.com, Expedia, Hotels.com and VRBO. Use mode="new" for a fresh search (pass all known params) or mode="refine" with only changed params to narrow the current search. Returns JSON: spoken_summary (what to say), cards (properties with per-supplier prices and booking links), callouts (cross-supplier savings you must mention).',
  expect_reply: true,
  parameters: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['new', 'refine'],
        description: "'new' starts a fresh search; 'refine' narrows the current search with only changed params",
      },
      address: {
        type: 'string',
        description: "Destination, e.g. 'Miami, FL' or a district like 'South Beach, Miami Beach, FL'. For location refinements use a more specific place.",
      },
      latitude: { type: 'number', description: 'Optional center latitude for radial search' },
      longitude: { type: 'number', description: 'Optional center longitude for radial search' },
      radius_meters: {
        type: 'integer',
        description: 'Search radius in meters when using lat/lng (default 10000). Shrink to tighten a location refine.',
      },
      checkin: { type: 'string', description: 'Check-in date YYYY-MM-DD, today or later' },
      checkout: { type: 'string', description: 'Check-out date YYYY-MM-DD, after checkin' },
      adults: { type: 'integer' },
      children: { type: 'integer' },
      rooms: { type: 'integer' },
      min_price_per_night: {
        type: 'number',
        description: 'Per-night USD floor. Only applied when both dates are set.',
      },
      max_price_per_night: {
        type: 'number',
        description: 'Per-night USD budget cap. Only applied when both dates are set.',
      },
      min_star_rating: { type: 'integer', minimum: 0, maximum: 5 },
      min_guest_rating: { type: 'number', minimum: 0, maximum: 10 },
      property_type: {
        type: 'string',
        description: 'hotel | rental | villa | hostel | resort | apartment ...',
      },
      supplier: {
        type: 'string',
        enum: ['booking', 'expedia', 'hotelscom', 'vrbo'],
        description: 'Restrict to one supplier. Normally omit to compare all.',
      },
      page_size: { type: 'integer', description: 'Results to fetch (default 8)' },
    },
    required: ['mode'],
  },
};

const payload = {
  conversation_config: {
    agent: {
      prompt: { prompt: SYSTEM_PROMPT, llm: 'gpt-4o', temperature: 0.4 },
      first_message: FIRST_MESSAGE,
      language: 'en',
    },
    tts: { voice_id: process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM' },
  },
  platform_settings: { tools: [TOOL] },
  metadata: { name: 'Voyager — Travel Advisor Copilot' },
};

const agentId = process.env.AGENT_ID;
const url = agentId ? `${API}/v1/convai/agents/${agentId}` : `${API}/v1/convai/agents/create`;

const res = await fetch(url, {
  method: agentId ? 'PATCH' : 'POST',
  headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

const body = await res.json().catch(() => ({}));

if (!res.ok) {
  console.error(`ElevenLabs API ${res.status}:`, JSON.stringify(body, null, 2));
  console.error('\n--- MANUAL FALLBACK -------------------------------------------------');
  console.error('Create the agent manually at elevenlabs.io -> Conversational AI -> Agents:');
  console.error('1. Paste the system prompt and first message from this file.');
  console.error('2. Add a CLIENT tool named "search_accommodations" (expect reply = true)');
  console.error('   with this JSON schema:');
  console.error(JSON.stringify(TOOL.parameters, null, 2));
  console.error('---------------------------------------------------------------------');
  process.exit(1);
}

const newId = body.agent_id || body.id || agentId;
console.log(agentId ? `Updated agent ${agentId}` : `Created agent: ${newId}`);
console.log('Put this ID in client/.env as VITE_ELEVENLABS_AGENT_ID');
