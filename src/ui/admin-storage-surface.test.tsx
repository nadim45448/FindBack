/**
 * @vitest-environment jsdom
 */

/**
 * The administrator storage surface's suite — image-handling §4.
 *
 * ## What this suite asserts
 *
 * **That the surface tells the administrator the situation, not the
 * arithmetic.** The domain owns the numbers; the surface renders them. A
 * surface that showed only byte counts would leave the administrator to
 * compute the percentage themselves — which is the one thing a dashboard
 * exists to avoid.
 *
 * **That the lines are named.** An administrator who sees "92% used" and is
 * not told that 90% is a line has to guess where it is.
 *
 * **That a failed read shows no number.** "0 bytes used" is a fact about
 * the budget; a failed read is not a fact. The loading state therefore
 * renders a bar, not a number.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  buildStorageUsageView,
  type StorageUsageView,
} from '@/domain/administration';

import { resetDomEnvironment } from '@/test/dom';

import { AdminStorageSurface } from './admin-storage-surface';

/** The quota the surface is rendered against. */
const QUOTA = 1024 * 1024 * 1024;

/** A view at a given fraction of the budget. */
function viewAt(fraction: number): StorageUsageView {
  return buildStorageUsageView({
    usedBytes: Math.ceil(QUOTA * fraction),
    quotaBytes: QUOTA,
  });
}

beforeEach(() => {
  resetDomEnvironment();
});

afterEach(() => {
  cleanup();
});

describe('the administrator storage surface', () => {
  it('shows the headline, not just the numbers', () => {
    render(<AdminStorageSurface usage={viewAt(0.95)} />);

    // **The headline is what says "you should act".** A surface that showed
    // only byte counts would leave the administrator to work out whether
    // the number was a problem.
    // **The headline appears twice when the budget needs attention** — once
    // as the calm status, once in the alert — and both say the same thing.
    expect(screen.getAllByText(/nearly full/i).length).toBeGreaterThan(0);
  });

  it('shows the bytes used, the bytes remaining, and the budget', () => {
    render(<AdminStorageSurface usage={viewAt(0.25)} />);

    expect(screen.getByText('256 MB')).toBeTruthy();
    expect(screen.getByText('768 MB')).toBeTruthy();
    expect(screen.getByText('1 GB')).toBeTruthy();
  });

  it('shows the percentage in use', () => {
    render(<AdminStorageSurface usage={viewAt(0.5)} />);

    expect(screen.getByText('50%')).toBeTruthy();
  });

  it('names the warning and critical lines', () => {
    render(<AdminStorageSurface usage={viewAt(0.25)} />);

    // **The lines are named.** An administrator who sees "92% used" and is
    // not told where 90% is has to guess.
    const { container } = { container: document.body };

    expect(container.textContent).toContain('70%');
    expect(container.textContent).toContain('90%');
    expect(container.textContent).toContain('100%');
  });

  it('says uploads are refused at the budget', () => {
    const { container } = render(<AdminStorageSurface usage={viewAt(0.25)} />);

    expect(container.textContent).toContain('Uploads are refused at 100%');
  });

  it('raises an alert when the budget needs attention', () => {
    render(<AdminStorageSurface usage={viewAt(0.95)} />);

    expect(screen.getByRole('alert').textContent).toMatch(/nearly full/i);
  });

  it('raises no alert when the budget is within its limit', () => {
    render(<AdminStorageSurface usage={viewAt(0.25)} />);

    // **A budget that is fine must not shout.** An alert that fires on
    // every page load trains administrators to ignore it.
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('announces the headline calmly', () => {
    const { container } = render(<AdminStorageSurface usage={viewAt(0.25)} />);

    // **The headline is a status, not an alert.** The administrator's page
    // may be open when the budget crosses a threshold.
    expect(container.querySelector('[role="status"]')).not.toBeNull();
  });

  it('renders a skeleton rather than a zero while loading', () => {
    const { container } = render(<AdminStorageSurface usage={null} />);

    // **A zero is a fact about the budget, not a placeholder.** A skeleton
    // that rendered "0 bytes" would be indistinguishable from a real zero.
    expect(container.textContent).not.toContain('0');
    expect(container.querySelector('.admin-tile__skeleton-bar')).not.toBeNull();
  });

  it('renders the error state with a retry and a "Go back" secondary', () => {
    render(<AdminStorageSurface usage={null} error="Something went wrong." />);

    expect(screen.getByRole('alert').textContent).toContain('Something went wrong.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go back' })).toBeTruthy();
  });

  it('shows no number at all when the read failed', () => {
    const { container } = render(
      <AdminStorageSurface usage={null} error="Something went wrong." />,
    );

    // **The page never shows a number it did not read.**
    expect(container.textContent).not.toContain('MB');
    expect(container.textContent).not.toContain('GB');
    expect(container.textContent).not.toContain('%');
  });

  it('renders no stack trace in the error state', () => {
    const { container } = render(
      <AdminStorageSurface usage={null} error="Something went wrong." />,
    );

    expect(container.textContent).not.toContain('at ');
    expect(container.querySelector('pre')).toBeNull();
  });
});
