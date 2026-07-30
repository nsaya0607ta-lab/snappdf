'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { AudioEngine } from '@/lib/audio/engine';
import * as db from '@/lib/db';
import { guessFromFileName, readDuration, readTags } from '@/lib/metadata';
import { defaultSettings, type Playlist, type RepeatMode, type Track, type TrackSettings } from '@/lib/types';
import { positionStore } from './position-store';

export const MIN_SEMITONES = -12;
export const MAX_SEMITONES = 12;
export const MIN_TEMPO = 0.5;
export const MAX_TEMPO = 2;

const ACCEPTED_EXT = ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'oga', 'opus', 'mp4', 'weba', 'webm'];
const LAST_SESSION_KEY = 'keyshift-last-session';

interface LastSession {
  id: string;
  queue: string[];
}

function readLastSession(): LastSession | null {
  try {
    const raw = localStorage.getItem(LAST_SESSION_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as LastSession;
    return typeof v?.id === 'string' && Array.isArray(v.queue) ? v : null;
  } catch {
    return null;
  }
}

export interface AddProgress {
  total: number;
  done: number;
  current: string;
}

interface PlayerContextValue {
  tracks: Track[];
  trackMap: Map<string, Track>;
  settings: Map<string, TrackSettings>;
  playlists: Playlist[];
  currentId: string | null;
  currentTrack: Track | null;
  currentSettings: TrackSettings;
  playing: boolean;
  duration: number;
  peaks: Int8Array | null;
  loadingTrack: boolean;
  queue: string[];
  shuffle: boolean;
  repeat: RepeatMode;
  sleepEndsAt: number | null;
  addProgress: AddProgress | null;
  ready: boolean;
  error: string | null;

  addFiles: (files: File[]) => Promise<void>;
  removeTrack: (id: string) => Promise<void>;
  playTrack: (id: string, queue?: string[]) => Promise<void>;
  togglePlay: () => void;
  next: () => void;
  previous: () => void;
  seek: (time: number) => void;
  seekBy: (delta: number) => void;
  setSemitones: (value: number) => void;
  nudgeSemitones: (delta: number) => void;
  setTempo: (value: number) => void;
  nudgeTempo: (delta: number) => void;
  setVolume: (value: number) => void;
  toggleMute: () => void;
  markLoopA: () => void;
  markLoopB: () => void;
  clearLoop: () => void;
  toggleLoop: () => void;
  resetKeyAndTempo: () => void;
  toggleFavorite: (id: string) => void;
  setMemo: (id: string, memo: string) => void;
  setShuffle: (value: boolean) => void;
  cycleRepeat: () => void;
  setSleepMinutes: (minutes: number | null) => void;
  createPlaylist: (name: string) => Promise<string>;
  renamePlaylist: (id: string, name: string) => void;
  removePlaylist: (id: string) => Promise<void>;
  addToPlaylist: (playlistId: string, trackIds: string[]) => void;
  removeFromPlaylist: (playlistId: string, index: number) => void;
  movePlaylistItem: (playlistId: string, from: number, to: number) => void;
  dismissError: () => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used inside PlayerProvider');
  return ctx;
}

/** 再生位置（秒）。頻繁に更新されるのでこのフックを使う側だけが再描画される。 */
export function usePosition(): number {
  return useSyncExternalStore(positionStore.subscribe, positionStore.getSnapshot, positionStore.getServerSnapshot);
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const engineRef = useRef<AudioEngine | null>(null);
  if (engineRef.current === null && typeof window !== 'undefined') engineRef.current = new AudioEngine();

  const [tracks, setTracks] = useState<Track[]>([]);
  const [settings, setSettings] = useState<Map<string, TrackSettings>>(new Map());
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [peaks, setPeaks] = useState<Int8Array | null>(null);
  const [loadingTrack, setLoadingTrack] = useState(false);
  const [queue, setQueue] = useState<string[]>([]);
  const [shuffle, setShuffleState] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>('off');
  const [sleepEndsAt, setSleepEndsAt] = useState<number | null>(null);
  const [addProgress, setAddProgress] = useState<AddProgress | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTokenRef = useRef(0);
  /** Worklet に実際に読み込まれている曲（＝すぐ再生できる曲）*/
  const loadedIdRef = useRef<string | null>(null);
  const settingsSaveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const lastVolumeRef = useRef(1);

  const queueRef = useRef<string[]>([]);
  queueRef.current = queue;

  const trackMap = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks]);
  const currentTrack = currentId ? (trackMap.get(currentId) ?? null) : null;
  const currentSettings = useMemo(
    () => (currentId ? (settings.get(currentId) ?? defaultSettings(currentId)) : defaultSettings('')),
    [currentId, settings],
  );

  /* -------------------------------------------------------- 起動時の復元 */

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [t, s, p] = await Promise.all([db.getAllTracks(), db.getAllSettings(), db.getAllPlaylists()]);
        if (cancelled) return;
        t.sort((a, b) => b.addedAt - a.addedAt);
        setTracks(t);
        setSettings(new Map(s.map((x) => [x.trackId, x])));
        setPlaylists(p.sort((a, b) => b.updatedAt - a.updatedAt));

        // 前回開いていた曲を「選択された状態」だけ復元する。
        // 音は出さない（AudioContext はユーザー操作まで作らない）。
        const last = readLastSession();
        const track = last && t.find((x) => x.id === last.id);
        if (last && track) {
          setCurrentId(track.id);
          setDuration(track.duration);
          setQueue(last.queue.filter((id) => t.some((x) => x.id === id)));
          const cachedPeaks = await db.getPeaks(track.id).catch(() => undefined);
          if (!cancelled && cachedPeaks) setPeaks(cachedPeaks);
        }
      } catch {
        if (!cancelled) setError('ライブラリの読み込みに失敗しました。');
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ------------------------------------------------------- 設定の永続化 */

  const patchSettings = useCallback((trackId: string, patch: Partial<TrackSettings>) => {
    if (!trackId) return;
    setSettings((prev) => {
      const base = prev.get(trackId) ?? defaultSettings(trackId);
      const nextValue: TrackSettings = { ...base, ...patch };
      const map = new Map(prev);
      map.set(trackId, nextValue);

      // 書き込みはまとめる（スライダー操作でIDBを叩き続けないように）
      const timers = settingsSaveTimers.current;
      const existing = timers.get(trackId);
      if (existing) clearTimeout(existing);
      timers.set(
        trackId,
        setTimeout(() => {
          timers.delete(trackId);
          void db.putSettings(nextValue).catch(() => undefined);
        }, 350),
      );
      return map;
    });
  }, []);

  /* ------------------------------------------------------------ エンジン */

  const nextIndex = useCallback(
    (dir: 1 | -1): number => {
      if (queue.length === 0 || !currentId) return -1;
      const idx = queue.indexOf(currentId);
      if (idx < 0) return 0;
      if (shuffle && dir === 1) {
        if (queue.length === 1) return 0;
        let r = idx;
        while (r === idx) r = Math.floor(Math.random() * queue.length);
        return r;
      }
      const n = idx + dir;
      if (n < 0) return repeat === 'all' ? queue.length - 1 : -1;
      if (n >= queue.length) return repeat === 'all' ? 0 : -1;
      return n;
    },
    [queue, currentId, shuffle, repeat],
  );

  const playTrackRef = useRef<(id: string, q?: string[]) => Promise<void>>(async () => undefined);

  const playTrack = useCallback(
    async (id: string, nextQueue?: string[]) => {
      const engine = engineRef.current;
      if (!engine) return;
      const token = ++loadTokenRef.current;

      if (nextQueue) setQueue(nextQueue);
      setCurrentId(id);
      setPlaying(false);
      setLoadingTrack(true);
      positionStore.set(0);

      const s = settings.get(id) ?? defaultSettings(id);
      const meta = trackMap.get(id);
      setDuration(meta?.duration ?? 0);

      try {
        await engine.init();
        engine.setSemitones(s.semitones);
        engine.setTempo(s.tempo);
        engine.setVolume(s.volume);
        engine.setLoop(s.loopA, s.loopB, s.loopEnabled);

        // 波形は先にキャッシュから出しておく（デコードを待たずに表示できる）
        const cached = await db.getPeaks(id);
        if (token === loadTokenRef.current && cached) setPeaks(cached);
        else if (token === loadTokenRef.current) setPeaks(null);

        let decoded = engine.takePrefetched(id);
        if (!decoded) {
          const blob = await db.getFile(id);
          if (!blob) throw new Error('ファイルが見つかりません');
          decoded = await engine.decode(blob);
        }
        if (token !== loadTokenRef.current) return;

        setDuration(decoded.duration);
        setPeaks(decoded.peaks);
        void db.putPeaks(id, decoded.peaks).catch(() => undefined);

        await engine.load(decoded, 0);
        if (token !== loadTokenRef.current) return;

        loadedIdRef.current = id;
        try {
          localStorage.setItem(LAST_SESSION_KEY, JSON.stringify({ id, queue: nextQueue ?? queueRef.current }));
        } catch {
          /* 保存できなくても再生には影響しない */
        }

        await engine.play();
        setPlaying(true);
        setLoadingTrack(false);

        const prev = settings.get(id) ?? defaultSettings(id);
        patchSettings(id, { playCount: prev.playCount + 1, lastPlayedAt: Date.now() });
      } catch (e) {
        if (token !== loadTokenRef.current) return;
        setLoadingTrack(false);
        setPlaying(false);
        setError(e instanceof Error ? `再生できませんでした: ${e.message}` : '再生できませんでした。');
      }
    },
    [settings, trackMap, patchSettings],
  );

  playTrackRef.current = playTrack;

  /* 次の曲を先読み */
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !currentId || loadingTrack) return;
    const idx = queue.indexOf(currentId);
    if (idx < 0 || shuffle) return;
    const nextId = queue[idx + 1];
    if (!nextId) {
      engine.clearPrefetch();
      return;
    }
    const timer = setTimeout(() => {
      void engine.prefetchTrack(nextId, () => db.getFile(nextId));
    }, 1500);
    return () => clearTimeout(timer);
  }, [currentId, queue, shuffle, loadingTrack]);

  const next = useCallback(() => {
    const i = nextIndex(1);
    if (i >= 0 && queue[i]) void playTrackRef.current(queue[i]);
  }, [nextIndex, queue]);

  const previous = useCallback(() => {
    // 3秒以上再生していたら曲の頭に戻す（一般的なプレイヤーの挙動）
    if (positionStore.getSnapshot() > 3) {
      engineRef.current?.seek(0);
      positionStore.set(0);
      return;
    }
    const i = nextIndex(-1);
    if (i >= 0 && queue[i]) void playTrackRef.current(queue[i]);
  }, [nextIndex, queue]);

  const nextRef = useRef(next);
  nextRef.current = next;
  const repeatRef = useRef(repeat);
  repeatRef.current = repeat;

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setCallbacks({
      onPosition: (t) => positionStore.set(t),
      onEnded: () => {
        if (repeatRef.current === 'one') {
          engine.seek(0);
          void engine.play();
          return;
        }
        setPlaying(false);
        nextRef.current();
      },
    });
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    return () => {
      for (const timer of settingsSaveTimers.current.values()) clearTimeout(timer);
      settingsSaveTimers.current.clear();
      engine?.dispose();
    };
  }, []);

  /* -------------------------------------------------------------- 追加 */

  const addFiles = useCallback(
    async (files: File[]) => {
      const accepted = files.filter((f) => {
        const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
        return ACCEPTED_EXT.includes(ext) || f.type.startsWith('audio/');
      });
      if (accepted.length === 0) {
        setError('対応している音楽ファイルが見つかりませんでした。');
        return;
      }

      setAddProgress({ total: accepted.length, done: 0, current: accepted[0].name });
      const added: Track[] = [];
      let failed = 0;

      for (let i = 0; i < accepted.length; i++) {
        const file = accepted[i];
        setAddProgress({ total: accepted.length, done: i, current: file.name });
        try {
          const [tags, dur] = await Promise.all([readTags(file), readDuration(file)]);
          const guess = guessFromFileName(file.name);
          const id = uid();
          const track: Track = {
            id,
            fileName: file.name,
            title: tags.title || guess.title,
            artist: tags.artist || guess.artist,
            album: tags.album || '',
            duration: dur,
            size: file.size,
            mime: file.type || 'audio/mpeg',
            addedAt: Date.now(),
            hasCover: Boolean(tags.cover),
          };
          await db.putFile(id, file);
          if (tags.cover) await db.putCover(id, tags.cover);
          await db.putTrack(track);
          await db.putSettings(defaultSettings(id));
          added.push(track);
        } catch {
          failed++;
        }
      }

      if (added.length > 0) {
        setTracks((prev) => [...added.slice().reverse(), ...prev]);
        setSettings((prev) => {
          const map = new Map(prev);
          for (const t of added) map.set(t.id, defaultSettings(t.id));
          return map;
        });
      }
      setAddProgress(null);
      if (failed > 0) setError(`${failed}件のファイルを追加できませんでした。`);
    },
    [],
  );

  const removeTrack = useCallback(
    async (id: string) => {
      if (currentId === id) {
        loadTokenRef.current++;
        loadedIdRef.current = null;
        engineRef.current?.pause();
        engineRef.current?.unload();
        setPlaying(false);
        setCurrentId(null);
        setPeaks(null);
        setDuration(0);
        positionStore.set(0);
      }
      await db.deleteTrackEverywhere(id);
      setTracks((prev) => prev.filter((t) => t.id !== id));
      setSettings((prev) => {
        const map = new Map(prev);
        map.delete(id);
        return map;
      });
      setQueue((prev) => prev.filter((x) => x !== id));
      setPlaylists((prev) => {
        const updated = prev.map((p) =>
          p.trackIds.includes(id) ? { ...p, trackIds: p.trackIds.filter((x) => x !== id), updatedAt: Date.now() } : p,
        );
        for (const p of updated) if (!prev.includes(p)) void db.putPlaylist(p).catch(() => undefined);
        return updated;
      });
    },
    [currentId],
  );

  /* ---------------------------------------------------------- 再生操作 */

  const togglePlay = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (!currentId) {
      const first = queue[0] ?? tracks[0]?.id;
      if (first) void playTrackRef.current(first, queue.length ? queue : tracks.map((t) => t.id));
      return;
    }
    if (loadedIdRef.current !== currentId) {
      // 前回セッションから復元した直後など、まだ音源を読み込んでいない場合
      void playTrackRef.current(currentId, queue.length ? queue : tracks.map((t) => t.id));
      return;
    }
    if (playing) {
      engine.pause();
      setPlaying(false);
    } else {
      void engine.play();
      setPlaying(true);
    }
  }, [currentId, playing, queue, tracks]);

  const seek = useCallback(
    (time: number) => {
      if (!currentId || loadedIdRef.current !== currentId) return;
      const t = clamp(time, 0, Math.max(0, duration));
      engineRef.current?.seek(t);
      positionStore.set(t);
    },
    [duration, currentId],
  );

  const seekBy = useCallback((delta: number) => seek(positionStore.getSnapshot() + delta), [seek]);

  /* ------------------------------------------------------ キー / テンポ */

  const setSemitones = useCallback(
    (value: number) => {
      if (!currentId) return;
      const v = clamp(Math.round(value), MIN_SEMITONES, MAX_SEMITONES);
      engineRef.current?.setSemitones(v);
      patchSettings(currentId, { semitones: v });
    },
    [currentId, patchSettings],
  );

  const nudgeSemitones = useCallback(
    (delta: number) => setSemitones(currentSettings.semitones + delta),
    [currentSettings.semitones, setSemitones],
  );

  const setTempo = useCallback(
    (value: number) => {
      if (!currentId) return;
      const v = clamp(Math.round(value * 100) / 100, MIN_TEMPO, MAX_TEMPO);
      engineRef.current?.setTempo(v);
      patchSettings(currentId, { tempo: v });
    },
    [currentId, patchSettings],
  );

  const nudgeTempo = useCallback(
    (delta: number) => setTempo(currentSettings.tempo + delta),
    [currentSettings.tempo, setTempo],
  );

  const setVolume = useCallback(
    (value: number) => {
      const v = clamp(value, 0, 1);
      engineRef.current?.setVolume(v);
      if (v > 0) lastVolumeRef.current = v;
      if (currentId) patchSettings(currentId, { volume: v });
    },
    [currentId, patchSettings],
  );

  const toggleMute = useCallback(() => {
    setVolume(currentSettings.volume > 0 ? 0 : lastVolumeRef.current || 1);
  }, [currentSettings.volume, setVolume]);

  const resetKeyAndTempo = useCallback(() => {
    if (!currentId) return;
    engineRef.current?.setSemitones(0);
    engineRef.current?.setTempo(1);
    patchSettings(currentId, { semitones: 0, tempo: 1 });
  }, [currentId, patchSettings]);

  /* ------------------------------------------------------- ABリピート */

  const markLoopA = useCallback(() => {
    if (!currentId) return;
    const a = positionStore.getSnapshot();
    const b = currentSettings.loopB;
    const validB = b !== null && b > a + 0.2 ? b : null;
    engineRef.current?.setLoop(a, validB, validB !== null && currentSettings.loopEnabled);
    patchSettings(currentId, { loopA: a, loopB: validB });
  }, [currentId, currentSettings.loopB, currentSettings.loopEnabled, patchSettings]);

  const markLoopB = useCallback(() => {
    if (!currentId) return;
    const b = positionStore.getSnapshot();
    const a = currentSettings.loopA;
    if (a === null || b <= a + 0.2) {
      setError('B地点はA地点より後ろに指定してください。');
      return;
    }
    engineRef.current?.setLoop(a, b, true);
    patchSettings(currentId, { loopB: b, loopEnabled: true });
  }, [currentId, currentSettings.loopA, patchSettings]);

  const clearLoop = useCallback(() => {
    if (!currentId) return;
    engineRef.current?.setLoop(null, null, false);
    patchSettings(currentId, { loopA: null, loopB: null, loopEnabled: false });
  }, [currentId, patchSettings]);

  const toggleLoop = useCallback(() => {
    if (!currentId) return;
    const { loopA, loopB, loopEnabled } = currentSettings;
    if (loopA === null || loopB === null) {
      setError('先にA地点とB地点を指定してください。');
      return;
    }
    engineRef.current?.setLoop(loopA, loopB, !loopEnabled);
    patchSettings(currentId, { loopEnabled: !loopEnabled });
  }, [currentId, currentSettings, patchSettings]);

  /* ------------------------------------------------------ お気に入り等 */

  const toggleFavorite = useCallback(
    (id: string) => {
      const s = settings.get(id) ?? defaultSettings(id);
      patchSettings(id, { favorite: !s.favorite });
    },
    [settings, patchSettings],
  );

  const setMemo = useCallback((id: string, memo: string) => patchSettings(id, { memo }), [patchSettings]);

  const setShuffle = useCallback((value: boolean) => setShuffleState(value), []);

  const cycleRepeat = useCallback(() => {
    setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off'));
  }, []);

  /* -------------------------------------------------------- スリープ */

  const setSleepMinutes = useCallback((minutes: number | null) => {
    setSleepEndsAt(minutes === null ? null : Date.now() + minutes * 60_000);
  }, []);

  useEffect(() => {
    if (sleepEndsAt === null) return;
    const remain = sleepEndsAt - Date.now();
    const timer = setTimeout(() => {
      engineRef.current?.pause();
      setPlaying(false);
      setSleepEndsAt(null);
    }, Math.max(0, remain));
    return () => clearTimeout(timer);
  }, [sleepEndsAt]);

  /* ------------------------------------------------------ プレイリスト */

  const createPlaylist = useCallback(async (name: string) => {
    const p: Playlist = { id: uid(), name: name.trim() || '新しいプレイリスト', trackIds: [], createdAt: Date.now(), updatedAt: Date.now() };
    await db.putPlaylist(p);
    setPlaylists((prev) => [p, ...prev]);
    return p.id;
  }, []);

  const renamePlaylist = useCallback(
    (id: string, name: string) => {
      setPlaylists((prev) => {
        const target = prev.find((p) => p.id === id);
        if (!target) return prev;
        const updated = { ...target, name: name.trim() || target.name, updatedAt: Date.now() };
        void db.putPlaylist(updated).catch(() => undefined);
        return prev.map((p) => (p.id === id ? updated : p));
      });
    },
    [],
  );

  const removePlaylist = useCallback(async (id: string) => {
    await db.deletePlaylistRecord(id);
    setPlaylists((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const addToPlaylist = useCallback(
    (playlistId: string, trackIds: string[]) => {
      setPlaylists((prev) => {
        const target = prev.find((p) => p.id === playlistId);
        if (!target) return prev;
        const merged = [...target.trackIds, ...trackIds.filter((t) => !target.trackIds.includes(t))];
        const updated = { ...target, trackIds: merged, updatedAt: Date.now() };
        void db.putPlaylist(updated).catch(() => undefined);
        return prev.map((p) => (p.id === playlistId ? updated : p));
      });
    },
    [],
  );

  const removeFromPlaylist = useCallback(
    (playlistId: string, index: number) => {
      setPlaylists((prev) => {
        const target = prev.find((p) => p.id === playlistId);
        if (!target) return prev;
        const ids = target.trackIds.slice();
        ids.splice(index, 1);
        const updated = { ...target, trackIds: ids, updatedAt: Date.now() };
        void db.putPlaylist(updated).catch(() => undefined);
        return prev.map((p) => (p.id === playlistId ? updated : p));
      });
    },
    [],
  );

  const movePlaylistItem = useCallback(
    (playlistId: string, from: number, to: number) => {
      setPlaylists((prev) => {
        const target = prev.find((p) => p.id === playlistId);
        if (!target) return prev;
        const ids = target.trackIds.slice();
        if (from < 0 || from >= ids.length || to < 0 || to >= ids.length || from === to) return prev;
        const [moved] = ids.splice(from, 1);
        ids.splice(to, 0, moved);
        const updated = { ...target, trackIds: ids, updatedAt: Date.now() };
        void db.putPlaylist(updated).catch(() => undefined);
        return prev.map((p) => (p.id === playlistId ? updated : p));
      });
    },
    [],
  );

  /* ------------------------------------------------- Media Session API */

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    if (currentTrack) {
      ms.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist || '不明なアーティスト',
        album: currentTrack.album || '',
      });
    }
    ms.playbackState = playing ? 'playing' : 'paused';
    const handlers: [MediaSessionAction, () => void][] = [
      ['play', () => togglePlay()],
      ['pause', () => togglePlay()],
      ['nexttrack', () => nextRef.current()],
      ['previoustrack', () => previous()],
    ];
    for (const [action, fn] of handlers) {
      try {
        ms.setActionHandler(action, fn);
      } catch {
        /* 未対応のアクションは無視 */
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          ms.setActionHandler(action, null);
        } catch {
          /* noop */
        }
      }
    };
  }, [currentTrack, playing, togglePlay, previous]);

  const value: PlayerContextValue = {
    tracks,
    trackMap,
    settings,
    playlists,
    currentId,
    currentTrack,
    currentSettings,
    playing,
    duration,
    peaks,
    loadingTrack,
    queue,
    shuffle,
    repeat,
    sleepEndsAt,
    addProgress,
    ready,
    error,
    addFiles,
    removeTrack,
    playTrack,
    togglePlay,
    next,
    previous,
    seek,
    seekBy,
    setSemitones,
    nudgeSemitones,
    setTempo,
    nudgeTempo,
    setVolume,
    toggleMute,
    markLoopA,
    markLoopB,
    clearLoop,
    toggleLoop,
    resetKeyAndTempo,
    toggleFavorite,
    setMemo,
    setShuffle,
    cycleRepeat,
    setSleepMinutes,
    createPlaylist,
    renamePlaylist,
    removePlaylist,
    addToPlaylist,
    removeFromPlaylist,
    movePlaylistItem,
    dismissError: () => setError(null),
  };

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}
