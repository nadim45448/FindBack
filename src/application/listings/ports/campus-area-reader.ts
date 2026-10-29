/**
 * The campus-area reader port.
 *
 * **The deployment's configured areas** (FR-8, A4). The list is
 * per-deployment external data; ADR-20 settles its storage, but the domain
 * does not know that — it needs a *set of valid values*, and this port is
 * where the set comes from. That is what keeps the decision reversible: a
 * different implementation of this port would not touch the domain.
 *
 * **A read failure is a refusal, never a permissive default.** With an empty
 * set every campus area is rejected; with a fallback every campus area is
 * accepted. A fail-open would store a report with an unvalidated campus area,
 * which is exactly the closed-field-set discipline the whole design rests on.
 */

import type { CampusArea } from '@/domain/listings';

/** Reads the deployment's configured campus areas. */
export interface CampusAreaReader {
  /**
   * The areas that accept new submissions.
   *
   * @throws {CampusAreaUnavailableError} when the list cannot be read. The
   * caller must refuse rather than proceed with an assumed set.
   */
  listActive(): Promise<readonly CampusArea[]>;
}

/** The campus-area list could not be read. */
export class CampusAreaUnavailableError extends Error {
  constructor(message?: string) {
    super(message ?? 'The campus area list could not be read.');
    this.name = new.target.name;
  }
}
