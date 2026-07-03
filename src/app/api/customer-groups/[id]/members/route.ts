import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const bodySchema = z.object({ customer_ids: z.array(z.string()).min(1) });

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    await requireUser();
    const { id } = await params;
    const body = bodySchema.parse(await request.json());
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("customer_group_members")
      .upsert(
        body.customer_ids.map((customer_id) => ({ group_id: id, customer_id })),
        { onConflict: "group_id,customer_id", ignoreDuplicates: true }
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

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    await requireUser();
    const { id } = await params;
    const body = bodySchema.parse(await request.json());
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("customer_group_members")
      .delete()
      .eq("group_id", id)
      .in("customer_id", body.customer_ids);
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
