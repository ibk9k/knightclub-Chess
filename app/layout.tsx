import type { Metadata } from 'next';
import '../src/styles.css';

export const metadata: Metadata = {
  title: 'Knight Club — Your next move, a little better',
  description: 'Play chess with friends, find an online opponent, or practice with Stockfish. Free chess and analysis, at your pace.',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
