#!/usr/bin/env bun
// Zero-fabrication validator: every number, date, employer, title, degree,
// certification, and skill in a generated resume must trace back to the
// Master Career Document. Deterministic string matching, no model calls.
//
// Usage: bun tools/validate.ts <resume.tex|resume.txt> <Master_Career_Document.md>

import { readFileSync } from "node:fs";

export type Kind = "number" | "date" | "heading" | "certification" | "skill";

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
}

// Numbers not glued to a word (so S3, EC2, and IDs are left to the skills check),
// with an optional leading $ and a trailing % or K/M/B magnitude.
const NUMBER = /(\$)?(?<![A-Za-z0-9.,])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?:(\s?%)|([KMB])(?![A-Za-z]))?/g;

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

// The MCD minus its HTML comments, markdown emphasis, link targets, and the
// Legacy & Historical Platforms section, which resumes must never draw from.
// Ordered-list markers go too: a table of contents numbered 1 to 18 would
// otherwise back every small number in the resume.
function sourceText(mcd: string): string {
  return mcd
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/^##\s+Legacy & Historical Platforms[\s\S]*?(?=^##\s|(?![\s\S]))/m, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*`]/g, "");
}

interface NumberSet {
  plain: Set<string>;
  percent: Set<string>;
  dollar: Set<string>;
  magnitude: Set<string>;
}

const WORD_MAGNITUDE = /(\$)?(?<![A-Za-z0-9.,])(\d+(?:\.\d+)?)\s+(thousand|million|billion)\b/gi;

function numberKey(digits: string): string {
  return digits.replace(/,/g, "");
}

function collectNumbers(text: string): NumberSet {
  const set: NumberSet = { plain: new Set(), percent: new Set(), dollar: new Set(), magnitude: new Set() };
  for (const m of text.matchAll(NUMBER)) {
    const key = numberKey(m[2]);
    set.plain.add(key);
    if (m[3]) set.percent.add(key);
    if (m[1]) set.dollar.add(key + (m[4] ?? ""));
    if (m[4]) set.magnitude.add(key + m[4]);
  }
  // "2.3 million" in the MCD backs "2.3M" in the resume, and "$1.2 million" backs "$1.2M".
  for (const m of text.matchAll(WORD_MAGNITUDE)) {
    const short = numberKey(m[2]) + m[3][0].toUpperCase();
    set.magnitude.add(short);
    if (m[1]) set.dollar.add(short);
  }
  return set;
}

