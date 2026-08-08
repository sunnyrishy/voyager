import { SUPPLIER_LABELS } from './stay22.js';

const label = (s) => SUPPLIER_LABELS[s] || s;

/** Convert raw Stay22 results into UI-ready cards (sorted by best live price). */
export function buildCards(results, meta, limit = 6) {
  const nights = meta?.nights ?? null;

  const cards = (results || []).map((r) => {
    const offers = Object.entries(r.suppliers || {})
      .map(([supplier, s]) => ({
        supplier,
        label: label(supplier),
        total: typeof s?.price?.total === 'number' ? s.price.total : null,
        link: s?.link ?? null,
      }))
      .filter((o) => o.total !== null || o.link)
      .sort((a, b) => (a.total ?? Number.POSITIVE_INFINITY) - (b.total ?? Number.POSITIVE_INFINITY));

    const bestOffer = offers.find((o) => o.total !== null) || offers[0] || null;

    return {
      id: r.id,
      name: r.name,
      url: r.url ?? null,
      address: r.location?.address ?? '',
      thumbnail: r.media?.thumbnail ?? null,
      stars: r.rating?.hotelStars ?? null,
      guestRating: r.rating?.value ?? null,
      reviewCount: r.rating?.count ?? null,
      freeCancellation: r.policies?.freeCancellation ?? null,
      instantBook: r.policies?.instantBook ?? null,
      guests: r.capacity?.guests ?? null,
      offers,
      bestOffer,
      perNight: bestOffer?.total != null && nights ? Math.round(bestOffer.total / nights) : null,
      total: bestOffer?.total ?? null,
    };
  });

  cards.sort((a, b) => {
    const ap = a.total ?? Number.POSITIVE_INFINITY;
    const bp = b.total ?? Number.POSITIVE_INFINITY;
    if (ap !== bp) return ap - bp;
    return (b.guestRating ?? 0) - (a.guestRating ?? 0);
  });

  return cards.slice(0, limit);
}

/** Natural-language-ready summary the ElevenLabs agent speaks from. */
export function buildSpokenSummary({ turn, params, meta, cards, callouts }) {
  const total = meta?.total ?? cards.length;
  const nights = meta?.nights ?? null;
  const where = params.address ? `in ${params.address}` : 'in that area';
  const when = params.checkin && params.checkout ? `, ${params.checkin} to ${params.checkout}` : '';
  const budget = params.max ? `, under $${params.max} a night` : '';
  const out = [];

  out.push(
    turn === 'new'
      ? total > 0
        ? `Found ${total} place${total === 1 ? '' : 's'} ${where}${when}${budget}.`
        : `Nothing matched ${where}${when}${budget}. I can raise the budget or widen the area.`
      : total > 0
        ? `Got it — refined. ${total} match${total === 1 ? '' : 'es'} now.`
        : `That refinement emptied the list. Want me to loosen the budget or the area?`
  );

  cards.slice(0, 3).forEach((c, i) => {
    const bits = [];
    if (c.stars) bits.push(`${c.stars}-star`);
    if (c.guestRating != null) bits.push(`guests rate it ${c.guestRating} out of 10`);
    if (c.freeCancellation) bits.push('free cancellation');
    const price =
      c.total != null
        ? nights > 1
          ? ` $${Math.round(c.total / nights)} a night on ${c.bestOffer.label}`
          : ` $${c.total} on ${c.bestOffer.label}`
        : '';
    out.push(`${i + 1}: ${c.name}${bits.length ? ` — ${bits.join(', ')}` : ''}${price}.`);
  });

  callouts.slice(0, 2).forEach((co) => {
    out.push(`Value callout: ${co.text}`);
  });

  if (cards.length > 0) out.push('Full cards with booking links are on screen.');
  return out.join(' ');
}
