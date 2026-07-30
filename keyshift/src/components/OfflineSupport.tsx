'use client';

import { useEffect } from 'react';

/** 一度読み込めば通信なしで起動できるようにする（音源・設定は常に端末内） */
export function OfflineSupport() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register('./sw.js').catch(() => undefined);
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  return null;
}
