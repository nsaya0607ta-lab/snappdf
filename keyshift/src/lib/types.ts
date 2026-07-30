export interface Track {
  id: string;
  fileName: string;
  title: string;
  artist: string;
  album: string;
  duration: number; // 秒
  size: number;
  mime: string;
  addedAt: number;
  hasCover: boolean;
}

export interface TrackSettings {
  trackId: string;
  semitones: number; // -12 〜 +12
  tempo: number; // 0.5 〜 2.0
  volume: number; // 0 〜 1
  loopA: number | null; // 秒
  loopB: number | null; // 秒
  loopEnabled: boolean;
  favorite: boolean;
  memo: string; // 「この曲は-3が歌いやすい」など
  playCount: number;
  lastPlayedAt: number | null;
}

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: number;
  updatedAt: number;
}

export type RepeatMode = 'off' | 'all' | 'one';

export function defaultSettings(trackId: string): TrackSettings {
  return {
    trackId,
    semitones: 0,
    tempo: 1,
    volume: 1,
    loopA: null,
    loopB: null,
    loopEnabled: false,
    favorite: false,
    memo: '',
    playCount: 0,
    lastPlayedAt: null,
  };
}
