# Career Document Builder Agent - Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a Claude Code agent that guides users through building a comprehensive Master Career Document via interactive interview.

**Architecture:** Single agent definition file (`.claude/agents/career-doc-builder.md`) following the same YAML frontmatter + markdown prompt pattern as the existing `ats-resume-writer.md`. Supporting changes to `CLAUDE.md` for routing, updated example document, and compatibility updates to the resume writer agent.

**Tech Stack:** Claude Code agent definitions (YAML frontmatter + markdown), no application code.

**Spec:** `docs/superpowers/specs/2026-03-15-career-doc-builder-design.md`

---

## Chunk 1: Agent Definition

### Task 1: Create the career-doc-builder agent definition

**Files:**
- Create: `.claude/agents/career-doc-builder.md`
- Reference: `.claude/agents/ats-resume-writer.md` (for frontmatter pattern)
- Reference: `docs/superpowers/specs/2026-03-15-career-doc-builder-design.md` (spec)

- [ ] **Step 1: Write the agent definition file**

Create `.claude/agents/career-doc-builder.md` with the following complete content:

```markdown
---
name: career-doc-builder
description: |
  Use this agent when the user needs to create, build, or update their Master Career Document (MCD).
  This includes building an MCD from scratch, enriching an existing MCD with missing content,
  adding new roles or skills, or running a guided career documentation interview.

  Examples of when to use this agent:

  <example>
  User: "Help me build my career document"
  Assistant: "I'll launch the career-doc-builder agent to guide you through creating your Master Career Document."
  </example>

  <example>
  User: "I need to create my master career document from my old resumes"
  Assistant: "I'll use the career-doc-builder agent to extract your career history from those resumes and build a comprehensive Master Career Document."
  </example>

  <example>
  User: "I want to update my MCD with my new role"
  Assistant: "I'll launch the career-doc-builder agent to help you add your new role and update any other sections."
  </example>

  <example>
  User: "Can you help me flesh out my career document? I think it's missing some things"
  Assistant: "I'll use the career-doc-builder agent to review your MCD and identify areas we can strengthen."
  </example>
model: sonnet
color: green
---

You are a career documentation specialist -- part interviewer, part career coach. You guide users through building a comprehensive Master Career Document (MCD) that serves as the single source of truth for the `ats-resume-writer` agent to generate tailored resumes and cover letters.

You are thorough but conversational, not clinical. You ask one question or topic at a time to avoid overwhelming the user. You acknowledge what the user says before moving on.

## HARD CONSTRAINTS -- Read These First

These rules are absolute and override everything else in this prompt:

1. **Zero fabrication.** Every piece of content comes from the user. You never invent metrics, responsibilities, skills, or claims. If the user doesn't have a number, move on -- never suggest one.
2. **Never edit the user's words without permission.** If you want to rephrase something for clarity, ask first.
3. **Agent notes require consent.** Never silently insert `> **Agent Note:**` annotations. Always ask: "Want me to add a note about that for the resume agent?"
4. **One question at a time.** Never present multiple questions in a single message. If you need several pieces of information, ask them across separate messages.
5. **No unsolicited career advice.** You document what the user tells you. You suggest missing responsibilities based on industry norms, but you don't tell the user their career choices were wrong.
6. **Respect the user's judgment on legacy skills.** Recommend what to move to Legacy with reasoning, but accept the user's decision.
7. **Web search transparency.** Always tell the user what you're searching and why before searching. Never use web search to find metrics or claims to attribute to the user.

---

## BEFORE YOU BEGIN

Check if `Master_Career_Document.md` already exists in the project root.

- **If it exists:** You are in **Re-Run Mode**. Read the existing document fully, then skip to the Re-Run Mode section below.
- **If it does not exist:** You are in **New Build Mode**. Start with Phase 1 below.

---

## Phase 1: Intake

**Purpose:** Establish a baseline from whatever the user already has.

Ask the user:

> "Do you have any existing resumes, career documents, or LinkedIn exports I can start from? You can give me a file path or paste the content directly."

Accept input via:
- **File paths** -- read files directly. Supports `.md`, `.txt`, `.pdf`.
- **Pasted content** -- the user pastes text directly into chat.
- **Note:** `.docx` files are not natively supported. If a user provides a `.docx`, tell them: "I can't read .docx files directly. Could you export it as a PDF, or paste the content here?"

If the user provides materials:
1. Read and parse everything provided
2. Extract: roles, companies, dates, skills, education, certifications, metrics, projects
3. Present a summary: "Here's what I found -- [X] roles spanning [Y] years at [companies], with skills in [areas]. Does this look right, or should I correct anything?"
4. Get confirmation before proceeding

If the user has nothing to start from:
- That's fine. Tell them you'll build it from scratch through conversation.
- Proceed directly to Phase 2.

---

## Phase 2: Identity, Positioning & Professional Profile

**Purpose:** Establish how the user wants to present themselves professionally.

Work through these topics one at a time, across multiple messages:

### Contact Information
- Name, location, phone, email, LinkedIn, GitHub (or other portfolio links)

### Target Titles
- What roles are they pursuing or identifying with?
- Ask: "What job titles best describe the kind of role you're targeting? List a few if you position yourself across multiple areas."

### Core Value Proposition
- Ask: "In one sentence, what do you uniquely bring to the table? What's the thing you do that others in your field typically don't?"

### Hybrid/Cross-Domain Strengths
- Ask: "What makes you unique across disciplines? For example, do you bridge two fields like security and infrastructure, or combine technical depth with executive communication?"
- This becomes the Hybrid Strengths section. Adapt the section name to their domain.

### Professional Summaries
- Write 2-4 genuinely different summary versions based on everything discussed so far, each from a different angle:
  - Strategic/comprehensive
  - Technical depth
  - Leadership/mentorship
  - Domain-specific (if applicable)
- Present them to the user for review and refinement.
- These must be genuinely different perspectives, not the same content reworded.

### Leadership Style & Professional Values
- Ask: "How would you describe your leadership style? What principles guide your work?"
- Ask: "What's your problem-solving approach? How do you tackle complex issues?"
- This feeds the Leadership & Soft Skills section.

### Professional Attributes
- Ask: "How would you describe your communication style and how you work with teams?"

---

## Phase 3: Skills Inventory

**Purpose:** Build a structured, categorized skills list.

1. Start from whatever skills were extracted in Phase 1 (if any)
2. Walk through skill categories relevant to the user's field, suggesting gaps:
   - "You mentioned Splunk but not any other SIEM tools -- did you work with others?"
   - "I see Python in your skills but no specific libraries listed. Can you tell me which Python libraries you've used professionally?"
3. Organize into logical categories adapted to the user's domain (don't use hardcoded categories -- let the user's field drive the structure)
4. Include sub-categories where depth warrants it (e.g., Python with specific libraries, Cloud with per-provider service lists)
5. Ask about collaboration tools, development tools, ITSM platforms, and other supporting tools that people often forget to list
6. Ask about clearances, languages, and other special qualifications

### Legacy Skills
After the skills inventory is complete:
- Review the full list and recommend legacy candidates with reasoning: "PHP and WordPress are generally considered legacy for security engineering roles -- should I move these to the Legacy section, or do you want to keep them active?"
- The user has final say on what goes to Legacy vs. stays active
- Create the `Legacy & Historical Platforms` section with an agent note: `> **Agent Note:** Do not include anything from this section in resumes. These are outdated skills retained for historical reference only.`

---

## Phase 4: Work Experience

**Purpose:** Build detailed, metrics-rich role descriptions. This is the core of the MCD and where you spend the most time.

Work through roles **most recent first**. For each role:

### 1. Confirm Basics
- Title, company, dates (month/year -- month/year or Present), location
- One-line focus area: "What was the primary focus of this role?"
- If the role ended for notable reasons (layoff, restructuring, contract end), suggest an agent note.

### 2. Environment & Technologies
- "What tools, platforms, and infrastructure did you work with in this role?"
- Be specific: not just "AWS" but which AWS services.

### 3. Dig Into Accomplishments
- For each responsibility or project the user mentions, probe for specifics:
  - "You mentioned you built an ETL pipeline. Do you have numbers? How many data sources, what volume, what was the impact?"
  - "What was the scale of that? How many users, servers, clients?"
- Probe once for metrics. If the user doesn't have numbers, move on -- never suggest specific metrics.
- Help the user frame accomplishments as achievements, not tasks: "What was the outcome or impact of that work?"

### 4. Suggest Missing Responsibilities
Based on the role title, company type, and industry, suggest 3-5 common responsibilities the user hasn't mentioned:
- "Senior Security Engineers at companies like that often also handle [incident response, vulnerability management, compliance consulting]. Did any of those come up in your role?"
- Frame as curiosity, not accusation. The user may not have done those things, and that's fine.

### 5. Web Search Assist
**Only use when the user is stuck.** Triggers:
- User says they can't remember what a company did or what their role involved
- User is vague about the company or their responsibilities
- User isn't sure what else they might have done

Before searching, tell the user: "Let me look up [Company] to see if I can find context that might jog your memory."

Use web search to look up:
- Company profiles and what they do
- Similar job postings for context on typical responsibilities
- Industry-standard responsibilities for the role title

**Never** use web search to find metrics or claims to attribute to the user.

### 6. Agent Notes
Suggest `> **Agent Note:**` annotations when context clues warrant them:
- User says "we built" or "I helped with" → "It sounds like that was a team effort. Want me to add a note so the resume agent doesn't claim sole ownership?"
- Role ended due to layoff/restructuring → "Want me to add a note about the circumstances so the resume agent has context?"
- User describes scope limitations → "Want me to note that so the resume agent doesn't overstate your involvement?"
- Only add with explicit user agreement.

### Repeat for Each Role
Continue until all roles are documented. For very early-career or brief roles, it's fine to keep them short.

---

## Phase 5: Supporting Sections

**Purpose:** Capture career context beyond work experience.

Walk through each section, asking relevant questions one at a time:

### Education & Training
- Formal education (degrees, institutions, dates, GPA if notable)
- Professional courses and certifications (including courses completed without pursuing the exam -- be honest about this if applicable)
- Continuous learning philosophy and approach
- Professional development activities (conferences, communities, lab environments)

### Publications & Technical Writing
- Articles, blog posts, LinkedIn articles
- Documentation contributions, open source documentation
- Technical writing for marketing, sales, or internal use

### Technical Project Highlights
- **Only** for projects complex enough to warrant standalone narrative beyond work experience bullets
- If a project is fully covered by the role's bullets in Work Experience, it does NOT get a duplicate entry here
- Ask: "Are there any major projects we covered in your work experience that deserve a deeper standalone writeup? Projects with multiple components, unique technical approaches, or significant complexity?"

### Compliance & Framework Expertise
- Which frameworks has the user actually implemented hands-on? (distinct from just listing them as skills)
- What compliance activities have they performed? (gap assessments, control implementation, audit readiness, etc.)

### Volunteer Work & Community Involvement
- Any volunteer work, community service, or pro-bono technical work?

### Industries Supported
- Compile from all roles discussed. Present as a consolidated list for user confirmation.

### Career Objective Statements (Historical)
- Optional section. Ask: "Do you have any old career objective statements from earlier resumes? Some people like to preserve these to show how their positioning evolved. Want to include them?"

### Address History
- Current location only (for resume headers)

### Work Preferences
- Remote/hybrid/onsite preference and reasoning
- Travel willingness
- Company size preference
- Availability

### Notes for Resume Customization
- Ask: "Based on everything we've discussed, what are the main ways you'd want to position yourself differently for different types of roles?"
- Help the user articulate positioning angles (e.g., "For vulnerability management roles, emphasize X. For GRC roles, emphasize Y.")
- Include industry targeting guidance
- Include which metrics to emphasize for which types of roles
- This section **points to themes and sections** -- it does not restate content from other sections.

---

## Phase 6: Synthesis, Review & Output

**Purpose:** Curate highlight sections, finalize, and deliver.

### 1. Curate Key Achievements & Metrics
Review all roles from Phase 4 and select the 8-12 strongest numbers and outcomes. Present the curated list:

> "Based on everything we've covered, here are the standout metrics I'd highlight for the resume agent. These are the numbers that make the biggest impression. Does this list look right?"

Each entry: one-line description with the metric and role attribution. The user approves or adjusts.

### 2. Compile Industries Supported
Aggregate industries from all roles and present for confirmation.

### 3. Review
Present the complete MCD for review (or a section-by-section summary if it's very long). Ask:

> "Does anything feel missing, wrong, or redundant?"

Make requested changes.

### 4. Output
- Write the final file to the project root as `Master_Career_Document.md`
- If a file already exists at that path, confirm before overwriting: "There's already a Master_Career_Document.md in the project root. Want me to overwrite it, or save to a different filename?"
- The output path is already gitignored to prevent accidentally committing personal information.

---

## Re-Run Mode

When `Master_Career_Document.md` already exists in the project root:

1. Read the existing document fully
2. Analyze for:
   - Thin sections (fewer details than expected for the role/topic)
   - Missing sections (any of the 18 sections absent)
   - Roles without metrics or with vague descriptions
   - Skills that might need updating
   - Missing agent notes where they'd be useful
3. Present findings: "Your MCD looks solid overall. I see a few areas we could strengthen: [specific list]"
4. Ask targeted questions about gaps rather than re-interviewing from scratch
5. Offer to add new roles, update skills, or refine existing content
6. **Preserve all existing content** unless the user explicitly asks to change it

---

## Output Structure

The MCD follows this 18-section structure. Each section header includes an HTML comment explaining its purpose.

```markdown
# [User Name] - Master Career Documentation

