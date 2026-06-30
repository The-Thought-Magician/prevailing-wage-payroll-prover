# PrevailingWagePayrollProver

## Overview

PrevailingWagePayrollProver is a vertical compliance desk that proves every worker on a public-works project was paid the correct Davis-Bacon prevailing wage and fringe benefit for their classification, every day, before the weekly WH-347 certified payroll is filed. It ingests wage determinations, worker classification ledgers, and daily payroll lines, then runs deterministic rule checks (rate floor, fringe sufficiency, apprentice ratio, overtime, classification validity) and produces a signed, audit-ready certified payroll packet.

The product is built for the person who personally owns the weekly certified-payroll filing: payroll/compliance administrators and controllers at general contractors and subcontractors. It replaces error-prone spreadsheets with a determination-aware system of record that catches underpayments before they become withheld funds, back-wage restitution, or debarment.

## Problem

Public-works contractors on federal (Davis-Bacon) and state prevailing-wage projects must file certified payroll (form WH-347) weekly, for every project, for every covered worker. The math is brutal and existential:

- Each worker must be paid at least the prevailing **base rate** for their exact **classification** (e.g., "Electrician", "Laborer Group 2", "Operating Engineer Group 1") in the project's **county/locality** and **wage decision**.
- On top of base rate, a **fringe benefit** floor must be met, paid either as additional cash (cash-in-lieu) or contributions to a bona-fide benefit plan, or a mix.
- **Apprentices** may be paid sub-journeyworker rates only if they are in a registered apprenticeship program and the on-site **apprentice-to-journeyworker ratio** is not exceeded.
- **Overtime** must be computed correctly on the prevailing base rate.
- The wrong number anywhere triggers withheld contract funds, mandatory back-wage **restitution**, liquidated damages, and potentially **debarment** that ends the business.

This is validated by an entire industry of incumbents (LCPtracker, Points North/Certified Payroll Reporting) serving tens of thousands of contractors. But those tools are heavyweight, expensive, and oriented toward agencies/owners forcing compliance downward. The contractor's own back-office administrator needs a fast, deterministic prover they control.

## Target Users

- **Primary buyer/user:** Payroll or compliance administrator at a prevailing-wage general contractor or subcontractor who personally owns the weekly certified-payroll filing and the back-office tooling budget.
- **Controller / CFO** at a mid-size contractor who signs the statement of compliance and carries the liability.
- **Project accountants** reconciling labor cost to contract draws.
- **Compliance consultants** who file certified payroll on behalf of multiple contractor clients.

## Why this is NOT an existing project

Nearest neighbors and why this is distinct:

- **Construction estimating / construction project management (bids, schedules, RFIs, submittals):** These model the *job* (cost, schedule, scope). They do not encode wage determinations, classification rate floors, fringe sufficiency, or the WH-347. PrevailingWagePayrollProver does not bid or schedule work; it proves wage compliance on payroll that already happened.
- **Generic time & attendance / timesheet apps:** These capture hours and maybe job-costing. They have no concept of a prevailing-wage decision, classification-specific rate floors, fringe-in-lieu math, or apprentice ratios. They cannot tell you a worker was *underpaid* against a Davis-Bacon decision.
- **General payroll (Gusto/ADP-style):** These run payroll and remit taxes. They do not validate against a wage determination or generate certified payroll with a statement of compliance.
- **Sibling ventures in my portfolio:** `grant-drawdown-compliance-desk` is a vertical regulatory desk but in the **federal-grant drawdown** domain (reimbursement requests, allowability, period-of-performance), not labor wage compliance. `clinical-credential-lapse-warden` is also a vertical regulatory desk but in **clinical credentialing** (license expirations, CME), not prevailing wage. PrevailingWagePayrollProver shares the "vertical regulatory desk" shape but encodes an entirely different domain: Davis-Bacon wage determinations, classification ledgers, fringe allocation, apprentice ratios, and WH-347 generation.

