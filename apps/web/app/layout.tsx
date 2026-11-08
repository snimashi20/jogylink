import type { Metadata } from 'next';
import type { ReactNode } from 'react';
// Fonts come from npm (self-hosted), so builds never need to reach Google Fonts.
import '@fontsource-variable/inter';
import '@fontsource/noto-sans-sinhala/400.css';
import '@fontsource/noto-sans-sinhala/600.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'JogyLink',
  description: 'Jogy Products: stock, credit and orders in one place.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
