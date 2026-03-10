// ID generation

export function generateId(prefix: string): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const num = ((bytes[0]! << 24 | bytes[1]! << 16 | bytes[2]! << 8 | bytes[3]!) >>> 0) % 2176782336;
  const suffix = num.toString(36).padStart(6, '0');
  return `${prefix}-${suffix}`;
}
