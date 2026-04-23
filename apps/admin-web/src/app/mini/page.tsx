'use client';

import { Suspense } from 'react';
import { MiniShell } from './MiniShell';
import { MiniLoader } from './components/MiniLoader';

export default function MiniPage() {
  return (
    <Suspense fallback={<MiniLoader />}>
      <MiniShell />
    </Suspense>
  );
}
