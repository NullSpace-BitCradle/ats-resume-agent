# Resume & Cover Letter Workflow

## Standard Process

When asked to generate a resume, cover letter, or both:

1. Use the **ats-resume-writer** agent for all resume and cover letter generation
2. Resume template: `templates/resume-template.tex`
3. Cover letter template: `templates/cover-letter-template.tex`
4. Source of truth for all content: the candidate's `Master_Career_Document.md`, in the project root or in their folder under `candidates/`
5. Job description files follow the pattern: `Job_Description-[Company]-[Role].md`. With no job description, the agent writes a general resume aimed at the MCD's target titles

After generating each `.tex` file:
- Compile to PDF with `pdflatex -interaction=nonstopmode -halt-on-error`, twice for proper cross-references. Without those flags `pdflatex` waits for input at the first error and the run hangs
- Clean up all auxiliary files (`.aux`, `.log`, `.out`, `.toc`, `.fls`, `.fdb_latexmk`, etc.)
- Keep only the `.tex` source, the final `.pdf`, and the `.txt` export
- Run `bun tools/validate.ts <resume.tex> Master_Career_Document.md`. For a cover letter, add the job description file as a third argument. If it reports an unsupported claim, remove or correct that claim in the generated file, recompile, and run it again until it passes. Never add anything to the Master Career Document to make it pass
- Once the validator passes, run `bun tools/export-text.ts <file.tex>` to write the plain-text export
- If Bun is not installed, the last two steps cannot run: say `VALIDATOR NOT RUN` in the final message, so nobody mistakes the resume for a checked one

## Output Naming Convention

- Resume: `output/Resume-[Name]-[Company]-[Role].tex` / `.pdf`
- General resume (no job description): `output/Resume-[Name]-General.tex` / `.pdf`
- Cover Letter: `output/CoverLetter-[Name]-[Company]-[Role].tex` / `.pdf`

For a candidate with a folder, `output/` is `candidates/<name>/output/`.

## Working for Someone Else

`candidates/<name>/` holds one person's `Master_Career_Document.md`, their job descriptions, and their `output/`. Use it when running this on another person's behalf, so their files never mix with yours. `candidates/` and `inputs/` (for source resumes) are gitignored, as are `.doc`, `.docx`, `.pages`, `.odt`, and `.rtf` files in the project root.

## Hard Constraints

- **Only use information explicitly present in the candidate's Master Career Document**
- Do not infer, embellish, fabricate, or generalize beyond what is stated in the master document
- Do not add skills, experiences, metrics, or claims not directly supported by the source document

## Usage

1. Place your `Master_Career_Document.md` in the project root (see `examples/` for format)
2. Drop a job description file in the project root, or skip it for a general resume
3. Say something like:

> "Resume and cover letter for the [Company] file"

> "General resume from my career document"

Claude will handle the rest using the above process.

## Master Career Document Builder

When asked to build, create, compile, or update a Master Career Document, use the **career-doc-builder** agent. It interviews the candidate to create or enrich their MCD, reads old resumes (`.docx`, `.doc`, `.odt`, `.rtf`, and `.pages` through `bun tools/ingest.ts`), and in compile mode builds an unconfirmed MCD from documents alone when the candidate is not there to interview.

Usage examples:
- "Help me build my career document"
- "I need to create my master career document from my old resumes"
- "Update my MCD with my new role"
- "Review my career document for gaps"
- "Compile a career document for riley from the files in inputs/; they aren't here"
