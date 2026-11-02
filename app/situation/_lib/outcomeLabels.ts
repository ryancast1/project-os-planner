const DEMOCRAT = /\bdemocrat(?:ic|s)?\b/i;
const REPUBLICAN = /\brepublicans?\b/i;

export function getCompactOutcomeName(name: string, outcomeNames: readonly string[]): string {
  const repeatedParty = outcomeNames.filter((label) => DEMOCRAT.test(label)).length > 1
    || outcomeNames.filter((label) => REPUBLICAN.test(label)).length > 1;
  if (!repeatedParty) return name;

  return name.replace(/\bdemocrat(?:ic|s)?\b/gi, "DEM").replace(/\brepublicans?\b/gi, "REP");
}

function candidateSurname(name: string): string | null {
  const tagged = name.trim().match(/^(.+?)\s*\([DR]\)\s*$/i);
  if (!tagged) return null;
  const candidate = tagged[1]
    .replace(/^(?:(?:sen(?:ator)?|rep(?:resentative)?|gov(?:ernor)?|dr|mr|ms|mrs|pres(?:ident)?)\.?\s+)+/i, "")
    .replace(/,?\s+(?:jr\.?|sr\.?|II|III|IV)$/i, "");
  if (/\b(?:democrat(?:ic|s)?|republicans?|party|wins?|margin|other|candidate|person|none|independents?)\b/i.test(candidate)) return null;
  const parts = candidate.split(/\s+/);
  if (parts.length < 2 || parts.length > 6 || parts.some((part) => !/^[\p{L}\p{M}]+(?:[.'\u2019-][\p{L}\p{M}]+)*\.?$/u.test(part))) return null;

  const particles = new Set(["de", "del", "della", "di", "da", "dos", "das", "du", "la", "le", "van", "von", "der", "den", "ten", "ter", "st", "st."]);
  let start = parts.length - 1;
  while (start > 0 && particles.has(parts[start - 1].toLowerCase())) start--;
  return parts.slice(start).join(" ");
}

export function getTVOutcomeName(name: string, outcomeNames: readonly string[]): string {
  const partyLabel = name.trim().replace(/\s*\([DRI]\)\s*$/i, "");
  if (/^democrat(?:ic|s)?(?:\s+party)?$/i.test(partyLabel)) return "DEM";
  if (/^republicans?(?:\s+party)?$/i.test(partyLabel)) return "REP";
  if (/^independents?(?:\s+party)?$/i.test(partyLabel)) return "IND";
  const compact = getCompactOutcomeName(name, outcomeNames);
  if (compact !== name) return compact;
  const surname = candidateSurname(name);
  if (!surname) return name;
  // Keep full labels when shortening would make two candidates indistinguishable.
  const duplicates = outcomeNames.filter((label) => candidateSurname(label)?.toLowerCase() === surname.toLowerCase());
  return duplicates.length > 1 ? name : surname;
}
