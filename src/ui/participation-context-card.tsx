import { reportTypeLabel } from './member-copy';

export interface ParticipationContextCardProps {
  readonly itemName: string;
  readonly reportType: 'Lost' | 'Found';
  readonly meta?: string | undefined;
}

/**
 * The item summary on submit-claim / submit-recovery-response — mockup `fb-context`.
 */
export function ParticipationContextCard({
  itemName,
  reportType,
  meta,
}: ParticipationContextCardProps): React.JSX.Element {
  const modifier = reportType === 'Lost' ? 'lost' : 'found';

  return (
    <div className="participation-context" role="status">
      <span
        className={`report-type-badge report-type-badge--${modifier}`}
        aria-label={`Type: ${reportTypeLabel(reportType)}`}
      >
        {reportTypeLabel(reportType)}
      </span>

      <span className="participation-context__title">{itemName}</span>

      {meta ? <span className="participation-context__meta">{meta}</span> : null}
    </div>
  );
}
