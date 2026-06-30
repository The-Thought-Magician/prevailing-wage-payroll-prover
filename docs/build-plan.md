# Build Plan — PrevailingWagePayrollProver (AUTHORITATIVE BUILD CONTRACT)

This is the single source of truth. Filenames, mount paths, api method names, and page files declared here are binding. Backend mounts every domain router under `/api/v1/<mount>` via a child Hono `api` router. Frontend calls `fetch('/api/proxy/<path>')` mapping 1:1 to `/api/v1/<path>`. Backend trusts `X-User-Id` and uses `getUserId(c)`. Public reads / auth-gated writes with zod validation and ownership checks.

---

## (a) Tables (columns)

1. **companies** — id, user_id, legal_name, fein, address, city, state, zip, signatory_name, signatory_title, ot_rule_set, rate_tolerance_cents, created_at, updated_at
2. **projects** — id, user_id, company_id(FK companies), name, awarding_agency, contract_number, role, county, state, coverage, contract_value_cents, labor_budget_cents, status, filing_cadence, start_date, end_date, crafts(jsonb), created_at, updated_at
3. **wage_determinations** — id, user_id, project_id(FK projects), wd_number, modification_number, decision_date, effective_date, locality, county, state, schedule_type, source, is_active, superseded_by, created_at, updated_at
4. **determination_rates** — id, determination_id(FK wage_determinations), classification_name, base_rate(real), fringe_rate(real), created_at; UNIQUE(determination_id, classification_name)
5. **classifications** — id, user_id, canonical_name, craft_group, level, apprentice_eligible, journeyworker_classification, created_at
6. **classification_aliases** — id, classification_id(FK classifications), alias, created_at; UNIQUE(classification_id, alias)
7. **workers** — id, user_id, full_name, ssn_last4, employee_id, address, gender, ethnicity, default_classification, is_apprentice, program_id, program_level_id, is_active, created_at, updated_at
8. **apprenticeship_programs** — id, user_id, registration_number, sponsor, trade, required_ratio(real), effective_date, end_date, created_at, updated_at
9. **apprenticeship_levels** — id, program_id(FK apprenticeship_programs), level_name, period_number, pct_of_journeyworker(real), created_at; UNIQUE(program_id, period_number)
10. **fringe_plans** — id, user_id, name, plan_type, provider, contribution_basis, effective_date, end_date, created_at, updated_at
11. **payroll_lines** — id, user_id, project_id(FK projects), worker_id(FK workers), determination_id(FK wage_determinations), work_date, week_ending, classification_name, straight_hours(real), overtime_hours(real), doubletime_hours(real), base_rate_paid(real), fringe_cash_paid(real), fringe_plan_paid(real), gross_paid(real), is_apprentice, notes, created_at, updated_at
12. **fringe_contributions** — id, payroll_line_id(FK payroll_lines), fringe_plan_id(FK fringe_plans), amount_per_hour(real), created_at
13. **validation_runs** — id, user_id, project_id(FK projects), week_ending, status, total_lines, pass_count, fail_count, hard_fail, total_shortfall(real), summary(jsonb), created_at
14. **validation_findings** — id, user_id, run_id(FK validation_runs), project_id(FK projects), payroll_line_id(FK payroll_lines), worker_id(FK workers), finding_type, severity, status, message, shortfall(real), week_ending, assignee, resolution_notes, created_at, updated_at
15. **wh347_payrolls** — id, user_id, project_id(FK projects), week_ending, payroll_number, is_final, status, fringe_method, lines(jsonb), totals(jsonb), created_at, updated_at; UNIQUE(project_id, week_ending, payroll_number)
16. **compliance_signatures** — id, user_id, wh347_id(FK wh347_payrolls), signer_name, signer_title, attestation_text, fringe_method, signed_ip, signed_at, created_at
17. **restitution_worksheets** — id, user_id, project_id(FK projects), period_start, period_end, status, total_owed(real), created_at, updated_at
18. **restitution_items** — id, worksheet_id(FK restitution_worksheets), worker_id(FK workers), base_shortfall(real), fringe_shortfall(real), ot_shortfall(real), total_shortfall(real), paid, paid_reference, created_at
19. **subcontractors** — id, user_id, project_id(FK projects), name, tier, contact_name, contact_email, created_at, updated_at
20. **sub_filings** — id, subcontractor_id(FK subcontractors), week_ending, filed, filed_at, created_at; UNIQUE(subcontractor_id, week_ending)
21. **audit_packets** — id, user_id, project_id(FK projects), period_start, period_end, status, manifest(jsonb), created_at
22. **filing_deadlines** — id, user_id, project_id(FK projects), week_ending, due_date, filed, created_at; UNIQUE(project_id, week_ending)
23. **import_jobs** — id, user_id, project_id(FK projects), import_type, status, total_rows, inserted_rows, errors(jsonb), created_at
24. **activity_log** — id, user_id, entity_type, entity_id, action, detail(jsonb), created_at
25. **plans** — id(text PK, seeded 'free'/'pro'), name, price_cents
26. **subscriptions** — id, user_id(unique), plan_id, stripe_customer_id, stripe_subscription_id, status, current_period_end, created_at, updated_at

