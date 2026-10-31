import { prisma } from '@/infrastructure/db/prisma';
import { PrismaCampusAreaReader } from '@/infrastructure/listings/prisma-campus-area-reader';

/** Campus area value → display label for member tables. */
export async function readCampusAreaLabels(): Promise<Readonly<Record<string, string>>> {
  try {
    const areas = await new PrismaCampusAreaReader(prisma).listActive();
    const labels: Record<string, string> = {};

    for (const area of areas) {
      labels[area.value] = area.label;
    }

    return labels;
  } catch {
    return {};
  }
}
