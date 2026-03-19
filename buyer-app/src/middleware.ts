import { authMiddleware, clerkClient } from '@clerk/nextjs';

export default authMiddleware({
  publicRoutes: ['/', '/sign-in(.*)', '/sign-up(.*)'],

  async afterAuth(auth, req) {
    if (!auth.userId) return;
    if (!req.nextUrl.pathname.startsWith('/dashboard')) return;

    // Check if role is already correctly set in session claims
    const existingRole = (auth.sessionClaims?.publicMetadata as any)?.role;
    if (existingRole === 'buyer') return;

    // Stamp Clerk metadata — this also triggers user.updated webhook
    try {
      await clerkClient.users.updateUserMetadata(auth.userId, {
        publicMetadata: { role: 'buyer' },
      });
    } catch (e) {
      console.error('[middleware] Failed to stamp role:', e);
    }

    // Directly update DB using internal secret — no user token needed
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      await fetch(`${apiUrl}/api/internal/set-role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': process.env.INTERNAL_SECRET || '',
        },
        body: JSON.stringify({ role: 'buyer', clerk_id: auth.userId }),
      });
    } catch (e) {
      console.error('[middleware] DB sync failed:', e);
    }
  },
});

export const config = {
  matcher: ['/((?!.+\\.[\\w]+$|_next).*)', '/', '/(api|trpc)(.*)'],
};