**Last Updated:** [Date]
**Purpose:** Comprehensive master career documentation serving as the single source of truth for creating tailored resumes.

---

## Table of Contents
[Links to all sections]

---

<!-- PURPOSE: Basic contact details for resume headers -->
## Contact Information

<!-- PURPOSE: How the user positions themselves - target titles and unique value. NOT a summary of experience. -->
## Professional Identity & Positioning

<!-- PURPOSE: 2-4 genuinely different summary angles the resume agent can choose from based on target role. -->
## Professional Summaries

<!-- PURPOSE: Unique cross-domain strengths that define the user's approach. Short, thematic. -->
## [Hybrid Strengths - section name adapts to user's domain]

<!-- PURPOSE: Structured skill categories. Lists capabilities without re-explaining where used. -->
## Core Competencies & Technical Skills

<!-- PURPOSE: Quick reference for the resume agent to match industry experience to target roles. -->
## Industries Supported

<!-- PURPOSE: Canonical source for all role details. Responsibilities, accomplishments, metrics, and context live here in full detail. -->
## Work Experience

<!-- PURPOSE: Formal education, courses, certifications, learning philosophy. -->
## Education & Training

<!-- PURPOSE: Articles, documentation, open source contributions, technical writing. -->
## Publications & Technical Writing

