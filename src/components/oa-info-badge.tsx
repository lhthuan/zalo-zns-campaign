"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { oaInfoQuery } from "@/lib/queries";

export function OaInfoBadge() {
  const { data, error, isPending } = useQuery(oaInfoQuery);

  if (isPending) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        OA: đang kiểm tra...
      </Badge>
    );
  }

  if (error || !data?.name) {
    const message = error?.message ?? "Không xác định được lỗi";
    return (
      <div className="flex min-w-0 items-center gap-2">
        <Badge variant="destructive">OA: chưa kết nối</Badge>
        <span className="hidden max-w-xs truncate text-xs text-muted-foreground md:inline" title={message}>
          {message}
        </span>
      </div>
    );
  }

  return (
    <Badge variant="default" className="max-w-56 truncate" title={data.name}>
      OA: {data.name}
    </Badge>
  );
}
