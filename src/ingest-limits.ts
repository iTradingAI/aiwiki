import { promises as fs } from "node:fs";

export const MAX_PAYLOAD_SIZE = 10 * 1024 * 1024;

export class IngestPayloadTooLargeError extends Error {
  readonly code = "AIWIKI_INGEST_PAYLOAD_TOO_LARGE";
  readonly workspaceWritten = false;
  readonly recommendedNextAction = "reduce_or_split_source";

  constructor(
    readonly maxBytes: number,
    readonly receivedBytes: number
  ) {
    super(`payload exceeds maximum size of ${maxBytes} bytes (received ${receivedBytes} bytes)`);
    this.name = "IngestPayloadTooLargeError";
  }
}

export function assertPayloadWithinLimit(payload: unknown): void {
  assertBytesWithinLimit(Buffer.byteLength(JSON.stringify(payload), "utf8"));
}

export function assertTextWithinLimit(text: string): void {
  assertBytesWithinLimit(Buffer.byteLength(text, "utf8"));
}

export async function assertFileWithinLimit(filePath: string): Promise<void> {
  const metadata = await fs.stat(filePath);
  assertBytesWithinLimit(metadata.size);
}

export function assertBytesWithinLimit(receivedBytes: number): void {
  if (receivedBytes > MAX_PAYLOAD_SIZE) {
    throw new IngestPayloadTooLargeError(MAX_PAYLOAD_SIZE, receivedBytes);
  }
}