---

## (b) Backend route files (mount under /api/v1)

### `companies.ts` → mount `companies`
- `GET /` — public — list current-user companies — `Company[]`
- `GET /:id` — public — get company — `Company`
- `POST /` — auth — create company — `Company`
- `PUT /:id` — auth+owner — update company — `Company`
- `DELETE /:id` — auth+owner — delete company — `{ success }`

### `projects.ts` → mount `projects`
- `GET /` — public — list projects — `Project[]`
- `GET /:id` — public — project detail — `Project`
- `GET /:id/health` — public — compliance health (score, open findings, weeks filed/due, restitution outstanding) — `ProjectHealth`
- `POST /` — auth — create project — `Project`
- `PUT /:id` — auth+owner — update project — `Project`
- `DELETE /:id` — auth+owner — delete project — `{ success }`

### `determinations.ts` → mount `determinations`
- `GET /` — public — list determinations (optional `?project_id=`) — `Determination[]`
- `GET /:id` — public — determination + nested rates — `{ ...Determination, rates: Rate[] }`
- `POST /` — auth — create determination (with rates array) — `Determination`
- `PUT /:id` — auth+owner — update determination — `Determination`
- `POST /:id/rates` — auth+owner — add/replace a rate row — `Rate`
- `DELETE /:id/rates/:rateId` — auth+owner — delete a rate — `{ success }`
- `POST /:id/supersede` — auth+owner — mark superseded (set is_active=false, superseded_by) — `Determination`
- `DELETE /:id` — auth+owner — delete determination — `{ success }`

### `classifications.ts` → mount `classifications`
- `GET /` — public — list classifications (with aliases) — `Classification[]`
- `POST /` — auth — create classification — `Classification`
- `PUT /:id` — auth+owner — update classification — `Classification`
- `POST /:id/aliases` — auth+owner — add alias — `Alias`
- `DELETE /:id/aliases/:aliasId` — auth+owner — delete alias — `{ success }`
- `DELETE /:id` — auth+owner — delete classification — `{ success }`

### `workers.ts` → mount `workers`
- `GET /` — public — list workers — `Worker[]`
- `GET /:id` — public — worker detail — `Worker`
- `POST /` — auth — create worker — `Worker`
- `PUT /:id` — auth+owner — update worker — `Worker`
- `DELETE /:id` — auth+owner — delete worker — `{ success }`

### `programs.ts` → mount `programs`
- `GET /` — public — list apprenticeship programs (with levels) — `Program[]`
- `GET /:id` — public — program + levels — `{ ...Program, levels: Level[] }`
- `POST /` — auth — create program — `Program`
- `PUT /:id` — auth+owner — update program — `Program`
- `POST /:id/levels` — auth+owner — add level — `Level`
- `DELETE /:id/levels/:levelId` — auth+owner — delete level — `{ success }`
- `DELETE /:id` — auth+owner — delete program — `{ success }`

### `fringePlans.ts` → mount `fringe-plans`
- `GET /` — public — list fringe plans — `FringePlan[]`
- `POST /` — auth — create plan — `FringePlan`
- `PUT /:id` — auth+owner — update plan — `FringePlan`
- `DELETE /:id` — auth+owner — delete plan — `{ success }`

