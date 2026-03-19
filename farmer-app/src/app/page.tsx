import Link from 'next/link';
import { auth } from '@clerk/nextjs';
import { redirect } from 'next/navigation';

export default function HomePage() {
  const { userId } = auth();
  if (userId) redirect('/dashboard');

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: 'linear-gradient(135deg, #f2fbf4 0%, #fdf8f0 60%, #faf0e0 100%)' }}>
      <div className="max-w-2xl text-center">
        <div className="mb-6 inline-flex items-center gap-2 bg-leaf-100 text-leaf-700 px-4 py-2 rounded-full text-sm font-semibold">
          🌾 Farmer Portal / किसान पोर्टल
        </div>
        <h1 className="text-5xl font-display font-bold text-[#1d3a1f] mb-4 leading-tight">
          Plan. Grow.<br />
          <span className="text-leaf-600">AgriConnect.</span>
        </h1>
        <p className="text-lg text-[#7a6652] mb-10 max-w-lg mx-auto">
          Get AI-powered crop plans, track your harvest, and connect directly with buyers — all in one place.
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/sign-up"
            className="bg-leaf-600 hover:bg-leaf-700 text-white font-semibold px-8 py-3 rounded-xl transition-colors text-lg shadow-md">
            Get Started Free
          </Link>
          <Link href="/sign-in"
            className="border-2 border-leaf-600 text-leaf-700 hover:bg-leaf-50 font-semibold px-8 py-3 rounded-xl transition-colors text-lg">
            Sign In
          </Link>
        </div>
      </div>
    </main>
  );
}
