import { useCallback, useRef, useState } from 'react';
import { AGENT_ID, BACKEND_URL } from '../config';

const uuid = () =>
  globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

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

      // @elevenlabs/client's clientTools option is a plain object map of
      // { toolName: (parameters) => result }, NOT an array of {name, description,
      // parameters, handler} objects (that shape is only used server-side, e.g. in
      // scripts/create-agent.mjs when registering the tool on the agent). The SDK
      // invokes the handler directly with the parsed tool-call parameters — no
      // { input } / { parameters } wrapper — and hasOwnProperty-checks the tool
      // name against this object, so passing an array here means the lookup
      // always fails silently and the search tool never actually fires.
      const conversation = await Conversation.startSession({
        agentId: AGENT_ID,
        clientTools: {
          search_accommodations: async (parameters) => {
            console.log('[voyager] CLIENT TOOL FIRED', parameters);
            const result = await callSearchTool(parameters ?? {});
            console.log('[voyager] tool result sent to agent', result);
            return result;
          },
        },
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
            // @elevenlabs/client calls onMessage with { source, role, message, event_id }
            // where `role` is already 'user' | 'agent' and `message` is the plain text
            // string (not a nested { type, text } object as this code previously assumed).
            const role = message?.role || (message?.source === 'ai' ? 'agent' : message?.source);
            const text = typeof message?.message === 'string' ? message.message : '';
            if (!text || !role) return;
            if (role === 'user') {
              lastUserTextRef.current = text;
              setTranscript((prev) => [...prev, { id: uuid(), role: 'user', text }]);
            } else if (role === 'agent' || role === 'ai') {
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