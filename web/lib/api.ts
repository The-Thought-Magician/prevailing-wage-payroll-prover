// Same-origin relative calls to /api/proxy/... — the proxy route injects X-User-Id.
// Each path after /api/proxy/ maps 1:1 to the backend path after /api/v1/.

const J = { 'Content-Type': 'application/json' }

async function req(path: string, init?: RequestInit) {
  const res = await fetch(path, init)
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `Request failed (${res.status})`
    throw new Error(msg)
  }
  return data
}

const get = (path: string) => req(path)
const post = (path: string, body?: unknown) =>
  req(path, { method: 'POST', headers: J, body: body === undefined ? undefined : JSON.stringify(body) })
const put = (path: string, body?: unknown) =>
  req(path, { method: 'PUT', headers: J, body: body === undefined ? undefined : JSON.stringify(body) })
const del = (path: string) => req(path, { method: 'DELETE' })

function qs(params?: Record<string, string | number | boolean | undefined | null>) {
  if (!params) return ''
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

const api = {
  // Companies
  getCompanies: () => get('/api/proxy/companies'),
  getCompany: (id: string) => get(`/api/proxy/companies/${id}`),
  createCompany: (body: unknown) => post('/api/proxy/companies', body),
  updateCompany: (id: string, body: unknown) => put(`/api/proxy/companies/${id}`, body),
  deleteCompany: (id: string) => del(`/api/proxy/companies/${id}`),

  // Projects
  getProjects: () => get('/api/proxy/projects'),
  getProject: (id: string) => get(`/api/proxy/projects/${id}`),
  getProjectHealth: (id: string) => get(`/api/proxy/projects/${id}/health`),
  createProject: (body: unknown) => post('/api/proxy/projects', body),
  updateProject: (id: string, body: unknown) => put(`/api/proxy/projects/${id}`, body),
  deleteProject: (id: string) => del(`/api/proxy/projects/${id}`),

  // Determinations
  getDeterminations: (projectId?: string) =>
    get(`/api/proxy/determinations${qs({ project_id: projectId })}`),
  getDetermination: (id: string) => get(`/api/proxy/determinations/${id}`),
  createDetermination: (body: unknown) => post('/api/proxy/determinations', body),
  updateDetermination: (id: string, body: unknown) => put(`/api/proxy/determinations/${id}`, body),
  addDeterminationRate: (id: string, body: unknown) => post(`/api/proxy/determinations/${id}/rates`, body),
  deleteDeterminationRate: (id: string, rateId: string) =>
    del(`/api/proxy/determinations/${id}/rates/${rateId}`),
  supersedeDetermination: (id: string, body: unknown) => post(`/api/proxy/determinations/${id}/supersede`, body),
  deleteDetermination: (id: string) => del(`/api/proxy/determinations/${id}`),

  // Classifications
  getClassifications: () => get('/api/proxy/classifications'),
  createClassification: (body: unknown) => post('/api/proxy/classifications', body),
  updateClassification: (id: string, body: unknown) => put(`/api/proxy/classifications/${id}`, body),
  addClassificationAlias: (id: string, body: unknown) => post(`/api/proxy/classifications/${id}/aliases`, body),
  deleteClassificationAlias: (id: string, aliasId: string) =>
    del(`/api/proxy/classifications/${id}/aliases/${aliasId}`),
  deleteClassification: (id: string) => del(`/api/proxy/classifications/${id}`),

  // Workers
  getWorkers: () => get('/api/proxy/workers'),
  getWorker: (id: string) => get(`/api/proxy/workers/${id}`),
  createWorker: (body: unknown) => post('/api/proxy/workers', body),
  updateWorker: (id: string, body: unknown) => put(`/api/proxy/workers/${id}`, body),
  deleteWorker: (id: string) => del(`/api/proxy/workers/${id}`),

  // Programs
  getPrograms: () => get('/api/proxy/programs'),
  getProgram: (id: string) => get(`/api/proxy/programs/${id}`),
  createProgram: (body: unknown) => post('/api/proxy/programs', body),
  updateProgram: (id: string, body: unknown) => put(`/api/proxy/programs/${id}`, body),
  addProgramLevel: (id: string, body: unknown) => post(`/api/proxy/programs/${id}/levels`, body),
  deleteProgramLevel: (id: string, levelId: string) => del(`/api/proxy/programs/${id}/levels/${levelId}`),
  deleteProgram: (id: string) => del(`/api/proxy/programs/${id}`),

  // Fringe plans
  getFringePlans: () => get('/api/proxy/fringe-plans'),
  createFringePlan: (body: unknown) => post('/api/proxy/fringe-plans', body),
  updateFringePlan: (id: string, body: unknown) => put(`/api/proxy/fringe-plans/${id}`, body),
  deleteFringePlan: (id: string) => del(`/api/proxy/fringe-plans/${id}`),

  // Payroll lines
  getPayrollLines: (query?: { project_id?: string; week_ending?: string; worker_id?: string }) =>
    get(`/api/proxy/payroll-lines${qs(query)}`),
  getPayrollLine: (id: string) => get(`/api/proxy/payroll-lines/${id}`),
  createPayrollLine: (body: unknown) => post('/api/proxy/payroll-lines', body),
  bulkCreatePayrollLines: (body: unknown) => post('/api/proxy/payroll-lines/bulk', body),
  cloneWeek: (body: unknown) => post('/api/proxy/payroll-lines/clone-week', body),
  updatePayrollLine: (id: string, body: unknown) => put(`/api/proxy/payroll-lines/${id}`, body),
  deletePayrollLine: (id: string) => del(`/api/proxy/payroll-lines/${id}`),

  // Validation
  getValidationRuns: (projectId?: string) => get(`/api/proxy/validation/runs${qs({ project_id: projectId })}`),
  getValidationRun: (id: string) => get(`/api/proxy/validation/runs/${id}`),
  runValidation: (body: unknown) => post('/api/proxy/validation/run', body),

  // Findings
  getFindings: (query?: { project_id?: string; status?: string; type?: string }) =>
    get(`/api/proxy/findings${qs(query)}`),
  updateFinding: (id: string, body: unknown) => put(`/api/proxy/findings/${id}`, body),
  bulkResolveFindings: (body: unknown) => post('/api/proxy/findings/bulk-resolve', body),

  // WH-347
  getWh347s: (projectId?: string) => get(`/api/proxy/wh347${qs({ project_id: projectId })}`),
  getWh347: (id: string) => get(`/api/proxy/wh347/${id}`),
  generateWh347: (body: unknown) => post('/api/proxy/wh347/generate', body),
  deleteWh347: (id: string) => del(`/api/proxy/wh347/${id}`),

  // Signatures
  getSignature: (wh347Id: string) => get(`/api/proxy/signatures/${wh347Id}`),
  signCompliance: (body: unknown) => post('/api/proxy/signatures', body),
  reopenWh347: (wh347Id: string) => post(`/api/proxy/signatures/${wh347Id}/reopen`),

  // Restitution
  getRestitutionWorksheets: (projectId?: string) =>
    get(`/api/proxy/restitution${qs({ project_id: projectId })}`),
  getRestitutionWorksheet: (id: string) => get(`/api/proxy/restitution/${id}`),
  generateRestitution: (body: unknown) => post('/api/proxy/restitution/generate', body),
  markRestitutionItemPaid: (id: string, itemId: string, body: unknown) =>
    put(`/api/proxy/restitution/${id}/items/${itemId}`, body),
  deleteRestitutionWorksheet: (id: string) => del(`/api/proxy/restitution/${id}`),

  // Subcontractors
  getSubcontractors: (projectId?: string) => get(`/api/proxy/subcontractors${qs({ project_id: projectId })}`),
  createSubcontractor: (body: unknown) => post('/api/proxy/subcontractors', body),
  updateSubcontractor: (id: string, body: unknown) => put(`/api/proxy/subcontractors/${id}`, body),
  deleteSubcontractor: (id: string) => del(`/api/proxy/subcontractors/${id}`),
  getSubFilings: (id: string) => get(`/api/proxy/subcontractors/${id}/filings`),
  upsertSubFiling: (id: string, body: unknown) => post(`/api/proxy/subcontractors/${id}/filings`, body),

  // Audit packets
  getAuditPackets: (projectId?: string) => get(`/api/proxy/audit-packets${qs({ project_id: projectId })}`),
  getAuditPacket: (id: string) => get(`/api/proxy/audit-packets/${id}`),
  generateAuditPacket: (body: unknown) => post('/api/proxy/audit-packets/generate', body),
  deleteAuditPacket: (id: string) => del(`/api/proxy/audit-packets/${id}`),

  // Deadlines
  getDeadlines: (projectId?: string) => get(`/api/proxy/deadlines${qs({ project_id: projectId })}`),
  generateDeadlines: (body: unknown) => post('/api/proxy/deadlines/generate', body),
  updateDeadline: (id: string, body: unknown) => put(`/api/proxy/deadlines/${id}`, body),

  // Imports
  getImportJobs: () => get('/api/proxy/imports'),
  importPayroll: (body: unknown) => post('/api/proxy/imports/payroll', body),
  importDetermination: (body: unknown) => post('/api/proxy/imports/determination', body),
  seedSample: () => post('/api/proxy/imports/seed-sample'),

  // Dashboard
  getDashboardSummary: () => get('/api/proxy/dashboard/summary'),

  // Reports
  getLaborByClassification: (projectId?: string) =>
    get(`/api/proxy/reports/labor-by-classification${qs({ project_id: projectId })}`),
  getFringeCashVsPlan: (projectId?: string) =>
    get(`/api/proxy/reports/fringe-cash-vs-plan${qs({ project_id: projectId })}`),
  getApprenticeUtilization: (projectId?: string) =>
    get(`/api/proxy/reports/apprentice-utilization${qs({ project_id: projectId })}`),
  getRestitutionExposure: (projectId?: string) =>
    get(`/api/proxy/reports/restitution-exposure${qs({ project_id: projectId })}`),

  // Activity
  getActivity: (query?: { entity_type?: string; entity_id?: string }) =>
    get(`/api/proxy/activity${qs(query)}`),

  // Billing
  getBillingPlan: () => get('/api/proxy/billing/plan'),
  createCheckout: () => post('/api/proxy/billing/checkout'),
  createPortal: () => post('/api/proxy/billing/portal'),
}

export default api
