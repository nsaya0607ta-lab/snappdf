/**
 * AudioWorklet を包む再生エンジン。
 * デコード済みPCMは Worklet 側へ transfer するので、メインスレッドには残らない
 * （＝曲を切り替えても古いバッファが溜まらない）。
 */
import { computePeaks } from '../peaks';
import { semitoneToRatio } from '../format';

const WORKLET_URL = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/worklets/keyshift-processor.js`;

export interface DecodedTrack {
  channels: Float32Array[];
  frames: number;
  sampleRate: number;
  duration: number;
  peaks: Int8Array;
}

export interface EngineCallbacks {
  onPosition?: (time: number) => void;
  onEnded?: () => void;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private gain: GainNode | null = null;
  private ready: Promise<void> | null = null;
  private callbacks: EngineCallbacks = {};

  private semitones = 0;
  private tempo = 1;
  private volume = 1;

  /** 次に再生しそうな曲を先読みしておくスロット（常に1曲だけ） */
  private prefetch: { id: string; decoded: DecodedTrack } | null = null;

  setCallbacks(cb: EngineCallbacks): void {
    this.callbacks = cb;
  }

  get audioContext(): AudioContext | null {
    return this.ctx;
  }

  /** 初回のユーザー操作時に呼ぶ。AudioContext と Worklet を準備する。 */
  init(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const Ctor: typeof AudioContext =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor({ latencyHint: 'playback' });
      await ctx.audioWorklet.addModule(WORKLET_URL);

      const node = new AudioWorkletNode(ctx, 'keyshift-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      node.port.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === 'position') this.callbacks.onPosition?.(msg.time);
        else if (msg.type === 'ended') this.callbacks.onEnded?.();
      };

      const gain = ctx.createGain();
      gain.gain.value = this.volume;
      node.connect(gain).connect(ctx.destination);

      this.ctx = ctx;
      this.node = node;
      this.gain = gain;
      this.pushParams();
    })();
    return this.ready;
  }

  async resume(): Promise<void> {
    await this.init();
    if (this.ctx?.state === 'suspended') await this.ctx.resume();
  }

  /* ------------------------------------------------------------ decode */

  /** ファイルをデコードして PCM とピークを得る */
  async decode(blob: Blob): Promise<DecodedTrack> {
    await this.init();
    const ctx = this.ctx!;
    const buf = await blob.arrayBuffer();
    const audio = await ctx.decodeAudioData(buf);
    const channels: Float32Array[] = [];
    for (let c = 0; c < Math.min(2, audio.numberOfChannels); c++) {
      // getChannelData の参照をそのまま transfer すると AudioBuffer が壊れるのでコピーする
      channels.push(new Float32Array(audio.getChannelData(c)));
    }
    return {
      channels,
      frames: audio.length,
      sampleRate: audio.sampleRate,
      duration: audio.duration,
      peaks: computePeaks(channels),
    };
  }

  /** 次の曲を先読みしておく（曲送りを速くする） */
  async prefetchTrack(id: string, loader: () => Promise<Blob | undefined>): Promise<void> {
    if (this.prefetch?.id === id) return;
    this.prefetch = null;
    try {
      const blob = await loader();
      if (!blob) return;
      const decoded = await this.decode(blob);
      // 極端に長い曲はメモリを圧迫するので先読みしない
      if (decoded.duration > 20 * 60) return;
      this.prefetch = { id, decoded };
    } catch {
      this.prefetch = null;
    }
  }

  takePrefetched(id: string): DecodedTrack | null {
    if (this.prefetch?.id !== id) return null;
    const d = this.prefetch.decoded;
    this.prefetch = null;
    return d;
  }

  clearPrefetch(): void {
    this.prefetch = null;
  }

  /* -------------------------------------------------------------- load */

  /** デコード済みPCMを Worklet へ渡す（所有権ごと転送） */
  async load(decoded: DecodedTrack, startTime = 0): Promise<void> {
    await this.init();
    const buffers = decoded.channels.map((c) => c.buffer as ArrayBuffer);
    this.node!.port.postMessage(
      {
        type: 'load',
        channels: buffers,
        frames: decoded.frames,
        startFrame: Math.round(startTime * decoded.sampleRate),
      },
      buffers,
    );
    decoded.channels = [];
  }

  unload(): void {
    this.node?.port.postMessage({ type: 'unload' });
  }

  /* ---------------------------------------------------------- controls */

  async play(): Promise<void> {
    await this.resume();
    this.node?.port.postMessage({ type: 'play' });
  }

  pause(): void {
    this.node?.port.postMessage({ type: 'pause' });
  }

  seek(time: number): void {
    this.node?.port.postMessage({ type: 'seek', time });
  }

  setSemitones(value: number): void {
    this.semitones = value;
    this.pushParams();
  }

  setTempo(value: number): void {
    this.tempo = value;
    this.pushParams();
  }

  setVolume(value: number): void {
    this.volume = value;
    if (this.gain && this.ctx) {
      // 一気に変えるとプチッと鳴るので短いランプで追従させる
      this.gain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.015);
    }
  }

  setLoop(a: number | null, b: number | null, enabled: boolean): void {
    this.node?.port.postMessage({
      type: 'set',
      loopEnabled: enabled && a !== null && b !== null,
      loopStart: a ?? 0,
      loopEnd: b ?? 0,
    });
  }

  private pushParams(): void {
    this.node?.port.postMessage({
      type: 'set',
      pitchRatio: semitoneToRatio(this.semitones),
      tempo: this.tempo,
    });
  }

  dispose(): void {
    this.prefetch = null;
    this.node?.port.postMessage({ type: 'dispose' });
    this.node?.port.close();
    this.node?.disconnect();
    this.gain?.disconnect();
    void this.ctx?.close();
    this.ctx = null;
    this.node = null;
    this.gain = null;
    this.ready = null;
  }
}
