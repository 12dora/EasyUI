/**
 * EasyUI primitives — visual, business-free building blocks.
 * Import from `@easy-enterprise/ui` (the package barrel) or directly, e.g.
 * `import { Button } from "@easy-enterprise/ui/primitives/button"`.
 */

export { Button } from "./button";
export { Input, Textarea, Select, Field, FieldLabel } from "./field";
export { InfoTooltip } from "./info-tooltip";
export { Checkbox } from "./checkbox";
export { Badge, statusTone, type BadgeTone } from "./badge";
export { ActiveBadge, EnabledBadge } from "./active-badge";
export { PageHeader } from "./page-header";
export { PageLoadingSkeleton } from "./page-loading";
export { PageState } from "./page-state";
export { InlineNotice, InlineErrorBanner, type InlineNoticeTone } from "./inline-notice";
export { EmptyState, type EmptyStateKind, type EmptyStateSize } from "./empty-state";
export { AppErrorState, type AppErrorKind, type AppErrorRetry } from "./app-error-state";
export { PanelSurface } from "./panel-surface";
export { FormGrid, FormSection } from "./form-grid";
export { ActionRow, DialogFormActions } from "./action-row";
export { Section } from "./section";
export { Dialog, DialogHeaderAside } from "./dialog";
export { SegmentedToggle, type SegmentedToggleOption } from "./segmented-toggle";
export { TabList, TabPanel, tabPanelId, tabTriggerId, type TabDefinition, type TabListProps, type TabPanelProps } from "./tabs";
export { Toaster } from "./toaster";
export { UserAvatar, avatarInitials } from "./avatar";
export { PopoverSurface, POPOVER_MOTION } from "./popover-surface";
export { CollapseReveal } from "./collapse-reveal";
export {
  AsyncStateTransition,
  type AsyncSurfaceState,
  type AsyncStateTransitionProps,
} from "./async-state-transition";
