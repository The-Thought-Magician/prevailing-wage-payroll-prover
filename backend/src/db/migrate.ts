import { db } from './index.js'
import { sql } from 'drizzle-orm'

const statements: string[] = [
  // companies
  `CREATE TABLE IF NOT EXISTS companies (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    legal_name text NOT NULL,
    fein text,
    address text,
    city text,
    state text,
    zip text,
    signatory_name text,
    signatory_title text,
    ot_rule_set text NOT NULL DEFAULT 'federal',
    rate_tolerance_cents integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  // projects
  `CREATE TABLE IF NOT EXISTS projects (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    company_id text REFERENCES companies(id),
    name text NOT NULL,
    awarding_agency text,
    contract_number text,
    role text NOT NULL DEFAULT 'prime',
    county text,
    state text,
    coverage text NOT NULL DEFAULT 'federal',
    contract_value_cents integer DEFAULT 0,
    labor_budget_cents integer DEFAULT 0,
    status text NOT NULL DEFAULT 'active',
    filing_cadence text NOT NULL DEFAULT 'weekly',
    start_date text,
    end_date text,
    crafts jsonb DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  // wage_determinations
  `CREATE TABLE IF NOT EXISTS wage_determinations (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    project_id text REFERENCES projects(id),
    wd_number text NOT NULL,
    modification_number text DEFAULT '0',
    decision_date text,
    effective_date text,
    locality text,
    county text,
    state text,
    schedule_type text,
    source text NOT NULL DEFAULT 'union',
    is_active boolean NOT NULL DEFAULT true,
    superseded_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  // determination_rates
  `CREATE TABLE IF NOT EXISTS determination_rates (
    id text PRIMARY KEY,
    determination_id text NOT NULL REFERENCES wage_determinations(id),
    classification_name text NOT NULL,
    base_rate real NOT NULL,
    fringe_rate real NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (determination_id, classification_name)
  )`,

  // classifications
  `CREATE TABLE IF NOT EXISTS classifications (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    canonical_name text NOT NULL,
    craft_group text,
    level text,
    apprentice_eligible boolean NOT NULL DEFAULT false,
    journeyworker_classification text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  // classification_aliases
  `CREATE TABLE IF NOT EXISTS classification_aliases (
    id text PRIMARY KEY,
    classification_id text NOT NULL REFERENCES classifications(id),
    alias text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (classification_id, alias)
  )`,

  // workers
  `CREATE TABLE IF NOT EXISTS workers (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    full_name text NOT NULL,
    ssn_last4 text,
    employee_id text,
    address text,
    gender text,
    ethnicity text,
    default_classification text,
    is_apprentice boolean NOT NULL DEFAULT false,
    program_id text,
    program_level_id text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  // apprenticeship_programs
  `CREATE TABLE IF NOT EXISTS apprenticeship_programs (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    registration_number text NOT NULL,
    sponsor text,
    trade text,
    required_ratio real NOT NULL DEFAULT 1,
    effective_date text,
    end_date text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  // apprenticeship_levels
  `CREATE TABLE IF NOT EXISTS apprenticeship_levels (
    id text PRIMARY KEY,
    program_id text NOT NULL REFERENCES apprenticeship_programs(id),
    level_name text NOT NULL,
    period_number integer NOT NULL DEFAULT 1,
    pct_of_journeyworker real NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (program_id, period_number)
  )`,

  // fringe_plans
  `CREATE TABLE IF NOT EXISTS fringe_plans (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    name text NOT NULL,
    plan_type text NOT NULL DEFAULT 'health',
    provider text,
    contribution_basis text NOT NULL DEFAULT 'per_hour',
    effective_date text,
    end_date text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  // payroll_lines
  `CREATE TABLE IF NOT EXISTS payroll_lines (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    project_id text NOT NULL REFERENCES projects(id),
    worker_id text NOT NULL REFERENCES workers(id),
    determination_id text REFERENCES wage_determinations(id),
    work_date text NOT NULL,
    week_ending text NOT NULL,
    classification_name text NOT NULL,
    straight_hours real NOT NULL DEFAULT 0,
    overtime_hours real NOT NULL DEFAULT 0,
    doubletime_hours real NOT NULL DEFAULT 0,
    base_rate_paid real NOT NULL DEFAULT 0,
    fringe_cash_paid real NOT NULL DEFAULT 0,
    fringe_plan_paid real NOT NULL DEFAULT 0,
    gross_paid real NOT NULL DEFAULT 0,
    is_apprentice boolean NOT NULL DEFAULT false,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  // fringe_contributions
  `CREATE TABLE IF NOT EXISTS fringe_contributions (
    id text PRIMARY KEY,
    payroll_line_id text NOT NULL REFERENCES payroll_lines(id),
    fringe_plan_id text NOT NULL REFERENCES fringe_plans(id),
    amount_per_hour real NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  // validation_runs
  `CREATE TABLE IF NOT EXISTS validation_runs (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    project_id text NOT NULL REFERENCES projects(id),
    week_ending text NOT NULL,
    status text NOT NULL DEFAULT 'completed',
    total_lines integer NOT NULL DEFAULT 0,
    pass_count integer NOT NULL DEFAULT 0,
    fail_count integer NOT NULL DEFAULT 0,
    hard_fail boolean NOT NULL DEFAULT false,
    total_shortfall real NOT NULL DEFAULT 0,
    summary jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  // validation_findings
  `CREATE TABLE IF NOT EXISTS validation_findings (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    run_id text REFERENCES validation_runs(id),
    project_id text NOT NULL REFERENCES projects(id),
    payroll_line_id text REFERENCES payroll_lines(id),
    worker_id text REFERENCES workers(id),
    finding_type text NOT NULL,
    severity text NOT NULL DEFAULT 'high',
    status text NOT NULL DEFAULT 'open',
    message text NOT NULL,
    shortfall real NOT NULL DEFAULT 0,
    week_ending text,
    assignee text,
    resolution_notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  // wh347_payrolls
  `CREATE TABLE IF NOT EXISTS wh347_payrolls (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    project_id text NOT NULL REFERENCES projects(id),
    week_ending text NOT NULL,
    payroll_number integer NOT NULL DEFAULT 1,
    is_final boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'draft',
    fringe_method text NOT NULL DEFAULT '4a',
    lines jsonb DEFAULT '[]'::jsonb,
    totals jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, week_ending, payroll_number)
  )`,

  // compliance_signatures
  `CREATE TABLE IF NOT EXISTS compliance_signatures (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    wh347_id text NOT NULL REFERENCES wh347_payrolls(id),
    signer_name text NOT NULL,
    signer_title text NOT NULL,
    attestation_text text NOT NULL,
    fringe_method text NOT NULL DEFAULT '4a',
    signed_ip text,
    signed_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  // restitution_worksheets
  `CREATE TABLE IF NOT EXISTS restitution_worksheets (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    project_id text NOT NULL REFERENCES projects(id),
    period_start text,
    period_end text,
    status text NOT NULL DEFAULT 'open',
    total_owed real NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  // restitution_items
  `CREATE TABLE IF NOT EXISTS restitution_items (
    id text PRIMARY KEY,
    worksheet_id text NOT NULL REFERENCES restitution_worksheets(id),
    worker_id text NOT NULL REFERENCES workers(id),
    base_shortfall real NOT NULL DEFAULT 0,
    fringe_shortfall real NOT NULL DEFAULT 0,
    ot_shortfall real NOT NULL DEFAULT 0,
    total_shortfall real NOT NULL DEFAULT 0,
    paid boolean NOT NULL DEFAULT false,
    paid_reference text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  // subcontractors
  `CREATE TABLE IF NOT EXISTS subcontractors (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    project_id text NOT NULL REFERENCES projects(id),
    name text NOT NULL,
    tier integer NOT NULL DEFAULT 1,
    contact_name text,
    contact_email text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  // sub_filings
  `CREATE TABLE IF NOT EXISTS sub_filings (
    id text PRIMARY KEY,
    subcontractor_id text NOT NULL REFERENCES subcontractors(id),
    week_ending text NOT NULL,
    filed boolean NOT NULL DEFAULT false,
    filed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (subcontractor_id, week_ending)
  )`,

  // audit_packets
  `CREATE TABLE IF NOT EXISTS audit_packets (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    project_id text NOT NULL REFERENCES projects(id),
    period_start text,
    period_end text,
    status text NOT NULL DEFAULT 'generated',
    manifest jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  // filing_deadlines
  `CREATE TABLE IF NOT EXISTS filing_deadlines (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    project_id text NOT NULL REFERENCES projects(id),
    week_ending text NOT NULL,
    due_date text NOT NULL,
    filed boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, week_ending)
  )`,

  // import_jobs
  `CREATE TABLE IF NOT EXISTS import_jobs (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    project_id text REFERENCES projects(id),
    import_type text NOT NULL,
    status text NOT NULL DEFAULT 'completed',
    total_rows integer NOT NULL DEFAULT 0,
    inserted_rows integer NOT NULL DEFAULT 0,
    errors jsonb DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  // activity_log
  `CREATE TABLE IF NOT EXISTS activity_log (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    entity_type text NOT NULL,
    entity_id text,
    action text NOT NULL,
    detail jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  // plans
  `CREATE TABLE IF NOT EXISTS plans (
    id text PRIMARY KEY,
    name text NOT NULL,
    price_cents integer NOT NULL DEFAULT 0
  )`,

  // subscriptions
  `CREATE TABLE IF NOT EXISTS subscriptions (
    id text PRIMARY KEY,
    user_id text NOT NULL UNIQUE,
    plan_id text NOT NULL DEFAULT 'free',
    stripe_customer_id text,
    stripe_subscription_id text,
    status text NOT NULL DEFAULT 'active',
    current_period_end timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
]

const indexes: string[] = [
  `CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_projects_company ON projects(company_id)`,
  `CREATE INDEX IF NOT EXISTS idx_wage_determinations_user ON wage_determinations(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_wage_determinations_project ON wage_determinations(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_determination_rates_determination ON determination_rates(determination_id)`,
  `CREATE INDEX IF NOT EXISTS idx_classifications_user ON classifications(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_classification_aliases_classification ON classification_aliases(classification_id)`,
  `CREATE INDEX IF NOT EXISTS idx_workers_user ON workers(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_apprenticeship_programs_user ON apprenticeship_programs(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_apprenticeship_levels_program ON apprenticeship_levels(program_id)`,
  `CREATE INDEX IF NOT EXISTS idx_fringe_plans_user ON fringe_plans(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_payroll_lines_user ON payroll_lines(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_payroll_lines_project ON payroll_lines(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_payroll_lines_worker ON payroll_lines(worker_id)`,
  `CREATE INDEX IF NOT EXISTS idx_payroll_lines_week ON payroll_lines(project_id, week_ending)`,
  `CREATE INDEX IF NOT EXISTS idx_fringe_contributions_line ON fringe_contributions(payroll_line_id)`,
  `CREATE INDEX IF NOT EXISTS idx_validation_runs_project ON validation_runs(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_validation_findings_run ON validation_findings(run_id)`,
  `CREATE INDEX IF NOT EXISTS idx_validation_findings_project ON validation_findings(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_wh347_payrolls_project ON wh347_payrolls(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_compliance_signatures_wh347 ON compliance_signatures(wh347_id)`,
  `CREATE INDEX IF NOT EXISTS idx_restitution_worksheets_project ON restitution_worksheets(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_restitution_items_worksheet ON restitution_items(worksheet_id)`,
  `CREATE INDEX IF NOT EXISTS idx_subcontractors_project ON subcontractors(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sub_filings_sub ON sub_filings(subcontractor_id)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_packets_project ON audit_packets(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_filing_deadlines_project ON filing_deadlines(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_import_jobs_user ON import_jobs(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id)`,
]

export async function migrate() {
  for (const stmt of statements) {
    await db.execute(sql.raw(stmt))
  }
  for (const idx of indexes) {
    await db.execute(sql.raw(idx))
  }
  console.log('Migration complete: prevailing-wage-payroll-prover schema provisioned')
}
