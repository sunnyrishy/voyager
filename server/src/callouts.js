import { SUPPLIER_LABELS } from './stay22.js';

const label = (s) => SUPPLIER_LABELS[s] || s;

/**
 * Proactive cross-supplier value callouts — Voyager's signature feature.
 * Scans each property's suppliers map on the CURRENT response only (no history, no storage).
 */
export function computeCallouts(results, thresholdPct = 10, maxCallouts = 3) {
  const callouts = [];

  for (const r of results || []) {
    const offers = Object.entries(r.suppliers || {})
      .map(([supplier, s]) => ({
        supplier,
        price: typeof s?.price?.total === 'number' ? s.price.total : null,
        link: s?.link ?? null,
      }))
      .filter((o) => o.price !== null && o.price > 0)
      .sort((a, b) => a.price - b.price);

    if (offers.length < 2) continue;

    const best = offers[0];
    const worst = offers[offers.length - 1];
    const saveAmount = Math.round(worst.price - best.price);
    const gapPct = Math.round((saveAmount / worst.price) * 100);

    if (gapPct >= thresholdPct && saveAmount >= 5) {
      callouts.push({
        propertyId: r.id,
        propertyName: r.name,
        saveAmount,
        gapPct,
        bestSupplier: best.supplier,
        bestLabel: label(best.supplier),
        bestPrice: Math.round(best.price),
        worstSupplier: worst.supplier,
        worstLabel: label(worst.supplier),
        worstPrice: Math.round(worst.price),
        link: best.link,
        text: `${r.name} is $${saveAmount} cheaper on ${label(best.supplier)} than ${label(worst.supplier)} for the same room.`,
      });
    }
  }

  callouts.sort((a, b) => b.saveAmount - a.saveAmount);
  return callouts.slice(0, maxCallouts);
}
