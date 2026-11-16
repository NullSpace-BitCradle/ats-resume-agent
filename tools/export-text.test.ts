import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { exportText } from "./export-text";
import { validate } from "./validate";

const root = join(import.meta.dir, "..");
// Fixtures as LF, whatever the checkout did to them; the CRLF tests below convert on purpose.
const toLf = (s: string) => s.replace(/\r\n?/g, "\n");
const resume = toLf(readFileSync(join(root, "examples/sample-output/Resume-Alex_Morgan-Example_Corp-Senior_Engineer.tex"), "utf8"));
const mcd = toLf(readFileSync(join(root, "examples/Master_Career_Document.md"), "utf8"));
const coverTemplate = toLf(readFileSync(join(root, "templates/cover-letter-template.tex"), "utf8"));

describe("resume export", () => {
  const text = exportText(resume);
  const lines = text.split("\n");

  test("leaves no LaTeX behind", () => {
    expect(text).not.toMatch(/[\\{}~]/);
    expect(text).not.toMatch(/\[t\]|textwidth|tabularx|hspace/);
  });

  test("keeps the name first and the contact line after it, location included", () => {
    expect(lines[0]).toBe("Alex Morgan");
    expect(lines[1]).toBe(
      "Austin, TX | (555) 867-5309 | alex.morgan@example.com | linkedin.com/in/alex-morgan-example | github.com/alexmorgan-example",
    );
  });

  test("plain-text contact items survive anywhere in the header, with any icon form", () => {
    const title = resume.slice(resume.indexOf("\\documentTitle{Alex"), resume.indexOf("\\tinysection{Summary}"));
    expect(title).toContain("\\faMapMarker~Austin, TX ~ | ~");
    const noLocation = resume.replace("\\raisebox{-0.15\\height} \\faMapMarker~Austin, TX ~ | ~\n", "");
    expect(noLocation).not.toBe(resume);
    expect(exportText(noLocation).split("\n")[1]).toStartWith("(555) 867-5309 | ");
    const last = noLocation.replace("github.com/alexmorgan-example}\n", "github.com/alexmorgan-example} ~ | ~\n    \\faMapMarker*\\ Austin, TX\n");
    expect(last).not.toBe(noLocation);
    expect(exportText(last).split("\n")[1]).toEndWith(" | github.com/alexmorgan-example | Austin, TX");
  });

  test("the resume template's header exports every slot, location first", () => {
    const template = toLf(readFileSync(join(root, "templates/resume-template.tex"), "utf8"));
    expect(exportText(template).split("\n").slice(0, 2)).toEqual([
      "Your Name",
      "City, State | 123-456-7890 | you@example.com | linkedin.com/in/yourprofile | github.com/yourusername",
    ]);
  });

  test("uses standard section headings an ATS can find", () => {
    for (const h of ["SUMMARY", "SKILLS", "EXPERIENCE", "PROJECTS", "EDUCATION"]) expect(lines).toContain(h);
  });

  test("puts each role on one line with its dates, title below, bullets as dashes", () => {
    const i = lines.indexOf("Stellar Technologies | March 2022 - Present");
    expect(i).toBeGreaterThan(0);
    expect(lines[i + 1]).toBe("Senior Software Engineer");
    expect(lines[i + 2]).toStartWith("- Led migration of monolithic Python application to 12 Go microservices");
  });

  test("turns the skills table into labeled lines", () => {
    expect(lines).toContain("Data & Observability: PostgreSQL, Redis, MongoDB, Datadog, Grafana, Prometheus");
  });

  test("keeps escaped symbols readable", () => {
    expect(text).toContain("99.97% uptime");
    expect(text).toContain("$1.2M in annual oversell losses");
    expect(text).toContain("Bachelor of Science, Computer Science - Minor: Mathematics | Graduated May 2017");
  });

  test("the exported text still passes the validator", () => {
    expect(validate(text, mcd, { format: "text" }).findings).toEqual([]);
  });

  test("a fabrication survives export and the validator still catches it", () => {
    const bad = exportText(resume.replace("costs by 34\\%", "costs by 45\\%"));
    expect(validate(bad, mcd, { format: "text" }).findings.map((f) => f.token)).toEqual(["45%"]);
  });
});

describe("cover letter export", () => {
  test("the example cover letter exports with its date as a paragraph and still validates", () => {
    const cover = toLf(readFileSync(join(root, "examples/sample-output/CoverLetter-Alex_Morgan-Example_Corp-Senior_Engineer.tex"), "utf8"));
    const jd = toLf(readFileSync(join(root, "examples/Job_Description-Example_Corp-Senior_Engineer.md"), "utf8"));
    const text = exportText(cover);
    expect(text).toContain("\n\nMarch 10, 2026\n\n");
    expect(text).toContain("\n\nDear Hiring Manager,");
    expect(validate(text, mcd, { format: "text", extraSources: [jd] }).findings).toEqual([]);
  });

  test("the cover letter template exports to clean paragraphs", () => {
    const text = exportText(coverTemplate);
    expect(text).not.toMatch(/[\\{}~]|\[t\]|0\.5|linewidth/);
    expect(text).not.toMatch(/\d+pt\b|cvteal|^empty$/m);
    expect(text).toContain("Position: Job Title");
    expect(text).toContain("Dear Hiring Manager,");
    expect(text).toContain("Yours sincerely,");
    expect(text).toMatch(/Opening paragraph: .+\n\nBody paragraph 1:/);
  });
});

describe("CLI", () => {
  test("writes a .txt next to the .tex by default", async () => {
    const out = join(root, "output", "export-test.tex");
    await Bun.write(out, resume);
    const run = Bun.spawnSync(["bun", join(import.meta.dir, "export-text.ts"), out]);
    expect(run.exitCode).toBe(0);
    expect(await Bun.file(out.replace(/\.tex$/, ".txt")).text()).toStartWith("Alex Morgan\n");
    await Bun.file(out).delete();
    await Bun.file(out.replace(/\.tex$/, ".txt")).delete();
  });

  test("exits 2 on bad usage", () => {
    expect(Bun.spawnSync(["bun", join(import.meta.dir, "export-text.ts")]).exitCode).toBe(2);
  });
});

describe("resume template", () => {
  const template = toLf(readFileSync(join(root, "templates/resume-template.tex"), "utf8"));
  const preamble = (tex: string) => tex.slice(tex.indexOf("\\documentclass"), tex.indexOf("\\begin{document}"));

  test("uses T1 font encoding, so | separators reach the PDF text as |, not as em dashes", () => {
    expect(preamble(template)).toContain("\\usepackage[T1]{fontenc}");
  });

  test("the example resume carries the template's preamble verbatim, as the writer must", () => {
    expect(preamble(resume)).toBe(preamble(template));
  });
});

describe("Windows line endings", () => {
  test("CRLF input exports the same text as LF input", () => {
    const lf = resume.replace(/\r\n?/g, "\n");
    expect(exportText(lf.replace(/\n/g, "\r\n"))).toBe(exportText(lf));
  });
});
