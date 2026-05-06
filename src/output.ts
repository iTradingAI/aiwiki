export type CliStreams = {
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
};

export function writeLine(stream: NodeJS.WritableStream, line = ""): void {
  stream.write(`${line}\n`);
}

export class CliError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}