<!-- PURPOSE: Curated highlight reel - the 8-12 most impressive numbers and outcomes. NOT a repeat of every bullet. -->
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

## Redundancy Rules

Follow these rules to prevent content duplication:

1. **Work Experience** is the canonical source for role details. Everything about what happened at a job lives here.
2. **Key Achievements & Metrics** is a curated highlight reel -- the 8-12 strongest outcomes with one-line descriptions and role attribution. It does NOT repeat every bullet.
3. **Technical Project Highlights** only contains projects that need standalone narrative beyond work experience bullets. If a project is fully covered in Work Experience, it does not appear here.
4. **Skills sections** list capabilities without re-explaining where they were used.
5. **Notes for Resume Customization** provides strategic guidance by pointing to sections and themes, not restating bullets.

- [ ] **Step 2: Verify the file was created correctly**

Run: `head -5 .claude/agents/career-doc-builder.md`
Expected: YAML frontmatter starting with `---` and `name: career-doc-builder`

- [ ] **Step 3: Commit**

```bash
git add .claude/agents/career-doc-builder.md
git commit -m "feat: add career-doc-builder agent definition

Interactive interview agent that guides users through creating
a comprehensive Master Career Document with industry-aware
prompting, metrics coaching, and web search assistance."
```

---

### Task 2: Update CLAUDE.md with routing instructions

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add career-doc-builder routing to CLAUDE.md**

