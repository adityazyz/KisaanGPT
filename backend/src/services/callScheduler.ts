import { query, withTransaction } from '../db';
import { PoolClient } from 'pg';
import { buildStagePurpose } from './retellCalls';

export interface TimelineStep {
  label:       string;
  date:        string;  // YYYY-MM-DD
  description: string;
}

/**
 * After a crop plan is created, schedule one call per timeline step.
 * Called automatically from the crop plan creation route.
 */
export async function scheduleCallsForPlan(
  cropPlanId: string,
  farmerId:   string,
  cropName:   string,
  phone:      string | null,
  timeline:   TimelineStep[]
): Promise<void> {
  if (!phone || !timeline?.length) return;

  await withTransaction(async (client: PoolClient) => {
    // Delete any old calls for this plan (e.g. if re-generated)
    await client.query(
      `DELETE FROM scheduled_calls WHERE crop_plan_id = $1`,
      [cropPlanId]
    );

    for (let i = 0; i < timeline.length; i++) {
      const step = timeline[i];
      const purpose = buildStagePurpose(step.label, cropName);

      await client.query(
        `INSERT INTO scheduled_calls
           (crop_plan_id, farmer_id, phone, timeline_index, stage_label,
            stage_date, purpose, crop_name, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'scheduled')`,
        [cropPlanId, farmerId, phone, i, step.label, step.date, purpose, cropName]
      );
    }
  });
}

/**
 * Get all scheduled calls for a crop plan (for the frontend dropdown).
 */
export async function getCallsForPlan(cropPlanId: string) {
  const { rows } = await query(
    `SELECT * FROM scheduled_calls
     WHERE crop_plan_id = $1
     ORDER BY timeline_index ASC`,
    [cropPlanId]
  );
  return rows;
}

/**
 * Update a call's status after Retell dispatches it.
 */
export async function markCallDispatched(
  callId:       string,
  retellCallId: string
): Promise<void> {
  await query(
    `UPDATE scheduled_calls
     SET status = 'called', retell_call_id = $2, called_at = NOW()
     WHERE id = $1`,
    [callId, retellCallId]
  );
}