import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/lib/auth";

const updateCustomerSchema = z.object({
  customer_code: z.string().trim().min(1).optional().nullable(),
  name: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1).optional(),
  zalo_uid: z.string().trim().min(1).optional().nullable(),
  extra_fields: z.record(z.string(), z.unknown()).optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    await requireUser();
    const { id } = await params;
    const supabase = createAdminClient();
    const { data, error } = await supabase.from("customers").select("*").eq("id", id).single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 404 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    await requireUser();
    const { id } = await params;
    const body = updateCustomerSchema.parse(await request.json());
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("customers")
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ data });
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

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    await requireUser();
    const { id } = await params;
    const supabase = createAdminClient();
    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