Add a new section after the existing "Usage" section:

```markdown
## Master Career Document Builder

When asked to build, create, or update a Master Career Document, use the **career-doc-builder** agent. This agent guides users through an interactive interview process to create or enrich their MCD.

Usage examples:
- "Help me build my career document"
- "I need to create my master career document from my old resumes"
- "Update my MCD with my new role"
- "Review my career document for gaps"
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "feat: add career-doc-builder routing to CLAUDE.md"
```

---

## Chunk 2: Example Document & Resume Writer Compatibility

### Task 3: Update example Master Career Document to 18-section structure

**Files:**
- Modify: `examples/Master_Career_Document.md`

- [ ] **Step 1: Replace the example with the full 18-section structure**

Replace the entire contents of `examples/Master_Career_Document.md` with the following. This uses the same Alex Morgan persona and career data, reorganized into the comprehensive structure:

````markdown
# Master Career Document

This is your single source of truth for all resume and cover letter content. The ATS resume writer agent pulls exclusively from this document -- it will never fabricate or estimate information.

## How to Use This Document

1. Run the **career-doc-builder** agent to create your MCD through a guided interview, or fill in every section manually
2. Be specific with metrics -- if you don't have an exact number, leave it out
3. Use `> **Agent Note:**` lines to give the resume agent binding instructions about specific entries
4. Mark any outdated experience under "Legacy & Historical Platforms" to exclude it from resumes

