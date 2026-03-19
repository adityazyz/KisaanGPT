import { FastifyInstance } from 'fastify';
import { query } from '../db';

export async function webhookRoutes(app: FastifyInstance) {
  /**
   * POST /webhooks/clerk
   *
   * Both user.created AND user.updated use the same UPSERT keyed on clerk_id.
   * This means:
   *   - user.created  → inserts fresh row (role may be 'farmer' default if metadata not set yet)
   *   - user.updated  → overwrites ALL fields including role with whatever is in publicMetadata
   *
   * So even if user.created fires before set-role stamps the metadata,
   * the subsequent user.updated (triggered by set-role) will correct the role.
   *
   * No duplicate key errors are possible because we always upsert on clerk_id.
   */
  app.post('/clerk', async (req, reply) => {
    const event = req.body as any;
    const { type, data } = event;

    if (!data?.id) return reply.code(400).send({ error: 'Invalid payload' });

    const clerkId   = data.id;
    const email     = data.email_addresses?.[0]?.email_address || '';
    const fullName  = `${data.first_name || ''} ${data.last_name || ''}`.trim() || email;
    const phone     = data.phone_numbers?.[0]?.phone_number || null;
    const avatarUrl = data.image_url || null;
    const role      = (data.public_metadata?.role as string) || 'farmer';

    if (type === 'user.created' || type === 'user.updated') {
      // Single upsert handles both events — role is always taken from publicMetadata.
      // On user.created it may be 'farmer' (default) if set-role hasn't fired yet.
      // On user.updated (triggered by set-role) it will be the correct role.
      await query(
        `INSERT INTO users (clerk_id, email, full_name, phone, role, avatar_url)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (clerk_id) DO UPDATE
           SET email      = EXCLUDED.email,
               full_name  = EXCLUDED.full_name,
               phone      = EXCLUDED.phone,
               role       = EXCLUDED.role,
               avatar_url = EXCLUDED.avatar_url,
               updated_at = NOW()`,
        [clerkId, email, fullName, phone, role, avatarUrl]
      );
    } else if (type === 'user.deleted') {
      await query(
        `UPDATE users SET is_active = false, updated_at = NOW() WHERE clerk_id = $1`,
        [clerkId]
      );
    }

    return { received: true };
  });
}