### `payrollLines.ts` → mount `payroll-lines`
- `GET /` — public — list lines (filters `?project_id=&week_ending=&worker_id=`) — `PayrollLine[]`
- `GET /:id` — public — line detail — `PayrollLine`
- `POST /` — auth — create line — `PayrollLine`
- `POST /bulk` — auth — bulk create week of lines — `{ inserted, lines }`
- `POST /clone-week` — auth — clone a week to a new week_ending — `{ inserted }`
- `PUT /:id` — auth+owner — update line — `PayrollLine`
- `DELETE /:id` — auth+owner — delete line — `{ success }`

### `validation.ts` → mount `validation`
- `GET /runs` — public — list validation runs (`?project_id=`) — `ValidationRun[]`
- `GET /runs/:id` — public — run + its findings — `{ ...ValidationRun, findings: Finding[] }`
- `POST /run` — auth — prove a project+week (executes rate/fringe/apprentice/OT/classification engines, persists run + findings) — `ValidationRun`

### `findings.ts` → mount `findings`
- `GET /` — public — list findings (`?project_id=&status=&type=`) — `Finding[]`
- `PUT /:id` — auth+owner — update finding status/assignee/notes — `Finding`
- `POST /bulk-resolve` — auth — resolve many findings — `{ updated }`

### `wh347.ts` → mount `wh347`
- `GET /` — public — list WH-347 documents (`?project_id=`) — `Wh347[]`
- `GET /:id` — public — full WH-347 document (lines + totals + signature if signed) — `Wh347`
- `POST /generate` — auth — generate WH-347 from ledger for project+week (populates lines/totals, next payroll_number) — `Wh347`
- `DELETE /:id` — auth+owner — delete draft — `{ success }`

### `signatures.ts` → mount `signatures`
- `GET /:wh347Id` — public — signature for a WH-347 — `Signature | null`
- `POST /` — auth — sign statement of compliance (locks WH-347 → status signed; blocked if open hard findings) — `Signature`
- `POST /:wh347Id/reopen` — auth+owner — reopen signed WH-347 (status reopened) — `{ success }`

### `restitution.ts` → mount `restitution`
- `GET /` — public — list worksheets (`?project_id=`) — `Worksheet[]`
- `GET /:id` — public — worksheet + items — `{ ...Worksheet, items: Item[] }`
- `POST /generate` — auth — build worksheet from findings/shortfalls for project+period — `Worksheet`
- `PUT /:id/items/:itemId` — auth+owner — mark item paid w/ reference — `Item`
- `DELETE /:id` — auth+owner — delete worksheet — `{ success }`

### `subcontractors.ts` → mount `subcontractors`
- `GET /` — public — list subs (`?project_id=`) — `Sub[]`
- `POST /` — auth — create sub — `Sub`
- `PUT /:id` — auth+owner — update sub — `Sub`
- `DELETE /:id` — auth+owner — delete sub — `{ success }`
- `GET /:id/filings` — public — sub filing weeks — `SubFiling[]`
- `POST /:id/filings` — auth+owner — upsert a week filed status — `SubFiling`

### `auditPackets.ts` → mount `audit-packets`
- `GET /` — public — list packets (`?project_id=`) — `Packet[]`
- `GET /:id` — public — packet + manifest — `Packet`
- `POST /generate` — auth — bundle WH-347s/determinations/ledger/fringe/apprentice/restitution for project+range into a manifest — `Packet`
- `DELETE /:id` — auth+owner — delete packet — `{ success }`

### `deadlines.ts` → mount `deadlines`
- `GET /` — public — list filing deadlines (`?project_id=`) — `Deadline[]`
- `POST /generate` — auth — generate weekly deadlines across a project date range — `{ inserted }`
- `PUT /:id` — auth+owner — toggle filed — `Deadline`

### `imports.ts` → mount `imports`
- `GET /` — public — list import jobs — `ImportJob[]`
- `POST /payroll` — auth — import payroll CSV rows (mapped) for a project — `ImportJob`
- `POST /determination` — auth — import determination rate CSV rows — `ImportJob`
- `POST /seed-sample` — auth — provision demo company/project/determination/roster/ledger w/ intentional violations — `{ company, project, summary }`

