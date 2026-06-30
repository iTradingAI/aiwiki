export type FrontmatterPrimitive = string | boolean | number | null;
export type FrontmatterObject = Record<string, FrontmatterPrimitive | string[]>;
export type FrontmatterValue = FrontmatterPrimitive | string[] | FrontmatterObject[];

export type ParsedMarkdown = {
  frontmatter: Record<string, FrontmatterValue>;
  body: string;
};

export function parseMarkdown(text: string): ParsedMarkdown {
  if (!text.startsWith("---")) {
    return { frontmatter: {}, body: text };
  }
  const end = text.indexOf("\n---", 3);
  if (end === -1) {
    return { frontmatter: {}, body: text };
  }
  const rawFrontmatter = text.slice(3, end).trim();
  const body = text.slice(end).replace(/^\n---\r?\n?/, "");
  return { frontmatter: parseFrontmatter(rawFrontmatter), body };
}

export function parseFrontmatter(text: string): ParsedMarkdown["frontmatter"] {
  const result: ParsedMarkdown["frontmatter"] = {};
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line.trim());
    if (!match) {
      continue;
    }
    const key = match[1];
    const rawValue = match[2];
    if (!rawValue.trim() && isIndented(lines[index + 1])) {
      const parsed = parseIndentedArray(lines, index + 1);
      result[key] = parsed.value;
      index = parsed.nextIndex - 1;
      continue;
    }
    result[key] = parseScalar(rawValue);
  }
  return result;
}

export function frontmatterString(value: ParsedMarkdown["frontmatter"], key: string): string | undefined {
  const item = value[key];
  return typeof item === "string" ? item : undefined;
}

export function frontmatterBoolean(value: ParsedMarkdown["frontmatter"], key: string): boolean | undefined {
  const item = value[key];
  return typeof item === "boolean" ? item : undefined;
}

export function frontmatterArray(value: ParsedMarkdown["frontmatter"], key: string): string[] {
  const item = value[key];
  return Array.isArray(item) && item.every((entry) => typeof entry === "string") ? item : [];
}

export function frontmatterNumber(value: ParsedMarkdown["frontmatter"], key: string): number | undefined {
  const item = value[key];
  return typeof item === "number" ? item : undefined;
}

export function frontmatterNullableString(value: ParsedMarkdown["frontmatter"], key: string): string | null | undefined {
  const item = value[key];
  if (typeof item === "string" || item === null) {
    return item;
  }
  return undefined;
}

export function frontmatterObjectArray(value: ParsedMarkdown["frontmatter"], key: string): FrontmatterObject[] {
  const item = value[key];
  return Array.isArray(item) && item.every((entry) => typeof entry === "object" && entry !== null && !Array.isArray(entry))
    ? item as FrontmatterObject[]
    : [];
}

export function frontmatterLines(value: Record<string, FrontmatterValue | undefined>): string[] {
  const lines: string[] = [];
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) {
      continue;
    }
    lines.push(...serializeField(key, item));
  }
  return lines;
}

export function formatFrontmatter(value: Record<string, FrontmatterValue | undefined>): string {
  return ["---", ...frontmatterLines(value), "---"].join("\n");
}

function parseScalar(value: string): FrontmatterValue {
  const trimmed = value.trim();
  if (trimmed === "null") {
    return null;
  }
  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((item) => unquote(item.trim()))
      .filter(Boolean);
  }
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }
  return unquote(trimmed);
}

function parseIndentedArray(lines: string[], startIndex: number): { value: string[] | FrontmatterObject[]; nextIndex: number } {
  const strings: string[] = [];
  const objects: FrontmatterObject[] = [];
  let mode: "unknown" | "strings" | "objects" = "unknown";
  let index = startIndex;
  while (index < lines.length && isIndented(lines[index])) {
    const itemMatch = /^\s*-\s*(.*)$/.exec(lines[index]);
    if (!itemMatch) {
      index += 1;
      continue;
    }
    const item = itemMatch[1].trim();
    const inlineField = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(item);
    if (inlineField) {
      mode = "objects";
      const object: FrontmatterObject = {
        [inlineField[1]]: parseScalar(inlineField[2]) as FrontmatterPrimitive | string[]
      };
      index += 1;
      while (index < lines.length) {
        const fieldMatch = /^\s{4,}([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[index]);
        if (!fieldMatch) {
          break;
        }
        object[fieldMatch[1]] = parseScalar(fieldMatch[2]) as FrontmatterPrimitive | string[];
        index += 1;
      }
      objects.push(object);
      continue;
    }
    mode = "strings";
    strings.push(unquote(item));
    index += 1;
  }
  return { value: mode === "objects" ? objects : strings, nextIndex: index };
}

function serializeField(key: string, value: FrontmatterValue): string[] {
  if (Array.isArray(value)) {
    if (!value.length) {
      return [`${key}: []`];
    }
    if (value.every((item) => typeof item === "string")) {
      return [`${key}: [${(value as string[]).map((item) => quoteYaml(item)).join(", ")}]`];
    }
    return [
      `${key}:`,
      ...(value as FrontmatterObject[]).flatMap((item) => serializeObjectItem(item))
    ];
  }
  return [`${key}: ${serializeScalar(value)}`];
}

function serializeObjectItem(value: FrontmatterObject): string[] {
  const entries = Object.entries(value);
  if (!entries.length) {
    return ["  - {}"];
  }
  const [firstKey, firstValue] = entries[0];
  return [
    `  - ${firstKey}: ${serializeScalar(firstValue)}`,
    ...entries.slice(1).map(([key, item]) => `    ${key}: ${serializeScalar(item)}`)
  ];
}

function serializeScalar(value: FrontmatterPrimitive | string[]): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => quoteYaml(item)).join(", ")}]`;
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }
  return quoteYaml(value);
}

function quoteYaml(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function isIndented(value: string | undefined): boolean {
  return Boolean(value && /^\s+/.test(value));
}

function unquote(value: string): string {
  return value.replace(/^["']|["']$/g, "");
}
