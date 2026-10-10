/** AWS Query and S3 responses are small flat XML documents; these helpers read them without a parser. */

const unescapeXml = (value: string) =>
  value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

function xmlTagPattern(name: string, global = false): RegExp | null {
  if (!/^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(name)) return null;
  return new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, global ? "g" : "");
}

export function xmlTag(xml: string, name: string): string | null {
  const match = xmlTagPattern(name)?.exec(xml);
  return match ? unescapeXml(match[1].trim()) : null;
}

export function xmlTags(xml: string, name: string): string[] {
  const pattern = xmlTagPattern(name, true);
  if (!pattern) return [];
  return [...xml.matchAll(pattern)].map((match) => unescapeXml(match[1].trim()));
}

/** Raw (still escaped) inner XML of each repeated element, for reading nested fields. */
export function xmlBlocks(xml: string, name: string): string[] {
  const pattern = xmlTagPattern(name, true);
  if (!pattern) return [];
  return [...xml.matchAll(pattern)].map((match) => match[1]);
}
