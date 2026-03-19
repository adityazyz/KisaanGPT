import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-leaf-50 to-earth-50">
      <SignIn />
    </div>
  );
}
