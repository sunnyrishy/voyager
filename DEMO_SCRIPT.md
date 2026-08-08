# Voyager — Demo & Pitch Script

## Pitch (45 seconds, before the demo)
"Every hotel search tool is a one-shot search box built for consumers clicking
filters. But a real advisor call is a negotiation: 'Miami under $300' -> 'too far
from the beach' -> 'cheaper 4-star'. Voyager is the first voice copilot that
works that way — stateful, multi-turn, hands-free — and it proactively tells
the advisor when the same room is cheaper on another supplier. Built on
ElevenLabs Conversational AI and Stay22."

## Demo flow (2–3 minutes)
1. Start call. Wait for the greeting.
2. "Find me a family-friendly hotel in Miami under $300 a night for March 15 to 18."
3. Let it speak; point at the cards. If a callout fired, read it aloud:
   "Same room, $X cheaper on Hotels.com — that link is highlighted."
4. THE MONEY MOMENT: "Too far from the beach." -> watch results re-rank live.
5. "Any cheaper 4-star options?" -> second refinement stacks, earlier turn dims.
6. Invite a judge: "Give me any refinement right now — unscripted."

## Prize hooks — say these out loud
- Anecdote Travel ($800): "This makes a human OR agentic advisor faster —
  multi-turn state plus cross-supplier savings calls they'd otherwise miss."
- ElevenLabs: entire interaction runs on Conversational AI (streaming STT,
  tool calling, streaming TTS) — qualifies for both ElevenLabs categories.
- Track: AI Trip Planning.

## Pre-event checklist
- [ ] Real Stay22 API key installed (demo mode = 5 req/min, too slow for rehearsal)
- [ ] Agent created; one full happy-path call completed the day before
- [ ] Latency verified: each turn should feel like 3–5 seconds
- [ ] Phone hotspot tested as backup internet
- [ ] Backup: screen recording of a successful run, in case venue wifi dies
- [ ] Known-good fallback query: Miami, under $300, March 15–18 2027

## If things break on stage
- 429s -> pause 60 seconds, speak about the architecture meanwhile.
- Agent ignores the tool -> rephrase with an explicit destination and dates.
- No internet -> play the backup clip; narrate the architecture over it.

## Compliance flex (if judges ask about data)
"Live query-in, live-display-out — we keep nothing. Session state is in-memory
per conversation, cleared on end. That's Stay22's usage model and we built to it."
