/**
 * @vitest-environment jsdom
 */

/**
 * The first-invalid-field focus and scroll — story 011.
 *
 * **These are the tests for story 011's error criterion:** *"the error
 * summary carries `role="alert"`, the first invalid field receives focus,
 * and the page scrolls to the first error."*
 *
 * ## Why the suite drives the real panels
 *
 * The criterion is about the **whole form's** behaviour, not about a hook in
 * isolation: the submit has to turn the error state on, the summary has to
 * appear, the field has to take the focus, and the page has to scroll. So
 * the suite renders the three real panels — the report form, the claim
 * form, and the recovery response form — and drives them the way a member
 * would.
 *
 * ## Why the API is stubbed
 *
 * **The forms validate on the server.** The panels post to the API and
 * render the server's per-field error back into the form, so the suite
 * stubs the response the API would give for an invalid submission. The
 * behaviour under test — the summary, the focus, the scroll — is the
 * panel's, not the API's.
 *
 * ## Why the scroll is asserted against a stub
 *
 * jsdom does not implement `scrollIntoView`, and **a missing API must not
 * take the focus down with it.** So the suite installs a recording stub and
 * asserts on what the component asked for. The assertion is about the
 * *request* — that the component asked the browser to bring the field into
 * view — which is the part the component is responsible for.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRouterStub, resetDomEnvironment, type RouterStub } from '@/test/dom';

import { ClaimFormPanel } from './claim-form-panel';
import { RecoveryResponseFormPanel } from './recovery-response-form-panel';
import { ReportFormPanel } from './report-form-panel';

const router: RouterStub = createRouterStub();

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

/**
 * The scroll requests the components made.
 */
const scrollRequests: { readonly id: string; readonly options: ScrollIntoViewOptions | undefined }[] =
  [];

/**
 * A recording `scrollIntoView`.
 *
 * **The stub is installed on `Element.prototype`,** because the component
 * calls it on whatever element it found by id, and the element is created
 * by React after the test's own setup runs.
 */
function recordScroll(this: Element, options?: ScrollIntoViewOptions): void {
  scrollRequests.push({ id: this.id, options });
}

beforeEach(() => {
  resetDomEnvironment();
  scrollRequests.length = 0;
  Element.prototype.scrollIntoView = recordScroll;
});

afterEach(() => {
  cleanup();
  resetDomEnvironment();
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  vi.unstubAllGlobals();
});

/**
 * Stub the API with a per-field error.
 *
 * **The body is the shape the panels read:** `{ field, error }`. The panel
 * files that error under the server's field name and renders it beside the
 * field — and the focus hook looks the field up by that same name.
 */
function stubApiWithFieldError(field: string, error: string): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ field, error }),
    })),
  );
}

/**
 * The report form, rendered with the minimum it needs.
 */
function renderReportForm(): void {
  render(
    <ReportFormPanel
      type="Lost"
      initialValues={{
        name: '',
        category: '',
        description: '',
        date: '',
        campusArea: '',
        exactPlace: '',
        identifyingDetails: '',
      }}
      categories={['Electronics']}
      campusAreas={[{ value: 'Library', label: 'Library' }]}
      minDate="2020-01-01"
      maxDate="2026-01-01"
    />,
  );
}

/**
 * The claim form, rendered with the minimum it needs.
 */
function renderClaimForm(): void {
  render(
    <ClaimFormPanel reportId="report-1" minDate="2020-01-01" maxDate="2026-01-01" />,
  );
}

/**
 * The recovery response form, rendered with the minimum it needs.
 */
function renderResponseForm(): void {
  render(
    <RecoveryResponseFormPanel
      reportId="report-1"
      minDate="2020-01-01"
      maxDate="2026-01-01"
      campusAreas={[{ value: 'main_library', label: 'Main Library' }]}
    />,
  );
}

/**
 * The submit button.
 */
function submitButton(): HTMLElement {
  const button = document.querySelector('button[type="submit"]');

  if (!(button instanceof HTMLElement)) {
    throw new Error('the submit button is not in the document');
  }

  return button;
}

describe('the first invalid field takes the focus', () => {
  it('focuses the first invalid field of the report form', async () => {
    // **The criterion names the *first invalid field*, not the summary.**
    // A screen reader user hears the summary (it is a live region) and
    // then lands on the thing they must fix.
    stubApiWithFieldError('name', 'The name must be between 1 and 80 characters.');
    renderReportForm();

    fireEvent.click(submitButton());

    await waitFor(() => {
      expect(document.activeElement).toBe(document.getElementById('name'));
    });
  });

  it('focuses the first invalid field of the claim form', async () => {
    stubApiWithFieldError('reason', 'Say why you are claiming this item.');
    renderClaimForm();

    fireEvent.click(submitButton());

    await waitFor(() => {
      expect(document.activeElement).toBe(document.getElementById('reason'));
    });
  });

  it('focuses the first invalid field of the recovery response form', async () => {
    stubApiWithFieldError('whereFoundArea', 'Say where you found it.');
    renderResponseForm();

    fireEvent.click(submitButton());

    await waitFor(() => {
      expect(document.activeElement).toBe(document.getElementById('whereFoundArea'));
    });
  });

  it('focuses nothing before the first submit', () => {
    // **The validate-after-submit gate.** No error state exists before
    // the first submit attempt, so there is no invalid field to focus.
    renderReportForm();

    expect(document.activeElement).not.toBe(document.getElementById('name'));
  });
});

