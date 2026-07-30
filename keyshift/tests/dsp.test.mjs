/**
 * 再生エンジン（AudioWorklet）の検証テスト。ブラウザなしで走る。
 *
 *   node tests/dsp.test.mjs
 *
 * AudioWorklet のグローバルを偽装して keyshift-processor.js を読み込み、
 * 正弦波を流して出力の周波数（＝キー）と長さ（＝テンポ）を実測する。
 */
import fs from 'node:fs';
import vm from 'node:vm';

const SR = 44100;
const BLOCK = 128;

const src = fs.readFileSync(new URL('../public/worklets/keyshift-processor.js', import.meta.url), 'utf8');

let Registered = null;
const sandbox = {
  sampleRate: SR,
  currentTime: 0,
  registerProcessor: (_name, cls) => {
    Registered = cls;
  },
  AudioWorkletProcessor: class {
    constructor() {
      this.port = {
        onmessage: null,
        postMessage: (msg) => this._outbox.push(msg),
        close() {},
      };
      this._outbox = [];
    }
  },
  Math,
  console,
};
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

function makeProcessor() {
  const p = new Registered();
  p.send = (msg) => p.port.onmessage({ data: msg });
  return p;
}

function sine(freq, seconds, sr = SR) {
  const n = Math.round(seconds * sr);
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = Math.sin((2 * Math.PI * freq * i) / sr) * 0.8;
  return a;
}

/** 出力を回収する（無音が続いたら終了とみなす） */
function render(proc, maxSeconds) {
  const maxBlocks = Math.ceil((maxSeconds * SR) / BLOCK);
  const left = [];
  let ended = false;
  proc._outbox.length = 0;
  for (let b = 0; b < maxBlocks; b++) {
    const out = [new Float32Array(BLOCK), new Float32Array(BLOCK)];
    proc.process([], [out]);
    for (let i = 0; i < BLOCK; i++) left.push(out[0][i]);
    if (proc._outbox.some((m) => m.type === 'ended')) {
      ended = true;
      break;
    }
  }
  return { data: Float32Array.from(left), ended };
}

/** DFT で最大ピークの周波数を求める */
function dominantFreq(buf, from, len) {
  const seg = buf.subarray(from, from + len);
  // ハン窓
  const w = new Float32Array(len);
  for (let i = 0; i < len; i++) w[i] = seg[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / len));
  let best = 0;
  let bestMag = -1;
  const lo = 40;
  const hi = 4000;
  for (let f = lo; f <= hi; f += 0.5) {
    let re = 0;
    let im = 0;
    const k = (2 * Math.PI * f) / SR;
    for (let i = 0; i < len; i++) {
      re += w[i] * Math.cos(k * i);
      im -= w[i] * Math.sin(k * i);
    }
    const mag = re * re + im * im;
    if (mag > bestMag) {
      bestMag = mag;
      best = f;
    }
  }
  return best;
}

function rms(buf, from, len) {
  let s = 0;
  for (let i = from; i < from + len; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / len);
}

/** 末尾の無音を除いた長さ（秒） */
function activeLength(buf) {
  let last = buf.length - 1;
  while (last > 0 && Math.abs(buf[last]) < 1e-4) last--;
  return (last + 1) / SR;
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
}

/* ------------------------------------------------------------------ 1 */
{
  const input = sine(440, 2);
  const p = makeProcessor();
  p.send({ type: 'load', channels: [input.slice().buffer, input.slice().buffer], frames: input.length, startFrame: 0 });
  p.send({ type: 'set', pitchRatio: 1, tempo: 1 });
  p.send({ type: 'play' });
  const { data } = render(p, 3);
  // フェードイン(8ms)と最初のHann窓(23ms)を避けて比較
  const skip = 4096;
  let maxErr = 0;
  for (let i = skip; i < input.length - 1024; i++) maxErr = Math.max(maxErr, Math.abs(data[i] - input[i]));
  check('キー0・テンポ1.0 は入力と一致（無劣化）', maxErr < 1e-6, `最大誤差 ${maxErr.toExponential(2)}`);
}

/* ------------------------------------------------------------------ 2 */
const pitchCases = [
  { semi: 12, tempo: 1 },
  { semi: 7, tempo: 1 },
  { semi: -5, tempo: 1 },
  { semi: -12, tempo: 1 },
  { semi: 3, tempo: 1.5 },
  { semi: -3, tempo: 0.75 },
  { semi: 0, tempo: 2 },
  { semi: 0, tempo: 0.5 },
];

for (const { semi, tempo } of pitchCases) {
  const f0 = 440;
  const seconds = 4;
  const input = sine(f0, seconds);
  const p = makeProcessor();
  p.send({ type: 'load', channels: [input.slice().buffer, input.slice().buffer], frames: input.length, startFrame: 0 });
  p.send({ type: 'set', pitchRatio: Math.pow(2, semi / 12), tempo });
  p.send({ type: 'play' });
  const { data } = render(p, (seconds / tempo) * 1.4 + 1);

  const expectedFreq = f0 * Math.pow(2, semi / 12);
  const measured = dominantFreq(data, SR, 16384);
  const centsErr = 1200 * Math.log2(measured / expectedFreq);

  const expectedLen = seconds / tempo;
  const actualLen = activeLength(data);
  const lenErr = Math.abs(actualLen - expectedLen) / expectedLen;

  const level = rms(data, SR, 16384);

  check(
    `キー${semi >= 0 ? '+' : ''}${semi} / テンポ${tempo}x`,
    Math.abs(centsErr) < 12 && lenErr < 0.04 && level > 0.2,
    `周波数 ${measured.toFixed(1)}Hz (期待 ${expectedFreq.toFixed(1)}Hz, ${centsErr.toFixed(1)}cent) / ` +
      `長さ ${actualLen.toFixed(2)}s (期待 ${expectedLen.toFixed(2)}s) / RMS ${level.toFixed(3)}`,
  );
}

