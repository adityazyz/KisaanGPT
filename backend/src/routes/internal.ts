import { FastifyInstance } from 'fastify';
import { query } from '../db';

/**
 * Internal route called by frontend middleware/set-role.
 * Protected by a shared secret header, not by user JWT,
 * because it may be called from Next.js middleware where
 * user tokens aren't easily available.
 */
export async function internalRoutes(app: FastifyInstance) {
  app.post('/api/internal/set-role', async (req, reply) => {
    const secret = req.headers['x-internal-secret'];
    const expectedSecret = process.env.INTERNAL_SECRET;

    // Must provide either a valid internal secret OR a valid user Bearer token
    // (auth middleware already ran and may have set req.auth)
    const hasSecret = expectedSecret && secret === expectedSecret;
    const hasAuth   = !!(req as any).auth;

    if (!hasSecret && !hasAuth) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const { role, clerk_id } = req.body as { role: string; clerk_id?: string };
    const validRoles = ['farmer', 'buyer', 'supplier', 'admin'];

    if (!validRoles.includes(role)) {
      return reply.code(400).send({ error: 'Invalid role' });
    }

    // Use clerk_id from body (internal call) or from auth token (user call)
    const resolvedClerkId = clerk_id || (req as any).auth?.clerkId;
    if (!resolvedClerkId) {
      return reply.code(400).send({ error: 'clerk_id required' });
    }

    await query(
      `UPDATE users SET role = $1::user_role, updated_at = NOW() WHERE clerk_id = $2`,
      [role, resolvedClerkId]
    );

    return { ok: true, role };
  });
}