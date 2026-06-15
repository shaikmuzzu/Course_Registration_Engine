import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Course Registration Engine',
  description: 'A premium, secure course registration platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans bg-slate-950 text-white antialiased`}>
        {/* Ambient background orbs — fixed, behind everything */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-cyan-500/20 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[700px] h-[700px] bg-violet-600/15 rounded-full blur-[140px]" />
          <div className="absolute top-[40%] left-[50%] w-[400px] h-[400px] bg-emerald-500/10 rounded-full blur-[100px]" />
        </div>
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
