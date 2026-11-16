import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { type Converter, IngestError, ingest, iwaDecompress, readZip, rtfText, snappyDecompress } from "./ingest";

// Every fixture is built here from made-up text, so nothing personal is ever
// committed and each test shows exactly what the file holds.
const dir = mkdtempSync(join(tmpdir(), "ingest-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const bytes = (s: string) => new TextEncoder().encode(s);

// A minimal zip writer: stored or deflated entries, correct CRCs and sizes.
function zip(files: Record<string, string | Uint8Array>, deflate = true): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = typeof content === "string" ? bytes(content) : content;
    const packed = deflate ? new Uint8Array(deflateRawSync(data)) : data;
    const nameBytes = bytes(name);
    const crc = Bun.hash.crc32(data);
    const local = new Uint8Array(30 + nameBytes.length + packed.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, deflate ? 8 : 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, packed.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(packed, 30 + nameBytes.length);
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(10, deflate ? 8 : 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, packed.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, centrals.length, true);
  ev.setUint16(10, centrals.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  return concat(...locals, ...centrals, end);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function write(name: string, content: string | Uint8Array): string {
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

describe("zip", () => {
  test("reads stored and deflated entries", () => {
    for (const deflate of [true, false]) {
      const z = readZip(zip({ "a.txt": "first", "dir/b.txt": "second" }, deflate));
      expect([...z.keys()]).toEqual(["a.txt", "dir/b.txt"]);
      expect(new TextDecoder().decode(z.get("dir/b.txt")!())).toBe("second");
    }
  });

  test("refuses data that is not a zip", () => {
    expect(() => readZip(bytes("plain text, not an archive"))).toThrow(IngestError);
  });
});

describe(".docx", () => {
  const header = `<?xml version="1.0"?><w:hdr><w:p><w:r><w:t>Riley Example</w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">Springfield, ST | riley@example.com</w:t></w:r></w:p></w:hdr>`;
  const body = `<?xml version="1.0"?><w:document><w:body>
    <w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="9360"/></w:tabs></w:pPr>
      <w:r><w:t>Kitchen Manager</w:t></w:r><w:r><w:tab/><w:t>2014 &amp; 2015</w:t></w:r></w:p>
    <w:p><w:r><w:t>Trained new line cooks</w:t></w:r><w:r><w:br/><w:t>daily</w:t></w:r></w:p>
    <w:p><w:r><w:fldChar/><w:instrText> HYPERLINK "https://example.com" </w:instrText><w:t>example.com</w:t></w:r></w:p>
    <w:p><mc:AlternateContent><mc:Choice><w:txbxContent><w:p><w:r><w:t>Text box</w:t></w:r></w:p></w:txbxContent></mc:Choice>
      <mc:Fallback><w:txbxContent><w:p><w:r><w:t>Text box</w:t></w:r></w:p></w:txbxContent></mc:Fallback></mc:AlternateContent></w:p>
    <w:p><w:r><w:delText>deleted words</w:delText><w:t>Caf&#233; &lt;Lead&gt;</w:t></w:r></w:p>
    <w:sectPr><w:pgSz/></w:sectPr></w:body></w:document>`;

  test("headers come first, then paragraphs, tabs, and line breaks, with no layout or field codes", () => {
    const path = write("resume.docx", zip({ "[Content_Types].xml": "<Types/>", "word/document.xml": body, "word/header1.xml": header }));
    const result = ingest(path, { converters: [] });
    expect(result.method).toBe("built-in DOCX reader");
    expect(result.text).toBe(
      [
        "Riley Example",
        "Springfield, ST | riley@example.com",
        "",
        "Kitchen Manager\t2014 & 2015",
        "Trained new line cooks",
        "daily",
        "example.com",
        "Text box",
        "",
        "Café <Lead>",
        "",
      ].join("\n"),
    );
  });
});

describe(".odt", () => {
  test("headings, paragraphs, runs of spaces, tabs, and the page header", () => {
    const content = `<?xml version="1.0"?><office:document-content><office:automatic-styles><style:style style:name="P1"/></office:automatic-styles>
      <office:body><office:text><text:h text:outline-level="1">Experience</text:h>
      <text:p>Line Cook<text:s text:c="3"/>2009<text:tab/>Harbor Street Cafe</text:p>
      <text:list><text:list-item><text:p>Planned <text:span>seasonal</text:span> menus<text:line-break/>for private events</text:p></text:list-item></text:list>
      </office:text></office:body></office:document-content>`;
    const styles = `<office:document-styles><office:master-styles><style:master-page><style:header><text:p>Riley Example</text:p></style:header>
      </style:master-page></office:master-styles></office:document-styles>`;
    const path = write("resume.odt", zip({ mimetype: "application/vnd.oasis.opendocument.text", "content.xml": content, "styles.xml": styles }, false));
    const result = ingest(path, { converters: [] });
    expect(result.method).toBe("built-in ODT reader");
    expect(result.text).toBe(
      "Riley Example\n\nExperience\nLine Cook   2009\tHarbor Street Cafe\nPlanned seasonal menus\nfor private events\n",
    );
  });
});

describe(".rtf", () => {
  const rtf = [
    "{\\rtf1\\ansi\\ansicpg1252\\deff0{\\fonttbl{\\f0\\fswiss Helvetica;}}{\\colortbl;\\red0\\green0\\blue0;}",
    "{\\*\\generator Some Writer 1.0;}{\\info{\\title Old Resume}{\\author Someone}}",
    "{\\header \\pard Riley Example\\par}",
    "\\pard\\plain \\b Summary\\b0\\par",
    "Caf\\'e9 lead \\u8212? cook\\tab 2009\\line second line\\par",
    "Braces \\{kept\\} and a backslash \\\\ too.\\par",
    "{\\field{\\*\\fldinst HYPERLINK \"https://example.com\"}{\\fldrslt example.com}}\\par",
    "}",
  ].join("\n");

  test("keeps text, decodes escapes, and drops tables, metadata, and field codes", () => {
    expect(rtfText(rtf)).toBe(
      "Riley Example\nSummary\nCafé lead — cook\t2009\nsecond line\nBraces {kept} and a backslash \\ too.\nexample.com\n",
    );
  });

  test("ingest reads .rtf natively", () => {
    const result = ingest(write("resume.rtf", rtf), { converters: [] });
    expect(result.method).toBe("built-in RTF reader");
    expect(result.text).toStartWith("Riley Example\nSummary\n");
  });

  test("a \\uN with a hex fallback drops the fallback, and \\uc0 drops nothing", () => {
    expect(rtfText("{\\rtf1 a\\u233\\'e9 b\\uc0\\u233 c}")).toBe("aé béc");
  });
});

// Snappy vectors built by hand from the format description, not by an
// encoder, so the decoder is not only checked against itself.
describe("snappy", () => {
  const dec = (...b: number[]) => new TextDecoder().decode(snappyDecompress(new Uint8Array(b)));
  const abc = [0x61, 0x62, 0x63];

  test("a literal and an overlapping 1-byte-offset copy", () => {
    // length 12; literal "abc" (tag (3-1)<<2); copy 9 bytes from 3 back (tag (9-4)<<2|1)
    expect(dec(12, 0x08, ...abc, 0x15, 3)).toBe("abcabcabcabc");
  });

  test("a 2-byte-offset copy and a 4-byte-offset copy", () => {
    const hello = [...bytes("hello ")];
    expect(dec(11, 0x14, ...hello, ((5 - 1) << 2) | 2, 6, 0)).toBe("hello hello");
    expect(dec(11, 0x14, ...hello, ((5 - 1) << 2) | 3, 6, 0, 0, 0)).toBe("hello hello");
  });

  test("a long literal with its length in extra bytes, and a two-byte length varint", () => {
    const text = "x".repeat(150) + "y".repeat(50);
    expect(dec(0xc8, 0x01, 60 << 2, 199, ...bytes(text))).toBe(text);
    const two = "z".repeat(300);
    expect(dec(0xac, 0x02, 61 << 2, 299 & 0xff, 299 >> 8, ...bytes(two))).toBe(two);
  });

  test("corrupt input throws instead of returning garbage", () => {
    expect(() => dec(12, 0x08, ...abc, 0x15, 4)).toThrow(IngestError); // offset past the output
    expect(() => dec(12, 0x08, ...abc)).toThrow(IngestError); // shorter than declared
    expect(() => dec(3, 0x08, 0x61)).toThrow(IngestError); // truncated literal
  });
});

// An IWA stream, framed the way iWork writes it: [varint length][ArchiveInfo]
// [payload], in chunks of [0x00][24-bit LE length][raw snappy block].
const varint = (n: number): number[] => {
  const out: number[] = [];
  for (; n >= 0x80; n = Math.floor(n / 128)) out.push((n & 0x7f) | 0x80);
  out.push(n);
  return out;
};
const field = (n: number, payload: number[]) => [...varint(n * 8 + 2), ...varint(payload.length), ...payload];
const fieldVarint = (n: number, v: number) => [...varint(n * 8), ...varint(v)];
function object(id: number, type: number, payload: number[]): number[] {
  const info = [...fieldVarint(1, id), ...field(2, [...fieldVarint(1, type), ...fieldVarint(3, payload.length)])];
  return [...varint(info.length), ...info, ...payload];
}
// Literal-only snappy, in literals of up to 60 bytes.
function snappyLiterals(data: number[]): number[] {
  const out = [...varint(data.length)];
  for (let i = 0; i < data.length; i += 60) {
    const part = data.slice(i, i + 60);
    out.push((part.length - 1) << 2, ...part);
  }
  return out;
}
function iwa(stream: number[], chunkSize: number): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < stream.length; i += chunkSize) {
    const block = snappyLiterals(stream.slice(i, i + chunkSize));
    out.push(0, block.length & 0xff, (block.length >> 8) & 0xff, block.length >> 16, ...block);
  }
  return new Uint8Array(out);
}

describe(".pages", () => {
  const body = "Riley Example\nKitchen Manager\nCut food waste by 30 percent in 2016";
  const stream = [
    ...object(1, 2001, [...fieldVarint(1, 0), ...field(3, [...bytes(body)])]),
    ...object(2, 2022, [...field(1, [...bytes("paragraph-style-default")]), ...field(2, [...field(1, [...bytes("en_US")])])]),
  ];

  test("IWA chunks decompress and join in order", () => {
    expect([...iwaDecompress(iwa(stream, 40))]).toEqual(stream);
  });

  test("recovers the body text, drops style identifiers, and offers the page-one preview", () => {
    const preview = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const path = write("resume.pages", zip({ "Index/Document.iwa": iwa(stream, 50), "preview.jpg": preview }));
    const result = ingest(path, { converters: [] });
    expect(result.method).toBe("Pages Document.iwa (best effort)");
    expect(result.text).toBe(`${body}\n`);
    expect([...result.preview!]).toEqual([...preview]);
    expect(result.notes.join(" ")).toContain("best effort");
  });

  test("reads Index/Document.iwa from an Index.zip inside the bundle", () => {
    const inner = zip({ "Index/Document.iwa": iwa(stream, 1000) }, false);
    const result = ingest(write("older.pages", zip({ "Index.zip": inner })), { converters: [] });
    expect(result.text).toBe(`${body}\n`);
  });

  test("a .pages file with no document falls back to the PDF instructions", () => {
    const path = write("empty.pages", zip({ "Metadata/Properties.plist": "<plist/>" }));
    expect(() => ingest(path, { converters: [] })).toThrow(/no Index\/Document\.iwa.*export it as a PDF/s);
  });
});

describe("converters and the fallback", () => {
  // A stand-in converter: Bun itself, running a one-line script.
  const fake = (name: string, script: string, formats = [".doc"]): Converter => ({
    name,
    formats,
    executables: ["fake-tool"],
    command: (exe) => ({ args: [exe, "-e", script], outFile: null }),
  });
  const which = (exe: string) => (exe === "fake-tool" ? process.execPath : null);
  const doc = write("old.doc", new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));

  test("a .doc goes to an installed converter", () => {
    const result = ingest(doc, { converters: [fake("fake", "console.log('Converted resume text')")], which });
    expect(result).toMatchObject({ text: "Converted resume text\n", method: "fake" });
  });

  test("with no converter installed, a .doc asks for a PDF export and names LibreOffice", () => {
    const err = (() => {
      try {
        ingest(doc, { converters: [fake("fake", "")], which: () => null });
      } catch (e) {
        return e as Error;
      }
    })();
    expect(err).toBeInstanceOf(IngestError);
    expect(err!.message).toContain("No converter that reads this format is installed");
    expect(err!.message).toContain("LibreOffice");
    expect(err!.message).toContain("export it as a PDF");
  });

  test("a failing converter falls through to the next, and every failure is reported", () => {
    const failing = fake("broken", "process.exit(3)");
    const working = fake("working", "console.log('second converter text')");
    expect(ingest(doc, { converters: [failing, working], which }).method).toBe("working");
    expect(() => ingest(doc, { converters: [failing], which })).toThrow(/broken exited 3/);
  });

  test("a converter that hangs is stopped", () => {
    const hang = fake("slow", "setTimeout(() => {}, 60000)");
    expect(() => ingest(doc, { converters: [hang], which, timeoutMs: 500 })).toThrow(/slow timed out/);
  });

  test("a .docx the built-in reader cannot open goes to a converter", () => {
    const broken = write("broken.docx", "not really a zip");
    const result = ingest(broken, { converters: [fake("fake", "console.log('from the converter')", [".docx"])], which });
    expect(result.method).toBe("fake");
    expect(() => ingest(broken, { converters: [] })).toThrow(/built-in DOCX reader: not a zip archive/);
  });

  test("plain text passes through, PDFs and unknown formats are refused with what to do", () => {
    expect(ingest(write("notes.txt", "Plain notes\n")).text).toBe("Plain notes\n");
    expect(() => ingest(write("resume.pdf", "%PDF-1.4"))).toThrow(/read the PDF directly/);
    expect(() => ingest(write("resume.wpd", "x"))).toThrow(/not a supported format/);
    expect(() => ingest(join(dir, "missing.docx"))).toThrow(/no such file/);
  });
});

describe("CLI", () => {
  const cli = join(import.meta.dir, "ingest.ts");

  test("--out writes a .txt per file and a .pages preview beside it", () => {
    const out = join(dir, "out");
    mkdirSync(out, { recursive: true });
    const docx = write("cli.docx", zip({ "word/document.xml": "<w:document><w:body><w:p><w:r><w:t>CLI text</w:t></w:r></w:p></w:body></w:document>" }));
    const stream = object(1, 2001, field(3, [...bytes("Pages body text")]));
    const pages = write("cli-pages.pages", zip({ "Index/Document.iwa": iwa(stream, 100), "preview.jpg": new Uint8Array([0xff, 0xd8]) }));
    const run = Bun.spawnSync(["bun", cli, docx, pages, "--out", out]);
    expect(run.exitCode).toBe(0);
    expect(readFileSync(join(out, "cli.txt"), "utf8")).toBe("CLI text\n");
    expect(readFileSync(join(out, "cli-pages.preview.jpg")).length).toBe(2);
  });

  test("prints to stdout by default, exits 1 when a file cannot be read and 2 on bad usage", () => {
    const txt = write("cli-notes.txt", "notes");
    const ok = Bun.spawnSync(["bun", cli, txt]);
    expect(ok.stdout.toString()).toContain("===== ");
    expect(ok.stdout.toString()).toContain("notes");
    expect(Bun.spawnSync(["bun", cli, join(dir, "missing.rtf")]).exitCode).toBe(1);
    expect(Bun.spawnSync(["bun", cli]).exitCode).toBe(2);
  });
});
