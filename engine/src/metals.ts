/** "162Dy" -> 162; "145ND" -> 145. Returns null for unparsable labels. */
export function massOf(label: string | null | undefined): number | null {
  if (!label) return null;
  const m = /^\s*(\d{2,3})/.exec(label);
  return m ? Number(m[1]) : null;
}

export function channelLabel(mass: number, isotopes: Record<string, string>): string {
  const el = isotopes[String(mass)];
  return el ? `${mass}${el}` : String(mass);
}