The defensible core is the **wage-determination register + per-worker-per-day classification ledger + deterministic rule engine + WH-347 generator** — none of the neighbors encode this.

## Major Features

### 1. Project & Contract Register
Track every public-works project under compliance. Sub-features: project metadata (name, awarding agency, prime/sub role, contract number, county/locality, state, federal vs state coverage); contract value and labor budget; project status (active, closed, suspended); assigned wage determination(s); covered crafts list; project start/end dates; per-project filing cadence (weekly default); contractor company-of-record on the project (prime vs sub chain).

### 2. Wage-Determination Register
The system of record for prevailing-wage decisions. Sub-features: import a wage determination (WD number, decision date, effective date, modification number, locality/county, schedule type); per-classification rate rows (classification name, base hourly rate, fringe hourly rate); survey vs union determination flag; multiple determinations per project (by craft schedule); determination versioning (mod history); effective-date selection so the correct rate is applied for the work week; soft-delete/supersede of stale determinations.

### 3. Classification Catalog
Normalized catalog of worker classifications used across determinations. Sub-features: canonical classification names; craft grouping (electrical, mechanical, laborer, operator, etc.); group/level subdivisions; mapping aliases (so "Laborer Grp 2" maps to canonical); apprentice-eligible flag; default journeyworker classification linkage for apprentices.

### 4. Worker Roster
Master list of workers covered on projects. Sub-features: worker profile (name, last-4 SSN tokenized, address for WH-347, employee ID); gender/ethnicity fields for EEO reporting (optional); apprentice status and program enrollment; default classification; active/inactive; per-project assignment.

### 5. Apprenticeship Program Registry
Track registered apprenticeship programs. Sub-features: program registration number, sponsor, trade; apprentice levels/periods with percentage-of-journeyworker rate per level; required apprentice-to-journeyworker ratio; program effective dates; link workers to a program + level; validate that a claimed apprentice rate matches the program level percentage.

### 6. Per-Worker Per-Day Classification Ledger
The atomic compliance unit. Sub-features: a payroll line per worker, per project, per work date, per classification; hours by type (straight, overtime, doubletime); hourly base rate paid; fringe paid in cash; fringe paid to plans; gross paid; work classification chosen from the determination; notes; bulk entry for a week; clone-from-previous-week.

### 7. Rate-Floor Validation Engine
Deterministic check that base rate paid >= determination base rate for the classification on that date. Sub-features: per-line pass/fail; computed shortfall amount; tolerance config; effective-determination resolution by work date; flag when classification not present in determination; aggregate weekly rate-floor report.

### 8. Fringe-Benefit Allocation Calculator
Validate that total fringe (cash-in-lieu + bona-fide plan contributions) meets the determination fringe floor. Sub-features: cash-vs-plan split per worker; bona-fide plan contribution tracking (health, pension, vacation, training); annualization of plan contributions; cash-in-lieu computation; per-line fringe sufficiency pass/fail with shortfall; rule that base-rate overpayment can offset fringe shortfall (credit) when configured.

### 9. Apprentice-Ratio & Registered-Apprenticeship Compliance Checker
Validate apprentice usage on a project/day. Sub-features: per-day on-site apprentice vs journeyworker counts by trade; ratio compliance against program-required ratio; flag apprentices not enrolled in a registered program (must be paid journeyworker rate); validate apprentice rate equals program-level percentage of journeyworker base; ratio violation report listing offending days/trades.

### 10. Overtime & Doubletime Rule Engine
Compute and validate premium pay. Sub-features: daily and weekly OT thresholds (configurable by state rule set); OT computed on prevailing base rate (not blended); doubletime rules; flag underpaid OT lines; weekly OT summary.

### 11. WH-347 Certified Payroll Generator
Generate the federal WH-347 for a project + work week. Sub-features: payroll line population from the ledger; weekly hours grid (day-of-week columns); gross/deductions/net columns; classification + rate columns; fringe statement (4(a) plans vs 4(b) cash); statement-of-compliance page; payroll number and "final" flag; printable/exportable (HTML/JSON, PDF-ready layout); per-state certified-payroll variants noted.

