#!/usr/bin/env bun
// Zero-fabrication validator: every number, date, employer, title, degree,
// certification, and skill in a generated resume must trace back to the
// Master Career Document. Deterministic string matching, no model calls.
//
// Usage: bun tools/validate.ts <resume.tex|resume.txt> <Master_Career_Document.md> [extra sources...]
// Extra sources (the job description) are for cover letters only.

import { readFileSync } from "node:fs";
import { findCommands, stripComments, stripLatex } from "./latex";

export { stripLatex } from "./latex";

export type Kind = "number" | "date" | "heading" | "certification" | "skill" | "coverage" | "latex";

export interface Finding {
  kind: Kind;
  token: string;
  line: number;
  context: string;
}

export interface Result {
  findings: Finding[];
  checked: Record<"numbers" | "dates" | "headings" | "certifications" | "skills", number>;
}

export interface Options {
  format?: "tex" | "text";
  // Additional files that count as sources. For cover letters, which may name
  // the company, role, and facts from the job description. Never for resumes.
  extraSources?: string[];
}

// ---------------------------------------------------------------- text basics

function normalize(s: string): string {
  return s
    .replace(/[‒-―]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsTerm(corpus: string, term: string): boolean {
  const t = normalize(term);
  if (!t) return true;
  return new RegExp(`(?<![a-z0-9])${escapeRegex(t)}(?![a-z0-9])`).test(corpus);
}

// Fullwidth and spelled-out percent signs read the same as %.
function normalizeSymbols(s: string): string {
  return s
    .replace(/\uFF05/g, "%")
    .replace(/(\d)\u00A0(\d{3})(?!\d)/g, "$1,$2")
    .replace(/(\d)[\s-]*(?:percent(?:age[\s-]points?)?|per cent|pct)\b/gi, "$1%");
}

// ---------------------------------------------------------------- the source

// "Legacy & Historical Platforms" as the career-doc-builder writes it, plus the
// titles people use for the same idea, ignoring a trailing note like
// "(do not use)" or a colon. A project called "Legacy Platform Migration" does
// not match: the title has to end on what is being retired.
const RETIRED = /^(legacy|deprecated|outdated|retired|historical)$/i;
function isLegacyHeading(title: string): boolean {
  const t = title.replace(/[*_`]/g, "").replace(/\s*\([^)]*\)\s*$/, "").replace(/[:.\s]+$/, "").trim();
  const words = t.split(/\s+/);
  if (!RETIRED.test(words[0] ?? "")) return false;
  if (words.every((w) => RETIRED.test(w) || /^(&|and|\/)$/i.test(w))) return true;
  return /\b(historical|platforms?|skills?|tech|technolog(?:y|ies)|tools?|stack)$/i.test(t);
}

// The MCD minus what must never count as evidence: HTML comments, Agent Note
// instructions (a note saying "never list CISSP" is not a CISSP), and the
// Legacy section at any heading level. Ordered-list markers go too: a table of
// contents numbered 1 to 18 would otherwise back every small number in the
// resume, and in-page links (the table of contents) are dropped, so section
// names never become acronym sources.
function sourceText(mcd: string): string {
  const kept: string[] = [];
  let skipLevel = 0;
  let inNote: "" | "quote" | "bullet" = "";
  for (const line of mcd.replace(/<!--[\s\S]*?-->/g, " ").split("\n")) {
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h && skipLevel && h[1].length <= skipLevel) skipLevel = 0;
    if (h && isLegacyHeading(h[2])) skipLevel = h[1].length;
    if (skipLevel) continue;
    // A note is a quoted block or a bullet. A quoted note runs on through ">"
    // lines; a bulleted one through its indented continuation lines.
    if (/^\s*(?:>|[-*])\s*(?:[^\w\s*]+\s*)?\**\s*(?:\w+\s+)?(?:agent note|note for (?:the )?agent)\b/i.test(line)) {
      inNote = /^\s*>/.test(line) ? "quote" : "bullet";
      continue;
    }
    if (inNote === "quote" && /^\s*>/.test(line)) continue;
    if (inNote === "bullet" && /^\s+\S/.test(line) && !/^\s*[-*]\s/.test(line)) continue;
    inNote = "";
    kept.push(line);
  }
  return kept
    .join("\n")
    .replace(/^(\s*)\d+\.\s+/gm, "$1- ")
    .replace(/\[[^\]]*\]\(#[^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*`]/g, "");
}

// "AWS (EC2, Lambda)" in the MCD also backs "AWS Lambda" in the resume.
function expandParentheticals(text: string): string {
  const out: string[] = [];
  for (const m of text.matchAll(/([A-Za-z][\w.+#/-]*)\s*\(([^()]+)\)/g)) {
    for (const item of m[2].split(",")) if (item.trim()) out.push(`${m[1]} ${item.trim()}`);
  }
  return out.join("\n");
}

// Initials of runs of capitalized words inside one phrase, so "Test-Driven
// Development" backs "TDD". Markdown headings are left out: "Work Experience"
// is a section name, not a skill called WE.
function collectAcronyms(text: string): Set<string> {
  const acronyms = new Set<string>();
  const prose = text.replace(/^#{1,6}\s.*$/gm, "");
  for (const phrase of prose.split(/[,.;:()|\n&/]+/)) {
    const words = phrase.split(/[\s-]+/).filter(Boolean);
    for (let i = 0; i < words.length; i++) {
      let initials = "";
      for (let j = i; j < words.length && /^[A-Z]/.test(words[j]); j++) {
        initials += words[j][0];
        if (initials.length >= 2) acronyms.add(initials);
      }
    }
  }
  return acronyms;
}

// ---------------------------------------------------------------- numbers

// A number not glued to a word (S3, EC2, and IDs are the skills check's job),
// with an optional currency symbol, then a percent or a magnitude.
const NUMBER =
  /([$€£¥])?(?<![A-Za-z0-9.,])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?:\s?(%)|(k|mm|mn|m|bn|b)(?![A-Za-z])|\s(thousand|million|billion)(?![A-Za-z]))?/gi;

const WORDS: Record<string, number> = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11,
  twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80,
  ninety: 90, dozen: 12, one: 1, a: 1, "half a": 0.5,
};
// "one", "a", and "half a" only count before a magnitude ("one million"):
// on their own they are prose ("one of the first"), not metrics.
const PROSE_ONLY = new Set(["one", "a", "half a"]);
const WORD_NUMBER = new RegExp(
  `\\b(half a|${Object.keys(WORDS).filter((w) => w !== "half a").join("|")})(?:\\s(hundred|thousand|million|billion))?\\b`,
  "gi",
);

const MULTIPLIER: Record<string, number> = {
  hundred: 100, k: 1e3, thousand: 1e3, m: 1e6, mm: 1e6, mn: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9,
};

function valueKey(n: number): string {
  return String(Math.round(n * 1e6) / 1e6);
}

interface Parsed {
  token: string;
  core: string;
  value: string;
  money?: string;
  percent: boolean;
  scaled: boolean;
  index: number;
}

function parseNumbers(text: string): Parsed[] {
  const out: Parsed[] = [];
  const norm = normalizeSymbols(text);
  for (const m of norm.matchAll(NUMBER)) {
    const core = m[2].replace(/,/g, "");
    const mag = (m[4] ?? m[5])?.toLowerCase();
    const value = valueKey(Number(core) * (mag ? MULTIPLIER[mag] : 1));
    const suffix = m[4] ?? (m[5] ? ` ${m[5]}` : "");
    out.push({
      token: m[1] ? `${m[1]}${m[2]}${suffix}` : m[3] ? `${m[2]}%` : `${m[2]}${suffix}`,
      core,
      value,
      money: m[1],
      percent: Boolean(m[3]),
      scaled: Boolean(mag),
      index: m.index,
    });
  }
  for (const m of text.matchAll(WORD_NUMBER)) {
    const word = m[1].toLowerCase();
    if (PROSE_ONLY.has(word) && !m[2]) continue;
    const n = WORDS[word] * (m[2] ? MULTIPLIER[m[2].toLowerCase()] : 1);
    out.push({
      token: m[0],
      core: String(n),
      value: valueKey(n),
      percent: false,
      scaled: Boolean(m[2]),
      index: m.index,
    });
  }
  return out;
}

interface NumberSet {
  cores: Set<string>;
  values: Set<string>;
  percents: Set<string>;
  money: Set<string>;
}

function collectNumbers(text: string): NumberSet {
  const set: NumberSet = { cores: new Set(), values: new Set(), percents: new Set(), money: new Set() };
  for (const n of parseNumbers(text)) {
    set.cores.add(n.core);
    set.values.add(n.value);
    if (n.percent) set.percents.add(n.value);
    if (n.money) set.money.add(n.money + n.value);
  }
  return set;
}

// Money must match money in the same currency, percent a percent, and a scaled
// number (2.3M, 12 million, 10K) the same value. A bare number only has to exist.
function numberBacked(n: Parsed, source: NumberSet): boolean {
  if (n.money) return source.money.has(n.money + n.value);
  if (n.percent) return source.percents.has(n.value);
  if (n.scaled) return source.values.has(n.value);
  return source.cores.has(n.core) || source.values.has(n.value);
}

// ---------------------------------------------------------------- dates

const MONTH_NAME =
  "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const MONTH = new RegExp(`\\b${MONTH_NAME}\\.?(?![a-z])`, "g");
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// A full, day-level date in the forms letters use: "March 10, 2026",
// "Sunday, September 27th, 2026", "27 September 2026", "09/27/2026", "2026-09-27".
const DAY_DATE =
  `(?:(?:mon|tues|wednes|thurs|fri|satur|sun)day,?\\s+)?(?:${MONTH_NAME}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}` +
  `|\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH_NAME}\\.?,?\\s+\\d{4}|\\d{1,2}/\\d{1,2}/\\d{4}|\\d{4}-\\d{2}-\\d{2})`;
// The letter's own date: a line that is only a date, or a date after \hfill at
// the end of a line ("Austin, TX \hfill September 27, 2026").
const LETTER_DATE = new RegExp(`(^|\\\\hfill)\\s*${DAY_DATE}\\s*$`, "i");

// "Mar 2022", "March 2022", and "03/2022" all compare equal; so do Present and Current.
function canonDates(s: string): string {
  return s
    .toLowerCase()
    .replace(MONTH, (m) => `mo${MONTHS.indexOf(m.slice(0, 3)) + 1}`)
    .replace(/\b(0?[1-9]|1[0-2])\/(\d{4})\b/g, (_, mm, y) => `mo${Number(mm)} ${y}`)
    .replace(/\b(present|current|now|today)\b/g, "present");
}

// ---------------------------------------------------------------- headings

const DEGREES: [RegExp, string][] = [
  [/^b\.?\s?sc?\.?$/i, "bachelor of science"],
  [/^b\.?\s?a\.?$/i, "bachelor of arts"],
  [/^b\.?\s?eng\.?$/i, "bachelor of engineering"],
  [/^m\.?\s?sc?\.?$/i, "master of science"],
  [/^m\.?\s?a\.?$/i, "master of arts"],
  [/^m\.?\s?eng\.?$/i, "master of engineering"],
  [/^m\.?\s?b\.?\s?a\.?$/i, "master of business administration"],
  [/^ph\.?\s?d\.?$/i, "doctor of philosophy"],
  [/^a\.?\s?s\.?$/i, "associate of science"],
];

function headingParts(text: string): string[] {
  return text
    .split(/\s*(?:[,;|:()]|\s-\s|\s+in\s+)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function partBacked(corpus: string, part: string): boolean {
  if (containsTerm(corpus, part)) return true;
  const degree = DEGREES.find(([re]) => re.test(part));
  return Boolean(degree && containsTerm(corpus, degree[1]));
}

// ---------------------------------------------------------------- skills

// Top-level comma split that also unpacks "AWS (ECS, Lambda)" into its parts.
function splitSkills(cell: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of cell) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(current);
      current = "";
    } else current += ch;
  }
  out.push(current);
  return out
    .flatMap((item) => {
      const m = item.match(/^([^(]*)\((.*)\)\s*$/);
      return m ? [m[1], ...m[2].split(",")] : [item];
    })
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------- context

const STOPWORDS = new Set(
  "with that from this have your they their them into over than were been will also more most such each what when where which while about across both only very every here there these those".split(" "),
);

// Words of four or more letters in the sentence around text[index].
function sentenceWords(text: string, index: number): Set<string> {
  const before = text.slice(0, index);
  const startAt = Math.max(before.search(/[.!?;]\s+[^.!?;]*$/) + 1, 0);
  const endRel = text.slice(index).search(/[.!?;](?:\s|$)/);
  const sentence = text.slice(startAt, endRel < 0 ? text.length : index + endRel);
  return new Set((sentence.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !STOPWORDS.has(w)));
}

// Split source text into scopes: markdown sections (heading to next heading),
// and bullet entries (a top-level bullet through its indented and blank-line
// continuations, up to the next top-level bullet or heading).
function scopes(text: string): { sections: string[]; entries: string[] } {
  const sections: string[][] = [[]];
  const entries: string[][] = [[]];
  for (const line of text.split("\n")) {
    if (/^#{1,6}\s/.test(line)) {
      sections.push([]);
      entries.push([]);
    } else if (/^[-*+]\s/.test(line)) entries.push([]);
    sections[sections.length - 1].push(line);
    entries[entries.length - 1].push(line);
  }
  return { sections: sections.map((l) => normalize(l.join(" "))), entries: entries.map((l) => normalize(l.join(" "))) };
}

// ---------------------------------------------------------------- validate

const SKILLS_NAME = /skill|competenc|proficienc|technolog|tools|stack|expertise/i;
const CERTS_NAME = /certif|licens|credential/i;

export function validate(resume: string, mcd: string, options: Options = {}): Result {
  const format = options.format ?? "tex";
  const extra = options.extraSources ?? [];
  const resumeShaped = format === "tex" && /\\heading(?:Bf|It)?\s*\{|\\begin\{tabularx\}/.test(resume);
  if (extra.length && resumeShaped) {
    throw new Error(
      "Extra sources are for cover letters. This file has resume structure (headings or a skills table), and everything on a resume must come from the Master Career Document alone.",
    );
  }

  const cleaned = sourceText(mcd);
  const extraCleaned = extra.map(sourceText).join("\n");
  const all = `${cleaned}\n${extraCleaned}`;
  // A heading's parts must come from one MCD section; a certification's name,
  // issuer, and year from one bullet entry, so adjacent certs can't swap years.
  const { sections: sourceSections, entries: sourceEntries } = scopes(all);
  const corpus = normalize(`${all}\n${expandParentheticals(all)}`);
  const dateCorpus = normalize(canonDates(all));
  const numbers = collectNumbers(cleaned);
  // Each job-description number with the words of its sentence.
  const extraOccurrences = extraCleaned
    .split("\n")
    .flatMap((l) => parseNumbers(l).map((n) => ({ n, words: sentenceWords(normalizeSymbols(l), n.index) })));
  const acronyms = collectAcronyms(all);

  const findings: Finding[] = [];
  const checked: Result["checked"] = { numbers: 0, dates: 0, headings: 0, certifications: 0, skills: 0 };
  const rawLines = resume.split("\n");
  const flag = (kind: Kind, token: string, line: number) =>
    findings.push({ kind, token, line, context: (rawLines[line - 1] ?? "").trim() });

  // A job-description number only backs a claim made in a sentence that shares
  // a word with the posting's sentence: "serving 50M+ users" matches "serving
  // 50M+ monthly active users", but "mentored 5 junior engineers" does not
  // match "5+ years of backend software engineering experience".
  const sameNumber = (a: Parsed, b: Parsed) =>
    a.money ? a.money === b.money && a.value === b.value
    : a.percent ? b.percent && a.value === b.value
    : a.scaled ? a.value === b.value
    : a.core === b.core || a.value === b.value;
  const checkNumbers = (text: string, lineAt: (index: number) => number) => {
    for (const n of parseNumbers(text)) {
      checked.numbers++;
      if (numberBacked(n, numbers)) continue;
      const words = sentenceWords(normalizeSymbols(text), n.index);
      if (extraOccurrences.some((o) => sameNumber(n, o.n) && [...o.words].some((w) => words.has(w)))) continue;
      flag("number", n.token, lineAt(n.index));
    }
  };

  if (format === "text") {
    rawLines.forEach((l, i) => {
      if (!new RegExp(`^\\s*${DAY_DATE}\\s*$`, "i").test(l)) checkNumbers(l, () => i + 1);
    });
    return { findings, checked };
  }

  // An unescaped % after a number starts a LaTeX comment: the rest of the line
  // silently vanishes from the PDF while pdflatex still reports success.
  const docLine = rawLines.findIndex((l) => l.includes("\\begin{document}"));
  rawLines.forEach((l, i) => {
    const pct = l.search(/(?<!\\)%/);
    if (i > docLine && pct > 0 && /\d/.test(l[pct - 1])) flag("latex", `unescaped % after ${l[pct - 1]}`, i + 1);
  });

  // Comments go first, so a commented-out \end{document} cannot end the window.
  const tex = stripComments(resume);
  const lineStarts = [0];
  for (let i = 0; i < tex.length; i++) if (tex[i] === "\n") lineStarts.push(i + 1);
  const lineOf = (offset: number) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };

  const b = tex.indexOf("\\begin{document}");
  const e = tex.lastIndexOf("\\end{document}");
  const start = b >= 0 ? b + "\\begin{document}".length : 0;
  const end = e > start ? e : tex.length;
  const body = tex.slice(start, end);
  const at = (offset: number) => lineOf(start + offset);

  // Spans already checked as headings or skills are blanked out of the number
  // pass, keeping line breaks so every offset still maps to its line.
  const blanked = body.split("");
  const blank = (from: number, to: number) => {
    for (let i = from; i < to; i++) if (blanked[i] !== "\n") blanked[i] = " ";
  };

  const inOneScope = (parts: string[], scope: string[]) =>
    scope.some((w) =>
      parts.every((p) => {
        if (containsTerm(w, p)) return true;
        const degree = DEGREES.find(([re]) => re.test(p));
        return Boolean(degree && containsTerm(w, degree[1]));
      }),
    );

  const checkHeading = (raw: string, line: number) => {
    const text = stripLatex(raw).replace(/\s+/g, " ");
    if (!text || /^(certifications?|licenses?( & certifications)?|credentials?)$/i.test(text)) return;
    checked.headings++;
    if (containsTerm(corpus, text)) return;
    const parts = headingParts(text);
    const missing = parts.filter((p) => !partBacked(corpus, p));
    if (missing.length) for (const part of missing) flag("heading", part, line);
    else if (!inOneScope(parts, sourceSections)) flag("heading", text, line);
  };

  const checkDate = (raw: string, line: number) => {
    for (const part of stripLatex(raw).split(/\s*-\s*|\s+to\s+/).map((s) => s.trim()).filter(Boolean)) {
      checked.dates++;
      if (!containsTerm(dateCorpus, canonDates(part))) flag("date", part, line);
    }
  };

  const checkCert = (cert: string, line: number) => {
    checked.certifications++;
    if (containsTerm(corpus, cert)) return;
    if (!inOneScope(headingParts(cert), sourceEntries)) flag("certification", cert, line);
  };

  const checkSkills = (cell: string, line: number) => {
    for (const skill of splitSkills(cell)) {
      checked.skills++;
      const ok = containsTerm(corpus, skill) || (/^[A-Z]{2,6}$/.test(skill) && acronyms.has(skill));
      if (!ok) flag("skill", skill, line);
    }
  };

  // The letter's own date is not a claim: \date{}, or in a file without resume
  // structure, a line that ends in a full date. A resume never skips dates, so a
  // date wrapped onto its own line inside a bullet is still checked.
  for (const d of findCommands(body, "date", 1)) blank(d.at, d.end);
  if (!resumeShaped) {
    let offset = 0;
    for (const line of body.split("\n")) {
      const m = stripComments(line).match(LETTER_DATE);
      if (m) blank(offset + m.index! + m[1].length, offset + line.length);
      offset += line.length + 1;
    }
  }

  // Employers, titles, degrees, and their dates, in any spacing or nesting.
  const headings = ["headingBf", "headingIt", "heading"].flatMap((c) => findCommands(body, c, 2));
  for (const h of headings) {
    checkHeading(h.args[0], at(h.at));
    if (stripLatex(h.args[1])) checkDate(h.args[1], at(h.at));
    blank(h.at, h.end);
  }
  // Client and sub-project titles inside a role are employer-class claims.
  for (const t of findCommands(body, "itemTitle", 1)) {
    checkHeading(t.args[0].replace(/^\s*(client|customer|account|engagement)\s*:\s*/i, ""), at(t.at));
    blank(t.at, t.end);
  }

  // Skills tables. Rows may wrap across lines, and a row with no & (a
  // \multicolumn, or text broken onto its own row with \\) is checked too.
  for (const m of body.matchAll(/\\begin\{tabularx\}/g)) {
    const close = body.indexOf("\\end{tabularx}", m.index);
    const tableEnd = close < 0 ? body.length : close;
    const spec = findCommands(body.slice(m.index, tableEnd), "begin", 3)[0];
    let offset = m.index + (spec ? spec.end : "\\begin{tabularx}".length);
    // Rows end at \\ or \\[2pt]. A row with no & and no comma is a header or a
    // rule line, not a list of skills.
    for (const part of body.slice(offset, tableEnd).split(/(\\\\(?:\[[^\]]*\])?)/)) {
      if (/^\\\\/.test(part)) {
        offset += part.length;
        continue;
      }
      const cells = part.split(/(?<!\\)&/);
      const lead = part.length - part.trimStart().length;
      const cell =
        cells.length > 1
          ? cells.slice(1).join(" ")
          : part.replace(/\\multicolumn\s*\{[^}]*\}\s*\{[^}]*\}/g, "").replace(/^\s*\{?\s*[^,:{}]{1,40}:\s*/, "");
      const text = stripLatex(cell).replace(/\s+/g, " ");
      if (text && (cells.length > 1 || text.includes(","))) checkSkills(text, at(offset + lead));
      offset += part.length;
    }
    blank(m.index, tableEnd);
  }

  // Certifications: every \item under a Certifications, Licenses, or Credentials
  // heading or section, and any loose text in that block, up to the next
  // section or heading. The name, issuer, and year must appear together in the MCD.
  const sections = ["section", "subsection", "tinysection"].flatMap((c) => findCommands(body, c, 1));
  const certStarts = [...sections, ...headings].filter((s) => CERTS_NAME.test(stripLatex(s.args[0])));
  const boundaries = [...sections, ...headings].map((x) => x.at);
  for (const s of certStarts) {
    const next = Math.min(...boundaries.filter((x) => x > s.at), body.length);
    const block = body.slice(s.end, next);
    const items = [...block.matchAll(/\\item(?![A-Za-z])\s*([\s\S]*?)(?=\\item(?![A-Za-z])|\\end\{|$)/g)];
    for (const item of items) {
      const cert = stripLatex(item[1]).replace(/\s+/g, " ");
      if (cert) checkCert(cert, at(s.end + item.index));
    }
    let loose = block;
    for (const item of items) loose = loose.replace(item[0], " ".repeat(item[0].length));
    loose = loose.replace(/\\(?:begin|end)\{[^}]*\}/g, " ");
    const looseText = stripLatex(loose).replace(/\s+/g, " ").replace(/^[^,:]{1,20}:\s*/, "");
    if (looseText) {
      const where = at(s.end + loose.search(/\S/));
      for (const cert of splitSkills(looseText)) checkCert(cert, where);
    }
    blank(s.end, next);
  }

  // A section the validator could not read fails loudly instead of passing empty.
  const skillsSection = sections.find((s) => SKILLS_NAME.test(stripLatex(s.args[0])));
  if (skillsSection && checked.skills === 0) flag("coverage", "Skills section has no table the validator can read", at(skillsSection.at));
  if (certStarts.length && checked.certifications === 0)
    flag("coverage", "Certifications heading has no items the validator can read", at(certStarts[0].at));

  // Numbers, a paragraph at a time, so a sentence wrapped across source lines
  // keeps its context for the job-description rule.
  const bodyLines = blanked.join("").split("\n");
  const first = at(0);
  for (let i = 0; i < bodyLines.length; ) {
    const para: { text: string; line: number; from: number }[] = [];
    let joined = "";
    for (; i < bodyLines.length && stripLatex(bodyLines[i]); i++) {
      para.push({ text: stripLatex(bodyLines[i]), line: first + i, from: joined.length });
      joined += `${stripLatex(bodyLines[i])} `;
    }
    if (para.length) checkNumbers(joined, (index) => [...para].reverse().find((p) => p.from <= index)!.line);
    else i++;
  }

  findings.sort((x, y) => x.line - y.line);
  return { findings, checked };
}

if (import.meta.main) {
  const [resumePath, mcdPath, ...extra] = process.argv.slice(2);
  if (!resumePath || !mcdPath) {
    console.error("Usage: bun tools/validate.ts <resume.tex|resume.txt> <Master_Career_Document.md> [extra sources...]");
    process.exit(2);
  }
  let resume: string;
  let mcd: string;
  let extraSources: string[];
  try {
    resume = readFileSync(resumePath, "utf8");
    mcd = readFileSync(mcdPath, "utf8");
    extraSources = extra.map((p) => readFileSync(p, "utf8"));
  } catch (err) {
    console.error(`Cannot read input: ${(err as Error).message}`);
    process.exit(2);
  }
  const format = resumePath.endsWith(".tex") ? "tex" : "text";
  let result: Result;
  try {
    result = validate(resume, mcd, { format, extraSources });
  } catch (err) {
    console.error((err as Error).message);
    process.exit(2);
  }
  const { findings, checked } = result;
  const summary = Object.entries(checked)
    .map(([k, v]) => `${v} ${k}`)
    .join(", ");
  const sources = [mcdPath, ...extra].join(" + ");
  if (findings.length) {
    console.error(`FAIL: ${findings.length} claim(s) in ${resumePath} are not in ${sources}\n`);
    for (const f of findings) console.error(`  ${resumePath}:${f.line}  [${f.kind}] ${f.token}\n      ${f.context}`);
    console.error(`\nChecked ${summary}.`);
    process.exit(1);
  }
  console.log(`PASS: every checked claim in ${resumePath} traces to ${sources} (${summary}).`);
}
