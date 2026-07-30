/**
 * 波形表示用のピークデータ。
 * バケットごとの min/max を -127〜127 に量子化した Int8Array として持つ。
 * (バケット数 * 2) の長さで [min0, max0, min1, max1, ...] の並び。
 */
export const PEAK_BUCKETS = 1400;

export function computePeaks(channels: Float32Array[], buckets = PEAK_BUCKETS): Int8Array {
  const out = new Int8Array(buckets * 2);
  const frames = channels[0]?.length ?? 0;
  if (frames === 0) return out;
  const step = frames / buckets;
  const nCh = channels.length;

  for (let b = 0; b < buckets; b++) {
    const start = Math.floor(b * step);
    const end = Math.min(frames, Math.max(start + 1, Math.floor((b + 1) * step)));
    let min = 1;
    let max = -1;
    // 長いバケットは間引いて走査する（大容量ファイルでも一瞬で終わる）
    const stride = Math.max(1, Math.floor((end - start) / 512));
    for (let i = start; i < end; i += stride) {
      let v = 0;
      for (let c = 0; c < nCh; c++) v += channels[c][i];
      v /= nCh;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (min > max) {
      min = 0;
      max = 0;
    }
    out[b * 2] = Math.max(-127, Math.min(127, Math.round(min * 127)));
    out[b * 2 + 1] = Math.max(-127, Math.min(127, Math.round(max * 127)));
  }
  return out;
}
