// Shared LaTeX helpers for the validator and the plain-text export.

// Contents of the brace group that opens at s[open], and the index after it.
export function group(s: string, open: number): [string, number] {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "\\") i++;
    else if (s[i] === "{") depth++;
    else if (s[i] === "}" && --depth === 0) return [s.slice(open + 1, i), i + 1];
  }
  return [s.slice(open + 1), s.length];
}

// Index of the next "{" at or after i, skipping only whitespace; -1 if something else comes first.
export function nextGroup(s: string, i: number): number {
  while (i < s.length && /\s/.test(s[i])) i++;
  return s[i] === "{" ? i : -1;
}

// Every \command{a}{b}... with `arity` brace groups, tolerant of whitespace,
// line breaks, and nested braces between and inside the groups.
export function findCommands(s: string, command: string, arity: number): { at: number; end: number; args: string[] }[] {
  const found: { at: number; end: number; args: string[] }[] = [];
  const re = new RegExp(`\\\\${command}(?![A-Za-z])\\*?`, "g");
  for (const m of s.matchAll(re)) {
    const args: string[] = [];
    let i = m.index + m[0].length;
    for (let n = 0; n < arity; n++) {
      const open = nextGroup(s, i);
      if (open < 0) break;
      const [arg, after] = group(s, open);
      args.push(arg);
      i = after;
    }
    if (args.length === arity) found.push({ at: m.index, end: i, args });
  }
  return found;
}

// Drop % comments (not \%) line by line, keeping line breaks so offsets still map to lines.
export function stripComments(tex: string): string {
  return tex
    .split("\n")
    .map((l) => l.replace(/(?<!\\)%.*$/, ""))
    .join("\n");
}

// LaTeX reduced to the text a reader (or an ATS) would see.
export function stripLatex(text: string): string {
  return text
    .replace(/(?<!\\)%.*$/gm, "")
    .replace(/\\href\s*\{[^}]*\}/g, "")
    .replace(/\\(?:addtolength|setlength|definecolor|rule)\s*\{[^}]*\}(?:\s*\{[^}]*\})+/g, " ")
    .replace(/\\(?:raisebox|vspace|hspace|color|pagestyle|thispagestyle)\*?\s*\{[^}]*\}/g, " ")
    .replace(/\\begin\{(?:tabularx|minipage)\}(?:\[[^\]]*\])?(?:\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})*/g, " ")
    .replace(/\{,\}/g, ",")
    .replace(/(\d)(?:\\,|~|\\ |\\thinspace\s*|\u00A0)(\d{3})(?!\d)/g, "$1,$2")
    .replace(/\\\\(?:\[[^\]]*\])?/g, " ")
    .replace(/\\([%$&#_])/g, "$1")
    .replace(/\\[,;: !]/g, " ")
    .replace(/-{2,}/g, "-")
    .replace(/\\fa[A-Za-z]+\\?/g, " ")
    .replace(/\\[A-Za-z]+\*?/g, " ")
    .replace(/[{}~]/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}
