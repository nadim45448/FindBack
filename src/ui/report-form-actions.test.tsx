/**
 * @vitest-environment jsdom
 */

/**
 * The report form and the reporter actions' tests — bolt `014`, story 005.
 *
 * **These are the tests for the surfaces that carry a blocking rule.**
 *
 * - **The report form** — §10.1: the type is fixed by the URL, and the form
 *   renders **no type control at all**.
 * - **The report actions** — §10.4: a blocked action is **stated with its
 *   reason**, not silently dropped; and the destructive actions confirm.
 *
 * **The action plan is the domain's.** These tests assert that the surface
 * renders the plan it is given — not that the surface decides anything.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRouterStub, resetDomEnvironment, type RouterStub } from '@/test/dom';

import type { ReporterActionPlan } from '@/domain/listings';

import { ReportFormPageShell } from './report-form-page-shell';
import { ReportFormSurface, type ReportFormValues } from './report-form-surface';
import { ReportActionsSurface } from './report-actions-surface';

import {
  ADMINISTRATOR_ONLY_WORKFLOW,
  CANCEL,
  DELETE,
  EDIT,
  REPORT_CLOSED_CANNOT_EDIT,
  REPORT_HAS_INTERACTION_CANNOT_DELETE,
  REPORT_EXACT_PLACE_HELPER,
  SENSITIVE_LABEL,
  SUBMIT_REPORT,
  SUBMITTING,
  WITHDRAW,
} from './member-copy';

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
 * The form's opening values.
 */
const VALUES: ReportFormValues = {
  name: 'Brown leather wallet',
  category: 'Wallet',
  description: 'A brown leather wallet with a zip pocket.',
  date: '2026-10-20',
  campusArea: 'Library',
  exactPlace: '',
  identifyingDetails: '',
};

