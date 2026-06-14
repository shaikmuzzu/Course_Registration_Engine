import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Course Registration Engine",
  description: "A premium course registration platform with cyber-academic aesthetics",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="relative min-h-screen overflow-x-hidden">
        {/* Ambient glowing orbs - fixed background layer */}
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          {/* Cyan orb - top left */}
          <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-cyan-500/15 blur-[120px]" />
          {/* Emerald orb - bottom right */}
          <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-emerald-500/15 blur-[120px]" />
          {/* Amethyst orb - center */}
          <div className="absolute left-1/2 top-1/3 h-80 w-80 -translate-x-1/2 rounded-full bg-violet-500/10 blur-[120px]" />
        </div>

        {/* Main content */}
        {children}
      </body>
    </html>
  );
}
