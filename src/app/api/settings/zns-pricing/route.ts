import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import type { ZnsPricingTag } from "@/types/supabase";

const TAGS: ZnsPricingTag[] = ["TRANSACTION", "CUSTOMER_CARE", "PROMOTION", "OTHER"];

export async function GET() {
  try {
    await requireUser();
    const supabase = createAdminClient();
    const { data, error } = await supabase.from("zns_pricing").select("*");
    if (error) throw error;

    const byTag = new Map((data ?? []).map((r) => [r.tag, r.price_vnd]));
    const result = TAGS.map((tag) => ({ tag, price_vnd: byTag.get(tag) ?? 0 }));

    return NextResponse.json({ data: result });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

const bodySchema = z.array(
  z.object({
    tag: z.enum(["TRANSACTION", "CUSTOMER_CARE", "PROMOTION", "OTHER"]),
    price_vnd: z.number().min(0),
  })
);

export async function POST(request: NextRequest) {
  try {
    await requireUser();
    const body = bodySchema.parse(await request.json());
    const supabase = createAdminClient();

    const { error } = await supabase.from("zns_pricing").upsert(
      body.map((r) => ({ ...r, updated_at: new Date().toISOString() })),
      { onConflict: "tag" }
    );
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
