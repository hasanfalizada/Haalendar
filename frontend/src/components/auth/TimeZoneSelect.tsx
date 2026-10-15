// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. IANA time-zone picker defaulting to the browser zone (extracted from
// the setup wizard).
import { useMemo } from "react";

import { Field, Select } from "@/components/ui/input";

interface TimeZoneSelectProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
}

export function TimeZoneSelect({ id, label, value, onChange, error }: TimeZoneSelectProps) {
  const zones = useMemo(() => {
    const all = Intl.supportedValuesOf("timeZone");
    return all.includes(value) ? all : [value, ...all];
  }, [value]);
  return (
    <Field id={id} label={label} error={error}>
      {(aria) => (
        <Select
          {...aria}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
        >
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}
