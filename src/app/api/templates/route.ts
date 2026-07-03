import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/lib/auth";

export async function GET() {
  try {
    await requireUser();
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("zalo_templates")
      .select("*")
      .order("template_name", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
