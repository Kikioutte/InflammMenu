/** A complete decimal entry, with French comma support and no coercion to zero. */
export function parseNumericInput(raw: string, options: { min: number; max: number; integer?: boolean; decimals?: number }): number | null {
  const text = raw.trim().replace(",", ".");
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)) return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value < options.min || value > options.max) return null;
  if (options.integer && !Number.isInteger(value)) return null;
  if (options.decimals !== undefined && (text.split(".")[1]?.length ?? 0) > options.decimals) return null;
  return value;
}
