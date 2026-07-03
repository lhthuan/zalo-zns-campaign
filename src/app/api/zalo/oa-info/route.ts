import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { getOaInfo } from "@/lib/zalo/api";

export async function GET() {
  try {
    await requireUser();
    const info = await getOaInfo();
    return NextResponse.json({ data: info });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
