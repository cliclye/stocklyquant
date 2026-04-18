/** Prefer explicit client-provided keys (trimmed) over environment variables. */
export function pickApiKey(envVal: string | undefined, clientVal: unknown): string {
  const fromClient = typeof clientVal === "string" ? clientVal.trim() : "";
  const fromEnv = (envVal ?? "").trim();
  return fromClient || fromEnv;
}
