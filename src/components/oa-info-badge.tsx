"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";

export function OaInfoBadge() {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/zalo/oa-info")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setName(json?.data?.name ?? null))
      .catch(() => setName(null));
  }, []);

  if (!name) return null;

  return <Badge variant="outline">OA: {name}</Badge>;
}
