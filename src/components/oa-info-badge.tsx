"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";

type State =
  | { status: "loading" }
  | { status: "connected"; name: string }
  | { status: "error"; message: string };

export function OaInfoBadge() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    fetch("/api/zalo/oa-info")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json?.data?.name) {
          setState({ status: "error", message: json?.error ?? "Không xác định được lỗi" });
          return;
        }
        setState({ status: "connected", name: json.data.name });
      })
      .catch((err) => setState({ status: "error", message: String(err) }));
  }, []);

  if (state.status === "loading") {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        OA: đang kiểm tra...
      </Badge>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="destructive">OA: chưa kết nối</Badge>
        <span className="max-w-xs truncate text-xs text-muted-foreground" title={state.message}>
          {state.message}
        </span>
      </div>
    );
  }

  return <Badge variant="default">OA: {state.name}</Badge>;
}
