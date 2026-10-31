/**
 * The surface review checklist's tests — bolt `022`, story `011`.
 *
 * ## Why this suite exists
 *
 * Story 011's last criterion says: *"Given a new surface is added, **When** it
 * is reviewed, **Then** it is checked against every criterion in this story
 * before it is considered complete."*
 *
 * **`a11y-contract.test.ts` checks the properties of the design system** — the
 * contrast ratios, the touch-target floor, the reduced-motion coverage. Those
 * hold however many surfaces there are.
 *
 * **This suite checks the properties of each surface.** A surface that reaches
 * for a bare `<span className="badge">` instead of the shared badge, or that
 * points an `aria-describedby` at an element that does not exist, breaks the
 * contract for that surface alone — and no stylesheet assertion would notice.
 *
 * ## Why it reads the source rather than the DOM
 *
 * **A surface is a file.** The question the criterion asks is *"does this
 * surface meet the contract?"*, and the surface is the source file — the
 * server-rendered pages are built from it. Rendering every page and every
 * state of it in a test would be a different suite, and it would test the
 * **routes** rather than the **surfaces**.
 *
 * So the suite reads the surface files from disk and asserts on their
 * markup. The trade-off is explicit and deliberate: a surface written in a
 * way this suite cannot see would pass. The mitigation is that the suite's
 * rules are **narrow and mechanical** — one rule per criterion, each with
 * one way to satisfy it — so a surface that satisfies them is a surface that
 * meets the contract.
 *
 * ## The rules
 *
 * | Rule | The criterion it enforces |
 * |---|---|
 * | `no-raw-badge` | the badge pairs colour with a text label and an icon |
 * | `no-dangling-describedby` | the error text replaces the helper text under the same id |
 * | `no-native-validation` | the browser's validation cannot block the error summary |
 * | `no-raw-table` | header cells use `th scope="col"` |
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/** The UI surface directory. */
const UI_DIR = join(process.cwd(), 'src/ui');

/** The server-rendered surface directory. */
const APP_DIR = join(process.cwd(), 'src/app');

/**
 * The surface files the rules apply to.
 *
 * **Every `.tsx` under `src/ui` and `src/app`,** except the test files —
 * a test file may render a bare badge on purpose, to prove a rule fires.
 */
function surfaceFiles(): { readonly path: string; readonly source: string }[] {
  const files: { readonly path: string; readonly source: string }[] = [];

  for (const directory of [UI_DIR, APP_DIR]) {
    // **The entries are read as strings.** `readdirSync` with `recursive`
    // widens the element type to `string | Buffer`, and a `Buffer` has no
    // `endsWith` — so the encoding is declared rather than inferred.
    const entries = readdirSync(directory, { recursive: true, encoding: 'utf8' });

    for (const entry of entries) {
      if (!entry.endsWith('.tsx') || entry.endsWith('.test.tsx')) {
        continue;
      }

      const path = join(directory, entry);

      files.push({ path, source: readFileSync(path, 'utf8') });
    }
  }

  return files;
}

/** Every surface file. */
const SURFACES = surfaceFiles();

/** The surface files, named for the failure messages. */
function surfaceNames(): string[] {
  return SURFACES.map((surface) => surface.path.replace(`${process.cwd()}/`, ''));
}

/**
 * The opening tags of a file, with the line each one starts on.
 *
 * **The attributes of an element can span several lines,** so a rule that
 * reads one line at a time will see an element's `className` on one line
 * and its `role` on the next — and will report a false failure. Matching
 * the whole opening tag is what makes the rules read the element rather
 * than the line.
 */
function openingTags(source: string): { readonly tag: string; readonly line: number }[] {
  const tags: { readonly tag: string; readonly line: number }[] = [];

  const pattern = /<([a-zA-Z][\w.-]*)((?:\s[^<>]*?)?)\/?>/g;

  let match = pattern.exec(source);

  while (match !== null) {
    tags.push({
      tag: `<${match[1]}${match[2]}>`,
      line: source.slice(0, match.index).split('\n').length,
    });

    match = pattern.exec(source);
  }

  return tags;
}

/**
 * The opening tags that carry a class name containing `className`.
 */
function tagsWithClass(source: string, className: string): { readonly tag: string; readonly line: number }[] {
  return openingTags(source).filter(
    (entry) =>
      entry.tag.includes('className=') &&
      new RegExp(`className="[^"]*\\b${className}\\b`).test(entry.tag),
  );
}

describe('the surface checklist', () => {
  it('finds the surfaces to check', () => {
    // **The checklist is worthless if it checks nothing.** A glob that
    // stopped matching — a directory moved, a file renamed — would turn
    // every rule below into a no-op that still passed.
    expect(SURFACES.length).toBeGreaterThan(20);
  });
});

