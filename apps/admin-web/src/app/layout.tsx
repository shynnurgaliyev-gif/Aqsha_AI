import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Aqsha AI — Admin',
  description: 'Internal admin dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header>
          <h1>Aqsha AI</h1>
          <span className="badge">Admin</span>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
