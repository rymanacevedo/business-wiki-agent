export function normalizeWords(input: string): string[] {
  return input.trim().toLowerCase().split(/\s+/).filter(Boolean);
}
