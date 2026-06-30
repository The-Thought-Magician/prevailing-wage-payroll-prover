import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  compliance_signatures,
  wh347_payrolls,
  validation_findings,
  activity_log,
} from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const DEFAULT_ATTESTATION =
  'I certify that the above payroll is correct and complete, that the wage rates for ' +
  'laborers and mechanics contained therein are not less than the applicable wage rates ' +
  'contained in the wage determination incorporated into the contract, and that the ' +
  'classifications set forth for each laborer or mechanic conform with the work performed.'

const signSchema = z.object({
  wh347_id: z.string().min(1),
  signer_name: z.string().min(1),
  signer_title: z.string().min(1),
  attestation_text: z.string().min(1).optional(),
  fringe_method: z.enum(['4a', '4b', 'exception']).optional(),
})

// Public: signature for a WH-347 (null if unsigned)
router.get('/:wh347Id', async (c) => {
  const wh347Id = c.req.param('wh347Id')
  const [sig] = await db
    .select()
    .from(compliance_signatures)
    .where(eq(compliance_signatures.wh347_id, wh347Id))
    .orderBy(desc(compliance_signatures.signed_at))
  return c.json(sig ?? null)
})

// Auth: sign the statement of compliance. Locks the WH-347 (status -> signed).
// Blocked when there are open hard-severity findings for the same project+week.
router.post('/', authMiddleware, zValidator('json', signSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  const [doc] = await db
    .select()
    .from(wh347_payrolls)
    .where(eq(wh347_payrolls.id, body.wh347_id))
  if (!doc) return c.json({ error: 'WH-347 not found' }, 404)
  if (doc.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  if (doc.status === 'signed') {
    return c.json({ error: 'WH-347 is already signed' }, 409)
  }

  // Block signing while open hard violations exist for this project + week.
  const openFindings = await db
    .select()
    .from(validation_findings)
    .where(
      and(
        eq(validation_findings.project_id, doc.project_id),
        eq(validation_findings.week_ending, doc.week_ending),
        eq(validation_findings.severity, 'high'),
        eq(validation_findings.status, 'open'),
      ),
    )
  if (openFindings.length > 0) {
    return c.json(
      {
        error: 'Cannot sign: open high-severity findings exist for this week',
        open_findings: openFindings.length,
      },
      409,
    )
  }

  const fringeMethod = body.fringe_method ?? doc.fringe_method
  const signedIp =
    c.req.header('x-forwarded-for')?.split(',')[0].trim() ??
    c.req.header('x-real-ip') ??
    null

  const [sig] = await db
    .insert(compliance_signatures)
    .values({
      user_id: userId,
      wh347_id: body.wh347_id,
      signer_name: body.signer_name,
      signer_title: body.signer_title,
      attestation_text: body.attestation_text ?? DEFAULT_ATTESTATION,
      fringe_method: fringeMethod,
      signed_ip: signedIp,
    })
    .returning()

  // Lock the WH-347.
  await db
    .update(wh347_payrolls)
    .set({ status: 'signed', fringe_method: fringeMethod, updated_at: new Date() })
    .where(eq(wh347_payrolls.id, body.wh347_id))

  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'wh347',
    entity_id: body.wh347_id,
    action: 'signed',
    detail: { signer_name: body.signer_name, signer_title: body.signer_title, fringe_method: fringeMethod },
  })

  return c.json(sig, 201)
})

// Auth + owner: reopen a signed WH-347 (status -> reopened).
router.post('/:wh347Id/reopen', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const wh347Id = c.req.param('wh347Id')

  const [doc] = await db.select().from(wh347_payrolls).where(eq(wh347_payrolls.id, wh347Id))
  if (!doc) return c.json({ error: 'WH-347 not found' }, 404)
  if (doc.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  if (doc.status !== 'signed') {
    return c.json({ error: 'Only a signed WH-347 can be reopened' }, 409)
  }

  await db
    .update(wh347_payrolls)
    .set({ status: 'reopened', updated_at: new Date() })
    .where(eq(wh347_payrolls.id, wh347Id))

  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'wh347',
    entity_id: wh347Id,
    action: 'updated',
    detail: { reopened: true },
  })

  return c.json({ success: true })
})

export default router
