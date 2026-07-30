/**
 * 依存パッケージなしのタグリーダー。
 * ID3v2 (MP3) / MP4・M4A・AAC の ilst / FLAC の Vorbis Comment / WAV の LIST-INFO に対応。
 * ファイル全体は読まず、必要な範囲だけ Blob.slice で読み出す。
 */

export interface ParsedTags {
  title?: string;
  artist?: string;
  album?: string;
  cover?: Blob;
}

const td = {
  utf8: new TextDecoder('utf-8'),
  latin1: new TextDecoder('latin1'),
  utf16: new TextDecoder('utf-16'),
  utf16be: new TextDecoder('utf-16be'),
};

async function readRange(file: Blob, start: number, length: number): Promise<Uint8Array> {
  if (length <= 0 || start >= file.size) return new Uint8Array(0);
  const buf = await file.slice(start, Math.min(file.size, start + length)).arrayBuffer();
  return new Uint8Array(buf);
}

const ascii = (b: Uint8Array, o: number, n: number) => td.latin1.decode(b.subarray(o, o + n));
const be32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const le32 = (b: Uint8Array, o: number) => ((b[o + 3] << 24) | (b[o + 2] << 16) | (b[o + 1] << 8) | b[o]) >>> 0;
const syncsafe = (b: Uint8Array, o: number) =>
  ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);

function clean(s: string): string {
  return s.replace(/\0+$/g, '').trim();
}

/* ------------------------------------------------------------------ ID3 */

function decodeId3Text(data: Uint8Array): string {
  if (data.length === 0) return '';
  const enc = data[0];
  const body = data.subarray(1);
  switch (enc) {
    case 1:
      return clean(td.utf16.decode(body));
    case 2:
      return clean(td.utf16be.decode(body));
    case 3:
      return clean(td.utf8.decode(body));
    default:
      return clean(td.latin1.decode(body));
  }
}

/** encoding に応じた終端を探して [文字列, 次の位置] を返す */
function readTerminated(data: Uint8Array, offset: number, enc: number): [string, number] {
  if (enc === 1 || enc === 2) {
    let i = offset;
    while (i + 1 < data.length && !(data[i] === 0 && data[i + 1] === 0)) i += 2;
    const raw = data.subarray(offset, i);
    return [enc === 1 ? td.utf16.decode(raw) : td.utf16be.decode(raw), i + 2];
  }
  let i = offset;
  while (i < data.length && data[i] !== 0) i++;
  const raw = data.subarray(offset, i);
  return [enc === 3 ? td.utf8.decode(raw) : td.latin1.decode(raw), i + 1];
}

function parseId3(buf: Uint8Array): ParsedTags {
  const tags: ParsedTags = {};
  const major = buf[3];
  const flags = buf[5];
  let pos = 10;
  if (flags & 0x40) pos += major >= 4 ? syncsafe(buf, pos) : be32(buf, pos) + 4; // 拡張ヘッダ
  const idLen = major === 2 ? 3 : 4;
  const headerLen = major === 2 ? 6 : 10;

  while (pos + headerLen <= buf.length) {
    const id = ascii(buf, pos, idLen);
    if (!/^[A-Z0-9]+$/.test(id)) break;
    let size: number;
    if (major === 2) size = (buf[pos + 3] << 16) | (buf[pos + 4] << 8) | buf[pos + 5];
    else if (major >= 4) size = syncsafe(buf, pos + 4);
    else size = be32(buf, pos + 4);
    if (size <= 0 || pos + headerLen + size > buf.length) break;
    const data = buf.subarray(pos + headerLen, pos + headerLen + size);

    if (id === 'TIT2' || id === 'TT2') tags.title = decodeId3Text(data);
    else if (id === 'TPE1' || id === 'TP1') tags.artist = decodeId3Text(data);
    else if (id === 'TALB' || id === 'TAL') tags.album = decodeId3Text(data);
    else if ((id === 'APIC' || id === 'PIC') && !tags.cover) {
      const enc = data[0];
      let p = 1;
      let mime: string;
      if (id === 'PIC') {
        const fmt = ascii(data, 1, 3).toLowerCase();
        mime = fmt === 'png' ? 'image/png' : 'image/jpeg';
        p = 4;
      } else {
        const [m, next] = readTerminated(data, 1, 0);
        mime = m || 'image/jpeg';
        p = next;
      }
      p += 1; // picture type
      const [, afterDesc] = readTerminated(data, p, enc);
      const bytes = data.slice(afterDesc);
      if (bytes.length > 0) tags.cover = new Blob([bytes], { type: mime });
    }
    pos += headerLen + size;
  }
  return tags;
}

