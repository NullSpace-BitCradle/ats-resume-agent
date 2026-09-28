# ATS Resume Writer Agent for Claude Code

[![CI](https://github.com/NullSpace-BitCradle/ats-resume-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/NullSpace-BitCradle/ats-resume-agent/actions/workflows/ci.yml)

> v1.2.0. Prefer the original? It is preserved as the [v1.1.0 release](https://github.com/NullSpace-BitCradle/ats-resume-agent/releases/tag/v1.1.0) and the [`v1` branch](https://github.com/NullSpace-BitCradle/ats-resume-agent/tree/v1). See [CHANGELOG.md](CHANGELOG.md) for what changed.

An AI-powered resume and cover letter generator built on [Claude Code](https://code.claude.com/docs). It creates ATS-optimized, LaTeX-formatted resumes tailored to specific job descriptions. It also includes a guided career document builder that helps you create the source material through an interactive interview.

**Zero fabrication policy:** The agent will never estimate metrics, suggest proxy numbers, or embellish your experience. If a quantified achievement isn't in your master document, it won't appear in the output. This is a hard constraint, not a suggestion, and a [validator](#verify-zero-fabrication) checks it in code.

![The Zero-Fabrication Resume Workflow](images/Infographic.png)

## How It Works

The project has two agents that work together:

1. **Career Document Builder**: Guides you through an interactive interview to create a comprehensive Master Career Document. It can also ingest existing resumes, LinkedIn profile exports, or any career materials you already have as a starting point.
2. **Resume Writer**: Takes your Master Career Document and a job description, then produces a tailored LaTeX resume optimized for Applicant Tracking Systems. You run this each time you apply somewhere.

The typical flow:

1. Build your Master Career Document once (guided interview or manual)
2. Drop a job description file into the project
3. Tell Claude to generate a resume
4. The agent selects the most relevant content, maps keywords, and produces a polished PDF
5. The validator confirms every checked claim traces to your MCD, and an optional plain-text export gives you a copy for application forms

You can use it from a clone of this repository or install it as a [Claude Code plugin](#install-as-a-plugin).

### Sample Output

Here's what the agent produces from the included example data:

**Resume:**

![Sample Resume](images/Resume-Alex_Morgan-Example_Corp-Senior_Engineer.png)

**Cover Letter:**

![Sample Cover Letter](images/CoverLetter-Alex_Morgan-Example_Corp-Senior_Engineer.png)

## Prerequisites

### Claude Code

Install [Claude Code](https://code.claude.com/docs) (Anthropic's CLI tool). On macOS, Linux, or WSL:

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

On Windows PowerShell:

```powershell
irm https://claude.ai/install.ps1 | iex
```

On Windows CMD, run `curl -fsSL https://claude.ai/install.cmd -o install.cmd && install.cmd && del install.cmd`. Homebrew (`brew install --cask claude-code`) and WinGet (`winget install Anthropic.ClaudeCode`) also work. Run `claude --version` afterward to confirm the install. See the [setup guide](https://code.claude.com/docs/en/setup) for other options.

You need a Claude Pro, Max, Team, or Enterprise plan, or an Anthropic Console (API) account. The free claude.ai plan does not include Claude Code. See [authentication](https://code.claude.com/docs/en/authentication) for details. Each resume generation typically uses the Sonnet model and takes 30-60 seconds. The career document builder interview takes longer depending on career complexity.

### LaTeX (for PDF compilation)

The agent outputs `.tex` files. To compile them to PDF, you need `pdflatex`.

**Ubuntu/Debian/WSL:**
```bash
sudo apt-get install texlive-latex-base texlive-fonts-recommended \
  texlive-fonts-extra texlive-latex-extra cm-super
```
This installs all required LaTeX packages. `cm-super` provides the scalable fonts the cover letter template needs; without it, `pdflatex` stops with `auto expansion is only possible with scalable fonts`.

**macOS:**
```bash
brew install --cask mactex-no-gui
```
The full `mactex-no-gui` (~4GB) includes all required packages. The smaller `basictex` (~100MB) may be missing fonts and packages. If you use it, install missing packages with `tlmgr`:
```bash
sudo tlmgr update --self
sudo tlmgr install fontawesome5 fontawesome CormorantGaramond charter \
  ragged2e microtype lastpage bookmark tabularx enumitem titlesec fancyhdr cm-super
```

**Important:** The resume template uses `fontawesome5` and the cover letter template uses `fontawesome`. These are separate packages, and both must be installed for full functionality.

### Bun (for the validator and text export)

The [zero-fabrication validator](#verify-zero-fabrication) and the [plain-text export](#plain-text-export) run on [Bun](https://bun.com). Resume generation works without it, but the agent skips those two steps. On macOS, Linux, or WSL:

```bash
curl -fsSL https://bun.com/install | bash
```

See the [Bun installation docs](https://bun.com/docs/installation) for Windows and other options.

<details>
<summary>Troubleshooting LaTeX packages</summary>

To check if a specific package is installed:
```bash
kpsewhich fontawesome5.sty
```

If `pdflatex` fails with `File 'X.sty' not found`, install the missing package:
```bash
sudo tlmgr install <package-name>
```

If you don't have LaTeX installed and don't want to install it locally, you can still use the agent to generate the `.tex` files and compile them using [Overleaf](https://www.overleaf.com/) or another online LaTeX editor.
</details>

## Setup

There are two ways to use this project. Clone it (steps below) if you want to edit the templates or agents. Or install it as a Claude Code plugin and use it from any folder without cloning (see [Install as a plugin](#install-as-a-plugin)).

1. **Clone this repository:**
   ```bash
   git clone https://github.com/NullSpace-BitCradle/ats-resume-agent.git
   cd ats-resume-agent
   ```

2. **Check dependencies** (optional but recommended):
   ```bash
   ./setup.sh
   ```
   This checks for Claude Code and LaTeX, and offers to install anything missing.

3. **Create your Master Career Document** (choose one):

   **Option A, guided interview (recommended):**
   ```
   Help me build my career document
   ```
   The `career-doc-builder` agent will walk you through an interactive interview to produce a comprehensive 18-section MCD. If you have existing resumes, LinkedIn exports, or other career materials, it can ingest those as a starting point.

   **Option B, manual:**
   ```bash
   cp examples/Master_Career_Document.md Master_Career_Document.md
   ```
   Edit `Master_Career_Document.md` with your real career data. See the example file for the expected format and available features like agent notes and legacy sections.

   **Note:** `Master_Career_Document.md` and `Job_Description-*.md` files in the project root are gitignored by default to prevent accidentally committing personal information. The example files in `examples/` are tracked normally.

4. **Start Claude Code in the project directory:**
   ```bash
   claude
   ```

   The agent definition in `.claude/agents/ats-resume-writer.md` is preconfigured, so you don't need to read or modify it to generate resumes.

### Install as a plugin

This repository is also a Claude Code plugin marketplace. Inside any Claude Code session, run these, then confirm the install in the `/plugin` panel that the second command opens:

```
/plugin marketplace add NullSpace-BitCradle/ats-resume-agent
/plugin install ats-resume-agent@nullspace-bitcradle
```

Or from your shell, where the install finishes directly:

```bash
claude plugin marketplace add NullSpace-BitCradle/ats-resume-agent
claude plugin install ats-resume-agent@nullspace-bitcradle
```

That installs both agents (`ats-resume-writer` and `career-doc-builder`) along with the LaTeX templates and the validator. Then work from any folder that holds your `Master_Career_Document.md` and a `Job_Description-*.md` file. Generated files go to `output/` in that folder. You still need `pdflatex` for PDFs (see [Prerequisites](#latex-for-pdf-compilation)), and Bun if you want the validator.

To update later, run `/plugin marketplace update nullspace-bitcradle`.

## Usage

### Generate a Resume

Drop a job description file in the project root:

```bash
# Name it following the convention:
# Job_Description-[Company]-[Role].md
```

Then tell Claude:

```
Resume for the Example Corp file
```

or:

```
Resume and cover letter for the Example Corp file
```

The agent will:
1. Read your Master Career Document
2. Analyze the job description for keywords and requirements
3. Select the most relevant experience and skills
4. Generate a `.tex` file with ATS-optimized content
5. Compile it to PDF using `pdflatex`
6. Run the validator and fix any claim it flags (if Bun is installed)
7. Write a plain-text copy for application forms (if Bun is installed)

Output files are saved to the `output/` directory.

### Review and Iterate

After generating a resume, you can ask for adjustments:

```
Make the summary more focused on leadership experience
```

```
Add the CloudBridge SSO migration project to the experience section
```

```
Can you review this resume? I'm not getting callbacks
```

### Verify Zero Fabrication

The zero-fabrication promise is checked in code, not just in the prompt. The validator reads a generated resume and your Master Career Document and fails if the resume contains anything the MCD does not back up:

- **Numbers:** every number, including spelled-out ones like "fifteen" or "12 million", must appear in the MCD. Percentages must match a percentage, money must match money in the same currency, and scaled values must match by value, so `2.3M`, `2.3 million`, and `2,300,000` are interchangeable, but a bare `3` does not back `3M`.
- **Dates:** each start and end date on a heading line. `Mar 2022`, `March 2022`, and `03/2022` count as the same date, and so do Present and Current.
- **Employers, titles, and degrees:** the text of every `\headingBf`, `\headingIt`, and `\heading` line, plus client names in `\itemTitle{Client: ...}`. When a heading has several parts (`Software Engineer, Mathematics`), they must all come from one section of the MCD, not from anywhere in it. Common degree abbreviations (`B.S.`, `MBA`, `Ph.D.`) match the spelled-out degree.
- **Certifications:** each item, and any loose text, under a Certifications, Licenses, or Credentials heading or section. The name, issuer, and year must appear together in one MCD bullet, so when each certification is its own bullet, a real certification with a shifted year still fails. An entry can run across several lines.
- **Skills:** each item in the skills table, including rows that wrap across lines. An acronym passes when the MCD spells out the phrase it stands for (`TDD` for Test-Driven Development), and `AWS (EC2, Lambda)` in the MCD backs `AWS Lambda`.

These never count as a source: the "Legacy & Historical Platforms" section at any heading level (and titles like "Legacy Skills", "Deprecated Skills", or plain "Legacy"), Agent Notes, whether a quoted block or a bullet (a note saying "never list CISSP" is not evidence of CISSP), HTML comments, link targets, and the table of contents.

It also flags an unescaped `%` after a number (`34%` instead of `34\%`). LaTeX treats that `%` as the start of a comment, so the rest of the line silently disappears from the PDF even though `pdflatex` reports success.

If the resume has a skills section (Skills, Core Competencies, Technical Proficiencies, and similar names) or a certifications heading the validator cannot read, for example skills written as plain text instead of the template's table, it reports a `coverage` finding instead of passing. An unfamiliar layout fails loudly; it never passes silently.

The validator needs [Bun](#bun-for-the-validator-and-text-export):

```bash
bun tools/validate.ts output/Resume-Your_Name-Company-Role.tex Master_Career_Document.md
```

It prints `PASS` and exits 0, or lists each unsupported claim with its line number and exits 1. Files that don't end in `.tex` are read as plain text, and only their numbers are checked.

**Cover letters** can name the company, the role, and facts from the job posting, so pass the job description as an extra source:

```bash
bun tools/validate.ts output/CoverLetter-Your_Name-Company-Role.tex Master_Career_Document.md Job_Description-Company-Role.md
```

A number that only the job description backs has to keep its context: the letter's sentence must share a word with the posting's sentence. `serving 50M+ users` passes against "serving 50M+ monthly active users", but `mentored 5 junior engineers` does not pass just because the posting asks for "5+ years". Close paraphrases can still fail (`the 5-year requirement` shares no word with `5+ years`); reword or leave the number out.

The letter's own date is skipped when it sits on a line of its own that starts a paragraph (after a blank line, and followed by a blank line, a `\\` break, or the salutation), or after `\hfill` at the end of a line. A date inside a sentence is still checked, and resumes never skip dates.

The validator refuses extra sources for a file with resume structure. Everything on a resume has to come from your own history, and a job posting's tech stack is exactly where padded skills come from.

What it cannot prove:

- **It matches values, not sentences.** If a real number, title, or date shows up attached to the wrong role, the validator will not notice.
- **Parts of a heading can be combined within one MCD section.** Any parts found in the same section pass together, so a target title and a held title, or a title and a word from that role's bullets, can be joined into one heading.
- **A posting's metric can be claimed as your own** if the sentence shares words with the posting's sentence.
- **Shorthand like `45m` reads as 45 million.** Write out minutes.
- **Synonyms fail.** If the MCD says PostgreSQL and the resume says Postgres, it fails. The fix is to add the term to your MCD if it's true.
- **Prose isn't parsed for names.** An employer mentioned only in the summary paragraph isn't checked.

Treat a PASS as "nothing was invented," not "every sentence is accurate," and still read the output.

### Plain-Text Export

Some applicant tracking systems read plain text more reliably than a PDF, and many application forms want resume text pasted into a box. The export turns a generated `.tex` into clean text with standard section headings, one line per role, and dash bullets:

```bash
bun tools/export-text.ts output/Resume-Your_Name-Company-Role.tex
```

It writes `output/Resume-Your_Name-Company-Role.txt` (pass a second argument to choose the path). It also handles cover letters. The `.tex` stays the source of truth. The export is derived from it, so run the validator on the `.txt` too if you edit it by hand.

### Build or Update Your Career Document

The `career-doc-builder` agent guides you through creating a comprehensive Master Career Document via interactive interview:

```
Help me build my career document
```

It can also enrich an existing MCD:

```
Review my career document for gaps
```

```
Update my MCD with my new role
```

#### How the Career Document Builder Works

The agent runs a multi-phase interview that builds your career document section by section:

1. **Intake**: Feed it existing resumes, LinkedIn exports, or any career materials you have. It extracts roles, skills, metrics, and dates as a baseline. Starting from scratch is fine too.
2. **Identity & Positioning**: Establishes your target titles, value proposition, and writes 2-4 genuinely different professional summary angles.
3. **Skills Inventory**: Walks through skill categories relevant to your field, suggests gaps, and separates current skills from legacy ones.
4. **Work Experience**: The core of the interview. Goes role by role (most recent first), probing for metrics, suggesting common responsibilities you may have missed, and offering agent notes where context matters.
5. **Supporting Sections**: Education, certifications, publications, compliance expertise, volunteer work, and positioning guidance.
6. **Synthesis**: Revises your summaries with the full career context, curates a highlight reel of your strongest metrics, and delivers the final document.

The output is a single Markdown file with 18 structured sections. The interview typically takes 30-60 minutes depending on career complexity and how much existing material you provide. Once complete, you reuse this document every time you generate a resume, with no re-interviewing.

## Project Structure

```
ats-resume-agent/
|-- README.md                 # This file
|-- CHANGELOG.md              # Release notes
|-- CONTRIBUTING.md           # How to contribute
|-- LICENSE                   # MIT
|-- CLAUDE.md                 # Instructions for Claude Code (you don't need to edit this)
|-- setup.sh                  # Dependency checker and installer
|-- package.json              # Bun scripts: validate, export, test
|-- agents/                   # Same agents, in the plugin layout (kept identical by CI)
|-- .claude-plugin/
|   |-- plugin.json           # Plugin manifest (name, version, metadata)
|   `-- marketplace.json      # Lets /plugin marketplace add install from this repo
|-- .github/
|   |-- ISSUE_TEMPLATE/       # Bug report and LaTeX error forms
|   `-- workflows/ci.yml      # Validator tests, LaTeX build, plugin install check
|-- .gitignore                # Excludes output files and personal documents
|-- .claude/
|   `-- agents/
|       |-- ats-resume-writer.md   # Resume/cover letter generation agent
|       `-- career-doc-builder.md  # Interactive career document builder agent
|-- images/                        # Screenshots for README
|-- tools/
|   |-- validate.ts                # Zero-fabrication validator
|   |-- latex.ts                   # Shared LaTeX parsing helpers
|   |-- export-text.ts             # Plain-text export for ATS portals
|   `-- *.test.ts                  # Tests (bun test)
|-- templates/
|   |-- resume-template.tex        # LaTeX resume template (CC-BY-4)
|   |-- LICENSE-CC-BY-4.0.md       # License notice for the resume template
|   `-- cover-letter-template.tex  # LaTeX cover letter template
|-- examples/
|   |-- Master_Career_Document.md  # Example career doc with fake data
|   |-- Job_Description-Example_Corp-Senior_Engineer.md  # Example JD
|   `-- sample-output/
|       |-- Resume-Alex_Morgan-Example_Corp-Senior_Engineer.tex  # Example generated resume
|       |-- CoverLetter-Alex_Morgan-Example_Corp-Senior_Engineer.tex  # Example cover letter
|       |-- resume-preview.pdf     # Blank resume template, rendered
|       `-- cover-letter-preview.pdf  # Blank cover letter template, rendered
`-- output/                        # Generated resumes go here (gitignored)
```

## Master Career Document Format

The `career-doc-builder` agent produces a comprehensive 18-section MCD. You can also create one manually; the resume writer agent handles both formats. Key sections:

| Section | Purpose |
|---------|---------|
| **Contact Information** | Name, phone, email, LinkedIn, GitHub |
| **Professional Identity & Positioning** | Target titles and core value proposition |
| **Professional Summaries** | 2-4 different summary angles for different role types |
| **Hybrid Strengths** | Cross-domain strengths (section name adapts to your field) |
| **Core Competencies & Technical Skills** | Categorized skill lists with sub-categories |
| **Industries Supported** | Industries served across your career |
| **Work Experience** | Detailed roles with metrics and agent notes |
| **Education & Training** | Degrees, courses, certifications, lab environments |
| **Key Achievements & Metrics** | Curated highlight reel of strongest outcomes |
| **Leadership & Soft Skills** | Leadership style, values, professional attributes |
| **Notes for Resume Customization** | Positioning angles and metrics guidance by role type |
| **Legacy & Historical Platforms** | Outdated skills to exclude from resumes |

See `examples/Master_Career_Document.md` for the full 18-section structure with all available sections.

### Agent Notes

You can embed instructions for the agent directly in your career document:

```markdown
> **Agent Note:** This project was collaborative; do not attribute sole ownership.
```

The agent treats these as binding instructions and will respect them when generating content.

### Legacy Section

Any content under a "Legacy & Historical Platforms" heading is automatically excluded from all generated resumes, and the validator never counts it as a source. Titles like "Legacy Skills" or "Deprecated Skills" work the same way. Use this for outdated skills you want to keep on record but never include in applications.

## Key Design Decisions

**LaTeX over Word/PDF:** LaTeX produces consistent, professional formatting and is ATS-compatible through Unicode glyph mapping (`\pdfgentounicode=1`). The PDF output is machine-readable by ATS systems despite custom fonts and styling.

**Keyword-first content selection:** The agent builds a keyword map from each job description and prioritizes matching content from your career document. Skills sections list job-description keywords first within each category.

**One source of truth:** All content comes from the Master Career Document. The agent never asks you for information during generation. It reads the files and produces output.

**Checked, not trusted:** The prompt tells the agent not to fabricate, and the validator checks that it didn't. CI runs the validator tests, builds every template and example with `pdflatex`, and installs the plugin on every push.

## Customization

### Adjusting the Visual Design

The LaTeX templates in `templates/` control the visual design:

- **Colors:** Edit the `\definecolor` lines in `templates/resume-template.tex`
  ```latex
  \definecolor{accentTitle}{HTML}{0e6e55}  % Name and section text
  \definecolor{accentText}{HTML}{0e6e55}   % Section headings
  \definecolor{accentLine}{HTML}{a16f0b}   % Horizontal rules
  ```
- **Fonts:** Uncomment one of the sans-serif options or keep the default serif (Garamond + Charter)
- **Margins:** Adjust the `\addtolength` values
- **Bullet style:** Change `\renewcommand\labelitemi{--}` to use a different bullet character

### Adjusting Content Strategy

The agent's content selection strategy, quality standards, and action verb lists are all defined in `.claude/agents/ats-resume-writer.md`. You can modify these to match your preferences. For example, changing the recency bias from 5-7 years to 10 years, or adjusting the page limit. If you plan to contribute the change, copy the file to `agents/` too; the plugin loads that copy, and CI checks the two match.

### Cover Letter Tone

Edit the cover letter standards section in the agent definition to adjust tone, structure, or length preferences.

### Model Settings

Both agents default to Sonnet (`model: sonnet` in each agent file's frontmatter). You can pick a different model in any of these ways, from most specific to least:

- **Per request:** name the model when you ask, such as "use the ats-resume-writer agent on Opus for the Example Corp file." A model named in the request wins over the other two settings below.
- **Per agent:** change the `model:` line at the top of `.claude/agents/ats-resume-writer.md` or `.claude/agents/career-doc-builder.md`. It takes an alias (`sonnet`, `opus`, `haiku`), a full model ID, or `inherit` to use whatever model your main session runs.
- **For every subagent:** set `CLAUDE_CODE_SUBAGENT_MODEL` (for example, to `opus`) in your environment or in the `env` block of your Claude Code settings. It applies to agents with no `model:` line. Adding `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` makes it win over everything: the `model:` lines are ignored, and a model named per request is too.

These work the same for a plugin install, whose agent files keep the `model: sonnet` line. With a plugin, though, the agent files live in Claude Code's plugin cache and are replaced on every update, so choose per request or with the environment variable rather than editing them. See [choosing a subagent's model](https://code.claude.com/docs/en/sub-agents).

#### How models compare on this workflow

On 2026-09-27, each model got the resume writer's instructions plus the example MCD and job description, with no sample output available to copy, and wrote the Example Corp resume twice. The validator scored each run:

| Model | Runs passing | What failed |
|-------|--------------|-------------|
| Sonnet | 2 of 2 | nothing |
| Opus | 2 of 2 | nothing |
| Haiku | 0 of 2 | Kafka and "Event-Driven Architecture" added from the job description (1 run); unescaped `%` signs (both runs) |

The failures are the ones the validator exists to catch. One Haiku run added Kafka, which appears only in the job description's tech stack. Both Haiku runs wrote `34%` instead of `34\%`, which silently cuts the rest of the line out of the PDF. Two runs per model is a small sample, so treat this as a smoke test rather than a benchmark. It is still enough to keep Haiku off the resume writer. Opus did no better than Sonnet on these checks and costs more, so Sonnet stays the default. Either way, always run the validator.

If you find the agents occasionally deviating from instructions (adding unsolicited content, ignoring agent notes), start a fresh session to avoid context pollution from previous conversations. Running plain `claude` always starts a new session (only `--continue` or `--resume` pick up an old one), and `/clear` wipes the context inside a session that is already open.

## License

This project is licensed under the [MIT License](LICENSE).

The LaTeX resume template (`templates/resume-template.tex`) is adapted from [MTecknology/latex-resume](https://github.com/MTecknology/latex-resume) by [Michael Lustfield](https://github.com/mtecknology), modified for this project, and licensed under [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/legalcode.txt). See [templates/LICENSE-CC-BY-4.0.md](templates/LICENSE-CC-BY-4.0.md).

## Acknowledgments

- Resume LaTeX template adapted from [MTecknology/latex-resume](https://github.com/MTecknology/latex-resume) by [Michael Lustfield](https://github.com/mtecknology) (CC-BY-4.0)
- Built for use with [Claude Code](https://code.claude.com/docs) by Anthropic