### `dashboard.ts` → mount `dashboard`
- `GET /summary` — public — global compliance overview (per-project scores, open violations by type, weeks filed vs due, restitution outstanding, upcoming deadlines, violation trend) — `DashboardSummary`

### `reports.ts` → mount `reports`
- `GET /labor-by-classification` — public — labor cost grouped by classification (`?project_id=`) — `Row[]`
- `GET /fringe-cash-vs-plan` — public — fringe split report — `Row[]`
- `GET /apprentice-utilization` — public — apprentice vs journeyworker utilization — `Row[]`
- `GET /restitution-exposure` — public — outstanding restitution exposure — `Row[]`

### `activity.ts` → mount `activity`
- `GET /` — public — activity trail (`?entity_type=&entity_id=`) — `Activity[]`

### `billing.ts` → mount `billing`
- `GET /plan` — public — current user subscription + plan + stripeEnabled — `{ subscription, plan, stripeEnabled }`
- `POST /checkout` — auth — Stripe checkout session (503 if unconfigured) — `{ url }`
- `POST /portal` — auth — Stripe billing portal (503 if unconfigured) — `{ url }`
- `POST /webhook` — public — Stripe webhook (503 if unconfigured) — `{ received }`

(25 domain route files total, excluding the root `/health` served directly in index.ts.)

---

## (c) lib/api.ts methods (method → relative /api/proxy path → verb)

Companies:
- `getCompanies()` → `/api/proxy/companies` GET
- `getCompany(id)` → `/api/proxy/companies/${id}` GET
- `createCompany(body)` → `/api/proxy/companies` POST
- `updateCompany(id, body)` → `/api/proxy/companies/${id}` PUT
- `deleteCompany(id)` → `/api/proxy/companies/${id}` DELETE

Projects:
- `getProjects()` → `/api/proxy/projects` GET
- `getProject(id)` → `/api/proxy/projects/${id}` GET
- `getProjectHealth(id)` → `/api/proxy/projects/${id}/health` GET
- `createProject(body)` → `/api/proxy/projects` POST
- `updateProject(id, body)` → `/api/proxy/projects/${id}` PUT
- `deleteProject(id)` → `/api/proxy/projects/${id}` DELETE

Determinations:
- `getDeterminations(projectId?)` → `/api/proxy/determinations` GET
- `getDetermination(id)` → `/api/proxy/determinations/${id}` GET
- `createDetermination(body)` → `/api/proxy/determinations` POST
- `updateDetermination(id, body)` → `/api/proxy/determinations/${id}` PUT
- `addDeterminationRate(id, body)` → `/api/proxy/determinations/${id}/rates` POST
- `deleteDeterminationRate(id, rateId)` → `/api/proxy/determinations/${id}/rates/${rateId}` DELETE
- `supersedeDetermination(id, body)` → `/api/proxy/determinations/${id}/supersede` POST
- `deleteDetermination(id)` → `/api/proxy/determinations/${id}` DELETE

Classifications:
- `getClassifications()` → `/api/proxy/classifications` GET
- `createClassification(body)` → `/api/proxy/classifications` POST
- `updateClassification(id, body)` → `/api/proxy/classifications/${id}` PUT
- `addClassificationAlias(id, body)` → `/api/proxy/classifications/${id}/aliases` POST
- `deleteClassificationAlias(id, aliasId)` → `/api/proxy/classifications/${id}/aliases/${aliasId}` DELETE
- `deleteClassification(id)` → `/api/proxy/classifications/${id}` DELETE

Workers:
- `getWorkers()` → `/api/proxy/workers` GET
- `getWorker(id)` → `/api/proxy/workers/${id}` GET
- `createWorker(body)` → `/api/proxy/workers` POST
- `updateWorker(id, body)` → `/api/proxy/workers/${id}` PUT
- `deleteWorker(id)` → `/api/proxy/workers/${id}` DELETE

