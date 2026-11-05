/** Administrator case-file route for a report (Found or Lost). */
export function adminItemTrackHref(
  reportType: 'Found' | 'Lost',
  reportId: string,
): string {
  return reportType === 'Lost' ? `/admin/lost/${reportId}/track` : `/admin/items/${reportId}`;
}