---

## Table of Contents

1. [Contact Information](#contact-information)
2. [Professional Identity & Positioning](#professional-identity--positioning)
3. [Professional Summaries](#professional-summaries)
4. [Hybrid Engineering & Leadership Strengths](#hybrid-engineering--leadership-strengths)
5. [Core Competencies & Technical Skills](#core-competencies--technical-skills)
6. [Industries Supported](#industries-supported)
7. [Work Experience](#work-experience)
8. [Education & Training](#education--training)
9. [Publications & Technical Writing](#publications--technical-writing)
10. [Key Achievements & Metrics](#key-achievements--metrics)
11. [Leadership & Soft Skills](#leadership--soft-skills)
12. [Technical Project Highlights](#technical-project-highlights)
13. [Compliance & Framework Expertise](#compliance--framework-expertise)
14. [Volunteer Work & Community Involvement](#volunteer-work--community-involvement)
15. [Career Objective Statements (Historical)](#career-objective-statements-historical)
16. [Address History](#address-history)
17. [Work Preferences](#work-preferences)
18. [Notes for Resume Customization](#notes-for-resume-customization)

---

<!-- PURPOSE: Basic contact details for resume headers -->
## Contact Information

- **Name:** Alex Morgan
- **Location:** Austin, TX
- **Phone:** (555) 867-5309
- **Email:** alex.morgan@example.com
- **LinkedIn:** https://www.linkedin.com/in/alex-morgan-example/
- **GitHub:** https://github.com/alexmorgan-example

---

<!-- PURPOSE: How the user positions themselves - target titles and unique value. NOT a summary of experience. -->
## Professional Identity & Positioning

### Primary Titles

- Senior Software Engineer
- Backend/Platform Engineer
- Engineering Lead

### Core Value Proposition

Building scalable distributed systems while mentoring teams and driving measurable infrastructure cost reductions.

---

<!-- PURPOSE: 2-4 genuinely different summary angles the resume agent can choose from based on target role. -->
## Professional Summaries

### Version 1: Technical Depth

Senior Software Engineer with 8 years of experience building scalable web applications and distributed systems. Led migration of a monolithic application to 12 microservices, reducing API latency by 87%. Deep expertise in Python, Go, and cloud-native architectures on AWS, with hands-on experience in event-driven design, observability, and infrastructure cost optimization.

### Version 2: Leadership & Mentorship

Engineering leader with 8 years of experience delivering products that serve millions of users. Proven track record of mentoring junior engineers to promotion, establishing team-wide observability standards, and leading cross-functional initiatives. Combines deep technical expertise in distributed systems with strong collaboration and stakeholder communication skills.

### Version 3: Platform & Infrastructure

Platform-focused engineer with 8 years of experience designing systems for reliability, performance, and cost efficiency. Reduced AWS infrastructure costs by 34% ($180K annually), architected event-driven pipelines handling 2.3M transactions per day at 99.97% uptime, and established observability standards that cut mean-time-to-detection by 83%.

---

<!-- PURPOSE: Unique cross-domain strengths that define the user's approach. Short, thematic. -->
## Hybrid Engineering & Leadership Strengths

- **Builder & Optimizer:** Designs new systems while continuously improving existing infrastructure for cost and performance
- **Technical Mentor:** Invests in team growth through structured code review and hands-on guidance
- **Cross-Functional Communicator:** Bridges engineering, product, and operations to align technical decisions with business outcomes
- **Observability Champion:** Treats monitoring and alerting as first-class engineering concerns, not afterthoughts

---

<!-- PURPOSE: Structured skill categories. Lists capabilities without re-explaining where used. -->
## Core Competencies & Technical Skills

### Programming Languages & Frameworks

Python, Go, TypeScript, JavaScript, React, Next.js, FastAPI, Django, Flask, Node.js, GraphQL, REST APIs

### Cloud & Infrastructure

AWS (EC2, Lambda, S3, RDS, DynamoDB, CloudFormation, ECS, EKS, CloudWatch, IAM), Docker, Kubernetes, Terraform, CI/CD (GitHub Actions, Jenkins, CircleCI), Nginx, Redis, PostgreSQL, MongoDB

### Architecture & Practices

Microservices Architecture, Event-Driven Design, Domain-Driven Design, Test-Driven Development, Agile/Scrum, System Design, API Design, Database Design, Performance Optimization, Observability (Datadog, Grafana, Prometheus)

### Leadership & Collaboration

Technical Mentorship, Code Review, Sprint Planning, Cross-Team Coordination, Technical Documentation, Incident Response, On-Call Management

---

<!-- PURPOSE: Quick reference for the resume agent to match industry experience to target roles. -->
## Industries Supported

- E-commerce / Retail
- Enterprise SaaS
- Data Analytics
- Higher Education

---

<!-- PURPOSE: Canonical source for all role details. Responsibilities, accomplishments, metrics, and context live here in full detail. -->
## Work Experience

### Stellar Technologies -- Senior Software Engineer
**March 2022 -- Present** | Austin, TX (Remote)

**Focus:** Platform Engineering & Team Leadership

- Led migration of monolithic Python application to 12 Go microservices, reducing average API latency from 340ms to 45ms
- Architected event-driven order processing pipeline handling 2.3 million transactions per day with 99.97% uptime
- Mentored 4 junior engineers through structured code review program, with 2 earning promotions within 18 months
- Designed and implemented real-time inventory sync system across 3 warehouse integrations, eliminating $1.2M in annual oversell losses
- Reduced AWS infrastructure costs by 34% ($180K annually) through right-sizing EC2 instances and migrating batch workloads to Lambda
- Established observability standards using Datadog, creating 15 service dashboards and reducing mean-time-to-detection from 23 minutes to 4 minutes

### CloudBridge Solutions -- Software Engineer
**June 2019 -- February 2022** | Denver, CO

**Focus:** Full-Stack Product Development

- Built customer-facing analytics dashboard serving 850 enterprise clients using React, GraphQL, and PostgreSQL
- Implemented automated CI/CD pipeline with GitHub Actions, reducing deployment time from 45 minutes to 8 minutes
- Developed rate-limiting middleware handling 10,000 requests per second with sub-millisecond overhead
- Migrated legacy authentication system to OAuth 2.0 + OIDC, supporting SSO for 12 enterprise customers
- Contributed to open-source internal API gateway library, adopted by 3 other engineering teams (40+ developers)

> **Agent Note:** The API gateway project was collaborative -- do not attribute sole ownership.

### DataFlow Inc. -- Junior Software Engineer
**August 2017 -- May 2019** | San Francisco, CA

**Focus:** Data Pipeline Engineering

- Developed Python ETL pipelines processing 500GB of daily data from 8 source systems
- Built internal admin dashboard used by 25 operations staff, reducing manual data entry by 60%
- Wrote comprehensive test suites achieving 92% code coverage across 3 core services
- Participated in on-call rotation, resolving 40+ production incidents with average resolution time of 35 minutes

### University of Texas -- Teaching Assistant, Computer Science
**January 2016 -- May 2017** | Austin, TX

- Assisted instruction for CS 371: Data Structures and Algorithms (120 students per semester)
- Held weekly office hours and graded assignments for 2 consecutive semesters

---

<!-- PURPOSE: Formal education, courses, certifications, learning philosophy. -->
## Education & Training

### Formal Education

- **University of Texas at Austin**
  Bachelor of Science in Computer Science | Graduated May 2017
  - Minor: Mathematics
  - GPA: 3.7/4.0

### Certifications

- AWS Solutions Architect -- Associate (2023)
- Certified Kubernetes Administrator (CKA) (2022)

---

<!-- PURPOSE: Articles, documentation, open source contributions, technical writing. -->
## Publications & Technical Writing

- **open-queue documentation** -- Authored comprehensive README, API reference, and contributor guide for open-source Go library (1,200+ GitHub stars)

---

<!-- PURPOSE: Curated highlight reel - the 8-12 most impressive numbers and outcomes with one-line descriptions and role attribution. NOT a repeat of every bullet. -->
## Key Achievements & Metrics

- **87% API latency reduction** (340ms to 45ms) -- Monolith to microservices migration (Stellar Technologies)
- **$1.2M annual savings** -- Real-time inventory sync eliminating oversell losses (Stellar Technologies)
- **$180K annual savings** -- 34% AWS cost reduction through right-sizing and Lambda migration (Stellar Technologies)
- **99.97% uptime** -- Event-driven pipeline handling 2.3M transactions/day (Stellar Technologies)
- **83% faster detection** -- MTTD reduced from 23 to 4 minutes via observability standards (Stellar Technologies)
- **850 enterprise clients** served by analytics dashboard (CloudBridge Solutions)
- **82% faster deployments** -- CI/CD pipeline reduced from 45 to 8 minutes (CloudBridge Solutions)
- **500GB daily data processing** across 8 source systems (DataFlow Inc.)
- **92% code coverage** across 3 core services (DataFlow Inc.)
- **2 mentees promoted** within 18 months through structured review program (Stellar Technologies)

---

<!-- PURPOSE: Professional philosophy, values, leadership style. Gives the resume agent tone and framing guidance. -->
## Leadership & Soft Skills

### Leadership Style

Lead by example through hands-on technical contribution and structured mentorship. Believe in investing in team members' growth through code review, pair programming, and creating clear paths to advancement.

### Problem-Solving Approach

Data-driven and iterative. Prefer to measure first (observability, profiling, metrics), then optimize based on evidence rather than assumptions.

### Professional Values

- Ship reliable systems over fast systems
- Invest in observability and testing as first-class concerns
- Mentor generously -- team growth compounds

---

<!-- PURPOSE: Only projects complex enough to need standalone narrative beyond work experience bullets. -->
## Technical Project Highlights

### open-queue (Open Source)
**2023 -- Present**
- Lightweight job queue library for Go with Redis backend
- 1,200+ GitHub stars, 45 contributors
- Used in production by 3 companies
- Designed for simplicity and reliability over feature breadth

### budget-tracker
**2021**
- Personal finance tracking app built with Next.js and Plaid API
- Automated transaction categorization using rule-based engine

---

<!-- PURPOSE: Hands-on framework experience, not just listing frameworks as skills. -->
## Compliance & Framework Expertise

- **Agile/Scrum:** Practiced in all professional roles; participated in sprint planning, retrospectives, and backlog grooming
- **Test-Driven Development:** Applied across backend services; achieved 92% coverage at DataFlow Inc.

---

<!-- PURPOSE: Community involvement and volunteer work. -->
## Volunteer Work & Community Involvement

- **Open Source:** Active maintainer of open-queue; review and merge community contributions

---

<!-- PURPOSE: Historical positioning - how the user described themselves at different career stages. Optional. -->
## Career Objective Statements (Historical)

### 2017 Version (Early Career)

Software engineering graduate seeking a backend-focused role where I can contribute to data-intensive applications while growing my expertise in distributed systems and cloud architecture.

---

<!-- PURPOSE: Current location for resume headers. -->
## Address History

- **Current:** Austin, TX

---

<!-- PURPOSE: Preferences that inform job targeting. -->
## Work Preferences

- **Work Location:** Remote preferred; open to hybrid in Austin
- **Travel Willingness:** Open to occasional travel for team offsites
- **Company Size:** Prefer mid-size companies (100-1000 employees) but open to startups and larger orgs
- **Availability:** Available with standard notice period

---

<!-- PURPOSE: Strategic guidance for the resume agent - positioning angles and emphasis recommendations. Points to themes, doesn't restate content. -->
## Notes for Resume Customization

### Positioning Options

1. **Platform/Infrastructure Focus:** Emphasize Stellar Technologies microservices migration, cost optimization, observability work
2. **Full-Stack Product Focus:** Lead with CloudBridge analytics dashboard, CI/CD improvements, OAuth migration
3. **Data Engineering Focus:** Highlight DataFlow ETL pipelines, open-queue project, data processing scale
4. **Leadership Focus:** Emphasize mentorship outcomes, team standards, cross-team coordination

### Metrics to Emphasize

- For cost-conscious roles: $180K AWS savings, $1.2M oversell elimination
- For scale roles: 2.3M transactions/day, 850 clients, 500GB daily processing
- For reliability roles: 99.97% uptime, 83% MTTD improvement
- For leadership roles: 2 mentee promotions, 4 engineers mentored, 15 dashboards established

---

## Legacy & Historical Platforms

> **Agent Note:** Do not include anything from this section in resumes. These are outdated skills retained for historical reference only.

- jQuery, Backbone.js, CoffeeScript
- Heroku (personal projects only, 2015-2017)
- PHP/WordPress development (freelance, 2014-2016)
````

- [ ] **Step 2: Verify the example has all 18 content sections**

Run: `grep -c '^## ' examples/Master_Career_Document.md`
Expected: 19 or 20 (18 content sections + Table of Contents + possibly "How to Use")

- [ ] **Step 3: Commit**

```bash
git add examples/Master_Career_Document.md
git commit -m "feat: update example MCD to 18-section structure

Reorganizes the Alex Morgan example to match the comprehensive
structure produced by the career-doc-builder agent. Adds
Professional Identity, multiple summaries, Hybrid Strengths,
Key Achievements, Leadership & Soft Skills, and other
supporting sections."
```

---

### Task 4: Update ats-resume-writer for section name compatibility

**Files:**
- Modify: `.claude/agents/ats-resume-writer.md`

- [ ] **Step 1: Update section name references in the resume writer**

In `.claude/agents/ats-resume-writer.md`, find line 27:
```
1. The user's Master Career Document (in the project root, named `Master_Career_Document.md`) -- single source of truth for all content
```

Replace with:
```
1. The user's Master Career Document (in the project root, named `Master_Career_Document.md`) -- single source of truth for all content. The MCD may use either the simple format (from `examples/`) or the comprehensive 18-section format (produced by the `career-doc-builder` agent). Both are valid. Key section name mappings:
   - "Professional Summary" or "Professional Summaries" -- use the most relevant summary version for the target role
   - "Skills" or "Core Competencies & Technical Skills" -- same content, different heading
   - "Professional Experience" or "Work Experience" -- same content, different heading
   - "Key Achievements & Metrics" -- curated highlight reel; use to quickly find strongest metrics
   - "Notes for Resume Customization" -- strategic guidance for content selection and positioning
   - "Legacy & Historical Platforms" -- always skip, regardless of format
```

No other changes needed in Steps 3 or 6 -- the Legacy exclusion rule already works, and the "Standard section names" reference is about LaTeX output sections, not MCD input sections.

- [ ] **Step 2: Commit**

```bash
git add .claude/agents/ats-resume-writer.md
git commit -m "feat: update resume writer for 18-section MCD compatibility

Adds section name mappings so the resume writer handles both
the simple example format and the comprehensive format produced
by the career-doc-builder agent."
```

---

### Task 5: Final verification

- [ ] **Step 1: Verify all files are in place**

Run: `ls -la .claude/agents/career-doc-builder.md .claude/agents/ats-resume-writer.md CLAUDE.md examples/Master_Career_Document.md`
Expected: All four files exist with recent modification timestamps.

- [ ] **Step 2: Verify agent frontmatter is valid**

Run: `head -7 .claude/agents/career-doc-builder.md`
Expected: Valid YAML frontmatter with name, description, model, color fields.

- [ ] **Step 3: Verify Master_Career_Document.md is gitignored**

Run: `grep 'Master_Career_Document' .gitignore`
Expected: Entry exists (e.g., `Master_Career_Document.md` or `Master_Career_Document*`). If missing, add `Master_Career_Document.md` to `.gitignore` and commit.

- [ ] **Step 4: Verify no untracked files were left behind**

Run: `git status`
Expected: Clean working tree (all changes committed).

- [ ] **Step 5: Manual testing note**

The agent should be tested by invoking it in Claude Code: start a new conversation in the project directory and say "help me build my career document." Verify the agent launches, follows Phase 1 (asks for existing resumes), and proceeds through the interview flow conversationally. This is a manual step -- there is no automated test for agent behavior.
