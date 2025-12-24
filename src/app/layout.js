import { Roboto, Roboto_Serif } from 'next/font/google';
import './globals.css';

const roboto = Roboto({
  variable: '--font-roboto',
  weight: ['400', '600'],
  subsets: ['latin'],
  display: 'swap',
});

const robotoSerif = Roboto_Serif({
  variable: '--font-roboto-serif',
  weight: ['600', '700'],
  subsets: ['latin'],
  display: 'swap',
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
        className={`${roboto.variable} ${robotoSerif.variable} antialiased bg-page-bg text-text font-sans`}
      >
        <header className="w-full border-b border-transparent bg-card">
          <div className="mx-auto max-w-6xl px-6 py-4">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-serif font-bold text-text">
                GMI Validator
              </h1>
            </div>
          </div>
        </header>

        <main className="min-h-[calc(100vh-56px)]">{children}</main>
      </body>
    </html>
  );
}
