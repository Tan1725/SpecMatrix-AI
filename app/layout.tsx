import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Catalyst Lens | Product Intelligence Cockpit',
  description: 'Evidence-first AI product data enrichment for industrial commerce.',
  openGraph: {
    title: 'Catalyst Lens',
    description: 'Every product claim. Proven.',
    type: 'website',
    images: [{ url: '/og.png', width: 1731, height: 909, alt: 'Catalyst Lens - Every product claim. Proven.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Catalyst Lens',
    description: 'Every product claim. Proven.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
