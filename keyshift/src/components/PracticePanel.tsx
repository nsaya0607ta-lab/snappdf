'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatKey, formatTime } from '@/lib/format';
import {
  MAX_SEMITONES,
  MAX_TEMPO,
  MIN_SEMITONES,
  MIN_TEMPO,
  usePlayer,
  usePosition,
} from '@/state/player';
import { IconClose, IconReset, IconTimer } from './icons';
import { Waveform } from './Waveform';

const TEMPO_PRESETS = [0.75, 0.9, 1, 1.1, 1.25];
const SLEEP_PRESETS = [15, 30, 45, 60];
const SEMITONES = Array.from({ length: MAX_SEMITONES - MIN_SEMITONES + 1 }, (_, i) => i + MIN_SEMITONES);

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-panel p-4 elevated">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold tracking-[0.14em] text-fg-faint uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function RoundButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line bg-panel-soft text-xl font-medium text-fg transition hover:border-line-strong hover:bg-accent-soft active:scale-95 disabled:opacity-35 disabled:hover:bg-panel-soft"
    >
      {children}
    </button>
  );
}

function Chip({
  active,
  onClick,
  children,
  className = '',
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
        active
          ? 'gradient-accent text-white shadow-sm'
          : 'border border-line bg-panel-soft text-fg-muted hover:border-line-strong hover:text-fg'
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function PracticePanel({ onClose }: { onClose?: () => void }) {
  const {
    currentTrack,
    currentSettings,
    currentId,
    duration,
    peaks,
    seek,
    setSemitones,
    nudgeSemitones,
    setTempo,
    nudgeTempo,
    resetKeyAndTempo,
    markLoopA,
    markLoopB,
    clearLoop,
    toggleLoop,
    setMemo,
    sleepEndsAt,
    setSleepMinutes,
  } = usePlayer();
  const position = usePosition();

  const chipRowRef = useRef<HTMLDivElement>(null);
  const [memoDraft, setMemoDraft] = useState(currentSettings.memo);
  useEffect(() => setMemoDraft(currentSettings.memo), [currentId, currentSettings.memo]);

  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    if (sleepEndsAt === null) {
      setRemaining(null);
      return;
    }
    const tick = () => setRemaining(Math.max(0, Math.round((sleepEndsAt - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [sleepEndsAt]);

  const disabled = !currentTrack;
  const { semitones, tempo, loopA, loopB, loopEnabled } = currentSettings;

  // 選択中の半音チップを常に見えるところへ寄せる
  useEffect(() => {
    const row = chipRowRef.current;
    const active = row?.querySelector<HTMLElement>('[data-active="true"]');
    if (!row || !active) return;
    // offsetParent がスクロール要素とは限らないので矩形から相対位置を求める
    const rowRect = row.getBoundingClientRect();
    const chipRect = active.getBoundingClientRect();
    const delta = chipRect.left - rowRect.left - (row.clientWidth - chipRect.width) / 2;
    row.scrollTo({ left: Math.max(0, row.scrollLeft + delta), behavior: 'smooth' });
  }, [semitones]);

  const keyHint = useMemo(() => {
    if (semitones === 0) return '原曲キー';
    return semitones > 0 ? `原曲より ${semitones} 半音 高い` : `原曲より ${Math.abs(semitones)} 半音 低い`;
  }, [semitones]);

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3 lg:p-4">
      <div className="flex items-center justify-between lg:hidden">
        <h2 className="text-sm font-semibold">練習パネル</h2>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="閉じる" className="rounded-full p-2 hover:bg-panel-soft">
            <IconClose className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* ------------------------------------------------------------ キー */}
      <Section
        title="キー"
        action={
          <button
            type="button"
            onClick={resetKeyAndTempo}
            disabled={disabled}
            className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-fg-muted transition hover:bg-panel-soft hover:text-fg disabled:opacity-40"
          >
            <IconReset className="h-3.5 w-3.5" />
            リセット
          </button>
        }
      >
        <div className="flex items-center justify-between gap-3">
          <RoundButton label="キーを1つ下げる" onClick={() => nudgeSemitones(-1)} disabled={disabled || semitones <= MIN_SEMITONES}>
            −
          </RoundButton>
          <div className="flex min-w-0 flex-col items-center">
            <span className="text-gradient-accent tabular text-4xl leading-none font-semibold">{formatKey(semitones)}</span>
            <span className="mt-1 text-[11px] text-fg-faint">{keyHint}</span>
          </div>
          <RoundButton label="キーを1つ上げる" onClick={() => nudgeSemitones(1)} disabled={disabled || semitones >= MAX_SEMITONES}>
            +
          </RoundButton>
        </div>

        <input
          type="range"
          min={MIN_SEMITONES}
          max={MAX_SEMITONES}
          step={1}
          value={semitones}
          disabled={disabled}
          onChange={(e) => setSemitones(Number(e.target.value))}
          aria-label="キー（半音）"
          className="mt-4 w-full disabled:opacity-40"
        />

        <div
          ref={chipRowRef}
          className="no-scrollbar -mx-1 mt-3 flex snap-x gap-1.5 overflow-x-auto px-1 pb-1"
        >
          {SEMITONES.map((s) => (
            <button
              key={s}
              type="button"
              data-active={s === semitones ? 'true' : undefined}
              disabled={disabled}
              onClick={() => setSemitones(s)}
              className={`tabular snap-center rounded-lg px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-40 ${
                s === semitones
                  ? 'gradient-accent text-white'
                  : s === 0
                    ? 'border border-line-strong bg-panel-soft text-fg'
                    : 'bg-panel-soft text-fg-muted hover:text-fg'
              }`}
            >
              {formatKey(s)}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-fg-faint">
          テンポは変わりません。半音単位でリアルタイムに反映されます。
        </p>
      </Section>

      {/* ---------------------------------------------------------- テンポ */}
      <Section title="テンポ">
        <div className="flex items-center justify-between gap-3">
          <RoundButton label="テンポを下げる" onClick={() => nudgeTempo(-0.05)} disabled={disabled || tempo <= MIN_TEMPO}>
            −
          </RoundButton>
          <div className="flex flex-col items-center">
            <span className="tabular text-3xl leading-none font-semibold">{tempo.toFixed(2)}<span className="text-lg">x</span></span>
            <span className="mt-1 text-[11px] text-fg-faint">キーは変わりません</span>
          </div>
          <RoundButton label="テンポを上げる" onClick={() => nudgeTempo(0.05)} disabled={disabled || tempo >= MAX_TEMPO}>
            +
          </RoundButton>
        </div>
        <input
          type="range"
          min={MIN_TEMPO}
          max={MAX_TEMPO}
          step={0.01}
          value={tempo}
          disabled={disabled}
          onChange={(e) => setTempo(Number(e.target.value))}
          aria-label="テンポ（再生速度）"
          className="mt-4 w-full disabled:opacity-40"
        />
        <div className="mt-3 flex flex-wrap gap-1.5">
          {TEMPO_PRESETS.map((t) => (
            <Chip key={t} active={Math.abs(tempo - t) < 0.005} onClick={() => setTempo(t)}>
              {t.toFixed(2)}x
            </Chip>
          ))}
        </div>
      </Section>

      {/* ------------------------------------------------------ ABリピート */}
      <Section
        title="ABリピート"
        action={
          <button
            type="button"
            onClick={clearLoop}
            disabled={disabled || (loopA === null && loopB === null)}
            className="rounded-full px-2 py-1 text-[11px] text-fg-muted transition hover:bg-panel-soft hover:text-fg disabled:opacity-40"
          >
            クリア
          </button>
        }
      >
        <Waveform
          peaks={peaks}
          duration={duration}
          loopA={loopA}
          loopB={loopB}
          loopEnabled={loopEnabled}
          onSeek={seek}
        />
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={markLoopA}
            disabled={disabled}
            className="rounded-xl border border-line bg-panel-soft py-2.5 text-center transition hover:border-line-strong disabled:opacity-40"
          >
            <span className="block text-[11px] text-fg-faint">A地点</span>
            <span className="tabular text-sm font-semibold">{loopA === null ? '--:--' : formatTime(loopA)}</span>
          </button>
          <button
            type="button"
            onClick={markLoopB}
            disabled={disabled}
            className="rounded-xl border border-line bg-panel-soft py-2.5 text-center transition hover:border-line-strong disabled:opacity-40"
          >
            <span className="block text-[11px] text-fg-faint">B地点</span>
            <span className="tabular text-sm font-semibold">{loopB === null ? '--:--' : formatTime(loopB)}</span>
          </button>
          <button
            type="button"
            onClick={toggleLoop}
            disabled={disabled}
            className={`rounded-xl py-2.5 text-center transition disabled:opacity-40 ${
              loopEnabled ? 'gradient-accent text-white' : 'border border-line bg-panel-soft hover:border-line-strong'
            }`}
          >
            <span className={`block text-[11px] ${loopEnabled ? 'text-white/70' : 'text-fg-faint'}`}>区間リピート</span>
            <span className="text-sm font-semibold">{loopEnabled ? 'ON' : 'OFF'}</span>
          </button>
        </div>
        <p className="tabular mt-2 text-[11px] text-fg-faint">現在位置 {formatTime(position)} / {formatTime(duration)}</p>
      </Section>

      {/* -------------------------------------------------------------- メモ */}
      <Section title="歌いやすいキーのメモ">
        <textarea
          value={memoDraft}
          disabled={disabled}
          onChange={(e) => setMemoDraft(e.target.value)}
          onBlur={() => currentId && setMemo(currentId, memoDraft)}
          rows={3}
          placeholder="例）この曲は -3 が歌いやすい。サビの高音は +0 だときつい。"
          className="w-full resize-none rounded-xl border border-line bg-panel-soft p-3 text-sm leading-relaxed text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none disabled:opacity-40"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-fg-faint">フォーカスを外すと保存されます</span>
          {currentId && memoDraft !== currentSettings.memo && (
            <button
              type="button"
              onClick={() => setMemo(currentId, memoDraft)}
              className="rounded-full bg-accent-soft px-3 py-1 text-[11px] font-medium text-accent"
            >
              保存
            </button>
          )}
        </div>
      </Section>

      {/* ------------------------------------------------------ スリープ */}
      <Section title="スリープタイマー">
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip active={sleepEndsAt === null} onClick={() => setSleepMinutes(null)}>
            オフ
          </Chip>
          {SLEEP_PRESETS.map((m) => (
            <Chip key={m} onClick={() => setSleepMinutes(m)}>
              {m}分
            </Chip>
          ))}
        </div>
        {remaining !== null && (
          <p className="tabular mt-3 flex items-center gap-1.5 text-xs text-fg-muted">
            <IconTimer className="h-4 w-4" />
            残り {formatTime(remaining)} で一時停止します
          </p>
        )}
      </Section>
    </div>
  );
}
