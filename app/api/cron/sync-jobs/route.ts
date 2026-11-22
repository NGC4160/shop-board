import { fetchHcpOpenJobs } from "@/lib/hcp";
import { isChicagoSevenAmHour } from "@/lib/chicago";
import { isAuthorizedCron } from "@/lib/cron-auth";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  if (!isChicagoSevenAmHour(now)) {
    return Response.json({
      ok: true,
      skipped: true,
      reason: "Not 7:00 AM America/Chicago (cron fires at 12:00 and 13:00 UTC for DST)",
      chicagoHour: new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Chicago",
        hour: "numeric",
        hourCycle: "h23",
      }).format(new Date(now)),
    });
  }

  const result = await fetchHcpOpenJobs();
  if (!result.ok) {
    console.error("HCP morning sync failed", result.error);
    return Response.json(result, { status: 502 });
  }
  if (result.skipped) {
    console.warn("HCP morning sync skipped", result.reason);
    return Response.json({
      ok: true,
      skipped: true,
      reason: result.reason,
      count: 0,
    });
  }
  console.info("HCP morning sync", { count: result.jobs.length, pages: result.pageCount });
  return Response.json({
    ok: true,
    skipped: false,
    count: result.jobs.length,
    pageCount: result.pageCount,
    fetchedAt: result.fetchedAt,
  });
}
