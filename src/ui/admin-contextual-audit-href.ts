/**
 * §17.1 — audit is contextual: Found reports use `/admin/items/:id/audit`,
 * Lost reports use `/admin/lost/:id/audit`. There is no global audit route.
 */
export function contextualAuditHref(
  reportType: 'Found' | 'Lost',
  reportId: string,
): string {
  return reportType === 'Lost'
    ? `/admin/lost/${reportId}/audit`
    : `/admin/items/${reportId}/audit`;
}
