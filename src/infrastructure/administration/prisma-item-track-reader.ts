/**
 * Prisma reader for administrator handoff tracking.
 */

import { Prisma, type PrismaClient } from '@prisma/client';

import type {
  ItemTrackReader,
  ItemTrackReading,
  ReturnedItemRow,
} from '@/application/administration/ports/item-track-reader';

import { TABLES, quoteName } from '@/infrastructure/listings/physical-columns';

export class PrismaItemTrackReader implements ItemTrackReader {
  constructor(private readonly client: PrismaClient) {}

  async listReturned(limit: number): Promise<readonly ReturnedItemRow[]> {
    const rows = await this.client.$queryRaw<
      {
        report_id: string;
        report_type: string;
        item_name: string;
        reporter_name: string;
        receiver_name: string;
        substitute_name: string | null;
        returned_at: Date;
      }[]
    >(Prisma.sql`
      SELECT
        r.${Prisma.raw(quoteName('id'))} AS report_id,
        r.${Prisma.raw(quoteName('type'))} AS report_type,
        r.${Prisma.raw(quoteName('name'))} AS item_name,
        reporter.${Prisma.raw(quoteName('displayName'))} AS reporter_name,
        receiver.${Prisma.raw(quoteName('displayName'))} AS receiver_name,
        rc.${Prisma.raw(quoteName('substitute_receiver_name'))} AS substitute_name,
        rc.${Prisma.raw(quoteName('confirmed_at'))} AS returned_at
      FROM ${Prisma.raw(quoteName(TABLES.report))} r
      JOIN ${Prisma.raw(quoteName('return_confirmations'))} rc
        ON rc.${Prisma.raw(quoteName('report_id'))} = r.${Prisma.raw(quoteName('id'))}
      JOIN ${Prisma.raw(quoteName(TABLES.account))} reporter
        ON reporter.${Prisma.raw(quoteName('id'))} = r.${Prisma.raw(quoteName('reporter_id'))}
      JOIN ${Prisma.raw(quoteName(TABLES.account))} receiver
        ON receiver.${Prisma.raw(quoteName('id'))} = rc.${Prisma.raw(quoteName('default_receiver_account_id'))}
      WHERE r.${Prisma.raw(quoteName('status'))} = ${'Returned'}
      ORDER BY rc.${Prisma.raw(quoteName('confirmed_at'))} DESC
      LIMIT ${limit}
    `);

    return rows.map((row) => ({
      reportId: row.report_id,
      reportType: row.report_type === 'Lost' ? 'Lost' : 'Found',
      itemName: row.item_name,
      reporterDisplayName: row.reporter_name,
      receiverDisplayName: row.substitute_name?.trim()
        ? `${row.substitute_name.trim()} (for ${row.receiver_name})`
        : row.receiver_name,
      returnedAt: row.returned_at,
    }));
  }

  async readTrack(reportId: string): Promise<ItemTrackReading | null> {
    const reports = await this.client.$queryRaw<
      {
        id: string;
        type: string;
        name: string;
        category: string;
        campus_area: string;
        status: string;
        reporter_name: string;
      }[]
    >(Prisma.sql`
      SELECT
        r.${Prisma.raw(quoteName('id'))} AS id,
        r.${Prisma.raw(quoteName('type'))} AS type,
        r.${Prisma.raw(quoteName('name'))} AS name,
        r.${Prisma.raw(quoteName('category'))} AS category,
        r.${Prisma.raw(quoteName('campus_area'))} AS campus_area,
        r.${Prisma.raw(quoteName('status'))} AS status,
        reporter.${Prisma.raw(quoteName('displayName'))} AS reporter_name
      FROM ${Prisma.raw(quoteName(TABLES.report))} r
      JOIN ${Prisma.raw(quoteName(TABLES.account))} reporter
        ON reporter.${Prisma.raw(quoteName('id'))} = r.${Prisma.raw(quoteName('reporter_id'))}
      WHERE r.${Prisma.raw(quoteName('id'))} = ${reportId}::uuid
      LIMIT 1
    `);

    const report = reports[0];

    if (!report) {
      return null;
    }

    const reportType = report.type === 'Lost' ? 'Lost' : 'Found';

    const returnConfirmation = await this.readReturnConfirmation(reportId);

    const claims =
      reportType === 'Found' ? await this.readClaims(reportId) : [];

    const recoveryResponses =
      reportType === 'Lost' ? await this.readRecoveryResponses(reportId) : [];

    return {
      reportId: report.id,
      reportType,
      itemName: report.name,
      category: report.category,
      campusArea: report.campus_area,
      status: report.status,
      reporterDisplayName: report.reporter_name,
      returnConfirmation,
      claims,
      recoveryResponses,
    };
  }

