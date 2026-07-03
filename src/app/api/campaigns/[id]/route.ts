import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    await requireUser();
    const { id } = await params;
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("campaigns")
      .select("*, zalo_templates(template_name, tag)")
      .eq("id", id)
      .single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 404 });
  }
}

const patchSchema = z.object({
  is_hidden: z.boolean().optional(),
  name: z.string().trim().min(1).optional(),
});

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    await requireUser();
    const { id } = await params;
    const body = patchSchema.parse(await request.json());
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("campaigns")
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

    const { data: campaign, error: findError } = await supabase
      .from("campaigns")
      .select("status")
      .eq("id", id)
      .single();
    if (findError || !campaign) {
      return NextResponse.json({ error: "Không tìm thấy chiến dịch" }, { status: 404 });
    }
    if (campaign.status !== "draft") {
      return NextResponse.json(
        { error: "Chỉ có thể xoá chiến dịch còn ở trạng thái nháp" },
        { status: 400 }
      );
    }

    const { error } = await supabase.from("campaigns").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
