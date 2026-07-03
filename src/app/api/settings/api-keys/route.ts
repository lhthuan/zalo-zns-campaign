import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { generateApiKey } from "@/lib/apiKey";

export async function GET() {
  try {
    await requireUser();
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("api_keys")
      .select("id, name, key_prefix, is_active, created_at, last_used_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

const createSchema = z.object({ name: z.string().trim().min(1) });

export async function POST(request: NextRequest) {
  try {
    await requireUser();
    const body = createSchema.parse(await request.json());
    const { plaintext, prefix, hash } = generateApiKey();

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("api_keys")
      .insert({ name: body.name, key_hash: hash, key_prefix: prefix })
      .select("id, name, key_prefix, is_active, created_at")
      .single();
    if (error) throw error;

    // Only time the plaintext key is ever returned — store it now, it can't be shown again.
    return NextResponse.json({ data: { ...data, plaintext } }, { status: 201 });
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
