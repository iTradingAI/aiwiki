export type ParsedMarkdown = {
  frontmatter: Record<string, string | boolean | string[]>;
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
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line.trim());
    if (!match) {
      continue;
    }
    result[match[1]] = parseScalar(match[2]);
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
  return Array.isArray(item) ? item : [];
}

function parseScalar(value: string): string | boolean | string[] {
  const trimmed = value.trim();
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
  return unquote(trimmed);
}

function unquote(value: string): string {
  return value.replace(/^["']|["']$/g, "");
}
