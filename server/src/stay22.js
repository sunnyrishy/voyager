import { config } from './config.js';

const BASE = 'https://api.stay22.com/v2/accommodations';

export const SUPPLIER_LABELS = {
  booking: 'Booking.com',
  expedia: 'Expedia',
  hotelscom: 'Hotels.com',
  vrbo: 'VRBO',
};

const ALLOWED = new Set([
  'address', 'lat', 'lng', 'radius',
  'nelat', 'nelng', 'swlat', 'swlng',
  'checkin', 'checkout', 'adults', 'children', 'rooms',
  'min', 'max', 'type',
  'minstarrating', 'minguestrating', 'minratingcount',
  'currency', 'provider', 'pageSize', 'page',
]);

export class Stay22Error extends Error {
  constructor(code, message, spoken) {
    super(message);
    this.code = code;
    this.spoken = spoken;
  }
}

function friendly(status) {
  switch (status) {
    case 400:
      return new Stay22Error(400, 'Bad or missing location',
        "I couldn't pin down that location — can you give me a city or neighborhood?");
    case 401:
      return new Stay22Error(401, 'Invalid API key',
        "I'm having a credentials hiccup with the hotel API — one moment.");
    case 429:
      return new Stay22Error(429, 'Rate limit exceeded',
        "I'm searching a bit too fast for the API — give me a few seconds and ask again.");
    case 502:
    case 504:
      return new Stay22Error(status, 'Upstream issue',
        "The booking suppliers are running slow right now — want to try that again?");
    default:
      return new Stay22Error(status, `Unexpected status ${status}`,
        "Something went wrong on the hotel side — let's try again.");
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Live query-in / live-display-out only. Do NOT persist results to disk or a DB.
 * Retries with exponential backoff on 429/502/504.
 */
export async function searchAccommodations(params = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    if (!ALLOWED.has(k)) continue;
    qs.set(k, String(v));
  }

  const hasLocation =
    qs.has('address') ||
    (qs.has('lat') && qs.has('lng')) ||
    (qs.has('nelat') && qs.has('nelng') && qs.has('swlat') && qs.has('swlng'));
  if (!hasLocation) {
    throw new Stay22Error(400, 'Missing location',
      'Where should I search? Give me a city, neighborhood, or landmark.');
  }

  const headers = { Accept: 'application/json' };
  if (config.stay22ApiKey) headers['X-API-KEY'] = config.stay22ApiKey;

  const url = `${BASE}?${qs.toString()}`;
  let lastErr = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    let res;
    try {
      res = await fetch(url, { headers });
    } catch {
      lastErr = new Stay22Error(0, 'Network error',
        "I couldn't reach the hotel API — check the connection and try again.");
      await sleep(500 * 2 ** attempt);
      continue;
    }

    if (res.ok) {
      let data;
      try {
        data = await res.json();
      } catch {
        throw new Stay22Error(0, 'Malformed response',
          'The hotel API returned something unreadable — try again.');
      }
      return {
        data,
        rateLimit: {
          limit: res.headers.get('X-RateLimit-Limit'),
          remaining: res.headers.get('X-RateLimit-Remaining'),
          reset: res.headers.get('X-RateLimit-Reset'),
        },
      };
    }

    if ([429, 502, 504].includes(res.status) && attempt < 2) {
      lastErr = friendly(res.status);
      await sleep(700 * 2 ** attempt);
      continue;
    }
    throw friendly(res.status);
  }
  throw lastErr;
}
