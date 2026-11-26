// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-166. Avatar (design system: round, initials fallback). The image comes from
// a versioned API URL; when there is none or it fails to load, the initials of the name are shown instead.
import { useState } from "react";

import { initials } from "@/lib/initials";
import { cn } from "@/lib/utils";

interface AvatarProps {
  name: string | undefined;
  url: string | null | undefined;
  size?: number;
  className?: string;
}

export function Avatar({ name, url, size = 32, className }: AvatarProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(url) && failedUrl !== url;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-tint font-semibold text-primary select-none",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      aria-hidden
    >
      {showImage && url ? (
        <img
          src={url}
          alt=""
          width={size}
          height={size}
          className="size-full object-cover"
          onError={() => {
            setFailedUrl(url);
          }}
        />
      ) : (
        // +++===+++ 2026-11-26 12:50 +04 — Hasan Alizada — HAAL-143 (WCAG 2.5.3, D-127). The initials are drawn by CSS
        // (`content: attr(data-initials)`), not written as text: the avatar is a picture, hidden from assistive
        // technology, and the button around it is named "Account menu of <name>" — text initials inside it would be a
        // visible label missing from that name.
        <span data-initials={initials(name)} className="before:content-[attr(data-initials)]" />
      )}
    </span>
  );
}