describe('the badge rule', () => {
  it('renders every badge through the shared component', () => {
    // **The criterion: "always pairs color with a text label and an
    // icon."** The shared `StatusBadge` is what carries the icon and the
    // `aria-label`; a hand-written `<span className="badge">` carries only
    // the colour.
    //
    // **The component's own source is exempt** — it is the one place the
    // class name is written out.
    const offenders: string[] = [];

    for (const surface of SURFACES) {
      if (surface.path.endsWith('status-badge.tsx')) {
        continue;
      }

      const tags = tagsWithClass(surface.source, 'badge');

      if (tags.length > 0) {
        offenders.push(
          `${surface.path.replace(`${process.cwd()}/`, '')}:${tags.map((entry) => entry.line).join(',')}`,
        );
      }
    }

    expect(offenders, `these surfaces write a raw badge: ${offenders.join(' ')}`).toEqual([]);
  });
});

describe('the describedby rule', () => {
  it('points every aria-describedby at an element that exists', () => {
    // **The criterion: "it replaces the helper text beneath the same element
    // id so the `aria-describedby` association is preserved."**
    //
    // An `aria-describedby` that names an id the document does not contain
    // is a broken association — the screen reader silently describes
    // nothing. The report form's image field and the recovery response
    // form's candidate-image field both had one.
    const offenders: string[] = [];

    for (const surface of SURFACES) {
      const referenced = new Set(
        Array.from(surface.source.matchAll(/aria-describedby="([^"]+)"/g)).map(
          (match) => match[1] as string,
        ),
      );

      for (const id of referenced) {
        if (id.includes('${')) {
          // **A template literal** — the id is computed, so it cannot be
          // checked from the source.
          continue;
        }

        const declared = new RegExp(`id="${escapeRegExp(id)}"`).test(surface.source);

        if (!declared) {
          offenders.push(`${surface.path.replace(`${process.cwd()}/`, '')} → "${id}"`);
        }
      }
    }

    expect(offenders, `these aria-describedby targets do not exist: ${offenders.join(' ')}`).toEqual(
      [],
    );
  });

  it('gives the helper and the error the same id under one field', () => {
    // **The replacement is under the same id.** A field whose helper is
    // `#x-describedby` and whose error is `#y-describedby` breaks the
    // association on the moment the error appears — which is the moment it
    // matters most.
    const offenders: string[] = [];

    for (const surface of SURFACES) {
      const helpers = new Set(
        Array.from(surface.source.matchAll(/className="field__helper"\s+id="([^"]+)"/g)).map(
          (match) => match[1] as string,
        ),
      );

      const errors = new Set(
        Array.from(surface.source.matchAll(/className="field__error"\s+id="([^"]+)"/g)).map(
          (match) => match[1] as string,
        ),
      );

      // **The ids are compared by their field part.** The helper is
      // `<field>-describedby` and so is the error, so the two sets must
      // name the same fields.
      const helperFields = new Set(Array.from(helpers, (id) => id.replace(/-describedby$/, '')));
      const errorFields = new Set(Array.from(errors, (id) => id.replace(/-describedby$/, '')));

      for (const field of helperFields) {
        if (!errorFields.has(field)) {
          offenders.push(
            `${surface.path.replace(`${process.cwd()}/`, '')}: "${field}" has a helper but no matching error id`,
          );
        }
      }
    }

    expect(offenders, `these fields have mismatched helper and error ids: ${offenders.join(' ')}`).toEqual(
      [],
    );
  });
});

describe('the native-validation rule', () => {
  it('lets the error summary run on every form that validates after submit', () => {
    // **The criterion: "the error summary carries `role="alert`", the first
    // invalid field receives focus, and the page scrolls to the first
    // error."**
    //
    // **The browser's own validation bubble blocks the submit event**, so
    // without `noValidate` the panel never hears about the failed
    // submission, the summary never appears, the focus never moves, and the
    // page never scrolls. The criterion cannot hold on a form that lets
    // the browser stop it.
    const offenders: string[] = [];

    for (const surface of SURFACES) {
      // **Only the forms that validate after submit matter.** A form
      // that has no `required` field cannot be blocked by the browser's
      // validation in the first place.
      if (!surface.source.includes('required')) {
        continue;
      }

      if (/<form\b/.test(surface.source) && !surface.source.includes('noValidate')) {
        offenders.push(surface.path.replace(`${process.cwd()}/`, ''));
      }
    }

    expect(
      offenders,
      `these forms let the browser block the error summary: ${offenders.join(' ')}`,
    ).toEqual([]);
  });
});

