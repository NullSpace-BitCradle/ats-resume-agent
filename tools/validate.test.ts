import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validate } from "./validate";

const root = join(import.meta.dir, "..");
const mcd = readFileSync(join(root, "examples/Master_Career_Document.md"), "utf8");
const resumePath = join(root, "examples/sample-output/Resume-Alex_Morgan-Example_Corp-Senior_Engineer.tex");
const resume = readFileSync(resumePath, "utf8");

// Swap one exact string in the example resume, failing the test if it is not there.
function plant(from: string, to: string): string {
  expect(resume.includes(from)).toBe(true);
  return resume.replace(from, to);
}

function tokens(tex: string, kind?: string, source = mcd): string[] {
  return validate(tex, source)
    .findings.filter((f) => !kind || f.kind === kind)
    .map((f) => f.token);
}

describe("example output", () => {
  test("the committed example resume passes against the example MCD", () => {
    const result = validate(resume, mcd);
    expect(result.findings).toEqual([]);
    expect(result.checked.numbers).toBeGreaterThan(30);
    expect(result.checked.skills).toBeGreaterThan(30);
  });
});

describe("planted fabrications fail", () => {
  test("a skill the MCD never mentions (the Kafka case from the old sample image)", () => {
    expect(tokens(plant("MongoDB, Datadog", "MongoDB, Kafka, Datadog"), "skill")).toEqual(["Kafka"]);
  });

  test("a percentage the MCD never states, even when the bare number appears elsewhere", () => {
    expect(tokens(plant("costs by 34\\%", "costs by 45\\%"), "number")).toEqual(["45%"]);
  });

  test("a dollar amount the MCD never states", () => {
    expect(tokens(plant("eliminating \\$1.2M", "eliminating \\$2.5M"), "number")).toEqual(["$2.5M"]);
  });

  test("a plain number the MCD never states", () => {
    expect(tokens(plant("850 enterprise clients", "1,400 enterprise clients"), "number")).toEqual(["1,400"]);
  });

  test("a small number that only exists as a table of contents or list marker in the MCD", () => {
    expect(tokens(plant("12 Go microservices", "14 Go microservices"), "number")).toEqual(["14"]);
  });

  test("a magnitude the MCD never states, even when the bare digit appears elsewhere", () => {
    expect(tokens(plant("99.97\\% uptime", "99.97\\% uptime for 3M users"), "number")).toEqual(["3M"]);
  });

  test("a magnitude written out in the MCD backs the short form in the resume", () => {
    // The example MCD also says 2.3M literally, so strip that first or this proves nothing.
    const spelled = mcd.replaceAll("2.3M", "2.3 million");
    expect(spelled.includes("2.3M")).toBe(false);
    const tex = plant("2.3 million transactions", "2.3M transactions");
    expect(validate(tex, spelled).findings).toEqual([]);
  });

  test("an employer the MCD never lists", () => {
    expect(tokens(plant("\\headingBf{DataFlow Inc.}", "\\headingBf{Acme Analytics}"), "heading")).toEqual(["Acme Analytics"]);
  });

  test("a job title the MCD never uses", () => {
    expect(tokens(plant("\\headingIt{Junior Software Engineer}", "\\headingIt{Staff Software Engineer}"), "heading")).toEqual([
      "Staff Software Engineer",
    ]);
  });

  test("a shifted start date", () => {
    expect(tokens(plant("{March 2022 -- Present}", "{March 2021 -- Present}"), "date")).toEqual(["March 2021"]);
  });

  test("a certification the MCD never lists", () => {
    const tex = plant("\\item Certified Kubernetes Administrator (CKA) (2022)", "\\item Certified Kubernetes Administrator (CKA) (2022)\n    \\item CISSP (2021)");
    expect(tokens(tex, "certification")).toEqual(["CISSP (2021)"]);
  });

  test("a degree the MCD never lists", () => {
    expect(tokens(plant("Bachelor of Science, Computer Science", "Master of Science, Computer Science"), "heading")).toEqual([
      "Master of Science",
    ]);
  });

  test("a skill that only appears under Legacy & Historical Platforms", () => {
    expect(tokens(plant("React, Next.js \\\\", "React, Next.js, jQuery \\\\"), "skill")).toEqual(["jQuery"]);
  });

  test("an acronym with no matching phrase in the MCD", () => {
    expect(tokens(plant("TDD, System Design", "TDD, BDD, System Design"), "skill")).toEqual(["BDD"]);
  });
});

