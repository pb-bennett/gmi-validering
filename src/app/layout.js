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

export const metadata = {
  title: 'GMI Validator',
  description:
    'GMI Validator - minimal Next.js + Tailwind boilerplate',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-white text-black dark:bg-black dark:text-white`}
      >
        <header className="w-full border-b border-gray-200 dark:border-gray-800 bg-white/60 backdrop-blur-sm">
          <div className="mx-auto max-w-6xl px-6 py-4">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-semibold">
                GMI Validator
              </h1>
              {/* Tailwind visual test: should render a blue pill if Tailwind is working */}
              <span
                className="ml-4 inline-block rounded-full tw-test px-3 py-1 text-sm"
                id="tw-test"
              >
                Tailwind OK
              </span>
            </div>
          </div>
        </header>

        <main className="min-h-[calc(100vh-56px)]">{children}</main>
      </body>
    </html>
  );
}
