import Link from 'next/link';

import { BREADCRUMB_LABEL } from './member-copy';

export interface Breadcrumb {
  readonly label: string;
  readonly href: string | null;
}

export function Breadcrumbs({
  crumbs,
  variant = 'default',
}: {
  readonly crumbs: readonly Breadcrumb[];
  readonly variant?: 'default' | 'compact';
}): React.JSX.Element {
  const className =
    variant === 'compact' ? 'breadcrumbs breadcrumbs--compact' : 'breadcrumbs';

  return (
    <nav className={className} aria-label={BREADCRUMB_LABEL}>
      <ol className="breadcrumbs__list">
        {crumbs.map((crumb) => (
          <li className="breadcrumbs__item" key={crumb.label}>
            {crumb.href === null ? (
              <span aria-current="page">{crumb.label}</span>
            ) : (
              <Link href={crumb.href}>{crumb.label}</Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
