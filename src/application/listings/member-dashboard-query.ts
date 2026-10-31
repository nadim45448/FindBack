import type { ActorContext } from '@/domain/accounts';

import type {
  MemberDashboardReader,
  MemberDashboardStats,
} from './ports/member-dashboard-reader';

export class MemberDashboardQuery {
  constructor(private readonly reader: MemberDashboardReader) {}

  read(actor: ActorContext): Promise<MemberDashboardStats> {
    return this.reader.readForMember(actor.actorId);
  }
}