/* ------------------------------------------------------------------ 3 */
{
  // ABリピート: 1.0s〜2.0s を繰り返す
  const input = sine(440, 5);
  const p = makeProcessor();
  p.send({ type: 'load', channels: [input.slice().buffer, input.slice().buffer], frames: input.length, startFrame: 0 });
  p.send({ type: 'set', pitchRatio: 1, tempo: 1, loopEnabled: true, loopStart: 1, loopEnd: 2 });
  p.send({ type: 'seek', time: 1 });
  p.send({ type: 'play' });
  const { data, ended } = render(p, 8);
  const level = rms(data, SR * 4, 16384);
  check('ABリピートで曲が終わらず鳴り続ける', !ended && level > 0.2, `ended=${ended} RMS=${level.toFixed(3)}`);
}

/* ------------------------------------------------------------------ 4 */
{
  // 曲の終端で ended が飛ぶ
  const input = sine(440, 1);
  const p = makeProcessor();
  p.send({ type: 'load', channels: [input.slice().buffer], frames: input.length, startFrame: 0 });
  p.send({ type: 'set', pitchRatio: 1, tempo: 1 });
  p.send({ type: 'play' });
  const { data, ended } = render(p, 4);
  check('終端で ended が通知される', ended, `長さ ${activeLength(data).toFixed(2)}s`);
}

/* ------------------------------------------------------------------ 5 */
{
  // 一時停止で位置が進まない
  const input = sine(440, 5);
  const p = makeProcessor();
  p.send({ type: 'load', channels: [input.slice().buffer], frames: input.length, startFrame: 0 });
  p.send({ type: 'set', pitchRatio: 1, tempo: 1 });
  p.send({ type: 'play' });
  render(p, 1);
  p.send({ type: 'pause' });
  const posBefore = p.inPos;
  render(p, 2);
  const drift = (p.inPos - posBefore) / SR;
  check('一時停止中は再生位置が進まない', drift < 0.02, `ドリフト ${(drift * 1000).toFixed(1)}ms`);
}

/* ------------------------------------------------------------------ 6 */
{
  // モノラル音源がステレオ出力の両チャンネルに出る
  const input = sine(440, 1);
  const p = makeProcessor();
  p.send({ type: 'load', channels: [input.slice().buffer], frames: input.length, startFrame: 0 });
  p.send({ type: 'set', pitchRatio: Math.pow(2, 4 / 12), tempo: 1 });
  p.send({ type: 'play' });
  const out = [new Float32Array(BLOCK), new Float32Array(BLOCK)];
  let same = true;
  for (let b = 0; b < 200; b++) {
    p.process([], [out]);
    for (let i = 0; i < BLOCK; i++) if (out[0][i] !== out[1][i]) same = false;
  }
  check('モノラル音源が両チャンネルへ出力される', same, '');
}

/* ------------------------------------------------------------------ 7 */
{
  // 長時間再生でバッファのインデックスが破綻しないか
  const input = sine(220, 60);
  const p = makeProcessor();
  p.send({ type: 'load', channels: [input.slice().buffer, input.slice().buffer], frames: input.length, startFrame: 0 });
  p.send({ type: 'set', pitchRatio: Math.pow(2, 5 / 12), tempo: 1.35 });
  p.send({ type: 'play' });
  const { data } = render(p, 50);
  let bad = 0;
  for (let i = 0; i < data.length; i++) if (!Number.isFinite(data[i]) || Math.abs(data[i]) > 1.5) bad++;
  const late = rms(data, data.length - 40000, 16384);
  check('長時間再生でも破綻しない', bad === 0 && late > 0.2, `異常サンプル ${bad} / 終盤RMS ${late.toFixed(3)}`);
}

/* ------------------------------------------------------------------ 8 */
{
  // 再生中にキーを変えても音が途切れない
  const input = sine(440, 6);
  const p = makeProcessor();
  p.send({ type: 'load', channels: [input.slice().buffer, input.slice().buffer], frames: input.length, startFrame: 0 });
  p.send({ type: 'set', pitchRatio: 1, tempo: 1 });
  p.send({ type: 'play' });
  const out = [new Float32Array(BLOCK), new Float32Array(BLOCK)];
  const collected = [];
  for (let b = 0; b < 1200; b++) {
    if (b === 300) p.send({ type: 'set', pitchRatio: Math.pow(2, 4 / 12) });
    if (b === 600) p.send({ type: 'set', pitchRatio: Math.pow(2, -7 / 12), tempo: 1.25 });
    if (b === 900) p.send({ type: 'set', pitchRatio: 1, tempo: 1 });
    p.process([], [out]);
    for (let i = 0; i < BLOCK; i++) collected.push(out[0][i]);
  }
  const buf = Float32Array.from(collected);
  // 20msごとのRMSを見て、無音になった区間がないか確認
  const win = Math.round(SR * 0.02);
  let silent = 0;
  for (let i = win; i + win < buf.length; i += win) if (rms(buf, i, win) < 0.05) silent++;
  check('再生中のキー/テンポ変更で音が途切れない', silent === 0, `無音区間 ${silent}`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
