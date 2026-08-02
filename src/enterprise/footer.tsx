"use client";

import { useMemo, type ReactNode } from "react";

/** `maxWidth` is opt-in; unset means full-bleed, so the footer tracks the topbar/shell frame. */
export function EnterpriseFooter({ children, maxWidth }: { children: ReactNode; maxWidth?: number }) {
  return <footer className="border-t border-hairline bg-paper-deep"><div className="mx-auto flex items-center px-5 py-3 text-[12px] text-ink-faint" style={{ maxWidth }}>{children}</div></footer>;
}

/** Shared footer renderer used by every host; the backend remains the source of configured content. */
export function EnterpriseConfiguredFooter({ html, fallback, maxWidth }: { html?: string | null; fallback: ReactNode; maxWidth?: number }) {
  const safeHtml = useMemo(() => sanitizeFooterHtml((html ?? "").replaceAll("{year}", String(new Date().getFullYear()))), [html]);
  return <EnterpriseFooter maxWidth={maxWidth}>{safeHtml ? <span className="max-w-full [&_a]:text-ink-soft [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-ink" data-test-id="app-footer-html" dangerouslySetInnerHTML={{ __html: safeHtml }}/> : <span data-test-id="app-footer-fallback">{fallback}</span>}</EnterpriseFooter>;
}

const ALLOWED_TAGS = new Set(["A", "BR", "SPAN", "STRONG", "EM", "B", "I", "SMALL"]);
const ALLOWED_TARGETS = new Set(["_blank", "_self", "_parent", "_top"]);

function sanitizeFooterHtml(html: string): string {
  if (typeof window === "undefined" || !html) return "";
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild; if (!root) return "";
  const output = doc.createElement("div");
  for (const child of Array.from(root.childNodes)) { const safe = sanitizeNode(child, doc); if (safe) output.appendChild(safe); }
  return output.innerHTML;
}

function sanitizeNode(node: Node, doc: Document): Node | null {
  if (node.nodeType === Node.TEXT_NODE) return doc.createTextNode(node.textContent ?? "");
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const source = node as Element; if (!ALLOWED_TAGS.has(source.tagName)) return null;
  const target = doc.createElement(source.tagName.toLowerCase());
  if (source.tagName === "A") {
    const href = source.getAttribute("href"); if (href && isSafeHref(href)) target.setAttribute("href", href);
    const title = source.getAttribute("title"); if (title) target.setAttribute("title", title);
    const linkTarget = source.getAttribute("target"); if (linkTarget && ALLOWED_TARGETS.has(linkTarget)) target.setAttribute("target", linkTarget);
    target.setAttribute("rel", "noopener noreferrer");
  }
  for (const child of Array.from(source.childNodes)) { const safe = sanitizeNode(child, doc); if (safe) target.appendChild(safe); }
  return target;
}

function isSafeHref(href: string): boolean {
  const value = href.trim();
  if (!value || /[\u0000-\u001f\u007f]/.test(value) || value.startsWith("//") || value.includes("\\")) return false;
  if (value.startsWith("/") || value.startsWith("#") || value.startsWith("mailto:") || value.startsWith("tel:")) return true;
  try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:"; } catch { return false; }
}