  private async readReturnConfirmation(
    reportId: string,
  ): Promise<ItemTrackReading['returnConfirmation']> {
    const rows = await this.client.$queryRaw<
      {
        confirmed_at: Date;
        admin_name: string;
        receiver_name: string;
        substitute_name: string | null;
        relationship: string | null;
      }[]
    >(Prisma.sql`
      SELECT
        rc.${Prisma.raw(quoteName('confirmed_at'))} AS confirmed_at,
        admin.${Prisma.raw(quoteName('displayName'))} AS admin_name,
        receiver.${Prisma.raw(quoteName('displayName'))} AS receiver_name,
        rc.${Prisma.raw(quoteName('substitute_receiver_name'))} AS substitute_name,
        rc.${Prisma.raw(quoteName('relationship'))} AS relationship
      FROM ${Prisma.raw(quoteName('return_confirmations'))} rc
      JOIN ${Prisma.raw(quoteName(TABLES.account))} admin
        ON admin.${Prisma.raw(quoteName('id'))} = rc.${Prisma.raw(quoteName('administrator_id'))}
      JOIN ${Prisma.raw(quoteName(TABLES.account))} receiver
        ON receiver.${Prisma.raw(quoteName('id'))} = rc.${Prisma.raw(quoteName('default_receiver_account_id'))}
      WHERE rc.${Prisma.raw(quoteName('report_id'))} = ${reportId}::uuid
      LIMIT 1
    `);

    const row = rows[0];

    if (!row) {
      return null;
    }

    return {
      returnedAt: row.confirmed_at,
      administratorDisplayName: row.admin_name,
      defaultReceiverDisplayName: row.receiver_name,
      substituteReceiverName: row.substitute_name,
      relationship: row.relationship,
    };
  }

  private async readClaims(reportId: string): Promise<ItemTrackReading['claims']> {
    const rows = await this.client.$queryRaw<
      {
        id: string;
        status: string;
        submitted_at: Date | null;
        decided_at: Date | null;
        rejection_reason: string | null;
        claimant_name: string;
      }[]
    >(Prisma.sql`
      SELECT
        c.${Prisma.raw(quoteName('id'))} AS id,
        c.${Prisma.raw(quoteName('status'))} AS status,
        c.${Prisma.raw(quoteName('submitted_at'))} AS submitted_at,
        c.${Prisma.raw(quoteName('decided_at'))} AS decided_at,
        c.${Prisma.raw(quoteName('rejection_reason'))} AS rejection_reason,
        claimant.${Prisma.raw(quoteName('displayName'))} AS claimant_name
      FROM ${Prisma.raw(quoteName(TABLES.claim))} c
      JOIN ${Prisma.raw(quoteName(TABLES.account))} claimant
        ON claimant.${Prisma.raw(quoteName('id'))} = c.${Prisma.raw(quoteName('claimant_id'))}
      WHERE c.${Prisma.raw(quoteName('report_id'))} = ${reportId}::uuid
      ORDER BY c.${Prisma.raw(quoteName('submitted_at'))} ASC NULLS FIRST, c.${Prisma.raw(quoteName('id'))} ASC
    `);

    return rows.map((row) => ({
      claimId: row.id,
      claimantDisplayName: row.claimant_name,
      status: row.status,
      submittedAt: row.submitted_at,
      decidedAt: row.decided_at,
      rejectionReason: row.rejection_reason,
    }));
  }

  private async readRecoveryResponses(
    reportId: string,
  ): Promise<ItemTrackReading['recoveryResponses']> {
    const rows = await this.client.$queryRaw<
      {
        id: string;
        status: string;
        submitted_at: Date | null;
        respondent_name: string;
      }[]
    >(Prisma.sql`
      SELECT
        rr.${Prisma.raw(quoteName('id'))} AS id,
        rr.${Prisma.raw(quoteName('status'))} AS status,
        rr.${Prisma.raw(quoteName('submitted_at'))} AS submitted_at,
        respondent.${Prisma.raw(quoteName('displayName'))} AS respondent_name
      FROM ${Prisma.raw(quoteName(TABLES.response))} rr
      JOIN ${Prisma.raw(quoteName(TABLES.account))} respondent
        ON respondent.${Prisma.raw(quoteName('id'))} = rr.${Prisma.raw(quoteName('responder_id'))}
      WHERE rr.${Prisma.raw(quoteName('report_id'))} = ${reportId}::uuid
      ORDER BY rr.${Prisma.raw(quoteName('submitted_at'))} ASC NULLS FIRST, rr.${Prisma.raw(quoteName('id'))} ASC
    `);

    return rows.map((row) => ({
      responseId: row.id,
      respondentDisplayName: row.respondent_name,
      status: row.status,
      submittedAt: row.submitted_at,
    }));
  }
}
