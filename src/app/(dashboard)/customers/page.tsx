"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isValidVietnamesePhone } from "@/lib/phone";
import { ALL_CUSTOMERS_BATCH, ALL_CUSTOMERS_LABEL } from "@/lib/customerBatch";

interface Customer {
  id: string;
  customer_code: string | null;
  name: string;
  phone: string | null;
  zalo_uid: string | null;
}

interface ImportBatch {
  import_batch: string;
  customer_count: number;
  last_imported_at: string;
}

const PAGE_SIZE = 20;

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [batchFilter, setBatchFilter] = useState(ALL_CUSTOMERS_BATCH);
  const [deletingBatch, setDeletingBatch] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (search) params.set("search", search);
    if (batchFilter !== ALL_CUSTOMERS_BATCH) params.set("batch", batchFilter);
    const res = await fetch(`/api/customers?${params.toString()}`);
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      toast.error(json.error ?? "Không tải được danh sách khách hàng");
      return;
    }
    setCustomers(json.data);
    setTotal(json.total);
  }, [page, search, batchFilter]);

  const loadBatches = useCallback(async () => {
    const res = await fetch("/api/customers/import-batches");
    const json = await res.json();
    if (res.ok) setBatches(json.data ?? []);
  }, []);

  useEffect(() => {
    // Standard fetch-on-mount: `load` awaits before calling setState, it isn't synchronous.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadBatches();
  }, [loadBatches]);

  async function handleDeleteBatch() {
    if (batchFilter === ALL_CUSTOMERS_BATCH) return;
    if (!confirm(`Xoá toàn bộ khách hàng trong lô "${batchFilter}"? Không thể hoàn tác.`)) return;
    setDeletingBatch(true);
    const res = await fetch(`/api/customers/import-batches?batch=${encodeURIComponent(batchFilter)}`, {
      method: "DELETE",
    });
    const json = await res.json();
    setDeletingBatch(false);
    if (!res.ok) {
      toast.error(json.error ?? "Không xoá được lô này");
      return;
    }
    toast.success(`Đã xoá ${json.deleted} khách hàng thuộc lô "${batchFilter}"`);
    setBatchFilter(ALL_CUSTOMERS_BATCH);
    setPage(1);
    load();
    loadBatches();
  }

  function openNew() {
    setEditing({ id: "", customer_code: "", name: "", phone: "", zalo_uid: "" });
    setDialogOpen(true);
  }

  function openEdit(c: Customer) {
    setEditing(c);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!editing) return;
    if (!editing.phone && !editing.zalo_uid) {
      return toast.error("Cần ít nhất Số điện thoại hoặc Zalo UID");
    }
    if (editing.phone && !isValidVietnamesePhone(editing.phone)) {
      return toast.error("SĐT không hợp lệ (cần đúng định dạng số VN, 10-11 số)");
    }
    const isNew = !editing.id;
    const url = isNew ? "/api/customers" : `/api/customers/${editing.id}`;
    const res = await fetch(url, {
      method: isNew ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_code: editing.customer_code || undefined,
        name: editing.name,
        phone: editing.phone || (isNew ? undefined : null),
        zalo_uid: editing.zalo_uid || (isNew ? undefined : null),
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(JSON.stringify(json.error));
      return;
    }
    toast.success(isNew ? "Đã thêm khách hàng" : "Đã cập nhật khách hàng");
    setDialogOpen(false);
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Xoá khách hàng này?")) return;
    const res = await fetch(`/api/customers/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Không xoá được");
      return;
    }
    toast.success("Đã xoá");
    load();
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Khách hàng</h1>
        <div className="flex gap-2">
          <Button variant="outline" render={<Link href="/customers/import" />}>
            Import file
          </Button>
          <Button onClick={openNew}>Thêm khách hàng</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Tìm theo tên, SĐT, mã KH..."
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          className="max-w-sm"
        />
        <Select
          value={batchFilter}
          onValueChange={(v) => {
            setPage(1);
            setBatchFilter(v ?? ALL_CUSTOMERS_BATCH);
          }}
          items={{
            [ALL_CUSTOMERS_BATCH]: `— ${ALL_CUSTOMERS_LABEL} —`,
            ...Object.fromEntries(batches.map((b) => [b.import_batch, `${b.import_batch} (${b.customer_count})`])),
          }}
        >
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Lọc theo lô import" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CUSTOMERS_BATCH}>— {ALL_CUSTOMERS_LABEL} —</SelectItem>
            {batches.map((b) => (
              <SelectItem key={b.import_batch} value={b.import_batch}>
                {b.import_batch} ({b.customer_count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {batchFilter !== ALL_CUSTOMERS_BATCH && (
          <Button variant="destructive" size="sm" onClick={handleDeleteBatch} disabled={deletingBatch}>
            {deletingBatch ? "Đang xoá..." : "Xoá cả lô này"}
          </Button>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mã KH</TableHead>
            <TableHead>Tên</TableHead>
            <TableHead>SĐT</TableHead>
            <TableHead>Zalo UID</TableHead>
            <TableHead className="text-right">Hành động</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                Đang tải...
              </TableCell>
            </TableRow>
          ) : customers.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                Không có khách hàng nào
              </TableCell>
            </TableRow>
          ) : (
            customers.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.customer_code}</TableCell>
                <TableCell>{c.name}</TableCell>
                <TableCell>{c.phone ?? "—"}</TableCell>
                <TableCell>{c.zalo_uid ?? "—"}</TableCell>
                <TableCell className="text-right space-x-2">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>
                    Sửa
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(c.id)}>
                    Xoá
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Tổng {total} khách hàng</span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Trước
          </Button>
          <span>
            {page}/{totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Sau
          </Button>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Sửa khách hàng" : "Thêm khách hàng"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Mã KH</Label>
                <Input
                  value={editing.customer_code ?? ""}
                  onChange={(e) => setEditing({ ...editing, customer_code: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Tên</Label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Số điện thoại</Label>
                <Input
                  value={editing.phone ?? ""}
                  onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Cần ít nhất SĐT hoặc Zalo UID — có thể để trống SĐT nếu đã có UID.
                </p>
              </div>
              <div className="space-y-1">
                <Label>Zalo UID (nếu biết)</Label>
                <Input
                  value={editing.zalo_uid ?? ""}
                  onChange={(e) => setEditing({ ...editing, zalo_uid: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Huỷ
            </Button>
            <Button onClick={handleSave}>Lưu</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
