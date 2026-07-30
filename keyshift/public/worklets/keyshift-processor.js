/**
 * KeyShift 再生エンジン (AudioWorklet)
 * ---------------------------------------------------------------------------
 * デコード済みPCMを丸ごと受け取り、この Processor 自身が音源になる。
 * AudioBufferSourceNode を使わないので、シーク・ABリピート・キー/テンポ変更が
 * すべてサンプル単位で正確に、かつ再生を止めずに行える。
 *
 * 信号の流れ:
 *   PCM ─► WSOLA タイムストレッチ (alpha) ─► アンチエイリアスLPF ─► 補間リサンプル (rho)
 *
 *   ピッチ比   P     = 2^(semitone/12)
 *   テンポ比   T     = 再生速度 (0.5〜2.0)
 *   リサンプル rho   = P            … 速度も音程も P 倍になる
 *   ストレッチ alpha = P / T        … 速度だけ元に戻し、音程変化のみ残す
 *
 * semitone=0 かつ tempo=1.0 のときは alpha=rho=1 となり、
 * 探索スキップ + 補間係数 t=0 により入力サンプルがそのまま出力される（無劣化）。
 */

const FRAME = 2048; // 解析/合成窓長
const HOP_S = FRAME >> 1; // 合成ホップ（50%オーバーラップ）
const SEEK_MAX = 512; // 波形類似探索の範囲 ±512 サンプル（約86Hz以上の周期をカバー）
const CORR_LEN = 384; // 相互相関を取る長さ
const COARSE_STEP = 4; // 粗探索のステップ
const FINE_RANGE = 3; // 粗探索結果の周辺を1サンプル刻みで再探索
const CAP = FRAME * 8; // ストレッチ済みバッファ容量
const COMPACT_AT = FRAME * 3; // これ以上読み進んだらバッファを前詰め
const FADE_SEC = 0.008; // 再生/停止/シーク時のクリック防止フェード
const POSITION_INTERVAL = 12; // 約32msごとに再生位置を通知

/** 周期Hann窓（50%オーバーラップで加算すると常に1.0になる） */
function makeHann(n) {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  return w;
}

/** 4次バターワースLPF（2段のバイクアッド）の係数を作る */
function butterworthLowpass(cutoff, sampleRate) {
  const qs = [0.5411961, 1.3065630];
  const sections = [];
  const fc = Math.max(200, Math.min(cutoff, sampleRate * 0.49));
  for (const q of qs) {
    const w0 = (2 * Math.PI * fc) / sampleRate;
    const cw = Math.cos(w0);
    const sw = Math.sin(w0);
    const alpha = sw / (2 * q);
    const b0 = (1 - cw) / 2;
    const b1 = 1 - cw;
    const b2 = (1 - cw) / 2;
    const a0 = 1 + alpha;
    const a1 = -2 * cw;
    const a2 = 1 - alpha;
    sections.push({
      b0: b0 / a0,
      b1: b1 / a0,
      b2: b2 / a0,
      a1: a1 / a0,
      a2: a2 / a0,
    });
  }
  return sections;
}

class KeyShiftProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.win = makeHann(FRAME);

    // 音源
    this.channels = []; // Float32Array[]
    this.frames = 0;
    this.loaded = false;

    // 再生パラメータ
    this.pitchRatio = 1; // rho
    this.tempo = 1; // T
    this.playing = false;
    this.loopEnabled = false;
    this.loopStart = 0; // frames
    this.loopEnd = 0; // frames

    // ストレッチ側の状態
    this.inPos = 0; // 音源上の解析位置（float, frames）
    this.lastD = 0;
    this.firstFrame = true;
    this.ref = new Float32Array(CORR_LEN);
    this.buf = []; // ストレッチ済みバッファ（ch毎）
    this.olaPos = 0; // OLA書き込み位置＝確定済みサンプル数
    this.readIdx = 1; // リサンプラの読み出し位置（整数部）
    this.frac = 0; // 同 小数部
    this.filteredTo = 1; // LPF適用済みの位置

    // LPF
    this.lpfOn = false;
    this.lpfSections = null;
    this.lpfState = [];

    // フェード
    this.fade = 0;
    this.fadeTarget = 0;
    this.fadeStep = 1 / Math.max(1, FADE_SEC * sampleRate);

    this.blockCount = 0;
    this.alive = true;
    this.finished = false;

    this.port.onmessage = (e) => this.handleMessage(e.data);
  }

  /* ------------------------------------------------------------------ */
  /* メッセージ                                                          */
  /* ------------------------------------------------------------------ */

  handleMessage(msg) {
    switch (msg.type) {
      case 'load': {
        this.channels = msg.channels.map((b) => new Float32Array(b));
        this.frames = msg.frames | 0;
        this.loaded = this.channels.length > 0 && this.frames > 0;
        this.buf = this.channels.map(() => new Float32Array(CAP));
        this.lpfState = this.channels.map(() => [
          { x1: 0, x2: 0, y1: 0, y2: 0 },
          { x1: 0, x2: 0, y1: 0, y2: 0 },
        ]);
        this.finished = false;
        this.resetStream(msg.startFrame || 0);
        this.port.postMessage({ type: 'loaded', frames: this.frames });
        break;
      }
      case 'set': {
        if (typeof msg.pitchRatio === 'number' && msg.pitchRatio > 0) {
          this.pitchRatio = msg.pitchRatio;
          this.updateFilter();
        }
        if (typeof msg.tempo === 'number' && msg.tempo > 0) this.tempo = msg.tempo;
        if (typeof msg.loopEnabled === 'boolean') this.loopEnabled = msg.loopEnabled;
        if (typeof msg.loopStart === 'number') this.loopStart = Math.max(0, msg.loopStart * sampleRate);
        if (typeof msg.loopEnd === 'number') this.loopEnd = Math.max(0, msg.loopEnd * sampleRate);
        break;
      }
      case 'play': {
        if (!this.loaded) break;
        if (this.finished || this.inPos >= this.frames - 1) this.resetStream(0);
        this.playing = true;
        this.finished = false;
        this.fadeTarget = 1;
        break;
      }
      case 'pause': {
        this.playing = false;
        this.fadeTarget = 0;
        break;
      }
      case 'seek': {
        const f = Math.max(0, Math.min(this.frames - 1, Math.round(msg.time * sampleRate)));
        this.resetStream(f);
        this.finished = false;
        this.postPosition();
        break;
      }
      case 'unload': {
        this.playing = false;
        this.fade = 0;
        this.fadeTarget = 0;
        this.channels = [];
        this.buf = [];
        this.frames = 0;
        this.loaded = false;
        break;
      }
      case 'dispose': {
        this.playing = false;
        this.channels = [];
        this.buf = [];
        this.loaded = false;
        this.alive = false;
        break;
      }
      default:
        break;
    }
  }

  /* ------------------------------------------------------------------ */
  /* ストリーム状態のリセット（シーク・ループ折り返し）                    */
  /* ------------------------------------------------------------------ */

  resetStream(startFrame) {
    this.inPos = startFrame;
    // buf[0] は3次補間の p0 用に空けておく。合成は index 1 から始めるので、
    // 等倍再生では出力サンプルが入力サンプルと1対1で一致する（遅延ゼロ）。
    this.olaPos = 1;
    this.readIdx = 1;
    this.frac = 0;
    this.filteredTo = 1;
    this.lastD = 0;
    this.firstFrame = true;
    this.ref.fill(0);
    for (const b of this.buf) b.fill(0);
    for (const st of this.lpfState) {
      for (const s of st) {
        s.x1 = s.x2 = s.y1 = s.y2 = 0;
      }
    }
    // シーク直後のプチノイズを避けるため、再生中なら短くフェードインし直す
    if (this.playing) this.fade = 0;
  }

  updateFilter() {
    const rho = this.pitchRatio;
    if (rho > 1.0005) {
      this.lpfOn = true;
      this.lpfSections = butterworthLowpass((sampleRate * 0.46) / rho, sampleRate);
    } else {
      this.lpfOn = false;
      this.lpfSections = null;
    }
  }

  /* ------------------------------------------------------------------ */
  /* WSOLA                                                               */
  /* ------------------------------------------------------------------ */

  /** モノラル換算した音源サンプル（相関計算用） */
  mono(i) {
    if (i < 0 || i >= this.frames) return 0;
    const ch = this.channels;
    if (ch.length === 1) return ch[0][i];
    return (ch[0][i] + ch[1][i]) * 0.5;
  }

  /** ref との正規化相互相関が最大になるオフセットを探す */
  findOffset(nominal) {
    let bestScore = -Infinity;
    let bestD = 0;
    const evaluate = (d) => {
      const p = nominal + d;
      let dot = 0;
      let energy = 0;
      for (let i = 0; i < CORR_LEN; i++) {
        const s = this.mono(p + i);
        dot += s * this.ref[i];
        energy += s * s;
      }
      return dot / Math.sqrt(energy + 1e-9);
    };
    for (let d = -SEEK_MAX; d <= SEEK_MAX; d += COARSE_STEP) {
      const s = evaluate(d);
      if (s > bestScore) {
        bestScore = s;
        bestD = d;
      }
    }
    const lo = Math.max(-SEEK_MAX, bestD - FINE_RANGE);
    const hi = Math.min(SEEK_MAX, bestD + FINE_RANGE);
    for (let d = lo; d <= hi; d++) {
      if (d === bestD) continue;
      const s = evaluate(d);
      if (s > bestScore) {
        bestScore = s;
        bestD = d;
      }
    }
    return bestD;
  }

  /** 1フレーム分（HOP_S サンプル）をストレッチ済みバッファへ合成する */
  synthesizeFrame(alpha) {
    const nominal = Math.round(this.inPos);
    let d;
    if (this.firstFrame) {
      d = 0;
      this.firstFrame = false;
    } else if (Math.abs(alpha - 1) < 1e-6) {
      // 等倍再生では探索不要。前回と同じオフセットで完全再構成になる。
      d = this.lastD;
    } else {
      d = this.findOffset(nominal);
    }
    this.lastD = d;

    const base = nominal + d;
    const nCh = this.channels.length;
    const frames = this.frames;
    const win = this.win;
    const out = this.olaPos;

    for (let c = 0; c < nCh; c++) {
      const src = this.channels[c];
      const dst = this.buf[c];
      for (let i = 0; i < HOP_S; i++) {
        const j = base + i;
        dst[out + i] += (j >= 0 && j < frames ? src[j] : 0) * win[i];
      }
      for (let i = HOP_S; i < FRAME; i++) {
        const j = base + i;
        // 後半は未使用領域なので加算ではなく代入（ゼロ埋め不要）
        dst[out + i] = (j >= 0 && j < frames ? src[j] : 0) * win[i];
      }
    }

    // 次フレームの「自然な続き」を参照波形として保存
    const refStart = base + HOP_S;
    for (let i = 0; i < CORR_LEN; i++) this.ref[i] = this.mono(refStart + i);

    this.olaPos += HOP_S;
    this.inPos += HOP_S / alpha;
  }

  /** 確定した区間にアンチエイリアスLPFを掛ける */
  applyFilter() {
    if (!this.lpfOn || !this.lpfSections) {
      this.filteredTo = this.olaPos;
      return;
    }
    const from = this.filteredTo;
    const to = this.olaPos;
    if (to <= from) return;
    for (let c = 0; c < this.buf.length; c++) {
      const data = this.buf[c];
      const st = this.lpfState[c];
      for (let s = 0; s < this.lpfSections.length; s++) {
        const co = this.lpfSections[s];
        const z = st[s];
        let x1 = z.x1;
        let x2 = z.x2;
        let y1 = z.y1;
        let y2 = z.y2;
        for (let i = from; i < to; i++) {
          const x0 = data[i];
          const y0 = co.b0 * x0 + co.b1 * x1 + co.b2 * x2 - co.a1 * y1 - co.a2 * y2;
          x2 = x1;
          x1 = x0;
          y2 = y1;
          y1 = y0;
          data[i] = y0;
        }
        z.x1 = x1;
        z.x2 = x2;
        z.y1 = y1;
        z.y2 = y2;
      }
    }
    this.filteredTo = to;
  }

  /** バッファを前詰めしてインデックスを詰め直す */
  compact() {
    const shift = this.readIdx - 1;
    if (shift <= 0) return;
    const keep = this.olaPos + FRAME - shift;
    for (const b of this.buf) b.copyWithin(0, shift, shift + Math.max(0, keep));
    this.readIdx = 1;
    this.olaPos -= shift;
    this.filteredTo = Math.max(1, this.filteredTo - shift);
  }

  /* ------------------------------------------------------------------ */
  /* process                                                             */
  /* ------------------------------------------------------------------ */

  process(_inputs, outputs) {
    if (!this.alive) return false;

    const out = outputs[0];
    const blockSize = out[0].length;

    if (!this.loaded || (!this.playing && this.fade <= 0)) {
      for (const ch of out) ch.fill(0);
      return true;
    }

    const rho = this.pitchRatio;
    const alpha = this.pitchRatio / this.tempo;
    const nCh = this.channels.length;

    // ループ終端 / 曲終端の判定はサンプル位置ベースで行う
    const loopActive =
      this.loopEnabled && this.loopEnd > this.loopStart + sampleRate * 0.05;

    for (let i = 0; i < blockSize; i++) {
      // フェードアウトが終わったら位置を進めない（一時停止で曲が進まないように）
      if (!this.playing && this.fade <= 0) {
        for (let c = 0; c < out.length; c++) out[c][i] = 0;
        continue;
      }

      // 必要なだけストレッチ済みサンプルを用意する
      while (this.olaPos < this.readIdx + 3) {
        if (loopActive && this.inPos >= this.loopEnd) {
          this.resetStream(this.loopStart);
          continue;
        }
        if (this.inPos >= this.frames) {
          this.finished = true;
          break;
        }
        if (this.olaPos + FRAME > CAP) this.compact();
        this.synthesizeFrame(alpha);
        this.applyFilter();
      }

      if (this.finished) {
        for (let c = 0; c < out.length; c++) out[c][i] = 0;
        continue;
      }

      this.applyFilter();

      // Catmull-Rom 補間（t=0 のときは p1 をそのまま返すので等倍時は無劣化）
      const t = this.frac;
      const idx = this.readIdx;
      const g = this.fade;
      for (let c = 0; c < out.length; c++) {
        const src = this.buf[Math.min(c, nCh - 1)];
        const p0 = src[idx - 1];
        const p1 = src[idx];
        const p2 = src[idx + 1];
        const p3 = src[idx + 2];
        const v =
          t === 0
            ? p1
            : p1 +
              0.5 *
                t *
                (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
        out[c][i] = v * g;
      }

      // フェード更新
      if (this.fade < this.fadeTarget) this.fade = Math.min(this.fadeTarget, this.fade + this.fadeStep);
      else if (this.fade > this.fadeTarget) this.fade = Math.max(this.fadeTarget, this.fade - this.fadeStep);

      // 読み出し位置を進める
      let f = this.frac + rho;
      const adv = Math.floor(f);
      this.readIdx += adv;
      this.frac = f - adv;
      if (this.readIdx > COMPACT_AT) this.compact();
    }

    if (this.finished) {
      this.playing = false;
      this.fade = 0;
      this.fadeTarget = 0;
      this.port.postMessage({ type: 'ended' });
      this.finished = false;
      this.inPos = this.frames;
      this.postPosition();
      return true;
    }

    if (++this.blockCount >= POSITION_INTERVAL) {
      this.blockCount = 0;
      this.postPosition();
    }

    return true;
  }

  postPosition() {
    this.port.postMessage({
      type: 'position',
      time: Math.min(this.frames, Math.max(0, this.inPos)) / sampleRate,
    });
  }
}

registerProcessor('keyshift-processor', KeyShiftProcessor);
