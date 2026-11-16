#!/usr/bin/env bun
// Turns old resumes and career documents into plain text the career-doc-builder
// can read: .docx, .odt, .rtf, and .pages are parsed here with no dependencies;
// .doc (and anything the built-in parsers cannot read) goes to whichever
// converter is installed: pandoc, LibreOffice (soffice), Microsoft Word on
// Windows, macOS textutil, antiword, or catdoc. When nothing can read a file, it says so and asks for a
// PDF export instead of guessing.
//
// Usage: bun tools/ingest.ts <file>... [--out <dir>]
// Without --out, the text goes to stdout under a "===== <file> =====" header.
// With --out, each file becomes <dir>/<name>.txt, and a .pages file's page-one
// preview image is saved beside it as <dir>/<name>.preview.jpg.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { inflateRawSync } from "node:zlib";

export class IngestError extends Error {}

export const PDF_FALLBACK =
  "Open it in the app that made it (Word, Pages, LibreOffice, Google Docs) and export it as a PDF, or paste its text into the chat.";

// ---------------------------------------------------------------- zip

export type Zip = Map<string, () => Uint8Array>;

// The entries of a zip archive, each read on demand. Stored and deflated
// entries only; Zip64 and encryption are refused rather than misread.
export function readZip(data: Uint8Array): Zip {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let eocd = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new IngestError("not a zip archive");
  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  if (count === 0xffff || at === 0xffffffff) throw new IngestError("Zip64 archives are not supported");
  const entries: Zip = new Map();
  for (let n = 0; n < count; n++) {
    if (at + 46 > data.length || view.getUint32(at, true) !== 0x02014b50) throw new IngestError("corrupt zip central directory");
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(data.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extraLength + commentLength;
    entries.set(name, () => {
      if (flags & 1) throw new IngestError(`${name} is encrypted`);
      if (local + 30 > data.length || view.getUint32(local, true) !== 0x04034b50) throw new IngestError(`corrupt zip entry ${name}`);
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const raw = data.subarray(start, start + size);
      if (raw.length !== size) throw new IngestError(`truncated zip entry ${name}`);
      if (method === 0) return raw;
      if (method === 8) return new Uint8Array(inflateRawSync(raw));
      throw new IngestError(`${name} uses unsupported zip compression method ${method}`);
    });
  }
  return entries;
}

// ---------------------------------------------------------------- xml

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (whole, e: string) => {
    const lower = e.toLowerCase();
    if (lower === "lt") return "<";
    if (lower === "gt") return ">";
    if (lower === "amp") return "&";
    if (lower === "quot") return '"';
    if (lower === "apos") return "'";
    const code = lower.startsWith("#x") ? Number.parseInt(lower.slice(2), 16) : Number(lower.slice(1));
    return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

interface XmlRules {
  // Elements whose character data is document text (w:t; text:p and text:h).
  textElements: Set<string>;
  // Only text inside this element counts (office:body), or anywhere when null.
  within: string | null;
  // Elements whose whole subtree is skipped (duplicate fallbacks, field codes).
  skip: Set<string>;
  // Self-closing or closing elements that produce characters.
  breaks: Record<string, string>;
  // The element that stands for a run of spaces (ODF's text:s).
  spaces?: string;
  // ODF collapses white space inside a paragraph, as HTML does.
  collapse?: boolean;
}

// Character data from a document XML part, with paragraph and tab structure kept.
function xmlText(xml: string, rules: XmlRules): string {
  const out: string[] = [];
  let inText = 0;
  let inside = rules.within ? 0 : 1;
  let skipDepth = 0;
  for (const m of xml.matchAll(/<(\/?)([\w.:-]+)([^>]*?)(\/?)>|([^<]+)/g)) {
    const [, closing, name, attrs, selfClosing, chars] = m;
    if (chars !== undefined) {
      if (!skipDepth && inside && inText) out.push(decodeEntities(rules.collapse ? chars.replace(/[ \t\r\n]+/g, " ") : chars));
      continue;
    }
    if (rules.skip.has(name)) {
      if (selfClosing) continue;
      skipDepth += closing ? -1 : 1;
      continue;
    }
    if (skipDepth) continue;
    if (name === rules.within) inside += selfClosing ? 0 : closing ? -1 : 1;
    if (rules.textElements.has(name) && !selfClosing) inText += closing ? -1 : 1;
    if (!inside) continue;
    if (name === rules.spaces && !closing) {
      const c = Number(attrs.match(/:c="(\d+)"/)?.[1] ?? 1);
      out.push(" ".repeat(Math.min(c, 200)));
      continue;
    }
    const brk = rules.breaks[closing ? `/${name}` : name];
    if (brk !== undefined) out.push(brk);
  }
  return out.join("");
}

// Tidy extracted text: LF line ends, no trailing spaces, at most one blank line.
export function tidy(text: string): string {
  return `${text
    .replace(/\r\n?|[\u2028\u2029]/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffc\ufeff]/g, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()}\n`;
}

// ---------------------------------------------------------------- docx

const DOCX: XmlRules = {
  textElements: new Set(["w:t"]),
  within: null,
  // A text box is stored twice (mc:Choice and an mc:Fallback copy); field
  // instructions and deleted revisions are not visible text; property blocks
  // hold tab stops (w:tab) that are layout, not characters.
  skip: new Set(["mc:Fallback", "w:instrText", "w:delText", "w:fldData", "w:pPr", "w:rPr", "w:tblPr", "w:sectPr"]),
  // A table cell holds paragraphs, so each cell already ends its own line.
  breaks: { "/w:p": "\n", "w:tab": "\t", "w:br": "\n", "w:cr": "\n" },
};

// Headers first (resumes often keep the name and contact line there), then
// the body, then footers.
export function docxText(zip: Zip): string {
  const parts = [...zip.keys()];
  const pick = (re: RegExp) => parts.filter((p) => re.test(p)).sort();
  const body = zip.get("word/document.xml");
  if (!body) throw new IngestError("no word/document.xml: not a Word document");
  const read = (p: string) => xmlText(new TextDecoder().decode(zip.get(p)!()), DOCX);
  return [...pick(/^word\/header\d*\.xml$/).map(read), read("word/document.xml"), ...pick(/^word\/footer\d*\.xml$/).map(read)].join("\n");
}

// ---------------------------------------------------------------- odt

const ODT_BREAKS = { "/text:p": "\n", "/text:h": "\n", "text:tab": "\t", "text:line-break": "\n" };

export function odtText(zip: Zip): string {
  const content = zip.get("content.xml");
  if (!content) throw new IngestError("no content.xml: not an OpenDocument file");
  const decode = (p: string) => new TextDecoder().decode(zip.get(p)!());
  const rules = (within: string): XmlRules => ({
    textElements: new Set(["text:p", "text:h"]),
    within,
    skip: new Set(["text:tracked-changes", "text:note-citation"]),
    breaks: ODT_BREAKS,
    spaces: "text:s",
    collapse: true,
  });
  const styles = zip.has("styles.xml") ? decode("styles.xml") : "";
  return [xmlText(styles, rules("style:header")), xmlText(decode("content.xml"), rules("office:body")), xmlText(styles, rules("style:footer"))].join("\n");
}

// ---------------------------------------------------------------- rtf

// Destinations that hold no document text.
const RTF_SKIP = new Set(
  "fonttbl colortbl stylesheet info pict object listtable listoverridetable rsidtbl generator xmlnstbl themedata colorschememapping latentstyles datastore revtbl filetbl pgdsctbl mmathPr fldinst listtext pntext pntxta pntxtb bkmkstart bkmkend".split(
    " ",
  ),
);
const RTF_WORDS: Record<string, string> = {
  par: "\n", line: "\n", sect: "\n", page: "\n", tab: "\t", cell: "\t", row: "\n",
  emdash: "\u2014", endash: "\u2013", bullet: "\u2022", lquote: "\u2018", rquote: "\u2019", ldblquote: "\u201c", rdblquote: "\u201d",
  emspace: " ", enspace: " ", qmspace: " ",
};

export function rtfText(rtf: string): string {
  if (!rtf.startsWith("{\\rtf")) throw new IngestError("not an RTF document");
  const cp1252 = new TextDecoder("windows-1252");
  const out: string[] = [];
  const stack: { skip: boolean; uc: number }[] = [];
  let state = { skip: false, uc: 1 };
  let pendingSkip = 0; // characters to drop after a \uN
  let groupStart = false;
  const emit = (s: string) => {
    if (state.skip) return;
    if (pendingSkip > 0) {
      pendingSkip--;
      return;
    }
    out.push(s);
  };
  const re = /\\([a-zA-Z]+)(-?\d+)? ?|\\'([0-9a-fA-F]{2})|\\([^a-zA-Z])|([{}])|([^\\{}\r\n]+)|[\r\n]+/g;
  for (const m of rtf.matchAll(re)) {
    const [, word, arg, hex, symbol, brace, text] = m;
    // Raw line breaks in RTF source are not text and do not end a group's start.
    if (!word && !hex && !symbol && !brace && !text) continue;
    const opensGroup = groupStart;
    groupStart = false;
    if (brace === "{") {
      stack.push(state);
      state = { ...state };
      groupStart = true;
    } else if (brace === "}") {
      state = stack.pop() ?? { skip: false, uc: 1 };
      pendingSkip = 0;
    } else if (word) {
      if (opensGroup && RTF_SKIP.has(word)) state.skip = true;
      else if (word === "uc") state.uc = Number(arg ?? 1);
      else if (word === "u") {
        const code = Number(arg ?? 0);
        pendingSkip = 0;
        emit(String.fromCharCode(code < 0 ? code + 65536 : code));
        pendingSkip = state.uc;
      } else if (RTF_WORDS[word] !== undefined) emit(RTF_WORDS[word]);
    } else if (hex) emit(cp1252.decode(new Uint8Array([Number.parseInt(hex, 16)])));
    else if (symbol) {
      if (symbol === "*" && opensGroup) state.skip = true;
      else if (symbol === "~") emit("\u00a0");
      else if (symbol === "_") emit("-");
      else if ("\\{}".includes(symbol)) emit(symbol);
      else if (symbol === "\n" || symbol === "\r") emit("\n");
    } else if (text) {
      for (const ch of text) emit(ch);
    }
  }
  return out.join("");
}

// ---------------------------------------------------------------- pages

// Snappy's raw block format: a varint length, then literals and back-copies.
export function snappyDecompress(src: Uint8Array): Uint8Array {
  let pos = 0;
  let length = 0;
  for (let shift = 0; ; shift += 7) {
    if (pos >= src.length || shift > 28) throw new IngestError("corrupt snappy length");
    const b = src[pos++];
    length += (b & 0x7f) * 2 ** shift;
    if (!(b & 0x80)) break;
  }
  const out = new Uint8Array(length);
  let op = 0;
  const need = (n: number) => {
    if (pos + n > src.length) throw new IngestError("truncated snappy data");
  };
  while (pos < src.length) {
    const tag = src[pos++];
    const type = tag & 3;
    if (type === 0) {
      let len = tag >> 2;
      if (len >= 60) {
        const bytes = len - 59;
        need(bytes);
        len = 0;
        for (let i = 0; i < bytes; i++) len += src[pos + i] * 2 ** (8 * i);
        pos += bytes;
      }
      len += 1;
      need(len);
      if (op + len > length) throw new IngestError("snappy literal overruns its declared length");
      out.set(src.subarray(pos, pos + len), op);
      pos += len;
      op += len;
      continue;
    }
    let len: number;
    let offset: number;
    if (type === 1) {
      need(1);
      len = ((tag >> 2) & 7) + 4;
      offset = ((tag >> 5) << 8) | src[pos++];
    } else if (type === 2) {
      need(2);
      len = (tag >> 2) + 1;
      offset = src[pos] | (src[pos + 1] << 8);
      pos += 2;
    } else {
      need(4);
      len = (tag >> 2) + 1;
      offset = (src[pos] | (src[pos + 1] << 8) | (src[pos + 2] << 16) | (src[pos + 3] << 24)) >>> 0;
      pos += 4;
    }
    if (offset === 0 || offset > op || op + len > length) throw new IngestError("corrupt snappy copy");
    // Byte by byte: a copy may overlap the bytes it is producing.
    for (let i = 0; i < len; i++, op++) out[op] = out[op - offset];
  }
  if (op !== length) throw new IngestError("snappy data shorter than its declared length");
  return out;
}

// An .iwa file: chunks with a 4-byte header (type 0, then a 24-bit
// little-endian length), each a raw snappy block. iWork leaves out the stream
// identifier and CRCs of standard snappy framing.
export function iwaDecompress(data: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = [];
  for (let pos = 0; pos < data.length; ) {
    if (pos + 4 > data.length) throw new IngestError("truncated IWA chunk header");
    if (data[pos] !== 0) throw new IngestError(`unknown IWA chunk type ${data[pos]}`);
    const len = data[pos + 1] | (data[pos + 2] << 8) | (data[pos + 3] << 16);
    if (pos + 4 + len > data.length) throw new IngestError("truncated IWA chunk");
    chunks.push(snappyDecompress(data.subarray(pos + 4, pos + 4 + len)));
    pos += 4 + len;
  }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

const UTF8 = new TextDecoder("utf-8", { fatal: true });

// Text a person wrote, as opposed to bytes that happen to decode: valid UTF-8
// with a letter in it and no control characters but line breaks and tabs.
function asText(bytes: Uint8Array): string | null {
  let s: string;
  try {
    s = UTF8.decode(bytes);
  } catch {
    return null;
  }
  if (!/\p{L}/u.test(s) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ufffd]/.test(s)) return null;
  return s;
}

function readVarint(b: Uint8Array, pos: number): [number, number] | null {
  let value = 0;
  for (let shift = 0; shift < 64; shift += 7) {
    if (pos >= b.length) return null;
    const byte = b[pos++];
    value += (byte & 0x7f) * 2 ** shift;
    if (!(byte & 0x80)) return [value, pos];
  }
  return null;
}

interface PbField {
  field: number;
  wire: number;
  value: number;
  bytes?: Uint8Array;
}

// One protobuf message, or null when the bytes are not a well-formed message.
function parseMessage(b: Uint8Array): PbField[] | null {
  const fields: PbField[] = [];
  for (let pos = 0; pos < b.length; ) {
    const key = readVarint(b, pos);
    if (!key || key[0] < 8) return null;
    pos = key[1];
    const field = Math.floor(key[0] / 8);
    const wire = key[0] % 8;
    if (wire === 0) {
      const v = readVarint(b, pos);
      if (!v) return null;
      fields.push({ field, wire, value: v[0] });
      pos = v[1];
    } else if (wire === 1 || wire === 5) {
      pos += wire === 1 ? 8 : 4;
      if (pos > b.length) return null;
      fields.push({ field, wire, value: 0 });
    } else if (wire === 2) {
      const len = readVarint(b, pos);
      if (!len || len[1] + len[0] > b.length) return null;
      fields.push({ field, wire, value: len[0], bytes: b.subarray(len[1], len[1] + len[0]) });
      pos = len[1] + len[0];
    } else return null;
  }
  return fields;
}

// Every string in a message tree, in document order; false when `b` is not a
// message. A length-delimited field could be text or a nested message. Text
// opens with a printable character; a nested message opens with a field key,
// and the small field numbers that start most messages are control bytes. So
// a printable start reads as text, and anything else is tried as a message
// first and kept as text only if it does not parse.
function collectStrings(b: Uint8Array, out: string[], depth = 0): boolean {
  const fields = depth > 40 ? null : parseMessage(b);
  if (!fields) return false;
  for (const f of fields) {
    if (!f.bytes || !f.bytes.length) continue;
    const s = asText(f.bytes);
    if (s !== null && f.bytes[0] >= 0x20) out.push(s);
    else if (!collectStrings(f.bytes, out, depth + 1) && s !== null) out.push(s);
  }
  return true;
}

// The decompressed IWA stream is a run of objects: a varint length, an
// ArchiveInfo message (field 2: MessageInfo, whose field 3 is the payload
// length), then the payloads. Returns null when the stream does not parse.
function iwaStrings(stream: Uint8Array): string[] | null {
  const out: string[] = [];
  for (let pos = 0; pos < stream.length; ) {
    const head = readVarint(stream, pos);
    if (!head || head[1] + head[0] > stream.length) return null;
    const info = parseMessage(stream.subarray(head[1], head[1] + head[0]));
    if (!info) return null;
    pos = head[1] + head[0];
    for (const mi of info.filter((f) => f.field === 2 && f.bytes)) {
      const length = parseMessage(mi.bytes!)?.find((f) => f.field === 3 && f.wire === 0)?.value;
      if (length === undefined || pos + length > stream.length) return null;
      collectStrings(stream.subarray(pos, pos + length), out);
      pos += length;
    }
  }
  return out;
}

// Printable UTF-8 runs, for an IWA stream whose object framing did not parse.
function printableRuns(stream: Uint8Array): string[] {
  const text = new TextDecoder("utf-8").decode(stream);
  return text.match(/[^\u0000-\u0008\u000b-\u001f\u007f\ufffd]{4,}/g)?.filter((s) => /\p{L}{2}/u.test(s)) ?? [];
}

// Strings that are clearly not prose: style and font identifiers, locale
// codes, UUIDs, file names.
function looksLikeIdentifier(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  // iWork's generated style names: "text-12-paragraphstyle-Slide Number".
  if (/^[A-Za-z]+-\d+-[A-Za-z]/.test(t)) return true;
  if (/\s/.test(t)) return false;
  if (/^[a-z]+(?:-[a-z0-9]+){2,}$/.test(t)) return true; // "paragraph-style-default"
  return (
    /^[0-9A-F]{8}-[0-9A-F]{4}-/i.test(t) ||
    /^[a-z]{2,3}(?:[_-][A-Za-z]{2,4})?$/.test(t) ||
    /[_.]/.test(t) && !/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(t) && !/^(?:https?:\/\/|www\.)/.test(t) && !/\.(?:com|org|net|io|edu|gov)\b/.test(t) ||
    /^[A-Z][a-z]+(?:[A-Z][a-z]+)+(?:-[A-Za-z]+)?$/.test(t)
  );
}

export interface PagesResult {
  text: string;
  preview?: Uint8Array;
  method: string;
}

// A .pages document: a zip (or, from older Pages, a folder) holding
// Index/Document.iwa, or Index.zip with it inside. Pages 09 files hold
// index.xml instead. Best effort: Apple does not document the format.
export function pagesText(zip: Zip): PagesResult {
  const preview = zip.get("preview.jpg")?.() ?? zip.get("QuickLook/Thumbnail.jpg")?.();
  let iwa = zip.get("Index/Document.iwa");
  if (!iwa && zip.has("Index.zip")) iwa = readZip(zip.get("Index.zip")!()).get("Index/Document.iwa");
  if (!iwa) {
    const xml = zip.get("index.xml");
    if (xml) {
      const rules: XmlRules = { textElements: new Set(["sf:p"]), within: "sf:text-body", skip: new Set(), collapse: true, breaks: { "/sf:p": "\n", "sf:br": "\n", "sf:tab": "\t", "sf:lnbr": "\n" } };
      return { text: xmlText(new TextDecoder().decode(xml()), rules), preview, method: "Pages 09 index.xml" };
    }
    throw new IngestError("no Index/Document.iwa in this .pages file");
  }
  const stream = iwaDecompress(iwa());
  const structured = iwaStrings(stream);
  const strings = (structured ?? printableRuns(stream)).filter((s) => !looksLikeIdentifier(s));
  const seen = new Set<string>();
  const text = strings.filter((s) => !seen.has(s) && seen.add(s)).join("\n");
  return { text, preview, method: structured ? "Pages Document.iwa (best effort)" : "Pages Document.iwa, raw strings (best effort)" };
}

// A .pages file saved by older Pages is a folder (a macOS package); read it as
// if it were a zip of its files.
function folderAsZip(dir: string): Zip {
  const zip: Zip = new Map();
  const walk = (rel: string) => {
    for (const name of readdirSync(join(dir, rel))) {
      const path = rel ? `${rel}/${name}` : name;
      if (statSync(join(dir, path)).isDirectory()) walk(path);
      else zip.set(path, () => new Uint8Array(readFileSync(join(dir, path))));
    }
  };
  walk("");
  return zip;
}

// ---------------------------------------------------------------- converters

export interface Converter {
  name: string;
  formats: string[];
  // Candidate executables, first found wins: names on PATH or absolute paths.
  executables: string[];
  // The command to run, and the file it writes (null: it writes to stdout).
  command: (exe: string, input: string, outDir: string) => { args: string[]; outFile: string | null };
}

const SOFFICE_PATHS = [
  "soffice",
  "libreoffice",
  "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
  "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
  "/Applications/LibreOffice.app/Contents/MacOS/soffice",
];

// PowerShell single-quoted strings take everything literally except a single
// quote, which doubles.
const psQuote = (s: string) => `'${s.replace(/'/g, "''")}'`;

// Opens the file read-only in a hidden Word, saves it as UTF-8 plain text
// (wdFormatText = 2, Encoding = 65001), and always quits Word. Word wants
// absolute paths with backslashes.
export function wordScript(input: string, outFile: string): string {
  input = resolve(input);
  outFile = resolve(outFile);
  return [
    "$ErrorActionPreference = 'Stop'",
    "$w = New-Object -ComObject Word.Application",
    "$w.Visible = $false; $w.DisplayAlerts = 0",
    "try {",
    `  $d = $w.Documents.Open(${psQuote(input)}, $false, $true, $false)`,
    `  $d.SaveAs2(${psQuote(outFile)}, 2, $false, '', $false, '', $false, $false, $false, $false, $false, 65001)`,
    "  $d.Close($false)",
    "} finally { $w.Quit() }",
  ].join("\n");
}

export const CONVERTERS: Converter[] = [
  {
    name: "pandoc",
    formats: [".docx", ".odt", ".rtf"],
    executables: ["pandoc"],
    command: (exe, input) => ({ args: [exe, "-t", "plain", "--wrap=none", input], outFile: null }),
  },
  {
    name: "LibreOffice",
    formats: [".doc", ".docx", ".odt", ".rtf"],
    executables: SOFFICE_PATHS,
    command: (exe, input, outDir) => ({
      args: [exe, "--headless", "--convert-to", "txt:Text (encoded):UTF8", "--outdir", outDir, input],
      outFile: join(outDir, `${basename(input, extname(input))}.txt`),
    }),
  },
  {
    name: "textutil",
    formats: [".doc", ".docx", ".odt", ".rtf"],
    executables: ["textutil"],
    command: (exe, input) => ({ args: [exe, "-convert", "txt", "-stdout", input], outFile: null }),
  },
  {
    // Most Windows PCs have Word but none of the tools above. Word itself does
    // the conversion through PowerShell, read-only, saving UTF-8 text.
    name: "Microsoft Word",
    formats: [".doc"],
    executables: process.platform === "win32" ? ["powershell.exe", "pwsh.exe"] : [],
    command: (exe, input, outDir) => {
      const outFile = join(outDir, "word.txt");
      return { args: [exe, "-NoProfile", "-NonInteractive", "-Command", wordScript(input, outFile)], outFile };
    },
  },
  { name: "antiword", formats: [".doc"], executables: ["antiword"], command: (exe, input) => ({ args: [exe, input], outFile: null }) },
  { name: "catdoc", formats: [".doc"], executables: ["catdoc"], command: (exe, input) => ({ args: [exe, "-w", input], outFile: null }) },
];

export interface IngestOptions {
  converters?: Converter[];
  // Resolves an executable name or path to something runnable, or null.
  which?: (exe: string) => string | null;
  timeoutMs?: number;
}

function defaultWhich(exe: string): string | null {
  if (/[\\/]/.test(exe)) return existsSync(exe) ? exe : null;
  return Bun.which(exe);
}

function runConverter(c: Converter, exe: string, input: string, timeoutMs: number): string {
  const outDir = mkdtempSync(join(tmpdir(), "ingest-"));
  try {
    const { args, outFile } = c.command(exe, input, outDir);
    const run = Bun.spawnSync(args, { timeout: timeoutMs, stdout: "pipe", stderr: "pipe" });
    if (run.exitedDueToTimeout) throw new IngestError(`${c.name} timed out after ${timeoutMs / 1000}s`);
    if (run.exitCode !== 0) throw new IngestError(`${c.name} exited ${run.exitCode}: ${run.stderr.toString().trim().slice(0, 300)}`);
    const text = outFile ? (existsSync(outFile) ? readFileSync(outFile, "utf8") : "") : run.stdout.toString();
    if (!text.trim()) throw new IngestError(`${c.name} produced no text`);
    return text;
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- ingest

export interface IngestResult {
  text: string;
  method: string;
  notes: string[];
  preview?: Uint8Array;
}

const NATIVE = [".docx", ".odt", ".rtf", ".pages"];
export const SUPPORTED = [".docx", ".doc", ".odt", ".rtf", ".pages", ".txt", ".md"];

function native(path: string, ext: string): IngestResult {
  if (ext === ".rtf") return { text: rtfText(readFileSync(path, "latin1")), method: "built-in RTF reader", notes: [] };
  const zip = statSync(path).isDirectory() ? folderAsZip(path) : readZip(new Uint8Array(readFileSync(path)));
  if (ext === ".docx") return { text: docxText(zip), method: "built-in DOCX reader", notes: [] };
  if (ext === ".odt") return { text: odtText(zip), method: "built-in ODT reader", notes: [] };
  const pages = pagesText(zip);
  const notes = [
    "Pages files are read best effort: Apple does not document the format. Check the text against the original, and expect stray style names.",
  ];
  if (pages.preview) notes.push("The file holds an image of page one (preview.jpg); save it with --out and compare.");
  return { text: pages.text, method: pages.method, notes, preview: pages.preview };
}

// The text of one document. Throws IngestError, with what to do instead,
// when nothing available can read it.
export function ingest(path: string, options: IngestOptions = {}): IngestResult {
  const ext = extname(path).toLowerCase();
  if (!existsSync(path)) throw new IngestError(`${path}: no such file`);
  if (ext === ".txt" || ext === ".md") return { text: readFileSync(path, "utf8"), method: "plain text", notes: [] };
  if (ext === ".pdf") throw new IngestError(`${path}: PDFs need no conversion; read the PDF directly.`);
  if (!SUPPORTED.includes(ext)) throw new IngestError(`${path}: ${ext || "files without an extension"} is not a supported format. ${PDF_FALLBACK}`);

  const tried: string[] = [];
  if (NATIVE.includes(ext)) {
    try {
      const result = native(path, ext);
      if (result.text.trim()) return { ...result, text: tidy(result.text) };
      tried.push(`${result.method}: no text found`);
    } catch (err) {
      tried.push(`built-in ${ext.slice(1).toUpperCase()} reader: ${(err as Error).message}`);
    }
  }

  const which = options.which ?? defaultWhich;
  for (const c of (options.converters ?? CONVERTERS).filter((c) => c.formats.includes(ext))) {
    const exe = c.executables.map(which).find((e): e is string => Boolean(e));
    if (!exe) continue;
    try {
      return { text: tidy(runConverter(c, exe, path, options.timeoutMs ?? 120_000)), method: c.name, notes: [] };
    } catch (err) {
      tried.push((err as Error).message);
    }
  }
  const installHint =
    ext === ".doc"
      ? " Installing LibreOffice (free) lets this tool read .doc files; on a Mac, the built-in textutil already can."
      : "";
  const detail = tried.length ? ` Tried: ${tried.join("; ")}.` : " No converter that reads this format is installed.";
  throw new IngestError(`${path}: could not read this ${ext} file.${detail}${installHint} ${PDF_FALLBACK}`);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const outAt = args.indexOf("--out");
  const outDir = outAt >= 0 ? args[outAt + 1] : undefined;
  const files = args.filter((_, i) => outAt < 0 || (i !== outAt && i !== outAt + 1));
  if (!files.length || (outAt >= 0 && !outDir)) {
    console.error("Usage: bun tools/ingest.ts <file>... [--out <dir>]");
    console.error(`Reads ${SUPPORTED.join(", ")}. PDFs need no conversion.`);
    process.exit(2);
  }
  if (outDir) mkdirSync(outDir, { recursive: true });
  let failed = 0;
  for (const file of files) {
    try {
      const result = ingest(file);
      for (const note of result.notes) console.error(`note: ${file}: ${note}`);
      if (outDir) {
        const stem = join(outDir, basename(file, extname(file)));
        writeFileSync(`${stem}.txt`, result.text);
        console.error(`Wrote ${stem}.txt (${result.method})`);
        if (result.preview) {
          writeFileSync(`${stem}.preview.jpg`, result.preview);
          console.error(`Wrote ${stem}.preview.jpg (page one as an image)`);
        }
      } else {
        process.stdout.write(`===== ${file} (${result.method}) =====\n${result.text}\n`);
      }
    } catch (err) {
      failed++;
      console.error(err instanceof IngestError ? err.message : `${file}: ${(err as Error).message}`);
    }
  }
  process.exit(failed ? 1 : 0);
}
