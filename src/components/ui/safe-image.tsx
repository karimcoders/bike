"use client";

import { useState, type ImgHTMLAttributes } from "react";

// =====================================================================
// SafeImage — an <img> that shows a fallback placeholder when the source
// fails to load (broken URL, 404, network error, blob URL revoked, etc.)
// ---------------------------------------------------------------------
// Usage: <SafeImage src={product.photo} alt="..." placeholder={<Package />} />
//
// If `src` is empty/null/undefined, placeholder is shown immediately.
// If `src` is set but the image fails to load (onError), placeholder shows.
//
// Implementation:
//   The outer SafeImage decides whether to render the inner <ImgWithRetry>
//   or the placeholder. The inner component is remounted via key={src}
//   whenever src changes — this guarantees any internal error state from
//   a previous URL (e.g. a revoked blob: URL) is fully cleared before
//   the new URL is tried. No useEffect, no setState-in-effect, no race.
// =====================================================================

interface SafeImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src?: string | null;
  placeholder?: React.ReactNode;
  /** CSS class applied to the placeholder wrapper */
  placeholderClassName?: string;
}

// ---- Inner component that owns the errored flag for a given src ----
// Because the parent uses key={src} on this component, it remounts on
// every src change — giving us a fresh errored=false state for each new URL.
// No useEffect needed; no race conditions possible.
function ImgWithRetry({
  src,
  alt,
  className,
  placeholder,
  placeholderClassName,
  ...imgProps
}: {
  src: string;
  alt: string;
  className?: string;
  placeholder?: React.ReactNode;
  placeholderClassName: string;
} & ImgHTMLAttributes<HTMLImageElement>) {
  const [errored, setErrored] = useState(false);

  if (errored) {
    return (
      <div className={placeholderClassName} aria-label={alt}>
        {placeholder ?? null}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setErrored(true)}
      {...imgProps}
    />
  );
}

// ---- URL normalization ----
// Old DB entries store /uploads/... (static file path). New entries store
// /api/uploads/... (API route). When accessed through a preview panel /
// reverse proxy, /uploads/... may NOT be proxied (only /api/* is forwarded).
// So we rewrite old /uploads/... URLs to /api/uploads/... to ensure they
// load correctly regardless of proxy configuration.
// Data URLs (data:image/...) and absolute URLs (http://...) are left as-is.
export function normalizeSrc(src: string): string {
  if (!src) return src;
  if (src.startsWith("data:")) return src;
  if (src.startsWith("http://") || src.startsWith("https://")) return src;
  if (src.startsWith("blob:")) return src;
  // Rewrite /uploads/... → /api/uploads/... (but don't double-rewrite)
  if (src.startsWith("/uploads/")) {
    return `/api${src}`;
  }
  return src;
}

export function SafeImage({
  src,
  alt = "",
  placeholder,
  placeholderClassName = "flex items-center justify-center w-full h-full",
  className,
  ...imgProps
}: SafeImageProps) {
  // No src → placeholder immediately (no inner component needed)
  if (!src) {
    return (
      <div className={placeholderClassName} aria-label={alt}>
        {placeholder ?? null}
      </div>
    );
  }

  // Normalize old /uploads/... paths to /api/uploads/... for proxy compat
  const normalizedSrc = normalizeSrc(src);

  // key={src} forces a FULL remount of the inner img whenever src changes.
  // This is the bulletproof way to clear any internal state (including any
  // browser-level img load state) from the previous URL — eliminating the
  // race condition where a revoked blob: URL leaves errored=true and the
  // next valid server URL is incorrectly shown as a placeholder.
  return (
    <ImgWithRetry
      key={normalizedSrc}
      src={normalizedSrc}
      alt={alt}
      className={className}
      placeholder={placeholder}
      placeholderClassName={placeholderClassName}
      {...imgProps}
    />
  );
}
