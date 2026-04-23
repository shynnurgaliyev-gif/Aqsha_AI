import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Aqsha AI',
  description: 'Личный финансовый помощник',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function MiniLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
