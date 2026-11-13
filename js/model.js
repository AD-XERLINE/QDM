// EOQ / Quantity Discount Model. Pure functions, no DOM.
// Params = { D, S, I }  (I = holding rate as a fraction of unit price)
// Tier   = { minQty, price }

export function tc(Q, P, { D, S, I }) {
  const product = D * P;
  const ordering = (D / Q) * S;
  const holding = (Q / 2) * I * P;
  return { product, ordering, holding, total: product + ordering + holding };
}

export function eoq(P, { D, S, I }) {
  return Math.sqrt((2 * D * S) / (I * P));
}

export function evaluateTiers(params, tiers) {
  return tiers.map((tier, index) => {
    const next = tiers[index + 1];
    const maxQty = next ? next.minQty - 1 : Infinity;
    const qStar = Math.max(1, Math.round(eoq(tier.price, params)));
    const lower = Math.max(1, tier.minQty); // ordering 0 units is not an order
    let status = 'feasible';
    let qty = qStar;
    if (qStar < lower) { status = 'adjusted'; qty = lower; }
    else if (qStar > maxQty) { status = 'discarded'; qty = null; }
    return {
      index, minQty: tier.minQty, maxQty, price: tier.price, qStar, qty, status,
      cost: status === 'discarded' ? null : tc(qty, tier.price, params),
    };
  });
}

export function bestOffer(results) {
  return results
    .filter(r => r.status !== 'discarded')
    .reduce((best, r) => (best === null || r.cost.total < best.cost.total ? r : best), null);
}
