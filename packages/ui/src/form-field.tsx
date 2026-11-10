import { Check, TriangleAlert } from 'lucide-react';
import { forwardRef, useId, type InputHTMLAttributes } from 'react';

/**
 * C9 — Form Field (UI Design Guide, section 5).
 *
 *  - The label is always ABOVE the field (never a placeholder-only label).
 *  - Required fields show an asterisk AND the word "required".
 *  - An error uses a crimson border, a warning icon and a message. Write the message so it says
 *    HOW to fix it: "Enter a 10-digit phone number starting with 0", not "Invalid input".
 *  - A validated entry can show a green tick (`success`).
 *  - 44px high on the web.
 *
 * Works with react-hook-form: `<FormField label="SKU" {...register('sku')} />`.
 * Forms should use noValidate and let Zod produce the messages.
 */
export type FormFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'required'> & {
  label: string;
  required?: boolean;
  /** Caption-size hint below the field. Hidden while there is an error. */
  helperText?: string;
  error?: string;
  success?: boolean;
};

export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(function FormField(
  { label, required = false, helperText, error, success = false, id, className, ...rest },
  ref,
) {
  const generated = useId();
  const inputId = id ?? generated;
  const helperId = `${inputId}-helper`;
  const errorId = `${inputId}-error`;
  const showSuccess = success && !error;
  const describedBy = error ? errorId : helperText ? helperId : undefined;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-body font-semibold text-charcoal">
        {label}
        {required && (
          <span className="ml-2 text-caption font-normal text-stone">
            <span aria-hidden="true">*</span> required
          </span>
        )}
      </label>

      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={[
            'h-11 w-full rounded-control border bg-white px-3 text-body text-charcoal',
            'placeholder:text-stone',
            'outline-offset-0 focus:outline-2 focus:outline-brand',
            error ? 'border-alarm' : 'border-sand',
            showSuccess ? 'pr-10' : '',
            'disabled:cursor-not-allowed disabled:bg-sand disabled:text-stone',
            className ?? '',
          ]
            .filter(Boolean)
            .join(' ')}
          {...rest}
        />
        {showSuccess && (
          <>
            <Check
              className="pointer-events-none absolute top-1/2 right-3 h-5 w-5 -translate-y-1/2 text-safe"
              aria-hidden="true"
            />
            <span className="sr-only">Valid</span>
          </>
        )}
      </div>

      {error ? (
        <p id={errorId} role="alert" className="flex items-start gap-1 text-caption text-alarm">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : helperText ? (
        <p id={helperId} className="text-caption text-stone">
          {helperText}
        </p>
      ) : null}
    </div>
  );
});
