import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { LanguageProvider } from '@/context/LanguageContext';
import AgriChat from '@/components/AgriChat';
import './globals.css';

export const metadata: Metadata = {
  title: 'KisaanGPT : Farmer Portal',
  description: 'Plan, grow, and sell your harvest with KisaanGPT',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>
          <LanguageProvider>
            {children}
            {/* Floating voice chatbot — available on every page */}
            <AgriChat />
          </LanguageProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}