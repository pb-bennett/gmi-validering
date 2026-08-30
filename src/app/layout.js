import { Roboto } from 'next/font/google';
import './globals.css';
import { Analytics } from '@vercel/analytics/react';

const roboto = Roboto({
  variable: '--font-roboto',
  weight: ['300', '400', '500', '700'],
  subsets: ['latin'],
  display: 'swap',
});

export const metadata = {
  title: 'GMI Validator',
  description:
    'Nettbasert validering og analyse av innmålingsdata for vann og avløp.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="no">
      <body className={roboto.variable}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
