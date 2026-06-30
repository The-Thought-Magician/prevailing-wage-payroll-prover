import { pgTable, text, integer, boolean, timestamp, jsonb, unique, real } from 'drizzle-orm/pg-core'

// ---------------------------------------------------------------------------
// Company-of-record profiles
// ---------------------------------------------------------------------------
export const companies = pgTable('companies', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  legal_name: text('legal_name').notNull(),
  fein: text('fein'),
  address: text('address'),
  city: text('city'),
  state: text('state'),
  zip: text('zip'),
  signatory_name: text('signatory_name'),
  signatory_title: text('signatory_title'),
  ot_rule_set: text('ot_rule_set').notNull().default('federal'),
  rate_tolerance_cents: integer('rate_tolerance_cents').notNull().default(0),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------
export const projects = pgTable('projects', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  company_id: text('company_id').references(() => companies.id),
  name: text('name').notNull(),
  awarding_agency: text('awarding_agency'),
  contract_number: text('contract_number'),
  role: text('role').notNull().default('prime'), // prime | sub
  county: text('county'),
  state: text('state'),
  coverage: text('coverage').notNull().default('federal'), // federal | state
  contract_value_cents: integer('contract_value_cents').default(0),
  labor_budget_cents: integer('labor_budget_cents').default(0),
  status: text('status').notNull().default('active'), // active | closed | suspended
  filing_cadence: text('filing_cadence').notNull().default('weekly'),
  start_date: text('start_date'),
  end_date: text('end_date'),
  crafts: jsonb('crafts').$type<string[]>().default([]),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Wage determinations
// ---------------------------------------------------------------------------
export const wage_determinations = pgTable('wage_determinations', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  project_id: text('project_id').references(() => projects.id),
  wd_number: text('wd_number').notNull(),
  modification_number: text('modification_number').default('0'),
  decision_date: text('decision_date'),
  effective_date: text('effective_date'),
  locality: text('locality'),
  county: text('county'),
  state: text('state'),
  schedule_type: text('schedule_type'), // building | heavy | highway | residential
  source: text('source').notNull().default('union'), // union | survey
  is_active: boolean('is_active').notNull().default(true),
  superseded_by: text('superseded_by'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

// Per-classification base + fringe rows within a determination
export const determination_rates = pgTable('determination_rates', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  determination_id: text('determination_id').notNull().references(() => wage_determinations.id),
  classification_name: text('classification_name').notNull(),
  base_rate: real('base_rate').notNull(),
  fringe_rate: real('fringe_rate').notNull().default(0),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (t) => [unique().on(t.determination_id, t.classification_name)])

// ---------------------------------------------------------------------------
// Classification catalog
// ---------------------------------------------------------------------------
export const classifications = pgTable('classifications', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  canonical_name: text('canonical_name').notNull(),
  craft_group: text('craft_group'),
  level: text('level'),
  apprentice_eligible: boolean('apprentice_eligible').notNull().default(false),
  journeyworker_classification: text('journeyworker_classification'),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const classification_aliases = pgTable('classification_aliases', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  classification_id: text('classification_id').notNull().references(() => classifications.id),
  alias: text('alias').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (t) => [unique().on(t.classification_id, t.alias)])

// ---------------------------------------------------------------------------
// Workers
// ---------------------------------------------------------------------------
export const workers = pgTable('workers', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  full_name: text('full_name').notNull(),
  ssn_last4: text('ssn_last4'),
  employee_id: text('employee_id'),
  address: text('address'),
  gender: text('gender'),
  ethnicity: text('ethnicity'),
  default_classification: text('default_classification'),
  is_apprentice: boolean('is_apprentice').notNull().default(false),
  program_id: text('program_id'),
  program_level_id: text('program_level_id'),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Apprenticeship programs + levels
// ---------------------------------------------------------------------------
export const apprenticeship_programs = pgTable('apprenticeship_programs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  registration_number: text('registration_number').notNull(),
  sponsor: text('sponsor'),
  trade: text('trade'),
  required_ratio: real('required_ratio').notNull().default(1), // apprentices per journeyworker
  effective_date: text('effective_date'),
  end_date: text('end_date'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

export const apprenticeship_levels = pgTable('apprenticeship_levels', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  program_id: text('program_id').notNull().references(() => apprenticeship_programs.id),
  level_name: text('level_name').notNull(),
  period_number: integer('period_number').notNull().default(1),
  pct_of_journeyworker: real('pct_of_journeyworker').notNull(), // e.g. 0.65
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (t) => [unique().on(t.program_id, t.period_number)])

// ---------------------------------------------------------------------------
// Fringe plans (bona-fide benefit plans)
// ---------------------------------------------------------------------------
export const fringe_plans = pgTable('fringe_plans', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  name: text('name').notNull(),
  plan_type: text('plan_type').notNull().default('health'), // health | pension | vacation | training | apprenticeship
  provider: text('provider'),
  contribution_basis: text('contribution_basis').notNull().default('per_hour'), // per_hour | per_month
  effective_date: text('effective_date'),
  end_date: text('end_date'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Payroll lines (per-worker per-day classification ledger)
// ---------------------------------------------------------------------------
export const payroll_lines = pgTable('payroll_lines', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  project_id: text('project_id').notNull().references(() => projects.id),
  worker_id: text('worker_id').notNull().references(() => workers.id),
  determination_id: text('determination_id').references(() => wage_determinations.id),
  work_date: text('work_date').notNull(), // ISO date of the worked day
  week_ending: text('week_ending').notNull(), // ISO date of the payroll week
  classification_name: text('classification_name').notNull(),
  straight_hours: real('straight_hours').notNull().default(0),
  overtime_hours: real('overtime_hours').notNull().default(0),
  doubletime_hours: real('doubletime_hours').notNull().default(0),
  base_rate_paid: real('base_rate_paid').notNull().default(0),
  fringe_cash_paid: real('fringe_cash_paid').notNull().default(0),
  fringe_plan_paid: real('fringe_plan_paid').notNull().default(0),
  gross_paid: real('gross_paid').notNull().default(0),
  is_apprentice: boolean('is_apprentice').notNull().default(false),
  notes: text('notes'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

// Plan contributions attached to a payroll line
export const fringe_contributions = pgTable('fringe_contributions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  payroll_line_id: text('payroll_line_id').notNull().references(() => payroll_lines.id),
  fringe_plan_id: text('fringe_plan_id').notNull().references(() => fringe_plans.id),
  amount_per_hour: real('amount_per_hour').notNull().default(0),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Validation runs + findings
// ---------------------------------------------------------------------------
export const validation_runs = pgTable('validation_runs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  project_id: text('project_id').notNull().references(() => projects.id),
  week_ending: text('week_ending').notNull(),
  status: text('status').notNull().default('completed'), // completed | running
  total_lines: integer('total_lines').notNull().default(0),
  pass_count: integer('pass_count').notNull().default(0),
  fail_count: integer('fail_count').notNull().default(0),
  hard_fail: boolean('hard_fail').notNull().default(false),
  total_shortfall: real('total_shortfall').notNull().default(0),
  summary: jsonb('summary').$type<Record<string, unknown>>().default({}),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const validation_findings = pgTable('validation_findings', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  run_id: text('run_id').references(() => validation_runs.id),
  project_id: text('project_id').notNull().references(() => projects.id),
  payroll_line_id: text('payroll_line_id').references(() => payroll_lines.id),
  worker_id: text('worker_id').references(() => workers.id),
  finding_type: text('finding_type').notNull(), // rate | fringe | apprentice | overtime | classification | missing_filing
  severity: text('severity').notNull().default('high'), // high | medium | low
  status: text('status').notNull().default('open'), // open | acknowledged | resolved | waived
  message: text('message').notNull(),
  shortfall: real('shortfall').notNull().default(0),
  week_ending: text('week_ending'),
  assignee: text('assignee'),
  resolution_notes: text('resolution_notes'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// WH-347 payrolls + signatures
// ---------------------------------------------------------------------------
export const wh347_payrolls = pgTable('wh347_payrolls', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  project_id: text('project_id').notNull().references(() => projects.id),
  week_ending: text('week_ending').notNull(),
  payroll_number: integer('payroll_number').notNull().default(1),
  is_final: boolean('is_final').notNull().default(false),
  status: text('status').notNull().default('draft'), // draft | signed | reopened
  fringe_method: text('fringe_method').notNull().default('4a'), // 4a | 4b | exception
  lines: jsonb('lines').$type<Record<string, unknown>[]>().default([]),
  totals: jsonb('totals').$type<Record<string, unknown>>().default({}),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [unique().on(t.project_id, t.week_ending, t.payroll_number)])

export const compliance_signatures = pgTable('compliance_signatures', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  wh347_id: text('wh347_id').notNull().references(() => wh347_payrolls.id),
  signer_name: text('signer_name').notNull(),
  signer_title: text('signer_title').notNull(),
  attestation_text: text('attestation_text').notNull(),
  fringe_method: text('fringe_method').notNull().default('4a'),
  signed_ip: text('signed_ip'),
  signed_at: timestamp('signed_at').defaultNow().notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Restitution / back-wage
// ---------------------------------------------------------------------------
export const restitution_worksheets = pgTable('restitution_worksheets', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  project_id: text('project_id').notNull().references(() => projects.id),
  period_start: text('period_start'),
  period_end: text('period_end'),
  status: text('status').notNull().default('open'), // open | paid
  total_owed: real('total_owed').notNull().default(0),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

export const restitution_items = pgTable('restitution_items', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  worksheet_id: text('worksheet_id').notNull().references(() => restitution_worksheets.id),
  worker_id: text('worker_id').notNull().references(() => workers.id),
  base_shortfall: real('base_shortfall').notNull().default(0),
  fringe_shortfall: real('fringe_shortfall').notNull().default(0),
  ot_shortfall: real('ot_shortfall').notNull().default(0),
  total_shortfall: real('total_shortfall').notNull().default(0),
  paid: boolean('paid').notNull().default(false),
  paid_reference: text('paid_reference'),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Subcontractor tier tracking
// ---------------------------------------------------------------------------
export const subcontractors = pgTable('subcontractors', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  project_id: text('project_id').notNull().references(() => projects.id),
  name: text('name').notNull(),
  tier: integer('tier').notNull().default(1),
  contact_name: text('contact_name'),
  contact_email: text('contact_email'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

export const sub_filings = pgTable('sub_filings', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  subcontractor_id: text('subcontractor_id').notNull().references(() => subcontractors.id),
  week_ending: text('week_ending').notNull(),
  filed: boolean('filed').notNull().default(false),
  filed_at: timestamp('filed_at'),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (t) => [unique().on(t.subcontractor_id, t.week_ending)])

// ---------------------------------------------------------------------------
// Audit packets
// ---------------------------------------------------------------------------
export const audit_packets = pgTable('audit_packets', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  project_id: text('project_id').notNull().references(() => projects.id),
  period_start: text('period_start'),
  period_end: text('period_end'),
  status: text('status').notNull().default('generated'),
  manifest: jsonb('manifest').$type<Record<string, unknown>>().default({}),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Filing deadlines
// ---------------------------------------------------------------------------
export const filing_deadlines = pgTable('filing_deadlines', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  project_id: text('project_id').notNull().references(() => projects.id),
  week_ending: text('week_ending').notNull(),
  due_date: text('due_date').notNull(),
  filed: boolean('filed').notNull().default(false),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (t) => [unique().on(t.project_id, t.week_ending)])

// ---------------------------------------------------------------------------
// Import jobs
// ---------------------------------------------------------------------------
export const import_jobs = pgTable('import_jobs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  project_id: text('project_id').references(() => projects.id),
  import_type: text('import_type').notNull(), // payroll | determination
  status: text('status').notNull().default('completed'), // completed | failed
  total_rows: integer('total_rows').notNull().default(0),
  inserted_rows: integer('inserted_rows').notNull().default(0),
  errors: jsonb('errors').$type<Record<string, unknown>[]>().default([]),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Activity log
// ---------------------------------------------------------------------------
export const activity_log = pgTable('activity_log', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  entity_type: text('entity_type').notNull(),
  entity_id: text('entity_id'),
  action: text('action').notNull(), // created | updated | deleted | signed | exported
  detail: jsonb('detail').$type<Record<string, unknown>>().default({}),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------
export const plans = pgTable('plans', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  price_cents: integer('price_cents').notNull().default(0),
})

export const subscriptions = pgTable('subscriptions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull().unique(),
  plan_id: text('plan_id').notNull().default('free'),
  stripe_customer_id: text('stripe_customer_id'),
  stripe_subscription_id: text('stripe_subscription_id'),
  status: text('status').notNull().default('active'),
  current_period_end: timestamp('current_period_end'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})
