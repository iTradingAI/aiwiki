export type TextRepair = {
  value: string | undefined;
  repaired: boolean;
};

export function repairMojibake(value: string | undefined): TextRepair {
  if (!value || !looksLikeUtf8Mojibake(value)) {
    return { value, repaired: false };
  }

  const repaired = decodeUtf8BytesFromLatin1(value) ?? decodeUtf8BytesFromCp1252(value);
  if (!repaired || scoreText(repaired) <= scoreText(value)) {
    return { value, repaired: false };
  }
  return { value: repaired, repaired: true };
}

function looksLikeUtf8Mojibake(value: string): boolean {
  return /(?:Ã|Â|â€|â€œ|â€|â€™|å|ç|è|é|ä|æ|ï¼|ã€)/.test(value);
}

function decodeUtf8BytesFromLatin1(value: string): string | undefined {
  try {
    return Buffer.from(value, "latin1").toString("utf8");
  } catch {
    return undefined;
  }
}

function decodeUtf8BytesFromCp1252(value: string): string | undefined {
  const bytes: number[] = [];
  for (const char of value) {
    const code = char.codePointAt(0);
    if (code === undefined) {
      continue;
    }
    const mapped = cp1252ReverseMap.get(code);
    if (mapped !== undefined) {
      bytes.push(mapped);
    } else if (code <= 0xff) {
      bytes.push(code);
    } else {
      return undefined;
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

function scoreText(value: string): number {
  const cjk = [...value].filter((char) => /[\u4e00-\u9fff]/u.test(char)).length;
  const mojibake = (value.match(/(?:Ã|Â|â€|â€œ|â€|â€™|å|ç|è|é|ä|æ|ï¼|ã€)/g) ?? []).length;
  const replacement = (value.match(/\uFFFD/g) ?? []).length;
  return cjk * 4 - mojibake * 20 - replacement * 50;
}

const cp1252ReverseMap = new Map<number, number>([
  [0x20ac, 0x80],
  [0x201a, 0x82],
  [0x0192, 0x83],
  [0x201e, 0x84],
  [0x2026, 0x85],
  [0x2020, 0x86],
  [0x2021, 0x87],
  [0x02c6, 0x88],
  [0x2030, 0x89],
  [0x0160, 0x8a],
  [0x2039, 0x8b],
  [0x0152, 0x8c],
  [0x017d, 0x8e],
  [0x2018, 0x91],
  [0x2019, 0x92],
  [0x201c, 0x93],
  [0x201d, 0x94],
  [0x2022, 0x95],
  [0x2013, 0x96],
  [0x2014, 0x97],
  [0x02dc, 0x98],
  [0x2122, 0x99],
  [0x0161, 0x9a],
  [0x203a, 0x9b],
  [0x0153, 0x9c],
  [0x017e, 0x9e],
  [0x0178, 0x9f]
]);
