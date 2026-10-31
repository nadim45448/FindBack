/**
 * The item detail's section list — §11.3's order, derived from the
 * projection.
 *
 * ## What this module is for
 *
 * EXPERIENCE.md §11.3 names the detail page as *"composed of stacked
 * sections"* in a fixed order:
 *
 * 1. Header (name, type badge, status badge)
 * 2. Summary (category, date, campus area)
 * 3. Description (if visible)
 * 4. Image (if present and visible)
 * 5. Location (campus area always; exact place only when visible)
 * 6. Identifying details (only when visible)
 * 7. Reporter (only when visible)
 * 8. Status history (member-facing; only when visible)
 * 9. Audit trail (admin only)
 * 10. Actions (role-dependent)
 *
 * **The order is data, so it cannot drift.** A component that hard-coded
 * the sections would have the order in the markup and nowhere else; this
 * module puts it in one place, and the surface renders what it is given.
 *
 * ## The load-bearing rule: the projection decides, never the surface
 *
 * **A section is present because the projection carries its field — never
 * because the surface evaluated a rule.** §11.3's "if visible" is not the
 * surface's judgement; it is the projection's. The projection is the single
 * implementation point for FR-39 (see `visibility-projection.ts`), and a
 * surface that re-evaluated visibility would be a second implementation of
 * the matrix — the load-then-filter defect FR-39 names.
 *
 * So this module takes the **projected report** and the **granted field
 * set**, and asks one question per section: *did the projection carry this
 * field?* It never asks *should this viewer see it?*
 *
 * **A field that is absent is not rendered as empty.** The `Hidden from
 * other members` label appears where a section would have been, and the
 * section's own value is never present in the delivered HTML — not blank,
 * not masked, not fetched and hidden. §11.4 says the label appears "next
 * to the section heading", so the heading renders and the value does not.
 *
 * Pure — no I/O, no framework imports.
 */

import type { ReportField, ReportFieldSet } from './report-field-set';
import type { ProjectedReport, VisibilityProjection } from './visibility-projection';

/**
 * The sections a detail page is composed of.
 *
 * **The order is §11.3's order,** and the set is closed.
 */
export const ITEM_DETAIL_SECTIONS = [
  'header',
  'summary',
  'description',
  'image',
  'location',
  'identifyingDetails',
  'reporter',
  'statusHistory',
  'actions',
] as const;

/** One of the detail page's sections. */
export type ItemDetailSection = (typeof ITEM_DETAIL_SECTIONS)[number];

/**
 * The sections that render a **hidden** notice rather than their content.
 *
 * **These are the three sections whose content may be withheld.** `Image`
 * is not among them because §11.3 says "if present and visible" — an absent
 * image is simply absent, and a hidden image is a different thing.
 */
export const HIDDEN_NOTICE_SECTIONS: readonly ItemDetailSection[] = Object.freeze([
  'location',
  'identifyingDetails',
  'reporter',
]);

/**
 * A section's rendering instruction.
 *
 * **`visible` is the projection's answer, not the surface's.** The surface
 * renders a visible section's content and a hidden section's notice; it
 * makes no decision of its own.
 */
export interface ItemDetailSectionPlan {
  readonly section: ItemDetailSection;
  /**
   * Whether the projection granted the section's content.
   *
   * `false` means the notice renders **instead of** the content.
   */
  readonly visible: boolean;
}

/**
 * The plan for one section.
 *
 * **The `Hidden from other members` label applies to three sections only.**
 * `description`, `image`, and `statusHistory` are granted to every
 * authenticated column and are withheld from nobody, so a notice there
 * would be noise. And `summary` and `header` are the FR-38 set, granted to
 * every column including the anonymous one.
 */
function planSection(
  section: ItemDetailSection,
  granted: boolean,
): ItemDetailSectionPlan {
  return { section, visible: granted };
}

/**
 * The field each section's content comes from.
 *
 * **`location` is granted by `exactPlace`,** because the campus area is
 * always visible and the section's *variable* content — the exact place —
 * is the part that is withheld. So the section is hidden exactly when the
 * exact place is, and the notice reads correctly.
 *
 * `header` and `actions` are gated on `summary`, the FR-38 base every
 * column holds.
 */
const SECTION_FIELD: Readonly<Record<ItemDetailSection, ReportField>> = Object.freeze({
  header: 'summary',
  summary: 'summary',
  description: 'description',
  image: 'image',
  location: 'exactPlace',
  identifyingDetails: 'identifyingDetails',
  reporter: 'reporterName',
  statusHistory: 'statusHistory',
  actions: 'summary',
});

/**
 * Build the section plan for a projection.
 *
 * **The plan is derived from the granted field set and the projected
 * report.** A section is visible when its field is in the set — and the
 * `image` section is additionally gated on the image being present, because
 * §11.3 says "if present and visible".
 *
 * @param fields the fields the projection granted.
 * @param report the projected report.
 */
export function planItemDetailSections(
  fields: ReportFieldSet,
  report: ProjectedReport,
): readonly ItemDetailSectionPlan[] {
  return ITEM_DETAIL_SECTIONS.map((section) => {
    if (section === 'image') {
      // **"if present and visible."** Both conditions, and the presence one
      // is checked on the *value* — an absent image is not a hidden image.
      return planSection(section, fields.has('image') && report.imageRef !== undefined);
    }

    if (section === 'actions') {
      // **The actions section is always present.** It is the section that
      // carries the call to action, and a detail page with no action
      // rendered is a page whose actions were withheld — which is not what
      // §11.3 means by the other sections being conditional.
      return planSection(section, true);
    }

    const field = SECTION_FIELD[section];

    return planSection(section, fields.has(field));
  });
}

/**
 * The plan for a whole projection.
 *
 * **The convenience form of the above,** taking the projection rather than
 * its parts.
 */
export function planSectionsForProjection(
  projection: VisibilityProjection,
): readonly ItemDetailSectionPlan[] {
  return planItemDetailSections(projection.reportFields, projection.report);
}

/**
 * True when a section renders the hidden notice.
 *
 * **Only the three withheld-content sections do.** A section that is merely
 * absent — an image that was never uploaded — renders nothing at all.
 */
export function rendersHiddenNotice(
  plan: ItemDetailSectionPlan,
): boolean {
  return !plan.visible && HIDDEN_NOTICE_SECTIONS.includes(plan.section);
}
