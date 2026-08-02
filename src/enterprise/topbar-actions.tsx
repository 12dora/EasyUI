"use client";

import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from "react";
import { UserAvatar } from "../primitives/avatar";
import { PopoverSurface } from "../primitives/popover-surface";
import type {
  EnterpriseLinkRenderer,
  EnterpriseLocale,
  EnterpriseLocaleOption,
  EnterpriseNotification,
  EnterpriseShellLabels,
  EnterpriseUserSummary,
} from "./models";
import { RelativeTimestamp } from "./relative-time";

type OpenMenu = "language" | "notifications" | "user" | null;

export interface EnterpriseTopbarActionsProps {
  /** Route identity; changing it closes any open popover. */
  pathKey?: string;
  locale: EnterpriseLocale;
  localeOptions: readonly EnterpriseLocaleOption[];
  onLocaleChange: (locale: EnterpriseLocale) => void;
  labels: EnterpriseShellLabels;
  notifications?: {
    items: readonly EnterpriseNotification[];
    loading?: boolean;
    error?: boolean;
    viewAllHref: string;
    /**
     * Optional unread badge count for cold-load (items may still be empty).
     * When omitted, falls back to items.length (backward compatible).
     */
    unreadCount?: number;
    onOpen?: () => void;
    /** 条目带 href 时点击深链的回调(宿主常在此乐观标记已读)。 */
    onItemOpen?: (id: string) => void;
    onDismiss?: (id: string) => void;
    onDismissAll?: () => void;
  };
  user?: EnterpriseUserSummary;
  securityHref?: string;
  renderLink: EnterpriseLinkRenderer;
  onLogout?: () => void | Promise<void>;
}

/** Router/API-independent topbar actions shared by all enterprise apps. */
export function EnterpriseTopbarActions(props: EnterpriseTopbarActionsProps) {
  const [open, setOpen] = useState<OpenMenu>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      setOpen(null);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, [open]);

  useEffect(() => setOpen(null), [props.pathKey]);

  async function logout() {
    if (!props.onLogout || loggingOut) return;
    setLoggingOut(true);
    try {
      await props.onLogout();
      setOpen(null);
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div ref={rootRef} className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3" data-test-id="admin-topbar-actions">
      <LanguageAction {...props} onLocaleChange={(nextLocale) => { setOpen(null); props.onLocaleChange(nextLocale); }} open={open === "language"} toggle={() => setOpen(open === "language" ? null : "language")} />
      {props.notifications ? (
        <NotificationsAction
          {...props.notifications}
          labels={props.labels}
          locale={props.locale}
          renderLink={props.renderLink}
          open={open === "notifications"}
          toggle={() => {
            const next = open !== "notifications";
            setOpen(next ? "notifications" : null);
            if (next) props.notifications?.onOpen?.();
          }}
        />
      ) : null}
      {props.user ? (
        <UserAction
          user={props.user}
          labels={props.labels}
          securityHref={props.securityHref}
          renderLink={props.renderLink}
          open={open === "user"}
          toggle={() => setOpen(open === "user" ? null : "user")}
          loggingOut={loggingOut}
          onLogout={props.onLogout ? logout : undefined}
        />
      ) : null}
    </div>
  );
}

