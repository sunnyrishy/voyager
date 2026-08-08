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

3. Create the ElevenLabs agent (account with Conversational AI required):

    ELEVENLABS_API_KEY=xi_... node scripts/create-agent.mjs

   Note the printed agent ID. If the API call fails, the script prints manual
   dashboard instructions (paste the prompt + tool schema in the dashboard).

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
| Agent never calls the tool | Confirm tool is type client with expect reply on; check browser console for the tool handler firing. |
| Tool fires but agent gets nothing | Check your installed @elevenlabs/react clientTools handler signature (see useVoyagerAgent.js — adjust the input extraction). |
| 429 errors | You are on demo mode (5 req/min). Set a real STAY22_API_KEY (150 req/min). |
| "couldn't reach backend" | Backend not running, or VITE_BACKEND_URL wrong. |
| No mic prompt | Chrome on localhost is a secure context — allow mic via the address-bar icon. |

## Verify before the event (spec requirement)

- ElevenLabs: client-tool config shape + startCall({ agentId }) against current docs.
- Stay22: hit /v2/accommodations once with your real key; confirm rate headers.
