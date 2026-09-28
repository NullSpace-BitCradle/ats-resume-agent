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

function tokens(tex: string, kind?: string): string[] {
  return validate(tex, mcd)
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
    expect(tokens(plant("2.3 million transactions", "2.3M transactions"), "number")).toEqual([]);
  });

  test("an employer the MCD never lists", () => {
    expect(tokens(plant("\\headingBf{DataFlow Inc.}", "\\headingBf{Acme Analytics}"), "heading")).toEqual(["Acme Analytics"]);
  });

  test("an inflated job title", () => {
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
});
