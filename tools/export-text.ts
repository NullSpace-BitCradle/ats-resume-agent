#!/usr/bin/env bun
// Plain-text export of a generated resume or cover letter .tex, for ATS portals
// that parse text better than PDF. The .tex stays the source of truth; this is
// derived from it, so the validator can check the export too.
//
// Usage: bun tools/export-text.ts <file.tex> [out.txt]

import { readFileSync, writeFileSync } from "node:fs";
import { group, stripLatex } from "./latex";

// \documentTitle{Name}{contacts} spans lines, so it is rewritten before the
// line pass: the name, then each \href display text joined with " | ".
function expandTitle(body: string): string {
  const at = body.indexOf("\\documentTitle{");
  if (at < 0) return body;
  const [name, afterName] = group(body, at + "\\documentTitle".length);
  const [contacts, end] = group(body, afterName);
  const shown: string[] = [];
  for (let i = contacts.indexOf("\\href{"); i >= 0; i = contacts.indexOf("\\href{", i + 1)) {
    const [, afterUrl] = group(contacts, i + "\\href".length);
    shown.push(stripLatex(group(contacts, afterUrl)[0].replace(/\n/g, " ")));
  }
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
