/**
 * 再生位置だけを持つ極小ストア。
 * 秒間30回ほど更新されるため、アプリ全体を再描画しないように分離している。
 */
type Listener = () => void;

class PositionStore {
  private value = 0;
  private listeners = new Set<Listener>();

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = (): number => this.value;

  getServerSnapshot = (): number => 0;

  set(value: number): void {
    if (this.value === value) return;
    this.value = value;
    for (const fn of this.listeners) fn();
  }
}

export const positionStore = new PositionStore();
