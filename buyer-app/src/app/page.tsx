import Link from 'next/link';
import { auth } from '@clerk/nextjs';
import { redirect } from 'next/navigation';

export default function HomePage() {
  const { userId } = auth();
  if (userId) redirect('/dashboard');
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 bg-gradient-to-br from-brand-900 to-slate-900">
      <div className="max-w-2xl text-center">
        <div className="mb-6 inline-flex items-center gap-2 bg-brand-800 text-brand-200 px-4 py-2 rounded-full text-sm font-semibold">
          🛒 Buyer Portal
        </div>
        <h1 className="text-5xl font-display font-bold text-white mb-4 leading-tight">
          Source Fresh Produce<br /><span className="text-brand-300">Directly from Farms</span>
        </h1>
        <p className="text-lg text-slate-300 mb-10">Browse verified supply, post your demand, and get matched with the right farmers through our admin-assisted platform.</p>
        <div className="flex gap-4 justify-center">
          <Link href="/sign-up" className="bg-brand-500 hover:bg-brand-400 text-white font-semibold px-8 py-3 rounded-xl transition-colors text-lg shadow-md">Get Started</Link>
          <Link href="/sign-in" className="border-2 border-brand-400 text-brand-300 hover:bg-brand-900 font-semibold px-8 py-3 rounded-xl transition-colors text-lg">Sign In</Link>
        </div>
      </div>
    </main>
  );
}
