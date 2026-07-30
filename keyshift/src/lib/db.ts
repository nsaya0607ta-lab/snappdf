/**
 * IndexedDB ラッパー。
 * 音声ファイルそのものも含め、すべて端末内（ブラウザのストレージ）に保存する。
 * サーバーへの送信は一切行わない。
 */
import type { Playlist, Track, TrackSettings } from './types';

const DB_NAME = 'keyshift';
const DB_VERSION = 1;

export const STORE = {
  tracks: 'tracks',
  files: 'files',
  covers: 'covers',
  settings: 'settings',
  playlists: 'playlists',
  peaks: 'peaks',
} as const;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE.tracks)) db.createObjectStore(STORE.tracks, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE.files)) db.createObjectStore(STORE.files);
      if (!db.objectStoreNames.contains(STORE.covers)) db.createObjectStore(STORE.covers);
      if (!db.objectStoreNames.contains(STORE.settings)) db.createObjectStore(STORE.settings, { keyPath: 'trackId' });
      if (!db.objectStoreNames.contains(STORE.playlists)) db.createObjectStore(STORE.playlists, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE.peaks)) db.createObjectStore(STORE.peaks);
    };
    req.onsuccess = () => {
      req.result.onversionchange = () => req.result.close();
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

/* ---------------------------------------------------------------- tracks */

export const getAllTracks = () => run<Track[]>(STORE.tracks, 'readonly', (s) => s.getAll());
export const putTrack = (t: Track) => run(STORE.tracks, 'readwrite', (s) => s.put(t));

/* ----------------------------------------------------------------- files */

export const getFile = (id: string) => run<Blob | undefined>(STORE.files, 'readonly', (s) => s.get(id));
export const putFile = (id: string, blob: Blob) => run(STORE.files, 'readwrite', (s) => s.put(blob, id));

/* ---------------------------------------------------------------- covers */

export const getCover = (id: string) => run<Blob | undefined>(STORE.covers, 'readonly', (s) => s.get(id));
export const putCover = (id: string, blob: Blob) => run(STORE.covers, 'readwrite', (s) => s.put(blob, id));

/* -------------------------------------------------------------- settings */

export const getAllSettings = () => run<TrackSettings[]>(STORE.settings, 'readonly', (s) => s.getAll());
export const putSettings = (v: TrackSettings) => run(STORE.settings, 'readwrite', (s) => s.put(v));

/* ------------------------------------------------------------- playlists */

export const getAllPlaylists = () => run<Playlist[]>(STORE.playlists, 'readonly', (s) => s.getAll());
export const putPlaylist = (p: Playlist) => run(STORE.playlists, 'readwrite', (s) => s.put(p));
export const deletePlaylistRecord = (id: string) => run(STORE.playlists, 'readwrite', (s) => s.delete(id));

/* ----------------------------------------------------------------- peaks */

export const getPeaks = (id: string) => run<Int8Array | undefined>(STORE.peaks, 'readonly', (s) => s.get(id));
export const putPeaks = (id: string, data: Int8Array) => run(STORE.peaks, 'readwrite', (s) => s.put(data, id));

/* ---------------------------------------------------------------- delete */

export async function deleteTrackEverywhere(id: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const stores = [STORE.tracks, STORE.files, STORE.covers, STORE.settings, STORE.peaks];
    const tx = db.transaction(stores, 'readwrite');
    for (const s of stores) tx.objectStore(s).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function estimateUsage(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
}
