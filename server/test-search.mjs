const res = await fetch('http://localhost:8787/api/tools/search_accommodations', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    mode: 'new',
    address: 'Miami, FL',
    checkin: '2026-09-15',
    checkout: '2026-09-18',
    max_price_per_night: 300,
  }),
});
const data = await res.json();
console.log('ok:', data.ok, '| total matches:', data.meta?.total);
if (data.ok) {
  console.log((data.cards || []).slice(0, 3)
    .map((c) => `${c.name} — $${c.total} on ${c.bestOffer?.label}`)
    .join('\n'));
  console.log('callouts:', data.callouts?.length || 0);
} else {
  console.log('ERROR:', JSON.stringify(data.error, null, 2));
}