export type ParsedArgs = {
  positional: string[];
  flags: Map<string, string | boolean>;
};

export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags = new Map<string, string | boolean>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--") || arg === "--") {
      positional.push(arg);
      continue;
    }

    const trimmed = arg.slice(2);
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex >= 0) {
      flags.set(trimmed.slice(0, eqIndex), trimmed.slice(eqIndex + 1));
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      flags.set(trimmed, next);
      index += 1;
      continue;
    }

    flags.set(trimmed, true);
  }

  return { positional, flags };
}

export function flagString(args: ParsedArgs, name: string): string | undefined {
  const value = args.flags.get(name);
  return typeof value === "string" ? value : undefined;
}

export function flagBool(args: ParsedArgs, name: string): boolean {
  return args.flags.get(name) === true;
}