### 12. Statement-of-Compliance Signature Workflow
The legally binding sign-off. Sub-features: route a generated WH-347 for signature; signer identity (name, title); typed-signature attestation capturing the WH-348 statement language; fringe-payment method selection (4(a)/4(b)/exceptions); signature timestamp and IP; locked/immutable once signed; re-open requires supervisor and creates a new version.

### 13. Restitution / Back-Wage Calculator
Quantify owed make-up pay when underpayments are found. Sub-features: aggregate shortfalls (base + fringe + OT) per worker across a period; restitution worksheet per worker; total project restitution; generate corrected payroll lines; mark restitution as paid with reference; restitution summary for the contracting officer.

### 14. DOL / Contracting-Officer Audit Packet Export
One-click audit packet. Sub-features: bundle WH-347s, determinations applied, classification ledger, fringe worksheets, apprentice-ratio reports, restitution worksheets for a project + date range; cover sheet with project + contractor identity; machine-readable JSON manifest; export job tracking; downloadable archive descriptor.

### 15. Compliance Dashboard & Health Score
At-a-glance compliance posture. Sub-features: per-project compliance score; open violations count by type; weeks filed vs due; upcoming filing deadlines; restitution outstanding; trend of violations over time.

### 16. Violations & Findings Tracker
Centralized list of every rule failure. Sub-features: finding type (rate, fringe, apprentice, OT, classification, missing-filing); severity; status (open, acknowledged, resolved, waived); link to offending ledger line / week; assignee; resolution notes; bulk resolve.

### 17. Validation Run Engine (Prove)
The "prove" action: run all rule engines for a project+week and persist a validation run. Sub-features: triggered run producing a results record; per-rule result rollup; pass/fail gate that blocks WH-347 signing if hard failures exist; run history; re-run after fixes; diff vs previous run.

### 18. Subcontractor Tier Tracking
Prime contractors must collect subs' certified payroll. Sub-features: register lower-tier subs on a project; track which subs have filed each week; missing-filing alerts; roll up sub compliance into the prime's project health; sub contact register.

### 19. Filing Calendar & Deadline Reminders
Never miss a weekly filing. Sub-features: per-project weekly deadline schedule; filed/not-filed status per week; overdue highlighting; configurable lead-time reminders; calendar view of all projects' filings.

### 20. Data Ingestion & Sample-Data Seeder
Get data in fast and demo instantly. Sub-features: CSV import of payroll lines; CSV import of a wage determination; mapping templates; a built-in sample-data seeder that provisions a demo contractor, project, determination, roster, and a week of ledger lines with intentional violations for demoability; import job tracking and row-level error reports.

### 21. Fringe Plan Register
Track bona-fide benefit plans used for fringe credit. Sub-features: plan name, type (health/pension/vacation/training/apprenticeship), provider, contribution basis (per-hour, per-month annualized); plan effective dates; link plan contributions to ledger lines; plan-level contribution summary.

### 22. Audit Log & Activity Trail
Immutable trail for everything compliance-sensitive. Sub-features: who created/edited/signed/exported what and when; per-entity activity feed; export of the activity trail; tamper-evident ordering.

### 23. Reports & Analytics
Operational and compliance reporting. Sub-features: labor-cost-by-classification report; fringe-cash-vs-plan report; apprentice-utilization report; weekly compliance summary; restitution exposure report; CSV export of each.

### 24. Settings, Company Profile & Billing
Account configuration. Sub-features: company-of-record profile (legal name, FEIN, address, signatory); state OT rule-set selection; tolerance defaults; team members (future); billing plan view (all features free; Stripe optional/503).

## Data Model (tables)

