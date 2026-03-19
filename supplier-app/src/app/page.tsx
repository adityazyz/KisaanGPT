import Link from 'next/link';
import { auth } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
export default function HomePage() {
  const { userId } = auth();
  if (userId) redirect('/dashboard');
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 bg-gradient-to-br from-amber-50 to-stone-100">
      <div className="max-w-2xl text-center">
        <div className="mb-6 inline-flex items-center gap-2 bg-amber-100 text-amber-800 px-4 py-2 rounded-full text-sm font-semibold">🧪 Supplier Portal</div>
        <h1 className="text-5xl font-display font-bold text-stone-900 mb-4 leading-tight">Reach Thousands of<br /><span className="text-amber-600">Indian Farmers</span></h1>
        <p className="text-lg text-stone-500 mb-10">List your agricultural inputs, receive qualified leads, and grow your business with AgriConnect's verified farmer network.</p>
        <div className="flex gap-4 justify-center">
          <Link href="/sign-up" className="bg-amber-600 hover:bg-amber-700 text-white font-semibold px-8 py-3 rounded-xl transition-colors text-lg shadow-md">List Your Products</Link>
          <Link href="/sign-in" className="border-2 border-amber-600 text-amber-700 hover:bg-amber-50 font-semibold px-8 py-3 rounded-xl transition-colors text-lg">Sign In</Link>
        </div>
      </div>
    </main>
  );
}