function LanguageAction({ locale, localeOptions, onLocaleChange, labels, open, toggle }: EnterpriseTopbarActionsProps & { open: boolean; toggle: () => void }) {
  const menu = useTopbarMenuFocus(open);
  return (
    <div className="relative" data-test-id="topbar-language-switcher">
      <button ref={menu.triggerRef} type="button" onClick={toggle} aria-haspopup="menu" aria-expanded={open} aria-label={labels.switchLanguage} title={labels.switchLanguage} className="flex h-10 w-10 items-center justify-center text-ink-soft transition-colors hover:text-ink">
        <GlobeIcon />
      </button>
      {/* FE-PERF-04: PopoverSurface is CSS-enter only — no motion/react on the public shell path. */}
      {open ? (
        <PopoverSurface ref={menu.menuRef} role="menu" aria-label={labels.switchLanguage} tabIndex={-1} onKeyDown={menu.onKeyDown} className="absolute right-0 top-11 z-30 min-w-[132px] origin-top-right rounded-md border border-hairline bg-paper p-1 shadow-lg shadow-ink/10 focus:outline-none" data-animation="topbar-popover" data-test-id="topbar-language-menu">
          {localeOptions.map((option) => {
            const active = locale === option.code;
            return (
              <button key={option.code} type="button" role="menuitemradio" aria-checked={active} onClick={() => onLocaleChange(option.code)} className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-[13px] transition-colors ${active ? "bg-ink/[0.06] font-medium text-ink" : "text-ink-soft hover:bg-ink/[0.04] hover:text-ink"}`} data-test-id={`topbar-language-option-${option.code}`}>
                <span>{option.label}</span>{active ? <span className="h-1.5 w-1.5 rounded-full bg-[rgb(var(--amber))]" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </PopoverSurface>
      ) : null}
    </div>
  );
}

function NotificationsAction({ items, loading, error, viewAllHref, unreadCount, onItemOpen, onDismiss, onDismissAll, labels, locale, renderLink, open, toggle }: NonNullable<EnterpriseTopbarActionsProps["notifications"]> & { labels: EnterpriseShellLabels; locale?: EnterpriseLocale; renderLink: EnterpriseLinkRenderer; open: boolean; toggle: () => void }) {
  const menu = useTopbarMenuFocus(open);
  // Prefer explicit unreadCount (cold-load badge); fall back to loaded items.
  const badgeCount = typeof unreadCount === "number" ? unreadCount : items.length;
  return (
    <div className="relative" data-test-id="topbar-notifications">
      <button ref={menu.triggerRef} type="button" onClick={toggle} aria-haspopup="menu" aria-expanded={open} aria-label={labels.notifications} title={labels.notifications} className="relative flex h-10 w-10 items-center justify-center text-ink-soft transition-colors hover:text-ink">
        <BellIcon />
        {badgeCount > 0 ? <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[rgb(var(--signal))] px-1 text-[10px] font-semibold leading-none text-paper" data-test-id="topbar-notifications-badge">{badgeCount > 99 ? "99+" : badgeCount}</span> : null}
      </button>
      {open ? (
        <PopoverSurface ref={menu.menuRef} role="menu" aria-label={labels.notifications} tabIndex={-1} onKeyDown={menu.onKeyDown} className="absolute right-0 top-11 z-30 w-[300px] origin-top-right rounded-md border border-hairline bg-paper p-3 shadow-lg shadow-ink/10 focus:outline-none" data-animation="topbar-popover" data-test-id="topbar-notifications-menu">
          <div className="flex items-center justify-between gap-2"><div className="text-[13px] font-medium text-ink">{labels.notifications}</div>{items.length ? <button type="button" onClick={onDismissAll} className="text-[11px] text-ink-soft hover:text-[rgb(var(--signal))]" data-test-id="topbar-notifications-clear-all">{labels.notificationsClearAll}</button> : null}</div>
          {loading && !items.length ? <div className="mt-2 text-[12px] text-ink-faint">…</div> : error ? <div className="mt-2 text-[12px] text-[rgb(var(--signal))]">{labels.notificationsLoadFailed}</div> : !items.length ? <div className="mt-1 text-[12px] text-ink-faint">{labels.notificationsEmpty}</div> : <ul className="mt-2 max-h-[320px] space-y-1 overflow-y-auto pr-0.5" data-test-id="topbar-notifications-list">{items.map((item) => <li key={item.id} className="flex items-start justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-ink/[0.03]" data-test-id="topbar-notification-item"><div className="min-w-0">{item.href ? renderLink({ href: item.href, className: "block truncate text-[12px] text-ink hover:underline", testId: "topbar-notification-deeplink", onClick: () => onItemOpen?.(item.id), children: item.title }) : <div className="truncate text-[12px] text-ink">{item.title}</div>}{item.detail ? <div className={`mt-0.5 text-[11px] ${item.urgent ? "text-[rgb(var(--signal))]" : "text-ink-faint"}`}>{item.detail}</div> : null}<RelativeTimestamp value={item.createdAt} absoluteLabel={item.createdAtLabel} locale={locale} className="mt-0.5 block text-[11px] text-ink-faint" testId="topbar-notification-time" /></div>{onDismiss ? <button type="button" onClick={() => onDismiss(item.id)} aria-label={labels.notificationsDismiss} title={labels.notificationsDismiss} className="shrink-0 rounded p-0.5 text-ink-faint hover:text-[rgb(var(--signal))]" data-test-id="topbar-notification-dismiss">×</button> : null}</li>)}</ul>}
          {renderLink({ href: viewAllHref, role: "menuitem", className: "mt-2 block text-center text-[11px] text-ink-soft transition-colors hover:text-ink", testId: "topbar-notifications-view-all", children: labels.notificationsViewAll })}
        </PopoverSurface>
      ) : null}
    </div>
  );
}

function UserAction({ user, labels, securityHref, renderLink, open, toggle, loggingOut, onLogout }: { user: EnterpriseUserSummary; labels: EnterpriseShellLabels; securityHref?: string; renderLink: EnterpriseLinkRenderer; open: boolean; toggle: () => void; loggingOut: boolean; onLogout?: () => void }) {
  const menu = useTopbarMenuFocus(open);
  return (
    <div className="relative" data-test-id="topbar-user">
      <button ref={menu.triggerRef} type="button" onClick={toggle} aria-haspopup="menu" aria-expanded={open} aria-label={labels.userMenu} title={user.name} className="flex items-center gap-2.5 rounded-md px-1.5 py-1 transition-colors hover:bg-ink/[0.04]" data-test-id="topbar-user-trigger">
        <span className="hidden min-w-0 flex-col items-end leading-tight sm:flex" data-test-id="topbar-user-identity">
          <span className="max-w-[150px] truncate text-[13px] font-semibold text-ink" data-test-id="topbar-user-name">{user.name}</span>
          <span className="text-[11px] text-ink-faint" data-test-id="topbar-user-role">{user.identity}</span>
        </span>
        <UserAvatar name={user.name} avatarUrl={user.avatarUrl} size="sm" data-test-id="topbar-user-avatar" />
      </button>
      {open ? (
        <PopoverSurface ref={menu.menuRef} role="menu" aria-label={labels.userMenu} tabIndex={-1} onKeyDown={menu.onKeyDown} className="absolute right-0 top-[calc(100%+6px)] z-30 min-w-[200px] origin-top-right rounded-md border border-hairline bg-paper py-1.5 shadow-[0_8px_18px_rgba(17,24,39,0.14)] focus:outline-none" data-animation="topbar-popover" data-test-id="topbar-user-menu">
          {user.permissionSummary ? <div className="border-b border-hairline-soft px-3 py-2 text-[11px] text-ink-faint" data-test-id="topbar-user-permissions">{user.permissionSummary}</div> : null}
          {securityHref ? renderLink({ href: securityHref, role: "menuitem", className: "flex w-full items-center gap-2 px-3 py-2 text-[13px] text-ink transition-colors hover:bg-ink/[0.04]", testId: "topbar-user-menu-security", children: labels.securitySettings }) : null}
          {onLogout ? (
            <button type="button" role="menuitem" onClick={onLogout} disabled={loggingOut} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-[rgb(var(--signal))] transition-colors hover:bg-[rgb(var(--signal))]/[0.06] disabled:opacity-60" data-test-id="topbar-user-menu-logout">
              {loggingOut ? labels.loggingOut : labels.logout}
            </button>
          ) : null}
        </PopoverSurface>
      ) : null}
    </div>
  );
}

function useTopbarMenuFocus(open: boolean) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      requestAnimationFrame(() => menuItems(menuRef.current)[0]?.focus());
      return;
    }
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      triggerRef.current?.focus();
    }
  }, [open]);

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = menuItems(menuRef.current);
    if (!items.length) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Home") items[0]?.focus();
    else if (event.key === "End") items[items.length - 1]?.focus();
    else {
      const delta = event.key === "ArrowDown" ? 1 : -1;
      items[(current + delta + items.length) % items.length]?.focus();
    }
  }

  return { triggerRef, menuRef, onKeyDown };
}

function menuItems(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      '[role="menuitem"], [role="menuitemradio"], button:not(:disabled), a[href]',
    ),
  );
}

function GlobeIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a13.7 13.7 0 0 1 0 18M12 3a13.7 13.7 0 0 0 0 18"/></svg>; }
function BellIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>; }
