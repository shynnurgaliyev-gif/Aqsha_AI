import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Aqsha AI — Admin',
  description: 'Internal admin dashboard',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header>
        <h1>Aqsha AI</h1>
        <span className="badge">Admin</span>
      </header>
      <main>{children}</main>
    </>
  );
}
