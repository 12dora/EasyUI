import {
  cloneElement,
  forwardRef,
  isValidElement,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useId,
} from "react";
import { CONTROL_CLASS, CONTROL_STATE_CLASS } from "../control-tokens";

/**
 * Shared native field chrome — height/radius match `CONTROL` / antd controlHeight.
 * Textarea overrides height so multi-line content can grow.
 */
const baseInput =
  `block w-full box-border ${CONTROL_CLASS.fieldBox} ` +
  "transition-colors " +
  "placeholder:text-ink-faint placeholder:font-normal " +
  `${CONTROL_STATE_CLASS.hoverBorder} ${CONTROL_STATE_CLASS.focusBorder} focus:outline-none ` +
  "disabled:opacity-50 disabled:cursor-not-allowed";

/** Multi-line fields drop the fixed height and keep the shared radius/surface. */
const baseTextarea =
  `block w-full box-border ${CONTROL_CLASS.radius} bg-paper-soft border border-ink/15 ` +
  "px-2.5 py-1.5 text-[13px] leading-5 transition-colors " +
  "placeholder:text-ink-faint placeholder:font-normal " +
  `${CONTROL_STATE_CLASS.hoverBorder} ${CONTROL_STATE_CLASS.focusBorder} focus:outline-none ` +
  "disabled:opacity-50 disabled:cursor-not-allowed";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={`${baseInput} ${className}`}
        {...rest}
      />
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className = "", rows = 3, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        rows={rows}
        className={`${baseTextarea} resize-y ${className}`}
        {...rest}
      />
    );
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = "", children, ...rest }, ref) {
    return (
      <select
        ref={ref}
        className={`${baseInput} pr-7 ${className}`}
        {...rest}
      >
        {children}
      </select>
    );
  },
);

interface FieldProps {
  label?: ReactNode;
  info?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}

type LabelableElementProps = {
  readonly id?: string;
  readonly "aria-describedby"?: string;
  readonly "aria-invalid"?: boolean;
  readonly "aria-required"?: boolean;
};

const nativeLabelableElements = new Set(["button", "input", "meter", "output", "progress", "select", "textarea"]);

function isLabelableElement(child: ReactNode): child is ReactElement<LabelableElementProps> {
  if (!isValidElement<LabelableElementProps>(child)) {
    return false;
  }
  if (typeof child.type === "string") {
    return nativeLabelableElements.has(child.type);
  }
  if (child.type === Input || child.type === Select || child.type === Textarea) {
    return true;
  }
  // 自定义控件(如 RemoteSearchSelect)以静态标记 __isFieldControl 声明可接收 id/aria-*,
  // 从而被 label/描述关联;避免 easy-ui 反向 import 组件层(边界约束)。
  return (child.type as { __isFieldControl?: boolean } | null)?.__isFieldControl === true;
}

export function FieldLabel({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <span className="text-[11px] uppercase tracking-[0.14em] text-ink-soft font-medium">
      {children}
      {required && <span className="ml-1 text-[rgb(var(--signal))]">*</span>}
    </span>
  );
}

export function Field({ label, info, hint, error, required, htmlFor, children, className = "" }: FieldProps) {
  const generatedId = useId();
  const wireable = isLabelableElement(children);
  const childId = wireable ? children.props.id : undefined;
  const controlId = htmlFor ?? childId ?? (label && wireable ? generatedId : undefined);
  const baseId = controlId ?? generatedId;
  const hintId = hint && !error ? `${baseId}-hint` : undefined;
  const errorId = error ? `${baseId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const labelledChildren = wireable
    ? cloneElement(children, {
        ...(controlId && !childId ? { id: controlId } : {}),
        "aria-describedby": describedBy ?? children.props["aria-describedby"],
        "aria-invalid": error ? true : children.props["aria-invalid"],
        "aria-required": required ? true : children.props["aria-required"],
      })
    : children;

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <div className="flex min-h-6 items-center gap-1">
          <label htmlFor={controlId}>
            <FieldLabel required={required}>{label}</FieldLabel>
          </label>
          {info}
        </div>
      )}
      {labelledChildren}
      {hint && !error && <span id={hintId} className="text-[11px] text-ink-faint">{hint}</span>}
      {error && <span id={errorId} className="text-[11px] text-[rgb(var(--signal))]">{error}</span>}
    </div>
  );
}
