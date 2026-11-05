import Link from 'next/link';

import type { ReturnedItemRow } from '@/application/administration/ports/item-track-reader';

import {
  ADMIN_RETURNED_EMPTY,
  ADMIN_RETURNED_HEADING,
  ADMIN_RETURNED_LEDE,
  COLUMN_ITEM,
  COLUMN_RECEIVER,
  COLUMN_REPORT_TYPE,
  COLUMN_RETURNED_AT,
  COLUMN_REPORTER,
  VIEW_RECORD,
} from './admin-copy';
import { adminItemTrackHref } from './admin-track-href';
import { StatusBadge } from './status-badge';

export interface AdminReturnedListSurfaceProps {
  readonly rows: readonly ReturnedItemRow[];
  readonly formatTimestamp: (value: Date) => string;
}

export function AdminReturnedListSurface({
  rows,
  formatTimestamp,
}: AdminReturnedListSurfaceProps): React.JSX.Element {
  return (
    <div className="admin-console">
      <h1 className="hero__title">{ADMIN_RETURNED_HEADING}</h1>
      <p className="hero__lede">{ADMIN_RETURNED_LEDE}</p>

      {rows.length === 0 ? (
        <div className="admin-queue__empty" role="status">
          <p>{ADMIN_RETURNED_EMPTY}</p>
        </div>
      ) : (
        <div className="admin-track-table-wrap">
          <table className="admin-track-table">
            <thead>
              <tr>
                <th scope="col">{COLUMN_ITEM}</th>
                <th scope="col">{COLUMN_REPORT_TYPE}</th>
                <th scope="col">{COLUMN_REPORTER}</th>
                <th scope="col">{COLUMN_RECEIVER}</th>
                <th scope="col">{COLUMN_RETURNED_AT}</th>
                <th scope="col">
                  <span className="visually-hidden">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.reportId}>
                  <td>{row.itemName}</td>
                  <td>
                    <StatusBadge status={row.reportType} kind="Type" tone="neutral" />
                  </td>
                  <td>{row.reporterDisplayName}</td>
                  <td>{row.receiverDisplayName}</td>
                  <td className="tabular">{formatTimestamp(row.returnedAt)}</td>
                  <td>
                    <Link
                      href={adminItemTrackHref(row.reportType, row.reportId)}
                      className="button button--secondary button--sm"
                    >
                      {VIEW_RECORD}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
