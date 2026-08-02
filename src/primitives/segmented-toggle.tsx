"use client";

export interface SegmentedToggleOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly disabled?: boolean;
}

interface SegmentedToggleProps<T extends string> {
  readonly value: T;
  readonly options: readonly SegmentedToggleOption<T>[];
  readonly onChange: (value: T) => void;
  readonly ariaLabel: string;
  readonly dataTestId?: string;
  readonly dataOptionAttribute?: `data-${string}`;
}

export function SegmentedToggle<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  dataTestId,
  dataOptionAttribute,
}: SegmentedToggleProps<T>) {
  return (
    <div
      className="inline-flex h-7 max-w-full items-center overflow-x-auto rounded-md border border-hairline bg-paper p-0.5 scrollbar-hide"
      role="group"
      aria-label={ariaLabel}
      data-test-id={dataTestId}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`h-full shrink-0 whitespace-nowrap rounded-[4px] px-2.5 text-[12px] leading-none transition-colors ${
            value === option.value ? "bg-ink font-medium text-paper" : "text-ink-soft hover:text-ink"
          } ${option.disabled ? "cursor-not-allowed opacity-45" : ""}`}
          disabled={option.disabled}
          onClick={() => {
            if (!option.disabled) onChange(option.value);
          }}
          data-active={value === option.value ? "true" : "false"}
          {...(dataOptionAttribute ? { [dataOptionAttribute]: option.value } : {})}
          aria-disabled={option.disabled || undefined}
          aria-pressed={value === option.value}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
