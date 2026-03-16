# Changelog

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

## v1.0.0 -- Initial Release

- ATS-optimized resume generation from Master Career Document
- Cover letter generation tailored to job descriptions
- LaTeX templates with ATS-compatible Unicode glyph mapping
- Zero-fabrication policy enforced in agent definition
- Example career document and job description included
- Sample output PDFs for preview
