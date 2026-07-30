'use client';

import { AppShell } from '@/components/AppShell';
import { OfflineSupport } from '@/components/OfflineSupport';
import { PlayerProvider } from '@/state/player';

export default function Page() {
  return (
    <PlayerProvider>
      <AppShell />
      <OfflineSupport />
    </PlayerProvider>
  );
}
