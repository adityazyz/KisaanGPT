'use client';
import { SignUp, useSignUp } from '@clerk/nextjs';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

function RoleStamper() {
  const { isLoaded, signUp } = useSignUp();
  const router = useRouter();
  const called = useRef(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (signUp?.status !== 'complete') return;
    if (called.current) return;
    called.current = true;

    fetch('/api/set-role', { method: 'POST' })
      .then(() => router.replace('/dashboard'))
      .catch(() => router.replace('/dashboard'));
  }, [isLoaded, signUp?.status, router]);

  return null;
}

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-100">
      <RoleStamper />
      <SignUp afterSignUpUrl="/dashboard" redirectUrl="/dashboard" />
    </div>
  );
}
