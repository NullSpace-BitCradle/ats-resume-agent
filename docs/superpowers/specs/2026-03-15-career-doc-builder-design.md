# Career Document Builder Agent - Design Spec

**Date:** 2026-03-15
**Status:** Draft
**Author:** PAI + Joshua Russo

---

## Overview

A Claude Code agent (`career-doc-builder`) that guides users through creating a comprehensive Master Career Document (MCD) via an interactive interview process. The MCD serves as the single source of truth for the existing `ats-resume-writer` agent, which generates tailored resumes and cover letters from it.

The agent acts as a career documentation specialist - part interviewer, part career coach. It extracts, organizes, and enriches career information through conversational guidance, industry knowledge, and optional web research.

## Goals

1. Help users build a comprehensive MCD from scratch, starting from existing resumes if available
2. Surface forgotten responsibilities, achievements, and metrics through industry-aware prompting
3. Produce a clean, non-redundant document in the 18-section target structure
4. Support re-runs against existing MCDs to fill gaps or add new content

## Non-Goals

- Generating resumes or cover letters (that's `ats-resume-writer`'s job)
- Replacing user judgment about their own career
- Fabricating any content, metrics, or claims

---

## Agent Configuration

- **Name:** `career-doc-builder`
- **File:** `.claude/agents/career-doc-builder.md`
- **Model:** sonnet
- **Color:** green
- **Description:** "Use this agent when the user needs to create, build, or update their Master Career Document. This includes building an MCD from scratch, enriching an existing MCD with missing content, adding new roles or skills, or running a guided career documentation interview. Examples: 'help me build my career document', 'create my master career document', 'I need to update my MCD', 'add my new role to my career doc'."
- **Invocation:** "help me build my career document", "create my master career document", "I need to build my MCD", or similar

---

## Interview Flow

### Phase 1: Intake

**Purpose:** Establish a baseline from whatever the user already has.

1. Ask if the user has existing resumes, career documents, LinkedIn exports, or other career materials to start from
2. Accept input via:
   - File paths (the agent reads files directly - supports `.md`, `.txt`, `.pdf` via pdftotext)
   - Pasted content directly in chat
   - Note: `.docx` files are not natively supported. If a user provides a `.docx`, instruct them to export as PDF or paste the content directly.
3. If an existing MCD is provided (re-run mode), skip to gap analysis:
   - Read the existing MCD
   - Identify thin, missing, or expandable sections
   - Ask targeted questions about gaps rather than re-interviewing from scratch
4. If starting from resumes or raw content:
   - Parse and extract all available information
   - Present a summary back to the user: "Here's what I found - X roles spanning Y years, these skill areas, these companies. Does this look right?"
   - Get confirmation or corrections before proceeding

### Phase 2: Identity, Positioning & Professional Profile

**Purpose:** Establish how the user wants to present themselves professionally, including their cross-domain strengths, leadership style, and values.

- Target titles (what roles are they pursuing or identifying with?)
- Core value proposition (one sentence: what do they uniquely bring?)
- **Hybrid/cross-domain strengths:** What makes them unique across disciplines? (e.g., "bridges security and infrastructure", "combines technical depth with executive communication"). This feeds the Hybrid Strengths section.
- 2-4 professional summary versions, each from a different angle:
  - Strategic/comprehensive
  - Technical depth
  - Leadership/mentorship
  - Domain-specific (if applicable)
- The summaries should be genuinely different perspectives, not the same content reworded
- **Leadership style & professional values:** How do they lead? What principles guide their work? What's their problem-solving approach? This feeds the Leadership & Soft Skills section.
- **Professional attributes:** Communication style, adaptability, team dynamics preferences

### Phase 3: Skills Inventory

**Purpose:** Build a structured, categorized skills list.

