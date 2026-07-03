import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/lib/auth";

const createCustomerSchema = z.object({
  customer_code: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  zalo_uid: z.string().trim().min(1).optional(),
  extra_fields: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const supabase = createAdminClient();

    const { searchParams } = request.nextUrl;
    const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? "20")));
    const search = searchParams.get("search")?.trim();

    let query = supabase
      .from("customers")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (search) {
      query = query.or(`phone.ilike.%${search}%,customer_code.ilike.%${search}%,name.ilike.%${search}%`);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({ data, total: count ?? 0, page, pageSize });
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
    const body = createCustomerSchema.parse(await request.json());
    const supabase = createAdminClient();

    const { data, error } = await supabase.from("customers").insert(body).select().single();
    if (error) throw error;

    return NextResponse.json({ data }, { status: 201 });
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
