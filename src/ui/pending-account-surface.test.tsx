/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PENDING_BANNER, PENDING_NEXT_HEADING, PENDING_UNAVAILABLE_ACTIONS } from './copy';
import { PendingAccountSurface, pendingFirstName } from './pending-account-surface';

afterEach(cleanup);

describe('the pending first name', () => {
  it('uses the first word of the display name', () => {
    expect(pendingFirstName('Ada Lovelace')).toBe('Ada');
  });

  it('falls back to there when the name is missing', () => {
    expect(pendingFirstName(null)).toBe('there');
  });
});

describe('the pending account surface', () => {
  it('greets by first name and names the registered email', () => {
    render(<PendingAccountSurface displayName="Ada Lovelace" email="ada@findback.test" />);

    expect(screen.getByRole('heading', { name: 'Welcome, Ada.' })).toBeTruthy();
    expect(screen.getAllByText('ada@findback.test')).toHaveLength(2);
  });

  it('renders the mockup banner and the next-steps card', () => {
    render(<PendingAccountSurface displayName="Ada Lovelace" email="ada@findback.test" />);

    expect(screen.getByRole('status').textContent).toContain(PENDING_BANNER);
    expect(screen.getByRole('heading', { name: PENDING_NEXT_HEADING })).toBeTruthy();

    for (const action of PENDING_UNAVAILABLE_ACTIONS) {
      expect(screen.getByText(action)).toBeTruthy();
    }
  });
});
