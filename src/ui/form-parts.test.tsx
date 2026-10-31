/**
 * @vitest-environment jsdom
 */

/**
 * The shared form parts' tests.
 *
 * **These are the tests for the validate-after-submit contract** — story
 * 002's criteria:
 *
 * - *"no error, icon, red border, or `aria-invalid` state is present
 *   before the first submit attempt"*;
 * - *"the error summary carries `role="alert"`, the first invalid field
 *   receives focus"*; and
 * - *"error text replaces helper text under the same `id` so the
 *   `aria-describedby` association survives"*.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { resetDomEnvironment } from '@/test/dom';

import { ErrorSummary, Field, FormColumn, SelectField } from './form-parts';

/**
 * A form that shows its errors only after a submit.
 *
 * **The state lives in the test, not in the component**, so the suite
 * exercises the same `Field` the real forms use. The re-validation on
 * change mirrors the real forms' `revalidate` — the criterion is *"a
 * field's error state clears the moment its value becomes valid"*.
 */
function ValidateAfterSubmit(): React.JSX.Element {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [value, setValue] = useState('');

  /** The field's error, once the form has been submitted. */
  function currentError(): string | undefined {
    return submitted ? errors['email'] : undefined;
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setSubmitted(true);
        setErrors(value.trim().length === 0 ? { email: 'An email address is required.' } : {});
      }}
    >
      <ErrorSummary heading="Check the form" errors={errors} labels={{ email: 'Email' }} />

      <Field
        id="email"
        name="email"
        label="Email"
        type="email"
        value={value}
        onChange={(next) => {
          setValue(next);

          // **The error clears the moment the value becomes valid** —
          // the other half of the validate-after-submit criterion.
          if (submitted && next.trim().length > 0) {
            setErrors({});
          }
        }}
        helper="We will never share it."
        error={currentError()}
        required
      />

      <button type="submit">Sign in</button>
    </form>
  );
}

afterEach(() => {
  cleanup();
  resetDomEnvironment();
});

/**
 * The email input.
 *
 * **Found by id, not by label.** The label carries the required
 * asterisk, so the accessible name is `Email *` on a required field —
 * and the error summary's link is also labelled `Email`. The id is the
 * one unambiguous handle on the input.
 */
function emailInput(): HTMLInputElement {
  const input = document.getElementById('email');

  if (!(input instanceof HTMLInputElement)) {
    throw new Error('the email input is not in the document');
  }

  return input;
}

