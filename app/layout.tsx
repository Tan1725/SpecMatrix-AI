import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SpecMatrix AI — Autonomous Multi-Agent Product Intelligence Platform',
  description: 'Enterprise AI engine converting raw distributor product data into structured, validated 252-column commerce catalogs.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;600;700;800;900&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600;700&family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
