/** Catalog card title — strip marketing suffixes after "|". PDP keeps full name. */
export function catalogCardDisplayName(name: string): string {
  const pipe = name.indexOf("|");
  if (pipe === -1) return name.trim();
  return name.slice(0, pipe).trim();
}