beforeEach(() => {
  resetDomEnvironment();
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the report form', () => {
  it('renders the Lost heading and description', () => {
    render(
      <ReportFormPageShell type="Lost">
        <div />
      </ReportFormPageShell>,
    );

    expect(screen.getByRole('heading', { name: 'Report a lost item' })).toBeTruthy();
    expect(
      screen.getByText(/match it against found reports/i),
    ).toBeTruthy();
  });

  it('renders the Found heading and description', () => {
    render(
      <ReportFormPageShell type="Found">
        <div />
      </ReportFormPageShell>,
    );

    expect(screen.getByRole('heading', { name: 'Report a found item' })).toBeTruthy();
    expect(screen.getByText(/Thanks for turning something in/i)).toBeTruthy();
  });

  it('renders no Lost/Found switch — the type is fixed by the URL', () => {
    // **§10.1: "No toggling between Lost and Found on the same form."**
    // The form receives its type and renders no control for it, so there is
    // no radio group, no select, and no toggle to find.
    const { container } = render(
      <ReportFormSurface
        type="Lost"
        values={VALUES}
        onChange={() => undefined}
        onSubmit={() => undefined}
        submitting={false}
        categories={['Wallet']}
        campusAreas={[{ value: 'Library', label: 'Library' }]}
        minDate="2025-10-30"
        maxDate="2026-10-30"
      />,
    );

    expect(screen.queryByRole('radio')).toBeNull();
    expect(container.querySelector('#type')).toBeNull();
    expect(screen.queryByRole('combobox', { name: /type/i })).toBeNull();
  });

  it('renders the flat mockup form and footer actions', () => {
    render(
      <ReportFormSurface
        type="Lost"
        values={VALUES}
        onChange={() => undefined}
        onSubmit={() => undefined}
        submitting={false}
        categories={['Wallet']}
        campusAreas={[{ value: 'Library', label: 'Library' }]}
        minDate="2025-10-30"
        maxDate="2026-10-30"
      />,
    );

    expect(screen.getByLabelText(/Item name/)).toBeTruthy();
    expect(screen.getByLabelText(/Location \(campus area\)/)).toBeTruthy();
    expect(screen.queryByText('Required details')).toBeNull();
    expect(screen.getByRole('button', { name: CANCEL })).toBeTruthy();
    expect(screen.getByRole('button', { name: SUBMIT_REPORT })).toBeTruthy();
  });

  it('bounds the date picker, and refuses a future date', () => {
    // **§10.3: "last 365 days, not future" for Lost.** The bound is on the
    // native input, so the browser refuses what the server would refuse.
    render(
      <ReportFormSurface
        type="Lost"
        values={VALUES}
        onChange={() => undefined}
        onSubmit={() => undefined}
        submitting={false}
        categories={['Wallet']}
        campusAreas={[{ value: 'Library', label: 'Library' }]}
        minDate="2025-10-30"
        maxDate="2026-10-30"
      />,
    );

    const date = screen.getByLabelText(/Date lost/) as HTMLInputElement;

    expect(date.getAttribute('min')).toBe('2025-10-30');
    expect(date.getAttribute('max')).toBe('2026-10-30');
  });

  it('marks the optional fields Sensitive, with the helper beside them', () => {
    // **§11.1: "A Sensitive flag appears inline next to fields that are
    // hidden from non-owners."**
    render(
      <ReportFormSurface
        type="Lost"
        values={VALUES}
        onChange={() => undefined}
        onSubmit={() => undefined}
        submitting={false}
        categories={['Wallet']}
        campusAreas={[{ value: 'Library', label: 'Library' }]}
        minDate="2025-10-30"
        maxDate="2026-10-30"
      />,
    );

    expect(screen.getAllByText(SENSITIVE_LABEL)).toHaveLength(2);
    expect(screen.getByText(REPORT_EXACT_PLACE_HELPER)).toBeTruthy();
  });

  it('marks the required fields with an asterisk and aria-required', () => {
    render(
      <ReportFormSurface
        type="Lost"
        values={VALUES}
        onChange={() => undefined}
        onSubmit={() => undefined}
        submitting={false}
        categories={['Wallet']}
        campusAreas={[{ value: 'Library', label: 'Library' }]}
        minDate="2025-10-30"
        maxDate="2026-10-30"
      />,
    );

    const name = screen.getByLabelText(/Item name/) as HTMLInputElement;

    expect(name.getAttribute('aria-required')).toBe('true');
    expect(name.required).toBe(true);
    expect(name.getAttribute('maxlength')).toBe('80');
  });

  it('disables the submit button and keeps its label visible while submitting', () => {
    // **Story 005's criterion:** the submit button is disabled, shows a
    // spinner, and **keeps its label visible** as `Submitting…`.
    render(
      <ReportFormSurface
        type="Lost"
        values={VALUES}
        onChange={() => undefined}
        onSubmit={() => undefined}
        submitting
        categories={['Wallet']}
        campusAreas={[{ value: 'Library', label: 'Library' }]}
        minDate="2025-10-30"
        maxDate="2026-10-30"
      />,
    );

    const submit = screen.getByRole('button', { name: SUBMITTING }) as HTMLButtonElement;

    expect(submit.disabled).toBe(true);
    expect(screen.getByRole('button', { name: CANCEL }).hasAttribute('disabled')).toBe(false);
  });

  it('shows a field error beside the field that failed', () => {
    render(
      <ReportFormSurface
        type="Lost"
        values={VALUES}
        onChange={() => undefined}
        onSubmit={() => undefined}
        submitting={false}
        errors={{ name: 'The name must be between 1 and 80 characters.' }}
        categories={['Wallet']}
        campusAreas={[{ value: 'Library', label: 'Library' }]}
        minDate="2025-10-30"
        maxDate="2026-10-30"
      />,
    );

    const name = screen.getByLabelText(/Item name/) as HTMLInputElement;

    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('The name must be between 1 and 80 characters.')).toBeTruthy();
  });
});