/* ------------------------------------------------------------------ MP4 */

const MP4_KEYS: Record<string, keyof ParsedTags> = {
  '©nam': 'title',
  '©ART': 'artist',
  '©alb': 'album',
};

function parseIlst(buf: Uint8Array, start: number, end: number, tags: ParsedTags): void {
  let p = start;
  while (p + 8 <= end) {
    const size = be32(buf, p);
    if (size < 8 || p + size > end) break;
    const name = ascii(buf, p + 4, 4);
    // 子の data アトモムを読む
    let q = p + 8;
    while (q + 8 <= p + size) {
      const dSize = be32(buf, q);
      if (dSize < 8 || q + dSize > p + size) break;
      if (ascii(buf, q + 4, 4) === 'data') {
        const type = be32(buf, q + 8) & 0xffffff;
        const payload = buf.subarray(q + 16, q + dSize);
        const key = MP4_KEYS[name];
        if (key && key !== 'cover') tags[key] = clean(td.utf8.decode(payload));
        else if (name === 'covr' && !tags.cover && payload.length > 0) {
          tags.cover = new Blob([payload.slice()], { type: type === 14 ? 'image/png' : 'image/jpeg' });
        }
      }
      q += dSize;
    }
    p += size;
  }
}

/** moov 配下を再帰的にたどって ilst を探す */
function walkMp4(buf: Uint8Array, start: number, end: number, tags: ParsedTags): void {
  let p = start;
  while (p + 8 <= end) {
    let size = be32(buf, p);
    const name = ascii(buf, p + 4, 4);
    let header = 8;
    if (size === 1) {
      // 64bit サイズ（下位32bitのみ利用）
      size = be32(buf, p + 12);
      header = 16;
    }
    if (size < header || p + size > end) break;
    if (name === 'ilst') parseIlst(buf, p + header, p + size, tags);
    else if (name === 'moov' || name === 'udta' || name === 'trak') walkMp4(buf, p + header, p + size, tags);
    else if (name === 'meta') walkMp4(buf, p + header + 4, p + size, tags); // meta は version/flags 4byte 付き
    p += size;
  }
}

async function parseMp4(file: Blob): Promise<ParsedTags> {
  const tags: ParsedTags = {};
  let pos = 0;
  // トップレベルのアトムを走査して moov だけ読み込む
  for (let guard = 0; guard < 64 && pos + 16 <= file.size; guard++) {
    const head = await readRange(file, pos, 16);
    if (head.length < 8) break;
    let size = be32(head, 0);
    const name = ascii(head, 4, 4);
    let header = 8;
    if (size === 1) {
      size = be32(head, 12);
      header = 16;
    }
    if (size < header) break;
    if (name === 'moov') {
      const moov = await readRange(file, pos, Math.min(size, 24 * 1024 * 1024));
      walkMp4(moov, header, moov.length, tags);
      break;
    }
    pos += size;
  }
  return tags;
}

/* ----------------------------------------------------------------- FLAC */

function applyVorbisComment(buf: Uint8Array, tags: ParsedTags): void {
  let p = 0;
  const vendorLen = le32(buf, p);
  p += 4 + vendorLen;
  const count = le32(buf, p);
  p += 4;
  for (let i = 0; i < count && p + 4 <= buf.length; i++) {
    const len = le32(buf, p);
    p += 4;
    if (p + len > buf.length) break;
    const line = td.utf8.decode(buf.subarray(p, p + len));
    p += len;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).toUpperCase();
    const value = clean(line.slice(eq + 1));
    if (key === 'TITLE' && !tags.title) tags.title = value;
    else if ((key === 'ARTIST' || key === 'ALBUMARTIST') && !tags.artist) tags.artist = value;
    else if (key === 'ALBUM' && !tags.album) tags.album = value;
  }
}

