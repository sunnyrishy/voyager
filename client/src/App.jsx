import { useEffect, useRef } from 'react';
import { useVoyagerAgent } from './hooks/useVoyagerAgent';
import ResultCard from './components/ResultCard';

function StatusPill({ agentStatus, inCall }) {
  const map = {
    listening: ['🎙 Listening', 'live'],
    speaking: ['🔊 Speaking', 'live'],
    thinking: ['🧠 Thinking', 'live'],
    connecting: ['⏳ Connecting…', 'warn'],
    connected: ['✅ Ready', 'ok'],
    idle: ['💤 Idle', 'muted'],
  };
  const [label, tone] = map[agentStatus] || (inCall ? ['🟢 On call', 'ok'] : ['⚪ Off', 'muted']);
  return <span className={`pill ${tone}`}>{label}</span>;
}

export default function App() {
  const { connStatus, agentStatus, transcript, turns, error, start, stop, hasAgent } =
    useVoyagerAgent();
  const inCall = connStatus === 'connected' || connStatus === 'connecting';

  const transcriptRef = useRef(null);
  const resultsRef = useRef(null);
  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight });
    resultsRef.current?.scrollTo({ top: resultsRef.current.scrollHeight });
  }, [transcript, turns]);

  return (
    <div className="app">
      <header>
        <div className="brand">
          ✈️ VOYAGER <span>AI voice copilot for travel advisors</span>
        </div>
        <div className="controls">
          <StatusPill agentStatus={agentStatus} inCall={inCall} />
          {!inCall ? (
            <button className="btn primary" disabled={!hasAgent} onClick={start}>
              {hasAgent ? 'Start call' : 'Missing VITE_ELEVENLABS_AGENT_ID'}
            </button>
          ) : (
            <button className="btn danger" onClick={stop}>
              End call
            </button>
          )}
        </div>
      </header>

      {!hasAgent && (
        <div className="banner">
          Create your agent with <code>node scripts/create-agent.mjs</code>, then put its ID in{' '}
          <code>client/.env</code> as <code>VITE_ELEVENLABS_AGENT_ID</code> and restart Vite.
        </div>
      )}
      {error && <div className="banner error">⚠️ {error}</div>}

      <main>
        <section className="transcript">
          <h3>Live call</h3>
          <div className="scroll" ref={transcriptRef}>
            {transcript.length === 0 && (
              <p className="hint">
                {inCall
                  ? 'Listening… try “Find me a hotel in Miami under $300 a night for March 15 to 18.”'
                  : 'Start the call and talk like a travel advisor.'}
              </p>
            )}
            {transcript.map((m) => (
              <div key={m.id} className={`bubble ${m.role}`}>
                <span>{m.role === 'user' ? 'Advisor' : 'Voyager'}</span>
                {m.text}
              </div>
            ))}
          </div>
        </section>

        <section className="results">
          <h3>
            Search turns{' '}
            {turns.length > 0 && <span className="muted">— newest highlighted, refinements stack</span>}
          </h3>
          <div className="scroll" ref={resultsRef}>
            {turns.length === 0 && (
              <div className="empty">
                Results appear here as you talk. Each refinement stacks a new turn on top — the
                judges get to watch the negotiation happen, just like a real advisor call.
              </div>
            )}
            {turns.map((turn) => (
              <div key={turn.id} className={`turn ${turn.dimmed ? 'dimmed' : 'active'}`}>
                <div className="turn-head">
                  <span className="turn-label">
                    {turn.dimmed ? 'Earlier' : 'Current'} ·{' '}
                    {turn.ok ? (turn.turn === 'new' ? 'New search' : 'Refinement') : 'Problem'}
                  </span>
                  {turn.userText && <span className="turn-user">“{turn.userText}”</span>}
                </div>

                {!turn.ok && <div className="error-note">⚠️ {turn.error?.spoken || turn.error?.message}</div>}

                {turn.ok && (
                  <>
                    {turn.callouts?.length > 0 && (
                      <div className="callouts">
                        {turn.callouts.map((c, i) => (
                          <div key={i} className="callout">
                            ⚡ <b>${c.saveAmount} cheaper on {c.bestLabel}</b> than {c.worstLabel} —{' '}
                            {c.propertyName}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="cards">
                      {(turn.cards || []).map((c) => (
                        <ResultCard key={c.id} card={c} nights={turn.meta?.nights} />
                      ))}
                    </div>
                    {turn.cards?.length === 0 && (
                      <div className="empty small">No matches — try widening the filters.</div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
