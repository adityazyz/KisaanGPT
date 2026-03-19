import { FastifyRequest, FastifyReply } from 'fastify';
import { createClerkClient } from '@clerk/clerk-sdk-node';
import { query } from '../db';

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

declare module 'fastify' {
  interface FastifyRequest {
    auth?: {
      clerkId: string;
      userId: string;
      role: string;
      email: string;
    };
  }
}

export async function authMiddleware(
  req: FastifyRequest,
  _reply: FastifyReply
) {
  if (req.url.startsWith('/webhooks')) return;

  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return;

  const token = header.slice(7);
  try {
    const payload = await clerk.verifyToken(token);
    const clerkId = payload.sub;

    // 1. Try existing row first — always trust what's in the DB
    //    (the webhook is the source of truth for role updates)
    let { rows } = await query(
      'SELECT id, role, email FROM users WHERE clerk_id = $1 AND is_active = true',
      [clerkId]
    );

    // 2. Row missing entirely (webhook hasn't fired yet at all) → insert from Clerk
    //    We only INSERT here, never UPDATE — the webhook owns all updates.
    if (!rows[0]) {
      const clerkUser = await clerk.users.getUser(clerkId);

      const email     = clerkUser.emailAddresses[0]?.emailAddress || '';
      const fullName  = `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() || email;
      const phone     = clerkUser.phoneNumbers[0]?.phoneNumber || null;
      const avatarUrl = clerkUser.imageUrl || null;
      const role      = (clerkUser.publicMetadata?.role as string) || 'farmer';

      // INSERT only — do nothing on conflict so we never clobber a row
      // that the webhook already wrote with the correct role
      const inserted = await query(
        `INSERT INTO users (clerk_id, email, full_name, phone, role, avatar_url)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (clerk_id) DO NOTHING
         RETURNING id, role, email`,
        [clerkId, email, fullName, phone, role, avatarUrl]
      );

      // If DO NOTHING fired (row was inserted by webhook between our SELECT and INSERT),
      // fetch the row that the webhook wrote — which has the correct role
      if (inserted.rows[0]) {
        rows = inserted.rows;
      } else {
        const refetch = await query(
          'SELECT id, role, email FROM users WHERE clerk_id = $1 AND is_active = true',
          [clerkId]
        );
        rows = refetch.rows;
      }
    }

    if (rows[0]) {
      req.auth = {
        clerkId,
        userId: rows[0].id,
        role:   rows[0].role,
        email:  rows[0].email,
      };
    }
  } catch {
    // Token invalid — req.auth stays undefined
  }
}

export function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  if (!req.auth) {
    reply.code(401).send({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

export function requireRole(
  roles: string[]
): (req: FastifyRequest, reply: FastifyReply) => boolean {
  return (req, reply) => {
    if (!requireAuth(req, reply)) return false;
    if (!roles.includes(req.auth!.role)) {
      reply.code(403).send({ error: 'Forbidden: insufficient role' });
      return false;
    }
    return true;
  };
}

export const requireFarmer   = requireRole(['farmer', 'admin']);
export const requireBuyer    = requireRole(['buyer',  'admin']);
export const requireSupplier = requireRole(['supplier','admin']);
export const requireAdmin    = requireRole(['admin']);