# Resume & Cover Letter Workflow

## Standard Process

When asked to generate a resume, cover letter, or both for a job posting:

1. Use the **ats-resume-writer** agent for all resume and cover letter generation
2. Resume template: `templates/resume-template.tex`
3. Cover letter template: `templates/cover-letter-template.tex`
4. Source of truth for all content: Your `Master_Career_Document.md` in the project root
5. Job description files follow the pattern: `Job_Description-[Company]-[Role].md`

After generating each `.tex` file:
- Compile to PDF using `pdflatex` (run twice for proper cross-references)
- Clean up all auxiliary files (`.aux`, `.log`, `.out`, `.toc`, `.fls`, `.fdb_latexmk`, etc.)
- Keep only the `.tex` source and the final `.pdf`

## Output Naming Convention

- Resume: `output/Resume-[YourName]-[Company]-[Role].tex` / `.pdf`
- Cover Letter: `output/CoverLetter-[YourName]-[Company]-[Role].tex` / `.pdf`

## Hard Constraints

- **Only use information explicitly present in your Master Career Document**
- Do not infer, embellish, fabricate, or generalize beyond what is stated in the master document
- Do not add skills, experiences, metrics, or claims not directly supported by the source document

## Usage

1. Place your `Master_Career_Document.md` in the project root (see `examples/` for format)
2. Drop a job description file in the project root
3. Say something like:

> "Resume and cover letter for the [Company] file"

Claude will handle the rest using the above process.

## Master Career Document Builder

When asked to build, create, or update a Master Career Document, use the **career-doc-builder** agent. This agent guides users through an interactive interview process to create or enrich their MCD.

Usage examples:
- "Help me build my career document"
- "I need to create my master career document from my old resumes"
- "Update my MCD with my new role"
- "Review my career document for gaps"
