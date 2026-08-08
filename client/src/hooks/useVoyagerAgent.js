import { useCallback, useRef, useState } from 'react';
import { AGENT_ID, BACKEND_URL } from '../config';

const uuid = () =>
  globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const TOOL_SCHEMA = {
  type: 'object',
  properties: {
    mode: { type: 'string', enum: ['new', 'refine'] },
    address: { type: 'string' },
    latitude: { type: 'number' },
    longitude: { type: 'number' },
    radius_meters: { type: 'integer' },
    checkin: { type: 'string' },
    checkout: { type: 'string' },
    adults: { type: 'integer' },
    children: { type: 'integer' },
    rooms: { type: 'integer' },
    min_price_per_night: { type: 'number' },
    max_price_per_night: { type: 'number' },
    min_star_rating: { type: 'integer' },
    min_guest_rating: { type: 'number' },
    property_type: { type: 'string' },
    supplier: { type: 'string', enum: ['booking', 'expedia', 'hotelscom', 'vrbo'] },
    page_size: { type: 'integer' },
  },
  required: ['mode'],
};

export function useVoyagerAgent() {
  const [connStatus, setConnStatus] = useState('off'); // off | connecting | connected
  const [agentStatus, setAgentStatus] = useState('idle');
  const [transcript, setTranscript] = useState([]);
  const [turns, setTurns] = useState([]);
  const [error, setError] = useState(null);

  const sessionIdRef = useRef(uuid());
  const lastUserTextRef = useRef('');
  const conversationRef = useRef(null);

  const callSearchTool = useCallback(async (params) => {
    try {
      const res = await fetch(`${BACKEND_URL}/tools/search_accommodations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params, sessionId: sessionIdRef.current }),
      });
      const data = await res.json();

      setTurns((prev) => [
        ...prev.map((t) => ({ ...t, dimmed: true })),
        {
          id: uuid(),
          userText: lastUserTextRef.current,
          dimmed: false,
          ts: Date.now(),
          ...data,
        },
      ]);
      return data; // returned to the agent as the tool result
    } catch (e) {
      return {
        ok: false,
        error: {
          code: 0,
          message: String(e),
          spoken: "I couldn't reach my search backend — is the local server running?",
        },
      };
    }
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (!AGENT_ID) {
      setError('Missing VITE_ELEVENLABS_AGENT_ID in client/.env — paste your agent ID and restart Vite.');
      return;
    }
    setConnStatus('connecting');
    try {
      // Dynamic import: the page renders even if this package has issues,
      // and the real error is shown in the UI banner instead of a white page.
      const mod = await import('@elevenlabs/client');
      const Conversation = mod.Conversation || mod.default?.Conversation;
      if (!Conversation) throw new Error('Conversation export not found in @elevenlabs/client');

      const conversation = await Conversation.startSession({
        agentId: AGENT_ID,
        clientTools: [
          {
            name: 'search_accommodations',
            description:
              'Search live accommodation inventory. mode="new" for a fresh search, mode="refine" with only changed params to narrow the current search.',
            parameters: TOOL_SCHEMA,
            handler: async ({ input }) => {
  console.log('[voyager] CLIENT TOOL FIRED', input);
  const result = await callSearchTool(input ?? {});
  console.log('[voyager] tool result sent to agent', result);
  return result;
},
          },
        ],
        onConnect: () => setConnStatus('connected'),
        onDisconnect: () => {
          setConnStatus('off');
          setAgentStatus('idle');
        },
        onError: (e) => setError(String(e?.message || e)),
        onStatusChange: (s) => setAgentStatus(s),
        onMessage: (message) => {
          console.log('[voyager] onMessage', message);
          try {
            const type = message?.type || message?.message?.type;
            const text = message?.message?.text || message?.text || '';
            if (!text) return;
            if (type === 'user') {
              lastUserTextRef.current = text;
              setTranscript((prev) => [...prev, { id: uuid(), role: 'user', text }]);
            } else if (type === 'agent' || type === 'ai') {
              setTranscript((prev) => [...prev, { id: uuid(), role: 'agent', text }]);
            }
          } catch {
            /* transcript is best-effort */
          }
        },
      });
      conversationRef.current = conversation;
    } catch (e) {
      console.error('Voyager start failed:', e);
      setError(String(e?.message || e));
      setConnStatus('off');
    }
  }, [callSearchTool]);

  const stop = useCallback(async () => {
    try {
      conversationRef.current?.endSession();
    } catch {
      /* noop */
    }
    conversationRef.current = null;
    setConnStatus('off');
    setAgentStatus('idle');
  }, []);

  return { connStatus, agentStatus, transcript, turns, error, start, stop, hasAgent: Boolean(AGENT_ID) };
}