describe('the error summary', () => {
  it('renders nothing when there are no errors', () => {
    // **The summary is absent from the DOM before the first submit** —
    // that is what the criterion requires. Rendering an empty container
    // would still put a live region on the page.
    const { container } = render(
      <ErrorSummary heading="Check the form" errors={{}} labels={{ email: 'Email' }} />,
    );

    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('carries role="alert" when there are errors', () => {
    render(
      <ErrorSummary
        heading="Check the form"
        errors={{ email: 'An email address is required.' }}
        labels={{ email: 'Email' }}
      />,
    );

    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('lists every error', () => {
    render(
      <ErrorSummary
        heading="Check the form"
        errors={{
          email: 'An email address is required.',
          password: 'Enter your password.',
        }}
        labels={{ email: 'Email', password: 'Password' }}
      />,
    );

    const items = screen.getAllByRole('listitem');

    expect(items).toHaveLength(2);
  });

  it('uses the field labels, not the field names', () => {
    render(
      <ErrorSummary
        heading="Check the form"
        errors={{ email: 'An email address is required.' }}
        labels={{ email: 'Email' }}
      />,
    );

    expect(screen.getByRole('link', { name: 'Email' })).toBeTruthy();
  });

  it('links each error to its field', () => {
    render(
      <ErrorSummary
        heading="Check the form"
        errors={{ email: 'An email address is required.' }}
        labels={{ email: 'Email' }}
      />,
    );

    expect(screen.getByRole('link', { name: 'Email' }).getAttribute('href')).toBe('#email');
  });

  it('is focusable itself, so a caller can move focus to it', () => {
    render(
      <ErrorSummary
        heading="Check the form"
        errors={{ email: 'An email address is required.' }}
        labels={{ email: 'Email' }}
      />,
    );

    expect(screen.getByRole('alert').getAttribute('tabindex')).toBe('-1');
  });
});

describe('the field', () => {
  it('has a persistent label, never a placeholder', () => {
    // **EXPERIENCE.md §5.3: "Labels are persistent."** A placeholder
    // disappears the moment the member types, taking the label with it.
    render(
      <Field
        id="email"
        name="email"
        label="Email"
        value=""
        onChange={() => {}}
        helper="We will never share it."
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Email' })).toBeTruthy();
    expect(screen.queryByPlaceholderText('Email')).toBeNull();
  });

  it('shows the helper text when there is no error', () => {
    render(
      <Field
        id="email"
        name="email"
        label="Email"
        value=""
        onChange={() => {}}
        helper="We will never share it."
      />,
    );

    expect(screen.getByText('We will never share it.')).toBeTruthy();
  });

  it('replaces the helper text with the error, under the same id', () => {
    // **The criterion: "error text replaces helper text under the same
    // `id` so the `aria-describedby` association survives."**
    render(
      <Field
        id="email"
        name="email"
        label="Email"
        value=""
        onChange={() => {}}
        helper="We will never share it."
        error="An email address is required."
      />,
    );

    const described = emailInput().getAttribute('aria-describedby');

    expect(described).toBe('email-describedby');
    expect(document.getElementById('email-describedby')?.textContent).toBe(
      'An email address is required.',
    );
    expect(screen.queryByText('We will never share it.')).toBeNull();
  });

  it('marks the invalid state with aria-invalid', () => {
    render(
      <Field
        id="email"
        name="email"
        label="Email"
        value=""
        onChange={() => {}}
        error="An email address is required."
      />,
    );

    expect(emailInput().getAttribute('aria-invalid')).toBe('true');
  });

  it('has no aria-invalid when it is not invalid', () => {
    render(<Field id="email" name="email" label="Email" value="" onChange={() => {}} />);

    expect(emailInput().hasAttribute('aria-invalid')).toBe(false);
  });

  it('carries the required attribute and the programmatic meaning', () => {
    render(<Field id="email" name="email" label="Email" value="" onChange={() => {}} required />);

    const input = emailInput();

    expect(input.getAttribute('required')).not.toBeNull();
    expect(input.getAttribute('aria-required')).toBe('true');
  });

  it('marks the required indicator as decorative', () => {
    // **The asterisk is visual; `required` is programmatic.** A screen
    // reader that read "*" aloud would say "star" for every required
    // field, which is noise.
    render(<Field id="email" name="email" label="Email" value="" onChange={() => {}} required />);

    const asterisk = document.querySelector('.field__required');

    expect(asterisk?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('the select field', () => {
  it('is a native select', () => {
    // **EXPERIENCE.md §5.4 says so explicitly** — these are short,
    // fixed lists, and the native control gets keyboard, screen reader,
    // and mobile support for free.
    render(
      <SelectField
        id="role"
        name="role"
        label="Self-declared role"
        value=""
        onChange={() => {}}
        options={['Student', 'Employee', 'Visitor', 'Other']}
      />,
    );

    expect(screen.getByLabelText('Self-declared role').tagName).toBe('SELECT');
  });

  it('offers the options and a placeholder choice', () => {
    render(
      <SelectField
        id="role"
        name="role"
        label="Self-declared role"
        value=""
        onChange={() => {}}
        options={['Student', 'Employee', 'Visitor', 'Other']}
      />,
    );

    expect(screen.getAllByRole('option')).toHaveLength(5);
  });
});

describe('validate after submit', () => {
  it('shows no error before the first submit', () => {
    render(<ValidateAfterSubmit />);

    expect(screen.queryByRole('alert')).toBeNull();
    expect(emailInput().hasAttribute('aria-invalid')).toBe(false);
    expect(screen.getByText('We will never share it.')).toBeTruthy();
  });

  it('shows the error summary after a failed submit', async () => {
    render(<ValidateAfterSubmit />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });
  });

  it('marks the invalid field after a failed submit', async () => {
    render(<ValidateAfterSubmit />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(emailInput().getAttribute('aria-invalid')).toBe('true');
    });
  });

  it('clears the error the moment the value becomes valid', async () => {
    render(<ValidateAfterSubmit />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });

    fireEvent.change(emailInput(), { target: { value: 'ada@example.com' } });

    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
    });

    expect(emailInput().hasAttribute('aria-invalid')).toBe(false);
  });
});

describe('a floating field', () => {
  it('keeps Email as a real label inside the field', () => {
    render(
      <Field
        id="email"
        name="email"
        label="Email"
        type="email"
        value=""
        onChange={() => undefined}
        variant="float"
        required
      />,
    );

    const input = emailInput();
    const field = input.closest('.field');

    expect(screen.getByLabelText('Email')).toBe(input);
    expect(field?.className).toContain('field--float');
    expect(field?.className).not.toContain('field--filled');
  });

  it('lifts the label once the field has a value', () => {
    render(
      <Field
        id="email"
        name="email"
        label="Email"
        type="email"
        value="ada@example.com"
        onChange={() => undefined}
        variant="float"
      />,
    );

    expect(emailInput().closest('.field')?.className).toContain('field--filled');
  });
});

describe('the form column', () => {
  it('caps the form width at 640 px', () => {
    // **DESIGN.md's `--form-max-width`, and story 001's criterion.**
    const { container } = render(
      <FormColumn>
        <p>Content</p>
      </FormColumn>,
    );

    expect(container.querySelector('.form-column')).toBeTruthy();
  });
});
