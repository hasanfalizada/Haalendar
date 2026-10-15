// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-171. QR code drawn as React SVG from the uqr module matrix (no innerHTML,
// no network): used for the otpauth URI of 2FA enrolment. Dark modules on white with a quiet zone, readable in dark mode.
import { encode } from "uqr";

interface QrCodeProps {
  value: string;
  label: string;
  size?: number;
}

export function QrCode({ value, label, size = 192 }: QrCodeProps) {
  const { data } = encode(value, { ecc: "M", border: 2 });
  const cells = data.length;
  let path = "";
  data.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) path += `M${String(x)},${String(y)}h1v1h-1z`;
    });
  });
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${String(cells)} ${String(cells)}`}
      shapeRendering="crispEdges"
      className="rounded-sm bg-white"
    >
      <rect width={cells} height={cells} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}