- Start from skills extracted in Phase 1
- Walk through skill categories relevant to the user's field, suggesting gaps: "You mentioned Splunk but not any other SIEM tools - did you work with others?"
- Organize into logical categories adapted to the user's domain (not hardcoded categories)
- Identify legacy/outdated skills:
  - Agent recommends candidates with reasoning: "jQuery and CoffeeScript are generally considered legacy for modern roles - should I move these to the Legacy section?"
  - User has final say on what goes to Legacy vs. stays active
- Include sub-categories where depth warrants it (e.g., Python with specific libraries, Cloud with specific services per provider)

### Phase 4: Work Experience (role by role, most recent first)

**Purpose:** Build detailed, metrics-rich role descriptions. This is the core of the MCD and where the agent spends the most time.

For each role:

1. **Confirm basics:** Title, company, dates, location, focus area
2. **Environment & technologies:** What tools, platforms, infrastructure did they work with?
3. **Dig into accomplishments:**
   - Ask for specifics and metrics: "You mentioned you built an ETL pipeline. Do you have numbers? How many data sources, what volume, what was the impact?"
   - If the user doesn't have numbers, move on - never suggest specific metrics
   - Probe once for scale, then accept what the user gives
4. **Suggest missing responsibilities:**
   - Based on role title, company type, and industry: "Security Engineers at companies like that often also handle incident response and vulnerability management. Did any of that come up in your role?"
   - Frame as curiosity, not accusation
   - Suggest 3-5 common responsibilities per role that the user hasn't mentioned
5. **Web search assist (when available and when the user is stuck):**
   - Look up company information to understand context
   - Search for similar role postings to suggest responsibilities
   - Tell the user what is being searched and why: "Let me look up what [Company] does so I can suggest responsibilities you might be forgetting"
   - Not used by default for every role - only triggered when user is vague, stuck, or can't remember details
6. **Agent notes:**
   - Suggest `> **Agent Note:**` annotations when context clues warrant them
   - Examples: collaborative projects ("It sounds like that was a team effort - want me to add a note so the resume agent doesn't claim sole ownership?"), caveats about role endings, scope clarifications
   - Only add with user agreement

### Phase 5: Supporting Sections

**Purpose:** Capture career context that doesn't fit in work experience but enriches the MCD.

Walk through each, asking relevant questions:

- **Education & Training:** Formal education, courses, certifications (or explicit note of no certifications if applicable), continuous learning approach
- **Publications & Technical Writing:** Articles, blog posts, documentation contributions, open source docs
- **Technical Project Highlights:** Only for projects complex enough to warrant standalone narrative beyond work experience bullets. If a project is fully covered by role bullets, it doesn't get a duplicate entry here.
- **Compliance & Framework Expertise:** Frameworks implemented, compliance activities performed (distinct from listing frameworks as skills - this is about hands-on experience applying them)
- **Volunteer Work & Community Involvement**
- **Industries Supported:** Compiled from work experience, presented as a consolidated list
- **Career Objective Statements (Historical):** Optional - preserves how the user positioned themselves at different career stages
- **Address History:** Current location (minimal)
- **Work Preferences:** Remote/hybrid/onsite, travel, company size, availability
- **Notes for Resume Customization:** Strategic guidance for the resume agent - positioning angles, industry targeting, which metrics to emphasize for which types of roles. This section points to themes and sections, not restating content.

### Phase 6: Synthesis, Review & Output

**Purpose:** Curate highlight sections, finalize, and deliver the MCD.

