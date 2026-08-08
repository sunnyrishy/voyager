/**
 * In-memory session state ONLY (Stay22 terms: no persistence, no analytics).
 * We store search params + result IDs/counts — never raw listing datasets.
 */
const sessions = new Map();
const TTL_MS = 30 * 60 * 1000;

const LOCATION_KEYS = ['address', 'lat', 'lng', 'radius', 'nelat', 'nelng', 'swlat', 'swlng'];
const LOCATION_PRIMARY = ['address', 'lat', 'nelat', 'swlat']; // one per location method
const PARAM_KEYS = [
  ...LOCATION_KEYS,
  'checkin', 'checkout', 'adults', 'children', 'rooms',
  'min', 'max', 'type', 'minstarrating', 'minguestrating', 'minratingcount',
  'currency', 'provider', 'pageSize', 'page',
];

export function getSession(id) {
  const s = sessions.get(id);
  if (!s) return null;
  if (Date.now() - s.updatedAt > TTL_MS) {
    sessions.delete(id);
    return null;
  }
  return s;
}

export function saveSession(id, state) {
  sessions.set(id, { ...state, updatedAt: Date.now() });
}

export function clearSession(id) {
  sessions.delete(id);
}

export function pruneSessions() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.updatedAt > TTL_MS) sessions.delete(id);
  }
}

/** NEW_SEARCH vs REFINE. Primary signal: agent-provided mode; defensive fallbacks included. */
export function classifyTurn(currentState, delta) {
  const mode = String(delta.mode || '').toLowerCase();
  if (mode === 'new') return 'new';
  if (mode === 'refine') return currentState ? 'refine' : 'new';
  if (!currentState) return 'new';
  const changedLocation = LOCATION_PRIMARY.some(
    (k) => delta[k] !== undefined && delta[k] !== null && delta[k] !== '' && delta[k] !== currentState.params[k]
  );
  return changedLocation ? 'new' : 'refine';
}

/** Merge a refine delta into current params. A new location method replaces the old one entirely. */
export function mergeParams(current = {}, delta = {}) {
  const merged = { ...current };
  const introducesLocation = LOCATION_PRIMARY.some(
    (k) => delta[k] !== undefined && delta[k] !== null && delta[k] !== ''
  );
  if (introducesLocation) {
    for (const k of LOCATION_KEYS) delete merged[k];
  }
  for (const k of PARAM_KEYS) {
    if (delta[k] === undefined || delta[k] === null || delta[k] === '') continue;
    merged[k] = delta[k];
  }
  return merged;
}
