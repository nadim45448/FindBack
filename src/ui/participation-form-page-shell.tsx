import { Breadcrumbs } from './breadcrumbs';

export interface ParticipationFormCrumb {
  readonly label: string;
  readonly href: string | null;
}

export interface ParticipationFormPageShellProps {
  readonly crumbs: readonly ParticipationFormCrumb[];
  readonly heading: string;
  readonly lede: string;
  readonly context?: React.ReactNode;
  readonly children: React.ReactNode;
}

/**
 * Narrow form chrome — mockups `11-submit-claim`, `20-submit-recovery-response`.
 */
export function ParticipationFormPageShell({
  crumbs,
  heading,
  lede,
  context,
  children,
}: ParticipationFormPageShellProps): React.JSX.Element {
  return (
    <div className="form-page">
      <Breadcrumbs variant="compact" crumbs={[...crumbs]} />

      <h1 className="hero__title">{heading}</h1>

      <p className="hero__lede">{lede}</p>

      {context}

      {children}
    </div>
  );
}
