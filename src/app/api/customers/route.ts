import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { isValidVietnamesePhone, toCanonicalZnsPhone } from "@/lib/phone";

const createCustomerSchema = z
  .object({
    customer_code: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).optional(),
    phone: z.string().trim().min(1).optional(),
    zalo_uid: z.string().trim().min(1).optional(),
    extra_fields: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((v) => v.phone || v.zalo_uid, {
    message: "Cần ít nhất Số điện thoại hoặc Zalo UID",
    path: ["phone"],
  });

const SORTABLE_COLUMNS = new Set(["name", "phone", "customer_code", "created_at", "updated_at"]);

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const supabase = createAdminClient();

    const { searchParams } = request.nextUrl;
    const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
    const pageSize = Math.min(500, Math.max(1, Number(searchParams.get("pageSize") ?? "20")));
    const search = searchParams.get("search")?.trim();
    const batch = searchParams.get("batch")?.trim();
    const groupId = searchParams.get("groupId")?.trim();
    const filterCode = searchParams.get("filterCode")?.trim();
    const filterName = searchParams.get("filterName")?.trim();
    const filterPhone = searchParams.get("filterPhone")?.trim();
    const sortParam = searchParams.get("sort")?.trim();
    const sortColumn = sortParam && SORTABLE_COLUMNS.has(sortParam) ? sortParam : "created_at";
    const sortDir = searchParams.get("dir") === "asc";

    let query = groupId
      ? supabase
          .from("customers")
          .select("*, customer_group_members!inner(group_id)", { count: "exact" })
          .eq("customer_group_members.group_id", groupId)
      : supabase.from("customers").select("*", { count: "exact" });

    query = query
      .order(sortColumn, { ascending: sortDir })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (search) {
      query = query.or(`phone.ilike.%${search}%,customer_code.ilike.%${search}%,name.ilike.%${search}%`);
    }
    if (batch) {
      query = query.eq("import_batch", batch);
    }
    if (filterCode) query = query.ilike("customer_code", `%${filterCode}%`);
    if (filterName) query = query.ilike("name", `%${filterName}%`);
    if (filterPhone) query = query.ilike("phone", `%${filterPhone}%`);

    const { data, error, count } = await query;
    if (error) throw error;

    // Strip the join-only embedded resource used purely to filter by group.
    const rows = (data ?? []).map((row) => {
      const rest = { ...row } as typeof row & { customer_group_members?: unknown };
      delete rest.customer_group_members;
      return rest;
    });

    return NextResponse.json({ data: rows, total: count ?? 0, page, pageSize });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

const bulkDeleteSchema = z.object({ ids: z.array(z.string()).min(1) });

export async function DELETE(request: NextRequest) {
  try {
    await requireUser();
    const body = bulkDeleteSchema.parse(await request.json());
    const supabase = createAdminClient();
    const { error } = await supabase.from("customers").delete().in("id", body.ids);
    if (error) throw error;
    return NextResponse.json({ success: true, deleted: body.ids.length });
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

export async function POST(request: NextRequest) {
  try {
    await requireUser();
    const body = createCustomerSchema.parse(await request.json());
    if (body.phone && !isValidVietnamesePhone(body.phone)) {
      return NextResponse.json({ error: "SĐT không hợp lệ (cần đúng định dạng số VN)" }, { status: 400 });
    }
    const phone = body.phone ? toCanonicalZnsPhone(body.phone) : undefined;
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("customers")
      .insert({ ...body, phone })
      .select()
      .single();
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
