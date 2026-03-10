// --json output helper

export function jsonOutput(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function jsonError(code: string, message: string): string {
  return JSON.stringify({ error: { code, message } }, null, 2);
}
