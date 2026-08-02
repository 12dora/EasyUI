"use client";

import type { ReactNode } from "react";

import { AppErrorState } from "./app-error-state";
import { PageLoadingSkeleton } from "./page-loading";

interface PageStateProps {
  loading?: boolean;
  error?: ReactNode;
  notFound?: boolean;
  notFoundTitle?: ReactNode;
  notFoundDescription?: ReactNode;
  fallbackActions?: ReactNode;
  children: ReactNode;
}

export function PageState({
  loading,
  error,
  notFound,
  notFoundTitle,
  notFoundDescription,
  fallbackActions,
  children,
}: PageStateProps) {
  const renderFallback = (content: ReactNode) => (
    <>
      {fallbackActions && <div className="mb-4">{fallbackActions}</div>}
      {content}
    </>
  );

  if (loading) return renderFallback(<PageLoadingSkeleton />);
  if (error) {
    return renderFallback(<AppErrorState kind="unexpected" title={error} data-test-id="page-error-state" />);
  }
  if (notFound) {
    return renderFallback(
      <AppErrorState
        kind="notFound"
        title={notFoundTitle}
        description={notFoundDescription}
        data-test-id="page-error-state"
      />,
    );
  }
  return <>{children}</>;
}