Programs:
- `getPrograms()` → `/api/proxy/programs` GET
- `getProgram(id)` → `/api/proxy/programs/${id}` GET
- `createProgram(body)` → `/api/proxy/programs` POST
- `updateProgram(id, body)` → `/api/proxy/programs/${id}` PUT
- `addProgramLevel(id, body)` → `/api/proxy/programs/${id}/levels` POST
- `deleteProgramLevel(id, levelId)` → `/api/proxy/programs/${id}/levels/${levelId}` DELETE
- `deleteProgram(id)` → `/api/proxy/programs/${id}` DELETE

Fringe plans:
- `getFringePlans()` → `/api/proxy/fringe-plans` GET
- `createFringePlan(body)` → `/api/proxy/fringe-plans` POST
- `updateFringePlan(id, body)` → `/api/proxy/fringe-plans/${id}` PUT
- `deleteFringePlan(id)` → `/api/proxy/fringe-plans/${id}` DELETE

Payroll lines:
- `getPayrollLines(query?)` → `/api/proxy/payroll-lines` GET
- `getPayrollLine(id)` → `/api/proxy/payroll-lines/${id}` GET
- `createPayrollLine(body)` → `/api/proxy/payroll-lines` POST
- `bulkCreatePayrollLines(body)` → `/api/proxy/payroll-lines/bulk` POST
- `cloneWeek(body)` → `/api/proxy/payroll-lines/clone-week` POST
- `updatePayrollLine(id, body)` → `/api/proxy/payroll-lines/${id}` PUT
- `deletePayrollLine(id)` → `/api/proxy/payroll-lines/${id}` DELETE

Validation:
- `getValidationRuns(projectId?)` → `/api/proxy/validation/runs` GET
- `getValidationRun(id)` → `/api/proxy/validation/runs/${id}` GET
- `runValidation(body)` → `/api/proxy/validation/run` POST

Findings:
- `getFindings(query?)` → `/api/proxy/findings` GET
- `updateFinding(id, body)` → `/api/proxy/findings/${id}` PUT
- `bulkResolveFindings(body)` → `/api/proxy/findings/bulk-resolve` POST

WH-347:
- `getWh347s(projectId?)` → `/api/proxy/wh347` GET
- `getWh347(id)` → `/api/proxy/wh347/${id}` GET
- `generateWh347(body)` → `/api/proxy/wh347/generate` POST
- `deleteWh347(id)` → `/api/proxy/wh347/${id}` DELETE

Signatures:
- `getSignature(wh347Id)` → `/api/proxy/signatures/${wh347Id}` GET
- `signCompliance(body)` → `/api/proxy/signatures` POST
- `reopenWh347(wh347Id)` → `/api/proxy/signatures/${wh347Id}/reopen` POST

Restitution:
- `getRestitutionWorksheets(projectId?)` → `/api/proxy/restitution` GET
- `getRestitutionWorksheet(id)` → `/api/proxy/restitution/${id}` GET
- `generateRestitution(body)` → `/api/proxy/restitution/generate` POST
- `markRestitutionItemPaid(id, itemId, body)` → `/api/proxy/restitution/${id}/items/${itemId}` PUT
- `deleteRestitutionWorksheet(id)` → `/api/proxy/restitution/${id}` DELETE

Subcontractors:
- `getSubcontractors(projectId?)` → `/api/proxy/subcontractors` GET
- `createSubcontractor(body)` → `/api/proxy/subcontractors` POST
- `updateSubcontractor(id, body)` → `/api/proxy/subcontractors/${id}` PUT
- `deleteSubcontractor(id)` → `/api/proxy/subcontractors/${id}` DELETE
- `getSubFilings(id)` → `/api/proxy/subcontractors/${id}/filings` GET
- `upsertSubFiling(id, body)` → `/api/proxy/subcontractors/${id}/filings` POST

Audit packets:
- `getAuditPackets(projectId?)` → `/api/proxy/audit-packets` GET
- `getAuditPacket(id)` → `/api/proxy/audit-packets/${id}` GET
- `generateAuditPacket(body)` → `/api/proxy/audit-packets/generate` POST
- `deleteAuditPacket(id)` → `/api/proxy/audit-packets/${id}` DELETE