function applyFlacPicture(buf: Uint8Array, tags: ParsedTags): void {
  if (tags.cover) return;
  let p = 4; // picture type
  const mimeLen = be32(buf, p);
  p += 4;
  const mime = ascii(buf, p, mimeLen);
  p += mimeLen;
  const descLen = be32(buf, p);
  p += 4 + descLen + 16; // desc + width/height/depth/colors
  const dataLen = be32(buf, p);
  p += 4;
  if (dataLen > 0 && p + dataLen <= buf.length) {
    tags.cover = new Blob([buf.slice(p, p + dataLen)], { type: mime || 'image/jpeg' });
  }
}

async function parseFlac(file: Blob): Promise<ParsedTags> {
  const tags: ParsedTags = {};
  let pos = 4;
  for (let guard = 0; guard < 64; guard++) {
    const head = await readRange(file, pos, 4);
    if (head.length < 4) break;
    const isLast = (head[0] & 0x80) !== 0;
    const type = head[0] & 0x7f;
    const size = (head[1] << 16) | (head[2] << 8) | head[3];
    if (type === 4) applyVorbisComment(await readRange(file, pos + 4, size), tags);
    else if (type === 6) applyFlacPicture(await readRange(file, pos + 4, Math.min(size, 16 * 1024 * 1024)), tags);
    pos += 4 + size;
    if (isLast) break;
  }
  return tags;
}

/* ------------------------------------------------------------------ WAV */

function parseWav(buf: Uint8Array): ParsedTags {
  const tags: ParsedTags = {};
  let p = 12;
  while (p + 8 <= buf.length) {
    const id = ascii(buf, p, 4);
    const size = le32(buf, p + 4);
    if (id === 'LIST' && ascii(buf, p + 8, 4) === 'INFO') {
      let q = p + 12;
      const end = Math.min(buf.length, p + 8 + size);
      while (q + 8 <= end) {
        const sid = ascii(buf, q, 4);
        const ssize = le32(buf, q + 4);
        const value = clean(td.latin1.decode(buf.subarray(q + 8, q + 8 + ssize)));
        if (sid === 'INAM') tags.title = value;
        else if (sid === 'IART') tags.artist = value;
        else if (sid === 'IPRD') tags.album = value;
        q += 8 + ssize + (ssize % 2);
      }
      break;
    }
    if (id === 'data') break;
    p += 8 + size + (size % 2);
  }
  return tags;
}

/* --------------------------------------------------------------- public */

export async function readTags(file: File): Promise<ParsedTags> {
  try {
    const head = await readRange(file, 0, 16);
    if (head.length < 12) return {};

    if (ascii(head, 0, 3) === 'ID3') {
      const size = syncsafe(head, 6) + 10;
      return parseId3(await readRange(file, 0, Math.min(size, 24 * 1024 * 1024)));
    }
    if (ascii(head, 0, 4) === 'fLaC') return await parseFlac(file);
    if (ascii(head, 4, 4) === 'ftyp') return await parseMp4(file);
    if (ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 4) === 'WAVE') {
      return parseWav(await readRange(file, 0, Math.min(file.size, 512 * 1024)));
    }
    return {};
  } catch {
    return {};
  }
}

/** デコードせずに再生時間だけを素早く取得する */
export function readDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (value: number) => {
      audio.removeAttribute('src');
      audio.load();
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(value) && value > 0 ? value : 0);
    };
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => done(audio.duration);
    audio.onerror = () => done(0);
    setTimeout(() => done(audio.duration), 8000);
    audio.src = url;
  });
}

/** ファイル名から「アーティスト - タイトル」を推測する */
export function guessFromFileName(name: string): { title: string; artist: string } {
  const base = name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
  // 「アーティスト - タイトル」の形だけを分割する。
  // ハイフン前後の空白を必須にして、"sample-track" のような語を割らないようにする。
  const m = base.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (m && m[1].length <= 60) return { artist: m[1].trim(), title: m[2].trim() };
  return { title: base, artist: '' };
}
