# Contributing

Thanks for your interest in contributing to ats-resume-agent.

## Reporting Issues

- **LaTeX compilation errors:** Include your OS, TeX Live version (`pdflatex --version`), and the full error output.
- **Agent behavior issues:** Describe what you asked Claude to do, what happened, and what you expected.

## Pull Requests

1. Open an issue first to discuss the change
2. Fork the repo and create a branch from `master`
3. Keep changes focused -- one feature or fix per PR
4. Test that both templates compile with `pdflatex`

## What's in Scope

- Bug fixes and template improvements
- Documentation clarifications
- New LaTeX template variants
- Agent definition improvements

## What's Out of Scope

- Adding non-LaTeX output formats (Word, plain text) -- this is a LaTeX-first project by design
- Removing the zero-fabrication constraint -- this is a core design principle