Deadlines:
- `getDeadlines(projectId?)` → `/api/proxy/deadlines` GET
- `generateDeadlines(body)` → `/api/proxy/deadlines/generate` POST
- `updateDeadline(id, body)` → `/api/proxy/deadlines/${id}` PUT

Imports:
- `getImportJobs()` → `/api/proxy/imports` GET
- `importPayroll(body)` → `/api/proxy/imports/payroll` POST
- `importDetermination(body)` → `/api/proxy/imports/determination` POST
- `seedSample()` → `/api/proxy/imports/seed-sample` POST

Dashboard:
- `getDashboardSummary()` → `/api/proxy/dashboard/summary` GET

Reports:
- `getLaborByClassification(projectId?)` → `/api/proxy/reports/labor-by-classification` GET
- `getFringeCashVsPlan(projectId?)` → `/api/proxy/reports/fringe-cash-vs-plan` GET
- `getApprenticeUtilization(projectId?)` → `/api/proxy/reports/apprentice-utilization` GET
- `getRestitutionExposure(projectId?)` → `/api/proxy/reports/restitution-exposure` GET

Activity:
- `getActivity(query?)` → `/api/proxy/activity` GET

Billing:
- `getBillingPlan()` → `/api/proxy/billing/plan` GET
- `createCheckout()` → `/api/proxy/billing/checkout` POST
- `createPortal()` → `/api/proxy/billing/portal` POST

---

## (d) Pages (URL → file under web/ → kind → api methods → renders)

Public:
1. `/` — `app/page.tsx` — public — (none) — static landing/marketing hero + feature grid + CTAs
2. `/auth/sign-in` — `app/auth/sign-in/page.tsx` — public — authClient — sign-in form
3. `/auth/sign-up` — `app/auth/sign-up/page.tsx` — public — authClient — sign-up form
4. `/pricing` — `app/pricing/page.tsx` — public — getBillingPlan — pricing tiers (all free; Stripe optional)

