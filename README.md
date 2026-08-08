# VOYAGER — AI Voice Copilot for Travel Advisors

Real-time voice copilot that searches live hotel inventory across Booking.com,
Expedia, Hotels.com and VRBO through natural multi-turn conversation. Built for
Checkout: The Travel & Hospitality Hackathon (NYC).

## Architecture

React client <-> (WebSocket audio) <-> ElevenLabs Conversational AI agent
-> client tool call -> Node/Express backend (session state + callouts + summary)
-> Stay22 /v2/accommodations -> spoken summary back through the agent.

Compliance: in-memory session state only. No persistence, no analytics —
live query-in, live-display-out, per Stay22 terms.

## Setup (~15 minutes)

1. Backend

    cd server && npm install
    cp .env.example .env        (Windows: copy .env.example .env)
    # add STAY22_API_KEY — get it at hub.stay22.com -> Settings -> API
    npm run dev                 # http://localhost:8787

2. Smoke-test Stay22 before touching voice:

    curl -s http://localhost:8787/api/health
    curl -s -X POST http://localhost:8787/api/tools/search_accommodations -H "Content-Type: application/json" -d "{\"mode\":\"new\",\"address\":\"Miami, FL\"}"

3. Create the ElevenLabs agent (account with Conversational AI required).
   Use a real API key (starts with `sk_` — from elevenlabs.io -> profile ->
   API Keys; the `key_...` value shown in the list view is just an ID and
   will be rejected):

    ELEVENLABS_API_KEY=sk_... node scripts/create-agent.mjs

   This registers `search_accommodations` as a standalone **client tool**
   (`POST /v1/convai/tools`) and attaches it to the agent via
   `conversation_config.agent.prompt.tool_ids` — the old inline
   `agent.prompt.tools` / `platform_settings.tools` field is deprecated and
   rejected by the API, so don't hand-roll that shape if you touch this
   script. Note the printed agent ID. If the API call fails, the script
   prints manual dashboard instructions (paste the prompt + tool schema in
   the dashboard, Tools tab, type = Client, "Wait for response" ON).

4. Frontend

    cd client && npm install
    cp .env.example .env        # set VITE_ELEVENLABS_AGENT_ID=<agent id>
    npm run dev                 # http://localhost:5173

5. Open http://localhost:5173, allow the microphone, press Start call, and say:
   "Find me a hotel in Miami under $300 a night for March 15 to 18."
   Then refine: "Too far from the beach." -> "Any cheaper 4-star options?"

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Agent talks fluently but invents hotel names/prices instead of real Stay22 data, and the browser console never logs `CLIENT TOOL FIRED` | The tool call never reached the browser at all. Re-run `node scripts/create-agent.mjs` (see step 3) — most likely `search_accommodations` isn't attached to this agent's `tool_ids`, or is registered as a Webhook/Server tool instead of Client. Verify in the dashboard: Agent -> Tools tab -> type = Client, "Wait for response" ON. |
| Agent never calls the tool, keeps stalling ("still searching...") | Same as above — check `tool_ids`/type in the dashboard, and confirm `expects_response: true` on the tool config. |
| `CLIENT TOOL FIRED` logs but the UI stays blank | Frontend bug, not agent config. `client/src/hooks/useVoyagerAgent.js`'s `clientTools` must be a plain object `{ search_accommodations: (parameters) => ... }` (per `@elevenlabs/client`'s `ClientToolsConfig` type) — not an array, and the handler receives the raw parameters object directly, no `{input}`/`{parameters}` wrapper. |
| 429 errors | You are on demo mode (5 req/min). Set a real STAY22_API_KEY (150 req/min). |
| "couldn't reach backend" | Backend not running, or VITE_BACKEND_URL wrong. |
| `EADDRINUSE` on `node src/index.js` | A previous server instance is still running on that port — find/stop it (Windows: `Get-NetTCPConnection -LocalPort 8787 \| Select OwningProcess`, then `Stop-Process -Id <pid>`) instead of starting a second one. |
| No mic prompt | Chrome on localhost is a secure context — allow mic via the address-bar icon. |

## Verify before the event (spec requirement)

- ElevenLabs: client-tool config shape + startCall({ agentId }) against current docs.
- Stay22: hit /v2/accommodations once with your real key; confirm rate headers.
