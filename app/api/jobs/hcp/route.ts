import { fetchHcpOpenJobs } from "@/lib/hcp";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const result = await fetchHcpOpenJobs();
  if (!result.ok) {
    console.error("HCP job list failed", result.error);
    return Response.json(result, { status: 502 });
  }
  if (result.skipped) {
    return Response.json({
      ok: true,
      skipped: true,
      reason: result.reason,
      jobs: [],
      fetchedAt: result.fetchedAt,
    });
  }
  return Response.json({
    ok: true,
    skipped: false,
    jobs: result.jobs,
    count: result.jobs.length,
    fetchedAt: result.fetchedAt,
  });
}
