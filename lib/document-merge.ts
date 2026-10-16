/** Stable JSON so three-way merge can tell "unchanged" from key-order noise. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

export function threeWayMergeById<T extends { id: string }>(
  base: readonly T[],
  local: readonly T[],
  server: readonly T[],
): { items: T[]; conflicts: number } {
  const baseMap = new Map(base.map((item) => [item.id, item]));
  const localMap = new Map(local.map((item) => [item.id, item]));
  const serverMap = new Map(server.map((item) => [item.id, item]));
  const ids = new Set<string>([...baseMap.keys(), ...localMap.keys(), ...serverMap.keys()]);
  const items: T[] = [];
  let conflicts = 0;

  for (const id of ids) {
    const baseItem = baseMap.get(id);
    const localItem = localMap.get(id);
    const serverItem = serverMap.get(id);
    const localSame = stableStringify(localItem) === stableStringify(baseItem);
    const serverSame = stableStringify(serverItem) === stableStringify(baseItem);
    if (localSame) {
      if (serverItem) items.push(serverItem);
      continue;
    }
    if (serverSame) {
      if (localItem) items.push(localItem);
      continue;
    }
    conflicts += 1;
    if (localItem && serverItem) {
      const localUpdated = updatedAtOf(localItem);
      const serverUpdated = updatedAtOf(serverItem);
      items.push(localUpdated >= serverUpdated ? localItem : serverItem);
    } else if (localItem) {
      items.push(localItem);
    } else if (serverItem) {
      items.push(serverItem);
    }
  }

  return { items, conflicts };
}

function updatedAtOf(value: { id: string }): number {
  if (!("updatedAt" in value)) return 0;
  const updatedAt = (value as { updatedAt?: unknown }).updatedAt;
  return typeof updatedAt === "number" && Number.isFinite(updatedAt) ? updatedAt : 0;
}

export function threeWayMergeValue<T>(base: T, local: T, server: T): T {
  const localSame = stableStringify(local) === stableStringify(base);
  if (localSame) return server;
  const serverSame = stableStringify(server) === stableStringify(base);
  if (serverSame) return local;
  return local;
}

/** Dismissals only accumulate when both sides changed, so a removal is not forgotten. */
export function threeWayMergeDismissed(
  base: readonly string[],
  local: readonly string[],
  server: readonly string[],
): string[] {
  const baseKey = [...base].sort().join("\n");
  const localKey = [...local].sort().join("\n");
  const serverKey = [...server].sort().join("\n");
  if (localKey === baseKey) return [...server];
  if (serverKey === baseKey) return [...local];
  return [...new Set([...server, ...local])];
}