// Initials of runs of capitalized words inside one phrase, so "Test-Driven
// Development" backs "TDD" without letting initials leak across sentences.
function collectAcronyms(text: string): Set<string> {
  const acronyms = new Set<string>();
  for (const phrase of text.split(/[,.;:()|\n&/]+/)) {
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

// One LaTeX source line reduced to the text a reader (or an ATS) would see.
function stripLatex(line: string): string {
  return line
    .replace(/(?<!\\)%.*$/, "")
    .replace(/\\href\{[^}]*\}/g, "")
    .replace(/\\(?:raisebox|vspace|hspace|addtolength|setlength)\{[^}]*\}/g, " ")
    .replace(/\\begin\{tabularx\}.*$/, "")
    .replace(/\\\\/g, " ")
    .replace(/\\([%$&#_])/g, "$1")
    .replace(/-{2,}/g, "-")
    .replace(/\\fa[A-Za-z]+\\?/g, " ")
    .replace(/\\[A-Za-z]+\*?/g, " ")
    .replace(/[{}~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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
  return out.flatMap((item) => {
    const m = item.match(/^([^(]*)\((.*)\)\s*$/);
    return m ? [m[1], ...m[2].split(",")] : [item];
  })
    .map((s) => s.trim())
    .filter(Boolean);
}

function headingParts(text: string): string[] {
  return text
    .split(/\s*(?:[,;|:()]|\s-\s)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function args(line: string, command: string): [string, string] | null {
  const m = line.match(new RegExp(`\\\\${command}\\{((?:[^{}]|\\{[^{}]*\\})*)\\}\\{((?:[^{}]|\\{[^{}]*\\})*)\\}`));
  return m ? [m[1], m[2]] : null;
}

export function validate(resume: string, mcd: string, options: Options = {}): Result {
  const format = options.format ?? "tex";
  const source = sourceText(mcd);
  const corpus = normalize(source);
  const numbers = collectNumbers(source);
  const acronyms = collectAcronyms(source);
  const findings: Finding[] = [];
  const checked: Result["checked"] = { numbers: 0, dates: 0, headings: 0, certifications: 0, skills: 0 };

  const lines = resume.split("\n");
  let start = 0;
  let end = lines.length;
  if (format === "tex") {
    const b = lines.findIndex((l) => l.includes("\\begin{document}"));
    const e = lines.findIndex((l) => l.includes("\\end{document}"));
    if (b >= 0) start = b + 1;
    if (e >= 0) end = e;
  }

  const flag = (kind: Kind, token: string, i: number) =>
    findings.push({ kind, token, line: i + 1, context: lines[i].trim() });

  const checkHeading = (raw: string, i: number) => {
    const text = stripLatex(raw);
    if (!text || normalize(text) === "certifications") return;
    checked.headings++;
    if (containsTerm(corpus, text)) return;
    for (const part of headingParts(text)) if (!containsTerm(corpus, part)) flag("heading", part, i);
  };

  const checkDate = (raw: string, i: number) => {
    for (const part of stripLatex(raw).split(/\s+-\s+|\s*-\s*$/).map((s) => s.trim()).filter(Boolean)) {
      checked.dates++;
      if (!containsTerm(corpus, part)) flag("date", part, i);
    }
  };

  let inSkills = false;
  let inCerts = false;

  for (let i = start; i < end; i++) {
    const raw = lines[i];
    const code = raw.replace(/(?<!\\)%.*$/, "");

    if (format === "tex") {
      if (code.includes("\\begin{tabularx}")) inSkills = true;
      else if (code.includes("\\end{tabularx}")) inSkills = false;
      else if (inSkills && /(?<!\\)&/.test(code)) {
        const cell = stripLatex(code.split(/(?<!\\)&/).slice(1).join(" "));
        for (const skill of splitSkills(cell)) {
          checked.skills++;
          const ok = containsTerm(corpus, skill) || (/^[A-Z]{2,6}$/.test(skill) && acronyms.has(skill));
          if (!ok) flag("skill", skill, i);
        }
        continue;
      }

      for (const command of ["headingBf", "headingIt"]) {
        const a = args(code, command);
        if (!a) continue;
        if (command === "headingBf") inCerts = normalize(stripLatex(a[0])) === "certifications";
        checkHeading(a[0], i);
        if (a[1].trim()) checkDate(a[1], i);
      }
      if (/\\(?:section|end\{resume_list\})/.test(code)) inCerts = false;

      const item = code.match(/\\item\s+(.*)$/);
      if (inCerts && item) {
        const cert = stripLatex(item[1]);
        checked.certifications++;
        if (!containsTerm(corpus, cert)) flag("certification", cert, i);
        continue;
      }
      // Heading and date arguments were checked above; don't double count their numbers.
      if (/\\heading(?:Bf|It)\{/.test(code)) continue;
    }

    const text = format === "tex" ? stripLatex(code) : raw;
    for (const m of text.matchAll(NUMBER)) {
      checked.numbers++;
      const key = numberKey(m[2]);
      if (m[1]) {
        const dollar = key + (m[4] ?? "");
        if (!numbers.dollar.has(dollar)) flag("number", `$${m[2]}${m[4] ?? ""}`, i);
      } else if (m[3]) {
        if (!numbers.percent.has(key)) flag("number", `${m[2]}%`, i);
      } else if (m[4]) {
        if (!numbers.magnitude.has(key + m[4])) flag("number", m[2] + m[4], i);
      } else if (!numbers.plain.has(key)) {
        flag("number", m[2], i);
      }
    }
  }

  return { findings, checked };
}

if (import.meta.main) {
  const [resumePath, mcdPath] = process.argv.slice(2);
  if (!resumePath || !mcdPath) {
    console.error("Usage: bun tools/validate.ts <resume.tex|resume.txt> <Master_Career_Document.md>");
    process.exit(2);
  }
  let resume: string;
  let mcd: string;
  try {
    resume = readFileSync(resumePath, "utf8");
    mcd = readFileSync(mcdPath, "utf8");
  } catch (err) {
    console.error(`Cannot read input: ${(err as Error).message}`);
    process.exit(2);
  }
  const format = resumePath.endsWith(".tex") ? "tex" : "text";
  const { findings, checked } = validate(resume, mcd, { format });
  const summary = Object.entries(checked)
    .map(([k, v]) => `${v} ${k}`)
    .join(", ");
  if (findings.length) {
    console.error(`FAIL: ${findings.length} claim(s) in ${resumePath} are not in ${mcdPath}\n`);
    for (const f of findings) console.error(`  ${resumePath}:${f.line}  [${f.kind}] ${f.token}\n      ${f.context}`);
    console.error(`\nChecked ${summary}.`);
    process.exit(1);
  }
  console.log(`PASS: every checked claim in ${resumePath} traces to ${mcdPath} (${summary}).`);
}
