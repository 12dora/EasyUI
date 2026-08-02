import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Visible text rendered beside the box. When set, the input is wrapped in a
   *  <label> so the text becomes the accessible name. Omit it when the control
   *  is captioned elsewhere (e.g. a <Field label htmlFor>) and pass an id instead. */
  label?: ReactNode;
  wrapperClassName?: string;
}

const boxClass =
  "size-3.5 shrink-0 rounded-[2px] accent-[rgb(var(--amber))] transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--amber))]/50 " +
  "disabled:cursor-not-allowed disabled:opacity-50";

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, className = "", wrapperClassName = "", disabled, ...rest },
  ref,
) {
  const input = <input ref={ref} type="checkbox" disabled={disabled} className={`${boxClass} ${className}`} {...rest} />;
  if (label === undefined) return input;
  return (
    <label className={`inline-flex min-h-9 items-center gap-2 text-[13px] text-ink ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"} ${wrapperClassName}`}>
      {input}
      <span>{label}</span>
    </label>
  );
});
