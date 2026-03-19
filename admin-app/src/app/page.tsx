import { auth } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default function HomePage() {
  const { userId } = auth();
  if (userId) redirect('/dashboard');
  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-950">
      <div className="text-center max-w-md px-6">
        <div className="mb-4 inline-flex items-center gap-2 bg-indigo-950 border border-indigo-800 text-indigo-300 px-4 py-2 rounded-full text-sm font-semibold">
          ⚙️ Admin Console
        </div>
        <h1 className="text-4xl font-bold text-white mb-3">AgriConnect<br /><span className="text-indigo-400">Operations Hub</span></h1>
        <p className="text-zinc-400 mb-8 text-sm">Verify supply, match buyers, and manage the platform.</p>
        <div className="flex gap-3 justify-center">
          <Link href="/sign-in" className="btn-primary px-8 py-3">Sign In</Link>
        </div>
      </div>
    </main>
  );
}
