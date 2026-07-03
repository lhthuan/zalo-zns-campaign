import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/lib/auth";

export async function GET() {
  try {
    await requireUser();
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("customer_group_counts");
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

const createSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
  customer_ids: z.array(z.string()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    await requireUser();
    const body = createSchema.parse(await request.json());
    const supabase = createAdminClient();

    const { data: group, error } = await supabase
      .from("customer_groups")
      .insert({ name: body.name, description: body.description ?? null })
      .select()
      .single();
    if (error) throw error;

    if (body.customer_ids && body.customer_ids.length > 0) {
      const { error: memberError } = await supabase
        .from("customer_group_members")
        .upsert(
          body.customer_ids.map((customer_id) => ({ group_id: group.id, customer_id })),
          { onConflict: "group_id,customer_id", ignoreDuplicates: true }
        );
      if (memberError) throw memberError;
    }

    return NextResponse.json({ data: group }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    if ((err as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "Đã có nhóm với tên này" }, { status: 409 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
