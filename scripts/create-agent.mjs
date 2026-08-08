#!/usr/bin/env node
/**
 * Creates (or updates) the Voyager agent, and registers/attaches its
 * search_accommodations CLIENT tool, on ElevenLabs Conversational AI.
 *
 *   Create:  ELEVENLABS_API_KEY=sk_... node scripts/create-agent.mjs
 *   Update:  ELEVENLABS_API_KEY=sk_... AGENT_ID=<id> node scripts/create-agent.mjs
 *
 * IMPORTANT: as of ElevenLabs' July 2025 tools migration, tools are
 * standalone resources (POST/PATCH /v1/convai/tools) referenced from the
 * agent via conversation_config.agent.prompt.tool_ids. The old inline
 * agent.prompt.tools / platform_settings.tools field is deprecated and is
 * REJECTED by the API (it fails silently-ish: earlier versions of this
 * script sent it, got a 200 back, and the tool was simply never attached —
 * the agent kept talking but never actually called search_accommodations).
 * https://elevenlabs.io/docs/eleven-agents/customization/tools/agent-tools-deprecation
 */

const API = 'https://api.elevenlabs.io';
const key = process.env.ELEVENLABS_API_KEY;
if (!key) {
  console.error('Set ELEVENLABS_API_KEY first.');
  process.exit(1);
}

const headers = { 'xi-api-key': key, 'Content-Type': 'application/json' };

async function api(method, path, body) {
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    // fetch() throws a bare "fetch failed" with the real reason tucked away
    // in .cause (DNS failure, TLS error, connection refused/reset, timeout,
    // proxy interference, etc.) — surface it instead of losing it.
    const err = new Error(
      `Network error calling ${method} ${path}: ${networkErr.message}` +
        (networkErr.cause ? ` (cause: ${networkErr.cause.code || networkErr.cause.message || networkErr.cause})` : '')
    );
    err.cause = networkErr.cause;
    throw err;
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`${method} ${path} -> ${res.status}`);
    err.body = json;
    throw err;
  }
  return json;
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

NEVER answer a search or refinement from memory or by guessing plausible-sounding hotels — always wait for the search_accommodations tool result and only speak from spoken_summary. If the tool is slow, say so briefly rather than inventing property names or prices.

If the advisor is vague, ask one short clarifying question. Never ramble.`;

const FIRST_MESSAGE =
  "Voyager online — live inventory across Booking, Expedia, Hotels.com and VRBO. Where's your client headed, and when?";

const TOOL_NAME = 'search_accommodations';

const TOOL_PARAMETERS = {
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
    adults: { type: 'integer', description: 'Number of adult guests (default 2 if unspecified)' },
    children: { type: 'integer', description: 'Number of children, if any' },
    rooms: { type: 'integer', description: 'Number of rooms needed (default 1 if unspecified)' },
    min_price_per_night: {
      type: 'number',
      description: 'Per-night USD floor. Only applied when both dates are set.',
    },
    max_price_per_night: {
      type: 'number',
      description: 'Per-night USD budget cap. Only applied when both dates are set.',
    },
    min_star_rating: {
      type: 'integer',
      minimum: 0,
      maximum: 5,
      description: 'Minimum hotel star rating to include, 0-5',
    },
    min_guest_rating: {
      type: 'number',
      minimum: 0,
      maximum: 10,
      description: 'Minimum guest review score to include, 0-10',
    },
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
};

const TOOL_CONFIG = {
  type: 'client',
  name: TOOL_NAME,
  description:
    'Search live accommodation inventory across Booking.com, Expedia, Hotels.com and VRBO. Use mode="new" for a fresh search (pass all known params) or mode="refine" with only changed params to narrow the current search. Returns JSON: spoken_summary (what to say), cards (properties with per-supplier prices and booking links), callouts (cross-supplier savings you must mention).',
  expects_response: true, // block the conversation until the client returns real results
  parameters: TOOL_PARAMETERS,
};

function printManualFallback() {
  console.error('\n--- MANUAL FALLBACK -------------------------------------------------');
  console.error('Do this at elevenlabs.io -> Conversational AI -> Agents -> your agent:');
  console.error('1. Prompt tab: paste the system prompt and first message from this file.');
  console.error('2. Tools tab: add (or edit) a CLIENT tool named exactly "search_accommodations"');
  console.error('   with "Wait for response" ON, using this parameter schema:');
  console.error(JSON.stringify(TOOL_PARAMETERS, null, 2));
  console.error('3. Make sure that tool is attached/enabled on this agent (Tools tab, checked on).');
  console.error('---------------------------------------------------------------------');
}

async function findOrUpsertTool() {
  let existing;
  try {
    const list = await api('GET', '/v1/convai/tools');
    existing = (list.tools || []).find(
      (t) => t.tool_config?.type === 'client' && t.tool_config?.name === TOOL_NAME
    );
  } catch (err) {
    console.error(`Could not list existing tools (continuing to create a new one): ${err.message}`);
  }

  if (existing) {
    console.log(`Found existing client tool "${TOOL_NAME}" (${existing.id}) — updating its schema...`);
    await api('PATCH', `/v1/convai/tools/${existing.id}`, { tool_config: TOOL_CONFIG });
    return existing.id;
  }

  console.log(`Creating client tool "${TOOL_NAME}"...`);
  const created = await api('POST', '/v1/convai/tools', { tool_config: TOOL_CONFIG });
  return created.id;
}

async function upsertAgent(toolId) {
  const payload = {
    conversation_config: {
      agent: {
        prompt: {
          prompt: SYSTEM_PROMPT,
          llm: 'gpt-4o',
          temperature: 0.4,
          tool_ids: [toolId],
        },
        first_message: FIRST_MESSAGE,
        language: 'en',
      },
      tts: { voice_id: process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM' },
    },
    metadata: { name: 'Voyager — Travel Advisor Copilot' },
  };

  const agentId = process.env.AGENT_ID;
  const path = agentId ? `/v1/convai/agents/${agentId}` : '/v1/convai/agents/create';
  const body = await api(agentId ? 'PATCH' : 'POST', path, payload);
  return { id: body.agent_id || body.id || agentId, wasUpdate: Boolean(agentId) };
}

async function main() {
  let toolId;
  try {
    toolId = await findOrUpsertTool();
    console.log(`Tool ready: ${toolId}`);
  } catch (err) {
    console.error(`Failed to register the tool: ${err.message}`);
    if (err.body) console.error(JSON.stringify(err.body, null, 2));
    printManualFallback();
    process.exitCode = 1;
    return;
  }

  try {
    const { id, wasUpdate } = await upsertAgent(toolId);
    console.log(wasUpdate ? `Updated agent ${id}` : `Created agent: ${id}`);
    console.log(`Attached tool_ids: [${toolId}]`);
    console.log('Put this ID in client/.env as VITE_ELEVENLABS_AGENT_ID, then restart Vite and hard-refresh.');
  } catch (err) {
    console.error(`Failed to ${process.env.AGENT_ID ? 'update' : 'create'} the agent: ${err.message}`);
    if (err.body) console.error(JSON.stringify(err.body, null, 2));
    printManualFallback();
    process.exitCode = 1;
  }
}

// Note: we set process.exitCode instead of calling process.exit() on error
// paths above, and let the module run to completion instead of forcing an
// early exit — on Windows, calling process.exit() while undici's fetch
// dispatcher still has an open handle can crash the process with a libuv
// assertion (`UV_HANDLE_CLOSING`) instead of just reporting the real error.
await main();