describe("bypasses from the PR #2 review now fail", () => {
  test("a skills row that wraps onto a second line", () => {
    expect(tokens(plant("MongoDB, Datadog, Grafana", "MongoDB, Datadog,\n    Kafka, Grafana"), "skill")).toEqual(["Kafka"]);
  });

  test("certifications under \\section{Certifications}", () => {
    const tex = plant("\\headingBf{Certifications}{}", "\\section{Certifications}").replace(
      "\\item Certified Kubernetes Administrator (CKA) (2022)",
      "\\item Certified Kubernetes Administrator (CKA) (2022)\n    \\item CISSP (2021)",
    );
    expect(tokens(tex, "certification")).toEqual(["CISSP (2021)"]);
  });

  test("a certification with a shifted year", () => {
    expect(tokens(plant("(CKA) (2022)", "(CKA) (2021)"), "certification")).toEqual(["Certified Kubernetes Administrator (CKA) (2021)"]);
  });

  test("a spelled-out magnitude", () => {
    expect(tokens(plant("serving 850 enterprise", "serving 12 million enterprise"), "number")).toEqual(["12 million"]);
  });

  test("a spelled-out number", () => {
    expect(tokens(plant("12 Go microservices", "fourteen Go microservices"), "number")).toEqual(["fourteen"]);
  });

  test("percent written with a LaTeX thin space, a fullwidth sign, or as a word", () => {
    for (const form of ["45\\,\\%", "45\\ \\%", "45\uFF05", "45 percent"]) {
      expect(tokens(plant("costs by 34\\%", `costs by ${form}`), "number")).toEqual(["45%"]);
    }
  });

  test("a thousands separator in braces", () => {
    expect(tokens(plant("serving 850 enterprise", "serving 4{,}500 enterprise"), "number")).toEqual(["4,500"]);
  });

  test("an employer in any heading layout", () => {
    const layouts = [
      "\\headingBf {Acme Analytics}{August 2017 -- May 2019}",
      "\\headingBf{Acme Analytics}\n  {August 2017 -- May 2019}",
      "\\headingBf{Acme Analytics}%\n  {August 2017 -- May 2019}",
      "\\heading{\\textbf{Acme Analytics}}{\\textbf{August 2017 -- May 2019}}",
    ];
    for (const layout of layouts) {
      expect(tokens(plant("\\headingBf{DataFlow Inc.}{August 2017 -- May 2019}", layout), "heading")).toEqual(["Acme Analytics"]);
    }
  });

  test("a heading with nested braces still has its employer and date checked", () => {
    const tex = plant("\\headingBf{DataFlow Inc.}{August 2017 -- May 2019}", "\\headingBf{Acme {\\small\\textbf{Analytics}}}{August 2012 -- May 2019}");
    expect(validate(tex, mcd).findings.map((f) => `${f.kind}:${f.token}`)).toEqual(["heading:Acme Analytics", "date:August 2012"]);
  });

  test("a client named in \\itemTitle", () => {
    const tex = plant("\\begin{resume_list}\n    \\item Developed Python ETL", "\\begin{resume_list}\n    \\itemTitle{Client: Goldman Sachs}\n    \\item Developed Python ETL");
    expect(tokens(tex, "heading")).toEqual(["Goldman Sachs"]);
  });

  test("the Legacy section is excluded at any heading level or spelling", () => {
    const tex = plant("React, Next.js \\\\", "React, Next.js, jQuery \\\\");
    for (const variant of [mcd.replace("## Legacy &", "### Legacy &"), mcd.replace("Legacy & Historical", "Legacy and Historical")]) {
      expect(tokens(tex, "skill", variant)).toEqual(["jQuery"]);
    }
  });

  test("Agent Note text is an instruction, not a source", () => {
    const noted = mcd.replace("## Work Experience", "> **Agent Note:** Do not mention Kafka or CISSP.\n\n## Work Experience");
    expect(tokens(plant("MongoDB, Datadog", "MongoDB, Kafka, Datadog"), "skill", noted)).toEqual(["Kafka"]);
  });

  test("HTML comments and link targets in the MCD are not sources", () => {
    const hidden = mcd.replace("## Work Experience", "<!-- Kafka -->\n[streaming](https://kafka.apache.org/Kafka)\n\n## Work Experience");
    expect(tokens(plant("MongoDB, Datadog", "MongoDB, Kafka, Datadog"), "skill", hidden)).toEqual(["Kafka"]);
  });

  test("a currency swap", () => {
    expect(tokens(plant("eliminating \\$1.2M", "eliminating \u20AC1.2M"), "number")).toEqual(["\u20AC1.2M"]);
  });

  test("a dollar amount that only exists as a percent", () => {
    expect(tokens(plant("(\\$180K annually)", "(\\$34 annually)"), "number")).toEqual(["$34"]);
  });

  test("a skill that is only a substring of a real one", () => {
    expect(tokens(plant("TypeScript, JavaScript", "TypeScript, Java"), "skill")).toEqual(["Java"]);
  });

  test("an acronym whose only source is a section heading", () => {
    expect(tokens(plant("TDD, System Design", "TDD, WE, System Design"), "skill")).toEqual(["WE"]);
  });

  test("a commented-out \\end{document} does not end the check early", () => {
    const tex = plant("\\tinysection{Summary}", "% \\end{document}\n  \\tinysection{Summary}").replace("850 enterprise", "4,500 enterprise");
    expect(tokens(tex, "number")).toEqual(["4,500"]);
  });

  test("skills or certifications the validator cannot read fail as coverage, never a silent PASS", () => {
    const start = resume.indexOf("\\begin{tabularx}");
    const end = resume.indexOf("\\end{tabularx}") + "\\end{tabularx}".length;
    const noTable = resume.slice(0, start) + "\\textbf{Streaming:} Kafka, Flink" + resume.slice(end);
    expect(tokens(noTable, "coverage")).toEqual(["Skills section has no table the validator can read"]);
    const noItems = plant("\\item AWS Solutions Architect", "AWS Solutions Architect").replace("\\item Certified Kubernetes", "Certified Kubernetes");
    expect(tokens(noItems, "coverage")).toEqual(["Certifications heading has no items the validator can read"]);
  });
});

