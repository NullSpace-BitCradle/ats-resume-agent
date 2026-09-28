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

export type Kind = "number" | "date" | "heading" | "certification" | "skill" | "coverage";

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
  return s.replace(/％/g, "%").replace(/(\d)\s*(?:percent|per cent)\b/gi, "$1%");
}

// ---------------------------------------------------------------- the source

// The MCD minus what must never count as evidence: HTML comments, Agent Note
// instructions (a note saying "never list CISSP" is not a CISSP), and any
// Legacy & Historical Platforms section at any heading level. Ordered-list
// markers go too: a table of contents numbered 1 to 18 would otherwise back
// every small number in the resume, and in-page links (the table of
// contents) are dropped, so section names never become acronym sources.
function sourceText(mcd: string): string {
  const kept: string[] = [];
  let skipLevel = 0;
  for (const line of mcd.replace(/<!--[\s\S]*?-->/g, " ").split("\n")) {
    const h = line.match(/^(#{1,6})\s/);
    if (h && skipLevel && h[1].length <= skipLevel) skipLevel = 0;
    if (h && /\blegacy\b/i.test(line) && /\b(historical|platforms?)\b/i.test(line)) skipLevel = h[1].length;
    if (skipLevel) continue;
    if (/^\s*>\s*\**\s*agent note\b/i.test(line)) continue;
    kept.push(line);
  }
  return kept
    .join("\n")
    .replace(/^\s*\d+\.\s+/gm, "")
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
  /([$€£¥])?(?<![A-Za-z0-9.,])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?:\s?(%)|(k|K|MM|M|mn|B|bn)(?![A-Za-z])|\s(thousand|million|billion)(?![A-Za-z]))?/g;

const WORDS: Record<string, number> = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11,
  twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80,
  ninety: 90, dozen: 12,
};
// "one" is left out on purpose: "one of the first" is prose, not a metric.
const WORD_NUMBER = new RegExp(`\\b(${Object.keys(WORDS).join("|")})(?:\\s(thousand|million|billion))?\\b`, "gi");

const MULTIPLIER: Record<string, number> = {
  k: 1e3, thousand: 1e3, m: 1e6, mm: 1e6, mn: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9,
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
}

function parseNumbers(text: string): Parsed[] {
  const out: Parsed[] = [];
  for (const m of normalizeSymbols(text).matchAll(NUMBER)) {
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
    });
  }
  for (const m of text.matchAll(WORD_NUMBER)) {
    const n = WORDS[m[1].toLowerCase()] * (m[2] ? MULTIPLIER[m[2].toLowerCase()] : 1);
    out.push({ token: m[0], core: String(n), value: valueKey(n), percent: false, scaled: Boolean(m[2]) });
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

const MONTH = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?(?![a-z])/g;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const DAY_DATE = new RegExp(`${MONTH.source}\\s+\\d{1,2},\\s+\\d{4}\\b`, "gi");

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

// ---------------------------------------------------------------- validate

export function validate(resume: string, mcd: string, options: Options = {}): Result {
  const format = options.format ?? "tex";
  const cleaned = [sourceText(mcd), ...(options.extraSources ?? []).map(sourceText)].join("\n");
  const sourceLines = cleaned.split("\n").map(normalize);
  const corpus = normalize(`${cleaned}\n${expandParentheticals(cleaned)}`);
  const dateCorpus = normalize(canonDates(cleaned));
  const numbers = collectNumbers(cleaned);
  const acronyms = collectAcronyms(cleaned);

  const findings: Finding[] = [];
  const checked: Result["checked"] = { numbers: 0, dates: 0, headings: 0, certifications: 0, skills: 0 };
  const rawLines = resume.split("\n");
  const flag = (kind: Kind, token: string, line: number) =>
    findings.push({ kind, token, line, context: (rawLines[line - 1] ?? "").trim() });

  // A full day-level date ("March 10, 2026") dates the letter itself; it is not a career claim.
  const checkNumbers = (text: string, line: number) => {
    for (const n of parseNumbers(text.replace(DAY_DATE, " "))) {
      checked.numbers++;
      if (!numberBacked(n, numbers)) flag("number", n.token, line);
    }
  };

  if (format === "text") {
    rawLines.forEach((l, i) => checkNumbers(l, i + 1));
    return { findings, checked };
  }

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

  const checkHeading = (raw: string, line: number) => {
    const text = stripLatex(raw).replace(/\s+/g, " ");
    if (!text || /^(certifications?|licenses?( & certifications)?)$/i.test(text)) return;
    checked.headings++;
    if (containsTerm(corpus, text)) return;
    for (const part of headingParts(text)) if (!partBacked(corpus, part)) flag("heading", part, line);
  };

  const checkDate = (raw: string, line: number) => {
    for (const part of stripLatex(raw).split(/\s*-\s*|\s+to\s+/).map((s) => s.trim()).filter(Boolean)) {
      checked.dates++;
      if (!containsTerm(dateCorpus, canonDates(part))) flag("date", part, line);
    }
  };

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

  // Skills tables, with rows that may wrap across lines.
  for (const m of body.matchAll(/\\begin\{tabularx\}/g)) {
    const close = body.indexOf("\\end{tabularx}", m.index);
    const tableEnd = close < 0 ? body.length : close;
    const spec = findCommands(body.slice(m.index, tableEnd), "begin", 3)[0];
    let offset = m.index + (spec ? spec.end : "\\begin{tabularx}".length);
    for (const row of body.slice(offset, tableEnd).split(/\\\\/)) {
      const cells = row.split(/(?<!\\)&/);
      const lead = row.length - row.trimStart().length;
      if (cells.length > 1) {
        for (const skill of splitSkills(stripLatex(cells.slice(1).join(" ")).replace(/\s+/g, " "))) {
          checked.skills++;
          const ok = containsTerm(corpus, skill) || (/^[A-Z]{2,6}$/.test(skill) && acronyms.has(skill));
          if (!ok) flag("skill", skill, at(offset + lead));
        }
      }
      offset += row.length + 2;
    }
    blank(m.index, tableEnd);
  }

  // Certifications: items under a Certifications heading or section, up to the
  // next section or heading. The name and every other part (issuer, year) must
  // appear together on one MCD line.
  const certStarts = [
    ...findCommands(body, "section", 1).filter((s) => /certif|licens/i.test(s.args[0])),
    ...headings.filter((h) => /certif|licens/i.test(h.args[0])),
  ];
  const boundaries = [...findCommands(body, "section", 1), ...headings].map((x) => x.at);
  for (const s of certStarts) {
    const next = Math.min(...boundaries.filter((x) => x > s.at), body.length);
    const block = body.slice(s.end, next);
    for (const item of block.matchAll(/\\item(?![A-Za-z])\s*([\s\S]*?)(?=\\item(?![A-Za-z])|\\end\{|$)/g)) {
      const cert = stripLatex(item[1]).replace(/\s+/g, " ");
      if (!cert) continue;
      checked.certifications++;
      const line = at(s.end + item.index);
      if (containsTerm(corpus, cert)) continue;
      const parts = headingParts(cert);
      const name = [...parts].sort((x, y) => y.length - x.length)[0];
      const home = sourceLines.filter((l) => containsTerm(l, name));
      if (!home.length || !parts.every((p) => home.some((l) => containsTerm(l, p)))) flag("certification", cert, line);
    }
  }

  // A section the validator could not read fails loudly instead of passing empty.
  const skillsSection = findCommands(body, "section", 1).find((s) => /skill/i.test(s.args[0]));
  if (skillsSection && checked.skills === 0) flag("coverage", "Skills section has no table the validator can read", at(skillsSection.at));
  if (certStarts.length && checked.certifications === 0)
    flag("coverage", "Certifications heading has no items the validator can read", at(certStarts[0].at));

  blanked
    .join("")
    .split("\n")
    .forEach((l, i) => checkNumbers(stripLatex(l), at(0) + i));

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
  const { findings, checked } = validate(resume, mcd, { format, extraSources });
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
