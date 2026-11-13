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

// Highest unit price at lot size Q whose TC does not exceed tcBest. May be <= 0.
export function breakEvenPrice(Q, tcBest, { D, S, I }) {
  return (tcBest - (D / Q) * S) / (D + (Q * I) / 2);
}

// "Keep the shop's best price, but order the lot size that suits us."
export function suggestProposal(params, best) {
  return { qn: Math.max(1, Math.round(eoq(best.price, params))), pn: best.price };
}

export function evaluateProposal(qn, pn, params, best) {
  const cost = tc(qn, pn, params);
  const be = breakEvenPrice(qn, best.cost.total, params);
  return {
    cost,
    saving: best.cost.total - cost.total,
    ordersPerYear: params.D / qn,
    daysBetweenOrders: (365 * qn) / params.D,
    avgInventory: qn / 2,
    bestAvgInventory: best.qty / 2,
    breakEven: be > 0 ? be : null,
  };
}
