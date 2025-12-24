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
      <body className={`${roboto.variable} ${robotoSerif.variable}`}>
        <header className="bg-card p-4">
          <h1 className="text-text">GMI Validator</h1>
        </header>
        {children}
      </body>
    </html>
  );
}
