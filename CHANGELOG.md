# Changelog

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
