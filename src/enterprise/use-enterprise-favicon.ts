"use client";

import { useEffect, useState } from "react";

/**
 * Browser-tab favicon = the logo the shell is showing (设置 → 通用 → Logo, or the host's
 * bundled default when nothing was uploaded).
 *
 * Every brand slot on the page calls this, and more than one can be mounted at once (public
 * and authenticated topbars during a route change, React StrictMode's double mount), so the
 * `<link rel="icon">` is owned by one module-level registry rather than by any single hook:
 *
 * - the most recently registered caller with a logo wins;
 * - with no logo anywhere, the tab shows the most recent `fallbackHref`, else the page's
 *   own original icon;
 * - when the last caller unmounts, every icon link is put back exactly as it was (href,
 *   `type`, `sizes`), and a link this module had to create is removed again.
 *
 * Writes are idempotent — an attribute is only touched when its value actually changes, so
 * re-renders never make the browser re-fetch the icon.
 */

interface FaviconClaim {
  logo: string | null;
  fallback: string | null;
}

interface IconSnapshot {
  href: string | null;
  type: string | null;
  sizes: string | null;
}

const ICON_SELECTOR = 'link[rel~="icon"]';
const OWNED_ATTR = "data-easyui-favicon";

const claims = new Map<object, FaviconClaim>();
const originals = new Map<HTMLLinkElement, IconSnapshot>();
let created: HTMLLinkElement | null = null;

function setAttr(link: HTMLLinkElement, name: string, value: string | null) {
  if (value === null) {
    if (link.hasAttribute(name)) link.removeAttribute(name);
  } else if (link.getAttribute(name) !== value) {
    link.setAttribute(name, value);
  }
}

function restoreAll() {
  for (const [link, snapshot] of originals) {
    if (!link.isConnected) continue;
    setAttr(link, "href", snapshot.href);
    setAttr(link, "type", snapshot.type);
    setAttr(link, "sizes", snapshot.sizes);
  }
  originals.clear();
  created?.remove();
  created = null;
}

function latest(pick: (claim: FaviconClaim) => string | null): string | null {
  let found: string | null = null;
  for (const claim of claims.values()) found = pick(claim) ?? found;
  return found;
}

/** The href the tab should show: the latest logo, else the latest fallback, else null. */
function targetHref(): { href: string | null; fromLogo: boolean } {
  const logo = latest((claim) => claim.logo);
  if (logo !== null) return { href: logo, fromLogo: true };
  return { href: latest((claim) => claim.fallback), fromLogo: false };
}

/** The page's icon links, creating (and remembering) one when the page has none. */
function ensureIconLinks(): HTMLLinkElement[] {
  const links = [...document.head.querySelectorAll<HTMLLinkElement>(ICON_SELECTOR)];
  if (links.length > 0) return links;
  created = document.createElement("link");
  created.rel = "icon";
  created.setAttribute(OWNED_ATTR, "");
  document.head.appendChild(created);
  return [created];
}

function snapshotOf(link: HTMLLinkElement): IconSnapshot | undefined {
  if (link !== created && !originals.has(link)) {
    originals.set(link, { href: link.getAttribute("href"), type: link.getAttribute("type"), sizes: link.getAttribute("sizes") });
  }
  return originals.get(link);
}

function applyIcon(link: HTMLLinkElement, href: string, fromLogo: boolean) {
  const snapshot = snapshotOf(link);
  setAttr(link, "href", href);
  // A logo is usually a data: URL of a different format than the page's `.ico`: a stale
  // `type="image/x-icon"` / `sizes` would make the browser mis-rank or skip it. The
  // fallback is a plain page icon again, so its original hints come back.
  setAttr(link, "type", fromLogo ? null : (snapshot?.type ?? null));
  setAttr(link, "sizes", fromLogo ? null : (snapshot?.sizes ?? null));
}

function sync() {
  if (typeof document === "undefined") return;
  const { href, fromLogo } = targetHref();
  if (claims.size === 0 || href === null) {
    restoreAll();
    return;
  }
  for (const link of ensureIconLinks()) applyIcon(link, href, fromLogo);
}

/**
 * Point the browser favicon at `logoSrc` (data URL or asset path) while the calling
 * component is mounted. `null`/empty shows `fallbackHref`, or the page's original icon when
 * no fallback is given. `EnterpriseBrandSlot` already calls this; hosts with their own brand
 * component call it with the logo they render.
 */
export function useEnterpriseFavicon(logoSrc: string | null | undefined, fallbackHref?: string | null): void {
  // One stable identity per hook instance: the registry key for this caller's claim.
  const [token] = useState<object>(() => ({}));
  const logo = logoSrc || null;
  const fallback = fallbackHref || null;

  useEffect(() => {
    claims.set(token, { logo, fallback });
    sync();
  }, [token, logo, fallback]);

  // Release lives in its own mount-only effect so a logo change updates the claim in place
  // instead of briefly dropping it (which would flash the original icon in between).
  useEffect(
    () => () => {
      claims.delete(token);
      sync();
    },
    [token],
  );
}
