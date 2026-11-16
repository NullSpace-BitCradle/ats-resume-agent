# Changelog

## v1.3.2: Write the resume with the file tool

- Resume writer: write the `.tex` with the Write or Edit tool, never a shell heredoc, `echo`, or `printf`. In 3 of 4 real runs on 2026-11-16, a heredoc turned every `\\` row ending into `\` and the compile failed until the agent noticed

## v1.3.1: Word on Windows, and fixes from real agent runs

- New: on Windows, the ingest tool reads `.doc` files through an installed copy of Word (opened hidden and read-only) when LibreOffice and antiword are missing. A UTF-8 byte order mark from any converter is dropped
- Fixed: in compile mode, the career-doc-builder dropped a gap's reason and the candidate's target roles even when the candidate had written them in their own documents. What the candidate wrote now counts as their word: the break is recorded in their wording (leaving out health details and other people's), the target roles go under Professional Identity & Positioning, and both are listed for confirmation
- Compile mode now says which sections to leave out, that Key Achievements lists every number however few, that an employer's name is not an industry, and the order of the title, open questions, and status line
- Resume writer: the education heading carries the graduation date, a Projects section is allowed when the MCD has fitting projects, certifications keep the MCD's form, months follow the MCD, a short summary is never padded, and a page that runs over loses the least relevant bullets first
- README: the pandoc entry for `.doc` was wrong (pandoc cannot read `.doc`) and is gone; the model comparison notes the 2026-11-16 runs of the v1.3.0 agents

## v1.3.0: Rewritten resume writer, careers outside tech, Windows

Changes from a review of how the agents serve candidates outside tech, with older careers, career breaks, and old resumes in office formats:

- Fixed: the resume writer measured "the last 5 to 7 years" and the 15-year cutoff from today, so after a career break it could cut most of an older career. Recency is now measured from the end of the most recent role, a role between two kept roles is never dropped (that would open a gap the MCD doesn't have), a career break is never a reason to drop earlier roles, and the MCD's Notes for Resume Customization can override all of it
- New career-break convention: a `### Career Break -- <reason>` entry under Work Experience with dates, optional bullets, and an optional Agent Note. The builder asks once, gently, about gaps over 6 months, the reason is the candidate's wording, and health details stay out unless they ask. The writer shows the break as its own entry. A validator test confirms a break heading passes with the MCD entry and fails without it
- Fixed: the plain-text export dropped any contact item that wasn't a link, so a location in the resume header vanished from the `.txt`. The resume template and the writer's LaTeX contract now have a location slot
- Fixed: the validator counted guidance as evidence. Target titles (Professional Identity & Positioning), Work Preferences, and Notes for Resume Customization say what the candidate wants, not what happened, so a target title could pass as a job title held and a note like "leave out roles older than 15 years" could back "15 years of experience". Those sections no longer count as sources; the writer still reads them for direction
- Fixed: the resume template used the default OT1 font encoding, which has no `|` glyph, so the header's `|` separators printed and reached ATS text as em dashes. It now loads `\usepackage[T1]{fontenc}`, and CI checks the compiled example's text layer. List bullets stay en dashes by design (`\labelitemi{--}`)
- New validator check: each skills-table row must end with `\\` and have one unescaped `&`. A lost `\\` used to surface as misleading merged skill tokens; it is now a `latex` finding on the row that lost it, and each row's skills are still checked on their own
- Windows: the README has a native MiKTeX section (install missing packages "Always", or a preinstall list; `sudo` and `tlmgr` don't apply), `setup.sh` knows about MiKTeX, the writer compiles with `-interaction=nonstopmode -halt-on-error` so an error can't leave `pdflatex` waiting for input, and the LaTeX issue form lists native Windows
- New `tools/ingest.ts` turns `.docx`, `.odt`, `.rtf`, and `.pages` into text with no other software, and `.doc` through LibreOffice, pandoc, macOS `textutil`, `antiword`, or `catdoc`, whichever is installed. When nothing can read a file, it asks for a PDF export. The career document builder uses it. The `.pages` reader is best effort; it was checked against real iWork files from a public test corpus, not yet against a Pages resume
- New builder compile mode: builds an MCD from documents alone when the candidate isn't there to interview. Facts only, conflicts and unknowns in an "Open questions" HTML comment, marked compiled and unconfirmed, with an Agent Note that it holds nothing the sources lacked
- New general resume: with no job description, the writer targets the MCD's target titles and Notes for Resume Customization and saves `Resume-<Name>-General.tex`
- New per-candidate workspaces: `candidates/<name>/` holds one person's MCD, job descriptions, and output, for running this on someone else's behalf. `candidates/`, `inputs/`, and office documents in the project root are gitignored. The root-level flow is unchanged
- `setup.sh` checks for Bun and offers to install it. Without Bun the writer now says `VALIDATOR NOT RUN` in its final message instead of quietly skipping the check
- The builder works for any field: neutral example prompts, and publications, project highlights, and compliance expertise appear only when the field has them. The MCD has up to 19 sections (18, plus Legacy & Historical Platforms); the docs said 18
- CI pins Bun 1.4.4 and fails when `agents/`, `tools/`, or `templates/` changed since the last tag without a new `plugin.json` version. It keeps `claude plugin validate` without `--strict`, because the root CLAUDE.md that clone users need always draws a warning
- Fixed: the validator missed every Master Career Document heading when the file had Windows (CRLF) line endings, so content under Legacy & Historical Platforms passed as if it were current, and `%` comments in a CRLF `.tex` were not stripped. The validator and the plain-text export now normalize line endings, `.gitattributes` keeps checkouts LF, and CI runs the validator tests on Windows too. If you validated on Windows before this release, run the validator again missed every Master Career Document heading when the file had Windows (CRLF) line endings, so content under Legacy & Historical Platforms passed as if it were current, and `%` comments in a CRLF `.tex` were not stripped. The validator and the plain-text export now normalize line endings, `.gitattributes` keeps checkouts LF, and CI runs the validator tests on Windows too. If you validated on Windows before this release, run the validator again
- Rewrote the resume writer prompt around its failure modes: the job description selects and emphasizes MCD content but never supplies it, the skills table gets an explicit check, LaTeX special characters must be escaped, and missing packages are reported instead of installed with sudo. The description no longer invites metric invention or asking the user for details. About 40 percent of the original length (118 lines, down from 304; the additions above bring it to 139)
- In the model comparison, Haiku went from 1 of 4 passing runs with the original prompt to 4 of 4 with the new one; Sonnet and Opus passed every run with both. Those runs predate the later v1.3.0 prompt changes listed above
- Docs: the template source is credited, LICENSE stays pure MIT with the template notice beside the template, and "What it cannot prove" names skills written outside the skills table
- Plugin version bumped to 1.3.0, so `/plugin marketplace update` delivers the rewritten writer to installed users

## v1.2.0: Checked zero fabrication, CI, and plugin install

- New zero-fabrication validator (`tools/validate.ts`): checks every number, date, employer, title, degree, certification, and skill in a generated resume against the Master Career Document, and fails loudly on anything it can't back up or can't read. Cover letters can add the job description as a source
- The validator flags unescaped `%` signs, which silently cut text out of the PDF
- New plain-text export (`tools/export-text.ts`) for application forms and ATS portals that read text better than PDF
- CI on every push: validator tests, a `pdflatex` build of every template and example, and a plugin install check
- Installable as a Claude Code plugin: `/plugin marketplace add NullSpace-BitCradle/ats-resume-agent`
- README: current Claude Code install commands and docs links, a real way to start a fresh session, model selection guidance, and a small model comparison
- Added `cm-super` to the LaTeX install instructions; without it the cover letter template fails on Ubuntu and WSL
- Sample resume regenerated from CI output. The previous image listed Kafka, which the example MCD never mentions
- Example resume and cover letter `.tex` sources added under `examples/sample-output/`

The original v1.1.0 is preserved as the `v1.1.0` release and the `v1` branch.

## v1.1.0 -- Career Document Builder & Agent Improvements

- New `career-doc-builder` agent: interactive interview that produces comprehensive 18-section Master Career Documents
- Resume writer now handles both simple and 18-section MCD formats with section name mappings
- Added compile and cleanup instructions to resume writer agent (previously only in CLAUDE.md)
- Resume writer: added preamble protection to prevent template divergence
- Resume writer: added reverse chronological order requirement
- Resume writer: added certification framing guidance for courses vs. earned credentials
- Resume writer: added keyword-MCD traceability requirement
- Resume writer: added cover letter compilation to Step 7
- Resume writer: converted description to YAML block scalar format
- Career-doc-builder: strengthened Phase 6 summary revision requirement
- Career-doc-builder: updated Key Achievements guidance for experienced candidates (up to 15)
- Career-doc-builder: improved Re-Run Mode section count reference
- Updated example MCD to 18-section structure
- Updated README with career-doc-builder documentation
- Added career-doc-builder routing to CLAUDE.md
- Added `setup.sh` dependency checker and installer
- Updated Claude Code install command to official curl installer
- Added "How the Career Document Builder Works" section to README
- Added model settings documentation to README
- Improved README flow and career-doc-builder description (resume/LinkedIn ingestion)
- Resume writer: added Hybrid Strengths section mapping
- Resume writer: removed invalid `\section{Certifications}` from template docs
- Career-doc-builder: added save step to Re-Run Mode

## v1.0.0 -- Initial Release

- ATS-optimized resume generation from Master Career Document
- Cover letter generation tailored to job descriptions
- LaTeX templates with ATS-compatible Unicode glyph mapping
- Zero-fabrication policy enforced in agent definition
- Example career document and job description included
- Sample output PDFs for preview
