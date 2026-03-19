import { query, withTransaction } from '../db';
import { PoolClient } from 'pg';

/** Aggregate verified supply items into lots grouped by crop + location */
export async function aggregateSupply(): Promise<{ lotsCreated: number; lotsUpdated: number }> {
  const { rows: items } = await query(`
    SELECT si.id, si.farmer_id, si.crop_name, si.qty_kg, si.quality_grade,
           f.state, f.district
    FROM supply_items si
    JOIN farms f ON f.farmer_id = si.farmer_id
    WHERE si.status = 'verified' AND si.lot_id IS NULL
    ORDER BY si.crop_name, f.state, f.district
  `);

  let lotsCreated = 0;
  let lotsUpdated = 0;

  return withTransaction(async (client: PoolClient) => {
    for (const item of items) {
      // Find existing open lot for same crop + location
      const { rows: existing } = await client.query(
        `SELECT id FROM supply_lots
         WHERE crop_name = $1 AND state = $2 AND district = $3 AND status = 'open'
         LIMIT 1`,
        [item.crop_name, item.state, item.district]
      );

      let lotId: string;
      if (existing[0]) {
        lotId = existing[0].id;
        await client.query(
          `UPDATE supply_lots
           SET total_qty_kg = total_qty_kg + $1,
               available_qty = available_qty + $1,
               updated_at = NOW()
           WHERE id = $2`,
          [item.qty_kg, lotId]
        );
        lotsUpdated++;
      } else {
        const { rows: newLot } = await client.query(
          `INSERT INTO supply_lots (crop_name, location, state, district, total_qty_kg, available_qty, quality_grade)
           VALUES ($1, $2, $3, $4, $5, $5, $6)
           RETURNING id`,
          [
            item.crop_name,
            `${item.district}, ${item.state}`,
            item.state,
            item.district,
            item.qty_kg,
            item.quality_grade,
          ]
        );
        lotId = newLot[0].id;
        lotsCreated++;
      }

      await client.query(
        `UPDATE supply_items SET lot_id = $1, status = 'aggregated' WHERE id = $2`,
        [lotId, item.id]
      );
    }

    return { lotsCreated, lotsUpdated };
  });
}

export interface MatchResult {
  demandId: string;
  lotId: string;
  matchedQty: number;
  score: number;
}

/** Find best supply lots for a demand post */
export async function findMatches(demandId: string): Promise<MatchResult[]> {
  const { rows: demand } = await query(
    `SELECT * FROM demand_posts WHERE id = $1`,
    [demandId]
  );
  if (!demand[0]) return [];
  const d = demand[0];

  const { rows: lots } = await query(
    `SELECT * FROM supply_lots
     WHERE crop_name ILIKE $1
       AND status = 'open'
       AND available_qty > 0
     ORDER BY available_qty DESC`,
    [d.crop_name]
  );

  const results: MatchResult[] = [];
  for (const lot of lots) {
    let score = 0;

    // Location proximity
    if (lot.state === d.delivery_state) score += 30;
    if (lot.district === d.delivery_district) score += 20;

    // Quantity satisfaction
    const qty = Math.min(lot.available_qty, d.quantity_kg);
    const coverage = qty / d.quantity_kg;
    score += Math.round(coverage * 30);

    // Quality match
    if (d.quality_pref && lot.quality_grade === d.quality_pref) score += 20;

    // Price compatibility
    if (d.price_per_kg && lot.price_per_kg && lot.price_per_kg <= d.price_per_kg) score += 10;

    if (score > 20) {
      results.push({ demandId, lotId: lot.id, matchedQty: qty, score });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 5);
}
