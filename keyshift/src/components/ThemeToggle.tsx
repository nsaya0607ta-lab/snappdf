'use client';

import { useEffect, useState } from 'react';
import { IconMoon, IconSun } from './icons';

const KEY = 'keyshift-theme';

export function ThemeToggle() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem(KEY, next ? 'dark' : 'light');
    } catch {
      /* プライベートモードなどでは保存しない */
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
      className="rounded-full p-2 text-fg-muted transition hover:bg-panel-soft hover:text-fg"
    >
      {dark ? <IconSun className="h-[18px] w-[18px]" /> : <IconMoon className="h-[18px] w-[18px]" />}
    </button>
  );
}