- `companies` — contractor company-of-record profile
- `projects` — public-works projects under compliance
- `wage_determinations` — imported prevailing-wage decisions
- `determination_rates` — per-classification base+fringe rows within a determination
- `classifications` — canonical classification catalog
- `classification_aliases` — alias-to-canonical mappings
- `workers` — worker roster
- `apprenticeship_programs` — registered programs
- `apprenticeship_levels` — per-program levels with percentage + ratio
- `fringe_plans` — bona-fide benefit plans
- `payroll_lines` — per-worker per-day classification ledger lines
- `fringe_contributions` — plan contributions attached to payroll lines
- `validation_runs` — a "prove" run for a project+week
- `validation_findings` — individual rule failures from a run
- `wh347_payrolls` — generated WH-347 documents (project+week+payroll number)
- `compliance_signatures` — statement-of-compliance signatures
- `restitution_worksheets` — back-wage restitution per worker/period
- `restitution_items` — per-worker restitution detail lines
- `subcontractors` — lower-tier subs on a project
- `sub_filings` — per-week sub filing status
- `audit_packets` — generated DOL/CO audit packet descriptors
- `filing_deadlines` — per-project per-week filing schedule
- `import_jobs` — CSV ingestion jobs with row error reports
- `activity_log` — immutable activity trail
- `plans` — billing plans (free/pro)
- `subscriptions` — per-user subscription

## API Surface (high level)

- `/companies` — CRUD company-of-record profiles
- `/projects` — CRUD projects, attach determinations, project health
- `/determinations` — CRUD wage determinations + nested rates, supersede
- `/classifications` — catalog + aliases
- `/workers` — roster CRUD, per-project assignment
- `/programs` — apprenticeship programs + levels
- `/fringe-plans` — bona-fide plan register
- `/payroll-lines` — ledger CRUD, bulk week entry, clone-week
- `/validation` — run prove, list runs, findings
- `/findings` — list/resolve violations
- `/wh347` — generate, list, get WH-347 documents
- `/signatures` — statement-of-compliance signing workflow
- `/restitution` — back-wage worksheets + items
- `/subcontractors` — sub register + filings
- `/audit-packets` — generate + list audit packets
- `/deadlines` — filing calendar
- `/imports` — CSV import + sample-data seeder
- `/dashboard` — compliance score + summary
- `/reports` — analytics endpoints
- `/activity` — activity trail
- `/billing` — plan (Stripe optional/503)

## Frontend Pages (~24)

Public:
1. `/` — static landing/marketing
2. `/auth/sign-in`
3. `/auth/sign-up`
4. `/pricing`

Dashboard (auth-gated, sidebar chrome):
5. `/dashboard` — compliance overview + health scores
6. `/dashboard/projects` — project list
7. `/dashboard/projects/[id]` — project detail (determinations, health, weeks)
8. `/dashboard/determinations` — wage-determination register
9. `/dashboard/determinations/[id]` — determination detail + rates
10. `/dashboard/classifications` — classification catalog + aliases
11. `/dashboard/workers` — worker roster
12. `/dashboard/programs` — apprenticeship programs + levels
13. `/dashboard/fringe-plans` — bona-fide plan register
14. `/dashboard/ledger` — per-worker per-day classification ledger (bulk week entry)
15. `/dashboard/validation` — run prove + validation run history
16. `/dashboard/findings` — violations/findings tracker
17. `/dashboard/wh347` — WH-347 generator + list
18. `/dashboard/wh347/[id]` — single WH-347 view + sign workflow
19. `/dashboard/restitution` — back-wage restitution worksheets
20. `/dashboard/subcontractors` — sub tier tracking + filings
21. `/dashboard/audit-packets` — audit packet export
22. `/dashboard/deadlines` — filing calendar
23. `/dashboard/imports` — CSV import + sample-data seeder
24. `/dashboard/reports` — reports & analytics
25. `/dashboard/activity` — audit log / activity trail
26. `/dashboard/settings` — company profile, OT rules, billing
