import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/lib/auth";

const saveSchema = z.object({
  zalo_app_id: z.string().trim().min(1),
  zalo_app_secret_key: z.string().trim().min(1),
});

export async function GET() {
  try {
    await requireUser();
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("app_settings")
      .select("zalo_app_id, zalo_app_secret_key, updated_at")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw error;

    // Never send the secret key back to the browser — only whether one is set.
    return NextResponse.json({
      data: {
        zaloAppId: data?.zalo_app_id ?? null,
        hasSecretKey: Boolean(data?.zalo_app_secret_key),
        updatedAt: data?.updated_at ?? null,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireUser();
    const body = saveSchema.parse(await request.json());
    const supabase = createAdminClient();

    const { error } = await supabase.from("app_settings").upsert({
      id: 1,
      zalo_app_id: body.zalo_app_id,
      zalo_app_secret_key: body.zalo_app_secret_key,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
