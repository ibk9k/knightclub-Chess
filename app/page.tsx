'use client';
import dynamic from 'next/dynamic';

// The chess engines and saved practice games belong to the visitor's browser.
const ChessApp = dynamic(() => import('../src/App'), { ssr: false });
export default function Page() { return <ChessApp />; }
