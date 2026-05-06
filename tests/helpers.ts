import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Writable } from "node:stream";

export async function tempRoot(name: string) {
  return mkdtemp(path.join(os.tmpdir(), `${name}-`));
}

export function fixturePath(...parts: string[]): string {
  return path.join(process.cwd(), "tests", "fixtures", ...parts);
}

export class MemoryWritable extends Writable {
  chunks: string[] = [];

  _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk);
    callback();
  }

  text(): string {
    return this.chunks.join("");
  }
}
