import type { Metadata } from 'next';
import '../src/styles.css';

export const metadata: Metadata = {
  title: 'Knight Club — Your next move, a little better',
  description: 'Play chess with friends, practise with Stockfish, or sharpen your skills with daily puzzles and a catalogue of chess challenges. Free chess and analysis, at your pace.',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