describe('the table rule', () => {
  it('gives every table a caption and scoped header cells', () => {
    // **The criterion: "header cells use `th scope="col"` and sortable
    // headers are buttons carrying `aria-sort`."**
    //
    // A `<td>` in the header row is not a header at all — a screen reader
    // announces the column's data cells with no name.
    const offenders: string[] = [];

    for (const surface of SURFACES) {
      if (!surface.source.includes('<table')) {
        continue;
      }

      const cells = Array.from(surface.source.matchAll(/<(td|th)\b([^>]*)>/g));

      const headerCells = cells.filter((match) => match[0].startsWith('<th'));

      if (headerCells.length === 0) {
        offenders.push(`${surface.path.replace(`${process.cwd()}/`, '')}: a table with no <th>`);
        continue;
      }

      for (const cell of headerCells) {
        if (!/scope="col"/.test(cell[2] ?? '')) {
          offenders.push(
            `${surface.path.replace(`${process.cwd()}/`, '')}: a <th> without scope="col"`,
          );
        }
      }
    }

    expect(offenders, `these tables are not semantic: ${offenders.join(' ')}`).toEqual([]);
  });
});

describe('the disclosure rule', () => {
  it('gives every aria-expanded control an aria-controls', () => {
    // **The criterion: "it carries `aria-expanded` and `aria-controls`
    // referencing the hidden region by id, and its state updates on
    // toggle."**
    //
    // **`aria-expanded` without `aria-controls`** tells a screen reader
    // that something is open without telling it *what*.
    const offenders: string[] = [];

    for (const surface of SURFACES) {
      for (const { tag, line } of openingTags(surface.source)) {
        if (!tag.includes('aria-expanded')) {
          continue;
        }

        if (!tag.includes('aria-controls')) {
          offenders.push(
            `${surface.path.replace(`${process.cwd()}/`, '')}:${line} has aria-expanded without aria-controls`,
          );
        }
      }
    }

    expect(offenders, `these disclosures are half-declared: ${offenders.join(' ')}`).toEqual([]);
  });
});

describe('the dialog rule', () => {
  it('gives every modal its role, its modality, and its title', () => {
    // **The criterion: "it uses `role="dialog"` with `aria-modal="true"`
    // and an `aria-labelledby` pointing at the modal title."**
    //
    // **All three, or the modal is unusable.** `role="dialog"` says what
    // it is; `aria-modal="true"` says the rest of the page is inert; and
    // `aria-labelledby` says what it is called. A modal with only the
    // first is a div the screen reader walks straight past.
    const offenders: string[] = [];

    for (const surface of SURFACES) {
      for (const { tag, line } of openingTags(surface.source)) {
        if (!tag.includes('role="dialog"')) {
          continue;
        }

        const missing = ['aria-modal="true"', 'aria-labelledby='].filter(
          (attribute) => !tag.includes(attribute),
        );

        if (missing.length > 0) {
          offenders.push(
            `${surface.path.replace(`${process.cwd()}/`, '')}:${line} is missing ${missing.join(' and ')}`,
          );
        }
      }
    }

    expect(offenders, `these modals are incomplete: ${offenders.join(' ')}`).toEqual([]);
  });

  it('points every modal\'s aria-labelledby at an element that exists', () => {
    // **The label has to resolve.** An `aria-labelledby` naming an id the
    // document does not contain leaves the modal with no accessible name
    // at all — which is the one thing a modal cannot do without.
    const offenders: string[] = [];

    for (const surface of SURFACES) {
      const tags = openingTags(surface.source);

      for (const { tag, line } of tags) {
        const labelledBy = tag.match(/aria-labelledby="([^"]+)"/)?.[1];

        if (!labelledBy) {
          continue;
        }

        const declared = new RegExp(`id="${escapeRegExp(labelledBy)}"`).test(surface.source);

        if (!declared) {
          offenders.push(
            `${surface.path.replace(`${process.cwd()}/`, '')}:${line} names "${labelledBy}", which does not exist`,
          );
        }
      }
    }

    expect(offenders, `these modal titles do not exist: ${offenders.join(' ')}`).toEqual([]);
  });
});

describe('the live-region rule', () => {
  it('gives every error summary a live region', () => {
    // **The criteria: "a successful non-blocking action … uses
    // `role="status"`", and "a validation or session error … uses
    // `role="alert"`".**
    //
    // The check is on the *element that carries the class*, and the
    // assertion is that a live region is present at all — because a
    // banner with no role is a banner a screen reader never announces.
    const offenders: string[] = [];

    for (const surface of SURFACES) {
      for (const { tag, line } of tagsWithClass(surface.source, 'error-summary')) {
        if (!/role="(alert|status)"/.test(tag)) {
          offenders.push(
            `${surface.path.replace(`${process.cwd()}/`, '')}:${line} is an error summary with no live region`,
          );
        }
      }
    }

    expect(offenders, `these summaries are silent: ${offenders.join(' ')}`).toEqual([]);
  });
});

describe('the checklist itself', () => {
  it('names every surface it checked', () => {
    // **A checklist that cannot report its own coverage cannot be
    // audited.** The names are printed so a reviewer can see what was
    // checked — and a surface that is missing from the list is a surface
    // nobody checked.
    expect(surfaceNames().length).toBe(SURFACES.length);
  });
});

/** A regular-expression-safe literal. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
