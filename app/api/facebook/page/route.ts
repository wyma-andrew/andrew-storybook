import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/auth-guard";
import { facebookConfigured, readFacebookPage } from "@/lib/facebook";

export const runtime = "nodejs";

export async function GET() {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;
  if (!facebookConfigured()) {
    return NextResponse.json({ error: "Set FB_PAGE_ID and FB_PAGE_TOKEN in .env first." }, { status: 503 });
  }
  try {
    return NextResponse.json(await readFacebookPage());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Facebook page lookup failed." }, { status: 502 });
  }
}