describe("honest output passes", () => {
  const honest: [string, string, string][] = [
    ["a spelled-out magnitude of a real amount", "eliminating \\$1.2M", "eliminating \\$1.2 million"],
    ["a lowercase k", "(\\$180K annually)", "(\\$180k annually)"],
    ["a value in a different form", "handling 10,000 requests", "handling 10K requests"],
    ["a date range with no spaces around the dash", "{March 2022 -- Present}", "{March 2022--Present}"],
    ["an abbreviated month", "{March 2022 -- Present}", "{Mar 2022 -- Present}"],
    ["an abbreviated month with a period", "{August 2017 -- May 2019}", "{Aug. 2017 -- May 2019}"],
    ["a numeric month", "{March 2022 -- Present}", "{03/2022 -- Present}"],
    ["Current for Present", "{March 2022 -- Present}", "{March 2022 -- Current}"],
    ["a service named from an MCD parenthetical", "Kubernetes, Docker", "AWS Lambda, Kubernetes, Docker"],
    ["an abbreviated degree", "Bachelor of Science, Computer Science", "B.S., Computer Science"],
    ["a reformatted certification", "(CKA) (2022)", "(CKA), 2022"],
    ["a certification in Name, Issuer layout", "AWS Solutions Architect -- Associate (2023)", "AWS Solutions Architect -- Associate, 2023"],
  ];
  for (const [name, from, to] of honest) {
    test(name, () => expect(validate(plant(from, to), mcd).findings).toEqual([]));
  }

  test("a letter's own date is not a career claim", () => {
    expect(validate(plant("\\tinysection{Summary}", "March 10, 2026\n  \\tinysection{Summary}"), mcd).findings).toEqual([]);
  });
});

