import { formatInventoryMoney } from "@/lib/inventory";
import type { InventorySyncMeta } from "@/lib/inventory-hcp-sync";
import { HCP_MISCELLANEOUS_JOB_INPUTS_GAP } from "@/lib/hcp-job-parts";
import type { InventoryFlag, InventoryUsage } from "@/lib/inventory-usage";

function formatWhen(ms: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

export function InventoryAttention({
  flags,
  sync,
}: {
  flags: InventoryFlag[];
  sync: InventorySyncMeta | null;
}) {
  const inputFailure = sync && !sync.jobInputsAvailable;
  if (flags.length === 0 && !inputFailure) return null;
  return (
    <section className="m-3 rounded-lg border border-border bg-surface px-4 py-3" aria-label="Needs attention">
      <h2 className="font-display text-lg font-semibold">Needs attention</h2>
      {inputFailure ? (
        <p className="mt-2 text-sm text-chip-clay-fg">
          Material job inputs could not be read{sync.jobInputsDetail ? `: ${sync.jobInputsDetail}` : "."} Material
          line items were still checked. Qty for job inputs was left as it was.
        </p>
      ) : null}
      {flags.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No mismatched parts on the jobs checked so far.</p>
      ) : (
        <ul className="mt-2 grid gap-2">
          {flags.map((flag) => (
            <li key={flag.id} className="text-sm">
              <span className="font-semibold">
                {flag.kind === "hcp_part_without_inventory"
                  ? "On the job, not in inventory"
                  : flag.detail.startsWith("Job is not completed")
                    ? "Job reopened"
                    : "On the board, not on the job"}
              </span>
              {" · "}
              Job {flag.jobNumber || flag.hcpJobId}
              {flag.customerId ? ` · customer ${flag.customerId}` : ""}
              {" · "}
              {flag.partNumber || flag.partName || "part"}
              {" · qty "}
              {flag.qty}
              {" · "}
              {flag.source === "job_inputs" ? "job inputs" : "materials"}
              <span className="block text-muted">{flag.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function InventoryUsageLog({ usage }: { usage: InventoryUsage[] }) {
  const rows = [...usage].sort((a, b) => b.appliedAt - a.appliedAt || a.id.localeCompare(b.id));
  return (
    <section className="m-3" aria-label="Usage log">
      <h2 className="mb-2 font-display text-lg font-semibold">Usage log</h2>
      <p className="mb-2 text-sm text-muted">
        Deducted value is qty × unit value for the bookkeeper to draft a QuickBooks journal. Nothing is posted.{" "}
        {HCP_MISCELLANEOUS_JOB_INPUTS_GAP}
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No job usage recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[64rem] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs tracking-wide text-muted uppercase">
                <th className="px-2 py-2 font-semibold">When</th>
                <th className="px-2 py-2 font-semibold">Job #</th>
                <th className="px-2 py-2 font-semibold">Customer id</th>
                <th className="px-2 py-2 font-semibold">Part</th>
                <th className="px-2 py-2 font-semibold">Qty</th>
                <th className="px-2 py-2 font-semibold">Unit value</th>
                <th className="px-2 py-2 font-semibold">Deducted value</th>
                <th className="px-2 py-2 font-semibold">Source</th>
                <th className="px-2 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border">
                  <td className="px-2 py-2 whitespace-nowrap">{formatWhen(row.appliedAt)}</td>
                  <td className="px-2 py-2 font-mono">{row.jobNumber || "—"}</td>
                  <td className="px-2 py-2 font-mono">{row.customerId || "—"}</td>
                  <td className="px-2 py-2">
                    {row.partNumber || row.partName || "—"}
                    {row.partNumber && row.partName ? <span className="block text-muted">{row.partName}</span> : null}
                  </td>
                  <td className="px-2 py-2 font-mono tabular-nums">{row.qty}</td>
                  <td className="px-2 py-2 font-mono tabular-nums">
                    {row.unitValue == null ? "—" : formatInventoryMoney(row.unitValue)}
                  </td>
                  <td className="px-2 py-2 font-mono tabular-nums">{formatInventoryMoney(row.extendedValue)}</td>
                  <td className="px-2 py-2">{row.source === "job_inputs" ? "Job inputs" : "Materials"}</td>
                  <td className="px-2 py-2">
                    {row.reversedAt == null
                      ? row.inventoryItemId
                        ? "Deducted"
                        : "Not matched"
                      : row.reverseReason === "job_reopened"
                        ? "Reversed — job reopened"
                        : "Reversed — line removed"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
