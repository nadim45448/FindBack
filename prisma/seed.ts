/**
 * The seed script.
 *
 * **The campus-area list is deployment content, not product content.** The
 * PRD names no campus areas — FR-8 makes the list a *fixed per-deployment
 * enum* — so the migration seeds **none**, and this script seeds the
 * **local development** set only (ADR-20).
 *
 * A production deployment seeds its own areas, either by running this script
 * with a different set or by inserting rows directly. That is what
 * "per-deployment" means: the set belongs to the deployment, and this file
 * is a convenience for the developer running it locally.
 *
 * The seed is **idempotent** — it upserts by `value`, so re-running it
 * neither duplicates rows nor resurrects a deactivated area's label
 * silently. `active` is *not* overwritten, because deactivation is a
 * deliberate act and a seed must not undo it.
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/**
 * The local development areas.
 *
 * Placeholder names for an unspecified institution — they are here to make
 * the flow exercisable, not to describe a real campus. A deployment
 * replaces them.
 */
const LOCAL_CAMPUS_AREAS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'library', label: 'Library' },
  { value: 'student_centre', label: 'Student Centre' },
  { value: 'lecture_halls', label: 'Lecture Halls' },
  { value: 'laboratories', label: 'Laboratories' },
  { value: 'dining_hall', label: 'Dining Hall' },
  { value: 'sports_centre', label: 'Sports Centre' },
  { value: 'residence_halls', label: 'Residence Halls' },
  { value: 'parking', label: 'Parking Area' },
];

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. The seed reads it from .env.local.');
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    for (const area of LOCAL_CAMPUS_AREAS) {
      // `upsert` on the primary key. `active` and `created_at` are left
      // alone on an existing row: a seed must not reactivate an area a
      // deployment deliberately deactivated, and it must not rewrite the
      // row's age.
      await prisma.campusArea.upsert({
        where: { value: area.value },
        update: { label: area.label },
        create: { value: area.value, label: area.label, active: true },
      });
    }

    const total = await prisma.campusArea.count();

    console.log(`Seeded ${LOCAL_CAMPUS_AREAS.length} local campus areas (${total} total).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