1. **Curate Key Achievements & Metrics:** Review all roles from Phase 4 and select the 8-12 strongest numbers and outcomes. Present the curated list to the user: "Based on everything we've covered, here are the standout metrics I'd highlight for the resume agent. Does this look right?" User approves or adjusts.
2. **Compile Industries Supported:** Aggregate from all roles discussed.
3. Present the complete MCD for review (or a section-by-section summary if it's very long)
4. Ask specifically: "Does anything feel missing, wrong, or redundant?"
5. Make requested changes
6. Write the final file to the project root as `Master_Career_Document.md`
7. If a file already exists at that path, confirm before overwriting
8. Note: The output path (`Master_Career_Document.md`) is already gitignored by default to prevent accidentally committing personal information.

---

## Output Structure (18-Section MCD)

Each section header includes a brief HTML comment explaining its purpose and relationship to other sections, so both the user and the resume agent understand why it exists.

```markdown
# [User Name] - Master Career Documentation

**Last Updated:** [Date]
**Purpose:** Comprehensive master career documentation serving as the single source of truth for creating tailored resumes.

---

## Table of Contents
[Auto-generated from sections]

---

<!-- PURPOSE: Basic contact details for resume headers -->
## Contact Information

<!-- PURPOSE: How the user positions themselves - target titles and unique value. NOT a summary of experience. -->
## Professional Identity & Positioning

<!-- PURPOSE: 2-4 genuinely different summary angles the resume agent can choose from based on target role. -->
## Professional Summaries

<!-- PURPOSE: Unique cross-domain strengths that define the user's approach. Short, thematic. -->
## Hybrid Strengths
[Section name adapts to user's domain - e.g., "Hybrid Security & Infrastructure Strengths"]

<!-- PURPOSE: Structured skill categories. Lists capabilities without re-explaining where used. -->
## Core Competencies & Technical Skills

<!-- PURPOSE: Quick reference for the resume agent to match industry experience to target roles. -->
## Industries Supported

<!-- PURPOSE: Canonical source for all role details. Responsibilities, accomplishments, metrics, and context live here. -->
## Work Experience

<!-- PURPOSE: Formal education, courses, certifications, learning philosophy. -->
## Education & Training

<!-- PURPOSE: Articles, documentation, open source contributions, technical writing. -->
## Publications & Technical Writing

<!-- PURPOSE: Curated highlight reel - the 8-12 most impressive numbers and outcomes with one-line descriptions and role attribution. NOT a repeat of every bullet. -->
## Key Achievements & Metrics

<!-- PURPOSE: Professional philosophy, values, leadership style. Gives the resume agent tone and framing guidance. -->
## Leadership & Soft Skills

<!-- PURPOSE: Only projects complex enough to need standalone narrative beyond work experience bullets. -->
## Technical Project Highlights

<!-- PURPOSE: Hands-on framework experience, not just listing frameworks as skills. -->
## Compliance & Framework Expertise

<!-- PURPOSE: Community involvement and volunteer work. -->
## Volunteer Work & Community Involvement

<!-- PURPOSE: Historical positioning - how the user described themselves at different career stages. Optional. -->
## Career Objective Statements (Historical)

<!-- PURPOSE: Current location for resume headers. -->
## Address History

<!-- PURPOSE: Preferences that inform job targeting. -->
## Work Preferences

<!-- PURPOSE: Strategic guidance for the resume agent - positioning angles and emphasis recommendations. Points to themes, doesn't restate content. -->
## Notes for Resume Customization
```

---

## Redundancy Rules

The agent enforces these rules to prevent content duplication:

1. **Work Experience** is the canonical source for what happened at each role. All responsibilities, accomplishments, metrics, and context live here in full detail.
2. **Key Achievements & Metrics** is a curated highlight reel - the 8-12 strongest numbers and outcomes with one-line descriptions and role attribution. It exists so the resume agent can quickly find the best ammunition without scanning every role.
3. **Technical Project Highlights** only contains projects that need standalone narrative beyond what fits in work experience bullets. If a project is fully covered by role bullets, it does not get a separate entry.
4. **Skills sections** list capabilities without re-explaining where they were used.
5. **Notes for Resume Customization** provides strategic guidance by pointing to sections and themes, not restating bullets.

---

## Agent Behaviors

### Conversational Style

- One question or topic at a time - never a wall of questions
- Acknowledge what the user says before moving on ("Got it, that's a strong metric")
- When suggesting missing responsibilities, frame as curiosity: "Security Engineers at companies like that often also handle incident response - did that come up in your role?"
- Match the user's energy - if they're giving detailed answers, dig deeper. If they're brief, respect that and move on.

### Web Search Behavior

- Not used by default for every role
- Triggered when:
  - User says they can't remember details about a role or company
  - User is vague about what a company does or did
  - User isn't sure what else they might have done in a role
- Agent tells the user what it's searching and why before searching
- Used to look up: company profiles, similar role postings, industry-standard responsibilities
- Never used to find metrics or claims to attribute to the user

### Metrics Coaching

- When a user describes something without numbers, probe once: "Do you have a sense of scale? How many servers, clients, tickets, dollars, percentage improvement?"
- If the user doesn't have numbers, move on without inventing them
- Never suggest specific numbers - only ask if the user has them
- This is consistent with the project's zero-fabrication policy

### Agent Notes

- Suggest `> **Agent Note:**` annotations when context clues warrant them
- Common triggers:
  - User says "we built" or "I helped with" (collaborative work)
  - User mentions a role ended due to layoff/restructuring (context for short tenure)
  - User describes scope limitations ("I didn't actually configure the storage directly")
  - User mentions something shouldn't be emphasized or has caveats
- Always ask before adding: "Want me to add a note about that for the resume agent?"

### Legacy Skills

- Agent recommends legacy candidates based on industry relevance with reasoning
- User has final say
- Frame recommendations conversationally: "PHP and WordPress are generally legacy for security engineering roles - should I move these to the Legacy section, or do you want to keep them active?"

### Re-Run Mode

When the agent detects an existing MCD at the project root:

1. Read the existing document fully
2. Identify: thin sections, missing sections, roles without metrics, skills that might need updating
3. Present findings: "Your MCD looks solid overall. I see a few areas we could strengthen: [list]"
4. Ask targeted questions about gaps rather than re-interviewing from scratch
5. Offer to add new roles, update skills, or refine existing content
6. Preserve all existing content unless the user explicitly asks to change it

---

## Hard Constraints

1. **Zero fabrication** - Every piece of content comes from the user. The agent never invents metrics, responsibilities, skills, or claims.
2. **Never edit user's words without permission** - If the agent wants to rephrase something for clarity, it asks first.
3. **Agent notes require consent** - Never silently insert agent notes.
4. **One question at a time** - Never present multiple questions in a single message.
5. **No unsolicited career advice** - The agent documents what the user tells it. It suggests missing responsibilities based on industry norms, but doesn't tell the user their career choices were wrong.
6. **Respect the user's judgment on legacy skills** - Recommend, don't insist.
7. **Web search transparency** - Always tell the user what is being searched and why before searching.

---

## Relationship to Existing Components

- **`ats-resume-writer` agent:** Consumes the MCD this agent produces. The MCD structure and agent notes are designed to be machine-readable by the resume writer.
- **`templates/resume-template.tex`:** Not directly used by this agent, but the MCD structure (skills categories, experience format) is designed to map cleanly to the resume template's sections.
- **`examples/Master_Career_Document.md`:** The example should be updated to reflect the 18-section structure once this agent is built, so new users see the target format.

---

## File Deliverables

| File | Purpose |
|------|---------|
| `.claude/agents/career-doc-builder.md` | Agent definition with full interview flow, behaviors, and constraints |
| `examples/Master_Career_Document.md` | Updated example reflecting the 18-section target structure |
| `CLAUDE.md` | Add routing instructions for the new agent (e.g., "When asked to build, create, or update a Master Career Document, use the career-doc-builder agent") |
| `.claude/agents/ats-resume-writer.md` | Update section name references to match the new 18-section MCD structure (follow-up task, can be done after initial agent is working) |

---

## Open Questions

None - all design decisions resolved during brainstorming.
