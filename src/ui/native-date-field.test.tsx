/**
 * @vitest-environment jsdom
 */

import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { NativeDateField } from './native-date-field';

describe('NativeDateField', () => {
  it('opens the native picker when the field is clicked', () => {
    const showPicker = vi.fn();

    render(
      <NativeDateField
        id="date"
        className="input"
        value=""
        min="2025-01-01"
        max="2026-01-01"
        onChange={() => undefined}
      />,
    );

    const input = document.getElementById('date') as HTMLInputElement;
    input.showPicker = showPicker;

    fireEvent.click(input);

    expect(showPicker).toHaveBeenCalledOnce();
  });
});