describe('the report actions', () => {
  /** A plan with every action permitted. */
  const PERMITTED: ReporterActionPlan = {
    edit: { kind: 'Permitted' },
    delete: { kind: 'Permitted' },
    withdraw: { kind: 'Permitted' },
    administratorOnly: false,
  };

  it('offers all three actions when the plan permits them', () => {
    render(<ReportActionsSurface plan={PERMITTED} />);

    expect(screen.getByRole('button', { name: EDIT })).toBeTruthy();
    expect(screen.getByRole('button', { name: DELETE })).toBeTruthy();
    expect(screen.getByRole('button', { name: WITHDRAW })).toBeTruthy();
  });

  it('states the blocked reason beside a disabled action', () => {
    // **Story 005's criterion:** the surface *"states the blocked-at-terminal
    // reason in plain English rather than silently doing nothing."* The
    // control is present and disabled, with the reason beside it.
    render(
      <ReportActionsSurface
        plan={{
          ...PERMITTED,
          edit: { kind: 'Blocked', reason: 'TerminalStatus' },
        }}
      />,
    );

    const edit = screen.getByRole('button', { name: EDIT }) as HTMLButtonElement;

    expect(edit.disabled).toBe(true);
    expect(screen.getByText(REPORT_CLOSED_CANNOT_EDIT)).toBeTruthy();
  });

  it('points at Withdraw when Delete is blocked by an interaction', () => {
    // **§10.4: once a Claim or RR exists, "the reporter must use Withdraw
    // instead."** The message names the remedy.
    render(
      <ReportActionsSurface
        plan={{
          ...PERMITTED,
          delete: { kind: 'Blocked', reason: 'InteractionExists' },
        }}
      />,
    );

    const deleteButton = screen.getByRole('button', { name: DELETE }) as HTMLButtonElement;

    expect(deleteButton.disabled).toBe(true);
    expect(screen.getByText(REPORT_HAS_INTERACTION_CANNOT_DELETE)).toBeTruthy();
  });

  it('says only an administrator can end the workflow', () => {
    // **§10.4: "only an Administrator may end the Lost workflow."**
    render(
      <ReportActionsSurface
        plan={{
          edit: { kind: 'Permitted' },
          delete: { kind: 'Blocked', reason: 'TerminalStatus' },
          withdraw: { kind: 'Blocked', reason: 'MatchConfirmed' },
          administratorOnly: true,
        }}
      />,
    );

    const withdraw = screen.getByRole('button', { name: WITHDRAW }) as HTMLButtonElement;

    expect(withdraw.disabled).toBe(true);
    expect(screen.getByText(ADMINISTRATOR_ONLY_WORKFLOW)).toBeTruthy();
  });

  it('confirms a delete before doing it', () => {
    const onDelete = vi.fn();

    render(<ReportActionsSurface plan={PERMITTED} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole('button', { name: DELETE }));

    // **The modal names the consequence,** and offers exactly a confirm and
    // a cancel action.
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(
      screen.getByText('Delete this report? This cannot be undone. The report will be removed from listings.'),
    ).toBeTruthy();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('dismisses the confirmation on Escape, as a cancel', () => {
    const onDelete = vi.fn();

    render(<ReportActionsSurface plan={PERMITTED} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole('button', { name: DELETE }));

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('confirms a withdraw with its own copy', () => {
    render(<ReportActionsSurface plan={PERMITTED} onWithdraw={() => undefined} />);

    fireEvent.click(screen.getByRole('button', { name: WITHDRAW }));

    expect(
      screen.getByText(
        'Withdraw this report? It will be removed from listings. The administrator can still see it in history.',
      ),
    ).toBeTruthy();
  });

  it('runs the handler only after the confirmation', () => {
    const onDelete = vi.fn();

    render(<ReportActionsSurface plan={PERMITTED} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole('button', { name: DELETE }));
    fireEvent.click(screen.getAllByRole('button', { name: DELETE })[1] as HTMLElement);

    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