Dashboard (auth-gated, DashboardLayout chrome):
5. `/dashboard` — `app/dashboard/page.tsx` — dashboard — getDashboardSummary, getProjects — compliance overview: health scores, open violations by type, weeks filed vs due, restitution outstanding, upcoming deadlines, violation trend
6. `/dashboard/projects` — `app/dashboard/projects/page.tsx` — dashboard — getProjects, createProject, getCompanies — project list + create
7. `/dashboard/projects/[id]` — `app/dashboard/projects/[id]/page.tsx` — dashboard — getProject, getProjectHealth, updateProject, getDeterminations, deleteProject — project detail: health, attached determinations, weeks
8. `/dashboard/determinations` — `app/dashboard/determinations/page.tsx` — dashboard — getDeterminations, createDetermination, getProjects — wage-determination register + create
9. `/dashboard/determinations/[id]` — `app/dashboard/determinations/[id]/page.tsx` — dashboard — getDetermination, updateDetermination, addDeterminationRate, deleteDeterminationRate, supersedeDetermination — determination detail + per-classification rate rows
10. `/dashboard/classifications` — `app/dashboard/classifications/page.tsx` — dashboard — getClassifications, createClassification, updateClassification, addClassificationAlias, deleteClassificationAlias, deleteClassification — classification catalog + aliases
11. `/dashboard/workers` — `app/dashboard/workers/page.tsx` — dashboard — getWorkers, createWorker, updateWorker, deleteWorker, getPrograms — worker roster + apprentice enrollment
12. `/dashboard/programs` — `app/dashboard/programs/page.tsx` — dashboard — getPrograms, createProgram, updateProgram, addProgramLevel, deleteProgramLevel, deleteProgram — apprenticeship programs + levels
13. `/dashboard/fringe-plans` — `app/dashboard/fringe-plans/page.tsx` — dashboard — getFringePlans, createFringePlan, updateFringePlan, deleteFringePlan — bona-fide plan register
14. `/dashboard/ledger` — `app/dashboard/ledger/page.tsx` — dashboard — getPayrollLines, createPayrollLine, bulkCreatePayrollLines, cloneWeek, updatePayrollLine, deletePayrollLine, getProjects, getWorkers — per-worker per-day classification ledger w/ bulk week entry + clone-week
15. `/dashboard/validation` — `app/dashboard/validation/page.tsx` — dashboard — getValidationRuns, getValidationRun, runValidation, getProjects — run prove + validation run history + per-run findings
16. `/dashboard/findings` — `app/dashboard/findings/page.tsx` — dashboard — getFindings, updateFinding, bulkResolveFindings, getProjects — violations/findings tracker
17. `/dashboard/wh347` — `app/dashboard/wh347/page.tsx` — dashboard — getWh347s, generateWh347, deleteWh347, getProjects — WH-347 generator + list
18. `/dashboard/wh347/[id]` — `app/dashboard/wh347/[id]/page.tsx` — dashboard — getWh347, getSignature, signCompliance, reopenWh347 — single WH-347 view + statement-of-compliance sign workflow
19. `/dashboard/restitution` — `app/dashboard/restitution/page.tsx` — dashboard — getRestitutionWorksheets, getRestitutionWorksheet, generateRestitution, markRestitutionItemPaid, deleteRestitutionWorksheet, getProjects — back-wage restitution worksheets
20. `/dashboard/subcontractors` — `app/dashboard/subcontractors/page.tsx` — dashboard — getSubcontractors, createSubcontractor, updateSubcontractor, deleteSubcontractor, getSubFilings, upsertSubFiling, getProjects — sub tier tracking + weekly filings
21. `/dashboard/audit-packets` — `app/dashboard/audit-packets/page.tsx` — dashboard — getAuditPackets, getAuditPacket, generateAuditPacket, deleteAuditPacket, getProjects — DOL/CO audit packet export
22. `/dashboard/deadlines` — `app/dashboard/deadlines/page.tsx` — dashboard — getDeadlines, generateDeadlines, updateDeadline, getProjects — filing calendar + deadline reminders
23. `/dashboard/imports` — `app/dashboard/imports/page.tsx` — dashboard — getImportJobs, importPayroll, importDetermination, seedSample, getProjects — CSV import + sample-data seeder
24. `/dashboard/reports` — `app/dashboard/reports/page.tsx` — dashboard — getLaborByClassification, getFringeCashVsPlan, getApprenticeUtilization, getRestitutionExposure, getProjects — reports & analytics
25. `/dashboard/activity` — `app/dashboard/activity/page.tsx` — dashboard — getActivity — audit log / activity trail
26. `/dashboard/settings` — `app/dashboard/settings/page.tsx` — dashboard — getCompanies, createCompany, updateCompany, getBillingPlan, createCheckout, createPortal — company profile, OT rules, tolerance, billing

Route handlers (not pages): `app/api/auth/[...path]/route.ts`, `app/api/proxy/[...path]/route.ts`.

(26 page.tsx files: 4 public + 22 dashboard.)

---

## (e) DashboardLayout sidebar nav sections

- **Overview**
  - Dashboard → `/dashboard`
- **Projects & Wages**
  - Projects → `/dashboard/projects`
  - Determinations → `/dashboard/determinations`
  - Classifications → `/dashboard/classifications`
- **Workforce**
  - Workers → `/dashboard/workers`
  - Apprenticeship Programs → `/dashboard/programs`
  - Fringe Plans → `/dashboard/fringe-plans`
- **Payroll & Proof**
  - Ledger → `/dashboard/ledger`
  - Validation → `/dashboard/validation`
  - Findings → `/dashboard/findings`
- **Filing**
  - WH-347 → `/dashboard/wh347`
  - Restitution → `/dashboard/restitution`
  - Subcontractors → `/dashboard/subcontractors`
  - Audit Packets → `/dashboard/audit-packets`
  - Deadlines → `/dashboard/deadlines`
- **Data & Insights**
  - Imports → `/dashboard/imports`
  - Reports → `/dashboard/reports`
  - Activity → `/dashboard/activity`
- **Account**
  - Settings → `/dashboard/settings`

---

## Consistency check

- Every api method maps to exactly one backend endpoint (verb + path 1:1 under /api/proxy ↔ /api/v1).
- Every api method is consumed by at least one page (see section d).
- 25 backend route files, 26 pages (4 public + 22 dashboard), 26 tables. All 24 idea.md feature sections are covered.