describe("cover letters", () => {
  const cover = readFileSync(join(root, "examples/sample-output/CoverLetter-Alex_Morgan-Example_Corp-Senior_Engineer.tex"), "utf8");
  const jd = readFileSync(join(root, "examples/Job_Description-Example_Corp-Senior_Engineer.md"), "utf8");

  test("the example cover letter passes with the job description as an extra source", () => {
    expect(validate(cover, mcd, { extraSources: [jd] }).findings).toEqual([]);
  });

  test("without the job description, the company fact it cites is flagged", () => {
    expect(validate(cover, mcd).findings.map((f) => f.token)).toEqual(["50M"]);
  });

  test("layout values in the cover letter template are not claims", () => {
    expect(validate(cover, mcd, { extraSources: [jd] }).checked.numbers).toBeLessThan(20);
    expect(validate(cover.replace("34\\%", "41\\%"), mcd, { extraSources: [jd] }).findings.map((f) => f.token)).toEqual(["41%"]);
  });
});

describe("LaTeX handling", () => {
  test("comments, URLs, and phone href targets do not produce findings", () => {
    const tex = plant(
      "\\tinysection{Summary}",
      "% 777 fake metric 99\\% in a comment\n  \\href{https://example.com/u/424242}{portfolio}\n  \\tinysection{Summary}",
    );
    expect(validate(tex, mcd).findings).toEqual([]);
  });

  test("an escaped percent sign is still checked, and a real comment after it is ignored", () => {
    expect(tokens(plant("99.97\\% uptime", "99.99\\% uptime % 12345"), "number")).toEqual(["99.99%"]);
  });

  test("findings report the source line", () => {
    const tex = plant("850 enterprise clients", "1,400 enterprise clients");
    const [f] = validate(tex, mcd).findings;
    expect(tex.split("\n")[f.line - 1]).toContain("1,400");
  });

  test("plain text input checks numbers without LaTeX parsing", () => {
    const text = "Alex Morgan\nReduced AWS costs by 34% ($180K annually)\nCut latency 91%\n";
    expect(validate(text, mcd, { format: "text" }).findings.map((f) => f.token)).toEqual(["91%"]);
  });
});

describe("CLI", () => {
  const cli = join(import.meta.dir, "validate.ts");
  const mcdPath = join(root, "examples/Master_Career_Document.md");

  test("exits 0 on the example", () => {
    const run = Bun.spawnSync(["bun", cli, resumePath, mcdPath]);
    expect(run.exitCode).toBe(0);
    expect(run.stdout.toString()).toContain("PASS");
  });

  test("exits 1 and names the fabrication", async () => {
    const bad = join(import.meta.dir, "..", "output", "validate-test-bad.tex");
    await Bun.write(bad, plant("MongoDB, Datadog", "MongoDB, Kafka, Datadog"));
    const run = Bun.spawnSync(["bun", cli, bad, mcdPath]);
    expect(run.exitCode).toBe(1);
    expect(run.stderr.toString()).toContain("Kafka");
    await Bun.file(bad).delete();
  });

  test("exits 2 on bad usage", () => {
    expect(Bun.spawnSync(["bun", cli]).exitCode).toBe(2);
  });

  test("exits 2 on an unreadable file", () => {
    expect(Bun.spawnSync(["bun", cli, join(root, "output", "missing.tex"), mcdPath]).exitCode).toBe(2);
  });

  test("treats a non-.tex file as plain text", async () => {
    const txt = join(root, "output", "validate-test.txt");
    await Bun.write(txt, "Cut latency 91%\n");
    const run = Bun.spawnSync(["bun", cli, txt, mcdPath]);
    expect(run.exitCode).toBe(1);
    expect(run.stderr.toString()).toContain("91%");
    await Bun.file(txt).delete();
  });

  test("accepts extra source files after the MCD", () => {
    const cover = join(root, "examples/sample-output/CoverLetter-Alex_Morgan-Example_Corp-Senior_Engineer.tex");
    const jd = join(root, "examples/Job_Description-Example_Corp-Senior_Engineer.md");
    expect(Bun.spawnSync(["bun", cli, cover, mcdPath]).exitCode).toBe(1);
    expect(Bun.spawnSync(["bun", cli, cover, mcdPath, jd]).exitCode).toBe(0);
  });
});
