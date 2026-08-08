import { Router } from 'express';
import { searchAccommodations, Stay22Error } from './stay22.js';
import { getSession, saveSession, clearSession, classifyTurn, mergeParams } from './session.js';
import { computeCallouts } from './callouts.js';
import { buildCards, buildSpokenSummary } from './summarize.js';

export const toolRouter = Router();

/** Agent-friendly field names -> Stay22 query params. */
const FIELD_MAP = {
  address: 'address',
  latitude: 'lat',
  longitude: 'lng',
  radius_meters: 'radius',
  checkin: 'checkin',
  checkout: 'checkout',
  adults: 'adults',
  children: 'children',
  rooms: 'rooms',
  min_price_per_night: 'min',
  max_price_per_night: 'max',
  min_star_rating: 'minstarrating',
  min_guest_rating: 'minguestrating',
  min_rating_count: 'minratingcount',
  property_type: 'type',
  supplier: 'provider',
  currency: 'currency',
  page_size: 'pageSize',
};

const RAW_KEYS = [
  'address', 'lat', 'lng', 'radius', 'nelat', 'nelng', 'swlat', 'swlng',
  'checkin', 'checkout', 'adults', 'children', 'rooms', 'min', 'max', 'type',
  'minstarrating', 'minguestrating', 'minratingcount', 'currency', 'provider',
  'pageSize', 'page',
];

function toStay22Params(input = {}) {
  const out = {};
  for (const [from, to] of Object.entries(FIELD_MAP)) {
    if (input[from] !== undefined && input[from] !== null && input[from] !== '') out[to] = input[from];
  }
  for (const k of RAW_KEYS) {
    if (out[k] === undefined && input[k] !== undefined && input[k] !== null && input[k] !== '') {
      out[k] = input[k];
    }
  }
  return out;
}

/**
 * The single tool the ElevenLabs agent calls.
 * Accepts params at top level, or wrapped as { parameters: {...} } / { input: {...} }
 * (so it also works if you switch to a webhook-style server tool later).
 */
toolRouter.post('/tools/search_accommodations', async (req, res) => {
  try {
    const body = req.body || {};
    const agentParams = body.parameters || body.input || body;
    const sessionId = String(body.sessionId || agentParams.sessionId || 'default');

    const delta = toStay22Params(agentParams);
    if (delta.pageSize === undefined) delta.pageSize = 8;
    delta.pageSize = Math.min(Number(delta.pageSize) || 8, 12);

    const current = getSession(sessionId);
    const turn = classifyTurn(current, { ...delta, mode: agentParams.mode });
    const params = turn === 'new' ? { ...delta } : mergeParams(current?.params || {}, delta);

    const { data } = await searchAccommodations(params);
    const results = data.results || [];
    const callouts = computeCallouts(results);
    const cards = buildCards(results, data.meta, 6);
    const spoken_summary = buildSpokenSummary({
      turn, params, meta: data.meta, cards, callouts,
    });

    // Compliance: working state only — params + ids/counts, never persisted listings.
    saveSession(sessionId, {
      params,
      lastResultIds: results.slice(0, 20).map((r) => r.id),
      lastTotal: data.meta?.total ?? results.length,
    });

    res.json({
      ok: true,
      turn,
      spoken_summary,
      meta: {
        total: data.meta?.total ?? results.length,
        count: results.length,
        nights: data.meta?.nights ?? null,
        currency: data.meta?.currency ?? 'USD',
      },
      cards,
      callouts,
      activeFilters: params,
    });
  } catch (err) {
    const e = err instanceof Stay22Error
      ? err
      : new Stay22Error(0, err?.message || 'Unknown error', 'Something broke on my side — try that again.');
    // 200 + ok:false so the tool result always reaches the agent gracefully.
    res.json({ ok: false, error: { code: e.code, message: e.message, spoken: e.spoken } });
  }
});

toolRouter.post('/tools/reset_session', (req, res) => {
  const sessionId = String(req.body?.sessionId || 'default');
  clearSession(sessionId);
  res.json({ ok: true });
});
