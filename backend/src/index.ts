import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { db } from './db/index.js'
import { migrate } from './db/migrate.js'
import {
  plans,
  companies,
  projects,
  wage_determinations,
  determination_rates,
  workers,
  payroll_lines,
} from './db/schema.js'

import companiesRoutes from './routes/companies.js'
import projectsRoutes from './routes/projects.js'
import determinationsRoutes from './routes/determinations.js'
import classificationsRoutes from './routes/classifications.js'
import workersRoutes from './routes/workers.js'
import programsRoutes from './routes/programs.js'
import fringePlansRoutes from './routes/fringePlans.js'
import payrollLinesRoutes from './routes/payrollLines.js'
import validationRoutes from './routes/validation.js'
import findingsRoutes from './routes/findings.js'
import wh347Routes from './routes/wh347.js'
import signaturesRoutes from './routes/signatures.js'
import restitutionRoutes from './routes/restitution.js'
import subcontractorsRoutes from './routes/subcontractors.js'
import auditPacketsRoutes from './routes/auditPackets.js'
import deadlinesRoutes from './routes/deadlines.js'
import importsRoutes from './routes/imports.js'
import dashboardRoutes from './routes/dashboard.js'
import reportsRoutes from './routes/reports.js'
import activityRoutes from './routes/activity.js'
import billingRoutes from './routes/billing.js'

const app = new Hono()

const allowedOrigins = [
  process.env.FRONTEND_URL ?? 'http://localhost:3000',
  'https://prevailing-wage-payroll-prover-ventures.vercel.app',
]

app.use(
  '*',
  cors({
    origin: (origin) => (allowedOrigins.includes(origin) ? origin : allowedOrigins[0]),
    credentials: true,
  }),
)

const api = new Hono()
api.route('/companies', companiesRoutes)
api.route('/projects', projectsRoutes)
api.route('/determinations', determinationsRoutes)
api.route('/classifications', classificationsRoutes)
api.route('/workers', workersRoutes)
api.route('/programs', programsRoutes)
api.route('/fringe-plans', fringePlansRoutes)
api.route('/payroll-lines', payrollLinesRoutes)
api.route('/validation', validationRoutes)
api.route('/findings', findingsRoutes)
api.route('/wh347', wh347Routes)
api.route('/signatures', signaturesRoutes)
api.route('/restitution', restitutionRoutes)
api.route('/subcontractors', subcontractorsRoutes)
api.route('/audit-packets', auditPacketsRoutes)
api.route('/deadlines', deadlinesRoutes)
api.route('/imports', importsRoutes)
api.route('/dashboard', dashboardRoutes)
api.route('/reports', reportsRoutes)
api.route('/activity', activityRoutes)
api.route('/billing', billingRoutes)

app.route('/api/v1', api)
app.get('/health', (c) => c.json({ ok: true }))

const DEMO_USER = 'demo-user'

async function seedIfEmpty() {
  // Plans (idempotent: count-then-insert)
  const existingPlans = await db.select().from(plans).limit(1)
  if (existingPlans.length === 0) {
    await db.insert(plans).values([
      { id: 'free', name: 'Free', price_cents: 0 },
      { id: 'pro', name: 'Pro', price_cents: 4900 },
    ])
    console.log('Seeded plans')
  }

  // Demo company + project + determination + worker + ledger
  const existingCompanies = await db.select().from(companies).limit(1)
  if (existingCompanies.length === 0) {
    const [company] = await db
      .insert(companies)
      .values({
        user_id: DEMO_USER,
        legal_name: 'Keystone Constructors LLC',
        fein: '12-3456789',
        address: '100 Trade St',
        city: 'Denver',
        state: 'CO',
        zip: '80202',
        signatory_name: 'Dana Reyes',
        signatory_title: 'Payroll Officer',
        ot_rule_set: 'federal',
        rate_tolerance_cents: 0,
      })
      .returning()

    const [project] = await db
      .insert(projects)
      .values({
        user_id: DEMO_USER,
        company_id: company.id,
        name: 'Cherry Creek Bridge Rehab',
        awarding_agency: 'Colorado DOT',
        contract_number: 'CDOT-2026-0142',
        role: 'prime',
        county: 'Denver',
        state: 'CO',
        coverage: 'federal',
        contract_value_cents: 250_000_000,
        labor_budget_cents: 90_000_000,
        status: 'active',
        filing_cadence: 'weekly',
        start_date: '2026-06-01',
        end_date: '2026-12-31',
        crafts: ['Laborer', 'Carpenter', 'Electrician'],
      })
      .returning()

    const [det] = await db
      .insert(wage_determinations)
      .values({
        user_id: DEMO_USER,
        project_id: project.id,
        wd_number: 'CO20260012',
        modification_number: '3',
        decision_date: '2026-01-10',
        effective_date: '2026-01-15',
        locality: 'Denver County',
        county: 'Denver',
        state: 'CO',
        schedule_type: 'highway',
        source: 'survey',
        is_active: true,
      })
      .returning()

    await db.insert(determination_rates).values([
      { determination_id: det.id, classification_name: 'Laborer', base_rate: 28.5, fringe_rate: 11.25 },
      { determination_id: det.id, classification_name: 'Carpenter', base_rate: 34.75, fringe_rate: 13.4 },
      { determination_id: det.id, classification_name: 'Electrician', base_rate: 41.2, fringe_rate: 15.8 },
    ])

    const [worker] = await db
      .insert(workers)
      .values({
        user_id: DEMO_USER,
        full_name: 'Marcus Hill',
        ssn_last4: '4821',
        employee_id: 'EMP-001',
        address: '55 Maple Ave, Denver, CO',
        gender: 'M',
        ethnicity: 'declined',
        default_classification: 'Laborer',
        is_apprentice: false,
        is_active: true,
      })
      .returning()

    // Demo ledger: one underpaid week (base paid below determination) to seed a violation.
    await db.insert(payroll_lines).values({
      user_id: DEMO_USER,
      project_id: project.id,
      worker_id: worker.id,
      determination_id: det.id,
      work_date: '2026-06-15',
      week_ending: '2026-06-20',
      classification_name: 'Laborer',
      straight_hours: 40,
      overtime_hours: 0,
      doubletime_hours: 0,
      base_rate_paid: 26.0, // below the 28.50 determination base — intentional violation
      fringe_cash_paid: 11.25,
      fringe_plan_paid: 0,
      gross_paid: 26.0 * 40 + 11.25 * 40,
      is_apprentice: false,
      notes: 'Demo line with intentional base-rate shortfall',
    })

    console.log('Seeded demo company/project/determination/worker/ledger')
  }
}

const port = parseInt(process.env.PORT ?? '3001')

// CRITICAL: bind the port FIRST so the platform health check sees a live
// service immediately, THEN run migrate + seed (both idempotent) afterward.
serve({ fetch: app.fetch, port }, () => console.log(`Server running on port ${port}`))

;(async () => {
  try {
    await migrate()
  } catch (e) {
    console.error('Migrate error:', e)
  }
  try {
    await seedIfEmpty()
  } catch (e) {
    console.error('Seed error:', e)
  }
})()

export default app
