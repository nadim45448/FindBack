'use client';

import { useRouter } from 'next/navigation';

/** Clickable table row that navigates to a member detail route. */
export function MemberDataTableRow({
  href,
  children,
}: {
  readonly href: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const router = useRouter();

  return (
    <tr
      className="member-data-table__row"
      tabIndex={0}
      onClick={() => {
        router.push(href);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          router.push(href);
        }
      }}
    >
      {children}
    </tr>
  );
}
