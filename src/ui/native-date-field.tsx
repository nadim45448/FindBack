'use client';

export interface NativeDateFieldProps {
  readonly id: string;
  readonly className?: string;
  readonly value: string;
  readonly min: string;
  readonly max: string;
  readonly required?: boolean;
  readonly 'aria-required'?: boolean | 'true' | 'false';
  readonly 'aria-invalid'?: boolean;
  readonly 'aria-describedby'?: string | undefined;
  readonly onChange: (value: string) => void;
}

function openNativeDatePicker(input: HTMLInputElement): void {
  if (typeof input.showPicker !== 'function') {
    return;
  }

  try {
    void input.showPicker();
  } catch {
    // Some browsers throw if showPicker is not tied to a user gesture.
  }
}

/**
 * Native `<input type="date">` that opens the browser calendar when clicked.
 */
export function NativeDateField({
  id,
  className,
  value,
  min,
  max,
  required,
  'aria-required': ariaRequired,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  onChange,
}: NativeDateFieldProps): React.JSX.Element {
  return (
    <input
      id={id}
      className={className}
      type="date"
      value={value}
      min={min}
      max={max}
      required={required}
      aria-required={ariaRequired}
      aria-invalid={ariaInvalid}
      aria-describedby={ariaDescribedBy}
      onClick={(event) => {
        openNativeDatePicker(event.currentTarget);
      }}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    />
  );
}