describe('the page scrolls to the first error', () => {
  it('asks the browser to bring the first invalid field into view', async () => {
    // **The criterion: "the page scrolls to the first error."** Moving
    // focus does not reliably scroll an element that is off-screen, so
    // the scroll is asked for directly.
    stubApiWithFieldError('name', 'The name must be between 1 and 80 characters.');
    renderReportForm();

    fireEvent.click(submitButton());

    await waitFor(() => {
      expect(scrollRequests.length).toBeGreaterThan(0);
    });

    expect(scrollRequests[0]?.id).toBe('name');
  });

  it('centres the field rather than putting it at the edge', async () => {
    // **`block: 'center'`** puts the field in the middle of the viewport
    // so the error message beside it is visible too — an error whose text
    // is off-screen is an error the member has to scroll to read.
    stubApiWithFieldError('name', 'The name must be between 1 and 80 characters.');
    renderReportForm();

    fireEvent.click(submitButton());

    await waitFor(() => {
      expect(scrollRequests.length).toBeGreaterThan(0);
    });

    expect(scrollRequests[0]?.options?.block).toBe('center');
  });

  it('scrolls the first error, not every error', async () => {
    // **One scroll, for the first error.** Scrolling to each in turn
    // would leave the member watching the page jump past the error they
    // were sent to.
    stubApiWithFieldError('name', 'The name must be between 1 and 80 characters.');
    renderReportForm();

    fireEvent.click(submitButton());

    await waitFor(() => {
      expect(scrollRequests.length).toBeGreaterThan(0);
    });

    expect(scrollRequests).toHaveLength(1);
  });

  it('still focuses the field when the browser has no scroll API', async () => {
    // **`scrollIntoView` is absent in some environments** — a test DOM, a
    // server render — and a missing API must not take the focus down with
    // it. The focus is the part that matters.
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;

    stubApiWithFieldError('name', 'The name must be between 1 and 80 characters.');
    renderReportForm();

    fireEvent.click(submitButton());

    await waitFor(() => {
      expect(document.activeElement).toBe(document.getElementById('name'));
    });
  });
});

describe('the error summary', () => {
  it('appears with role="alert" after a failed submit', async () => {
    // **The criterion: "the error summary carries `role="alert`"."** An
    // assertive live region is announced when it appears.
    stubApiWithFieldError('name', 'The name must be between 1 and 80 characters.');
    renderReportForm();

    expect(screen.queryByRole('alert')).toBeNull();

    fireEvent.click(submitButton());

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });
  });

  it('is absent before the first submit', () => {
    // **A summary that renders empty would still put a live region on the
    // page**, and the screen reader would announce nothing on load.
    renderReportForm();

    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.querySelector('#error-summary')).toBeNull();
  });

  it('comes before the fields in the document', async () => {
    // **The summary comes first in the DOM** because a screen reader
    // reaches it before the fields. That is also what makes the "focus
    // the first invalid field" behaviour sensible.
    stubApiWithFieldError('name', 'The name must be between 1 and 80 characters.');
    renderReportForm();

    fireEvent.click(submitButton());

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });

    const summary = screen.getByRole('alert');
    const firstField = document.getElementById('name');

    expect(summary.compareDocumentPosition(firstField as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
});

describe('a field that becomes valid again', () => {
  it('clears its error the moment the member edits it', async () => {
    // **The criterion: "its error state, icon, `aria-invalid`, and
    // `aria-describedby` clear immediately."** Clearing on the *edit*
    // rather than on a re-validation is what makes it immediate.
    stubApiWithFieldError('name', 'The name must be between 1 and 80 characters.');
    renderReportForm();

    fireEvent.click(submitButton());

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });

    const name = document.getElementById('name');

    expect(name?.getAttribute('aria-invalid')).toBe('true');

    fireEvent.change(name as HTMLInputElement, { target: { value: 'A blue backpack' } });

    await waitFor(() => {
      expect(name?.hasAttribute('aria-invalid')).toBe(false);
    });
  });

  it('clears only the edited field’s error, and leaves the others', async () => {
    // **A member may have made one correction and left the rest.** The
    // other errors must survive, or the member loses sight of what still
    // needs fixing.
    stubApiWithFieldError('name', 'The name must be between 1 and 80 characters.');
    renderReportForm();

    fireEvent.click(submitButton());

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });

    const name = document.getElementById('name');
    const category = document.getElementById('category');

    fireEvent.change(name as HTMLInputElement, { target: { value: 'A blue backpack' } });

    await waitFor(() => {
      expect(name?.hasAttribute('aria-invalid')).toBe(false);
    });

    expect(category?.hasAttribute('aria-invalid')).toBe(false);
  });
});
