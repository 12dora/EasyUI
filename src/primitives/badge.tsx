import type { ReactNode } from "react";

export type BadgeTone =
  | "neutral"
  | "ink"
  | "amber"
  | "evergreen"
  | "signal"
  | "bond"
  | "faint";

const TONE: Record<BadgeTone, string> = {
  neutral: "border-ink/20 text-ink bg-paper-soft",
  faint: "border-ink/10 text-ink-faint bg-paper-deep/60",
  ink: "border-ink/80 text-paper bg-ink",
  amber: "border-[rgb(var(--amber))]/40 text-[rgb(var(--amber))] bg-[rgb(var(--amber))]/[0.08]",
  evergreen:
    "border-[rgb(var(--evergreen))]/40 text-[rgb(var(--evergreen))] bg-[rgb(var(--evergreen))]/[0.08]",
  signal:
    "border-[rgb(var(--signal))]/40 text-[rgb(var(--signal))] bg-[rgb(var(--signal))]/[0.08]",
  bond:
    "border-[rgb(var(--bond))]/40 text-[rgb(var(--bond))] bg-[rgb(var(--bond))]/[0.08]",
};

export function Badge({
  tone = "neutral",
  children,
  className = "",
  uppercase = true,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  uppercase?: boolean;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap border rounded-[2px] px-1.5 py-0.5 font-mono text-[10.5px] leading-4 ${
        uppercase ? "uppercase tracking-[0.14em]" : "tracking-wide"
      } ${TONE[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** Map common backend status enums to a badge tone. */
export function statusTone(status: string | null | undefined): BadgeTone {
  if (!status) return "faint";
  const s = status.toUpperCase();
  // Activity-ish positive
  if (["ACTIVE", "PAID", "DELIVERED", "COMPLETED", "ACCEPTED", "CONFIRMED"].includes(s))
    return "evergreen";
  // Caution / in-flight
  if (
    ["PENDING", "DRAFT", "PRODUCTION", "DEPOSIT", "SENT", "REVISED", "SHIPPED", "INVOICED"].includes(
      s,
    )
  )
    return "amber";
  // Terminated
  if (["INACTIVE", "VOIDED", "REJECTED", "EXPIRED", "CANCELLED"].includes(s)) return "signal";
  // Converted / archived
  if (["CONVERTED", "CONVERTED_TO_ORDER", "ISSUED", "ARCHIVED"].includes(s)) return "bond";
  return "neutral";
}
