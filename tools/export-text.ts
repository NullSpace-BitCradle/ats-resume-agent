#!/usr/bin/env bun
// Plain-text export of a generated resume or cover letter .tex, for ATS portals
// that parse text better than PDF. The .tex stays the source of truth; this is
// derived from it, so the validator can check the export too.
//
// Usage: bun tools/export-text.ts <file.tex> [out.txt]

import { readFileSync, writeFileSync } from "node:fs";
import { group, normalizeEol, stripLatex } from "./latex";

// \documentTitle{Name}{contacts} spans lines, so it is rewritten before the
// line pass: the name, then every contact item as it reads on the page (link
// display text and plain text such as a location alike), joined with " | ".
function expandTitle(body: string): string {
  const at = body.indexOf("\\documentTitle{");
  if (at < 0) return body;
  const [name, afterName] = group(body, at + "\\documentTitle".length);
  const [contacts, end] = group(body, afterName);
  // stripLatex drops each \href's URL group and keeps its display text.
  const shown = stripLatex(contacts.replace(/\n/g, " "))
    .split(/\s*\|\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  return `${body.slice(0, at)}${stripLatex(name)}\n${shown.join(" | ")}\n${body.slice(end)}`;
}

function heading(line: string, command: string): string | null {
  const at = line.indexOf(`\\${command}{`);
  if (at < 0) return null;
  const [a, next] = group(line, at + command.length + 1);
  const [b] = group(line, next);
  return [stripLatex(a), stripLatex(b)].filter(Boolean).join(" | ");
}

export function exportText(tex: string): string {
  tex = normalizeEol(tex);
  const b = tex.indexOf("\\begin{document}");
  const e = tex.lastIndexOf("\\end{document}");
  let body = tex.slice(b >= 0 ? b + "\\begin{document}".length : 0, e >= 0 ? e : tex.length);
  body = expandTitle(body.split("\n").map((l) => l.replace(/(?<!\\)%.*$/, "")).join("\n"));

  const out: string[] = [];
  const blank = () => out.length && out[out.length - 1] !== "" && out.push("");
  let inTable = false;

  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) {
      blank();
      continue;
    }
    if (line.startsWith("\\begin{tabularx}")) {
      inTable = true;
      continue;
    }
    if (line.startsWith("\\end{tabularx}")) {
      inTable = false;
      continue;
    }
    if (inTable) {
      const [label, ...rest] = line.replace(/\\\\\s*$/, "").split(/(?<!\\)&/);
      out.push(rest.length ? `${stripLatex(label)}: ${stripLatex(rest.join(" "))}` : stripLatex(label));
      continue;
    }

    const section = line.match(/^\\(?:tiny)?section\*?\{(.*)\}/);
    if (section) {
      blank();
      out.push(stripLatex(section[1]).toUpperCase());
      continue;
    }
    const h = heading(line, "headingBf") ?? heading(line, "headingIt");
    if (h !== null) {
      if (line.includes("\\headingBf") && out[out.length - 1]?.startsWith("- ")) blank();
      if (h) out.push(h);
      continue;
    }
    const item = line.match(/^\\item(?:Title)?\s*(?:\{(.*)\}|(.*))$/);
    if (item) {
      const text = stripLatex(item[1] ?? item[2] ?? "");
      if (text) out.push(line.startsWith("\\itemTitle") ? text : `- ${text}`);
      continue;
    }

    // A letter's date is its own paragraph, as it renders; the salutation
    // starts a new one after the recipient block.
    const date = line.match(/^\\date\{(.*)\}\s*$/);
    if (date) {
      blank();
      out.push(stripLatex(date[1]));
      out.push("");
      continue;
    }
    if (line.startsWith("\\opening")) blank();

    // Everything else (cover letter prose, letter blocks): drop environment and
    // rule markup, keep \begin{letter}{...} and \opening{...} text, split on \\.
    const cleaned = line
      .replace(/\\begin\{letter\}\{(.*)\}/, "$1")
      .replace(/\\(?:opening|closing)\{(.*)\}/, "$1")
      .replace(/\\begin\{minipage\}(?:\[[^\]]*\])?\{[^}]*\}/g, " ")
      .replace(/\\(?:begin|end)\{[^}]*\}/g, " ");
    for (const part of cleaned.split(/\\\\(?:\[[^\]]*\])?/)) {
      const text = stripLatex(part);
      if (text) out.push(text);
    }
  }

  return `${out.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

if (import.meta.main) {
  const [input, output] = process.argv.slice(2);
  if (!input) {
    console.error("Usage: bun tools/export-text.ts <file.tex> [out.txt]");
    process.exit(2);
  }
  const target = output ?? input.replace(/\.tex$/, "") + ".txt";
  try {
    writeFileSync(target, exportText(readFileSync(input, "utf8")));
  } catch (err) {
    console.error(`Export failed: ${(err as Error).message}`);
    process.exit(2);
  }
  console.log(`Wrote ${target}`);
}
