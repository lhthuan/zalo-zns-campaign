"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isValidVietnamesePhone } from "@/lib/phone";
import { ALL_CUSTOMERS_BATCH, ALL_CUSTOMERS_LABEL } from "@/lib/customerBatch";
import { useTranslation } from "@/components/i18n-provider";

interface Customer {
  id: string;
  customer_code: string | null;
  name: string | null;
  phone: string | null;
  zalo_uid: string | null;
  import_batch: string | null;
  created_at: string;
}

interface ImportBatch {
  import_batch: string;
  customer_count: number;
  last_imported_at: string;
}

interface CustomerGroup {
  group_id: string;
  name: string;
  customer_count: number;
}

interface MessageLogEntry {
  id: string;
  source: "campaign" | "test_send" | "api";
  sourceLabel: string;
  templateLabel: string;
  templateId: string;
  templateData: Record<string, unknown>;
  sendMode: string;
  success: boolean;
  zaloMsgId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  at: string | null;
}

const PAGE_SIZE_OPTIONS = [100, 200, 300, 400, 500];
const ALL_GROUPS = "__all__";

// Declarative column list — add an entry here (and to Customer above, if the
// field is new) to expose another customer field in the table without
// touching the render logic below.
interface ColumnDef {
  key: string;
  label: string;
  sortable?: boolean;
  filterParam?: string;
  render: (c: Customer) => React.ReactNode;
}

function useDebouncedValue<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);
  return debounced;
}

export default function CustomersPage() {
  const { t } = useTranslation("customers");
  const { t: tc } = useTranslation("common");
  const COLUMNS: ColumnDef[] = [
    {
      key: "customer_code",
      label: t("colCode"),
      sortable: true,
      filterParam: "filterCode",
      render: (c) => c.customer_code ?? "—",
    },
    { key: "name", label: t("colName"), sortable: true, filterParam: "filterName", render: (c) => c.name ?? "—" },
    { key: "phone", label: t("colPhone"), sortable: true, filterParam: "filterPhone", render: (c) => c.phone ?? "—" },
    { key: "zalo_uid", label: t("colZaloUid"), render: (c) => c.zalo_uid ?? "—" },
    { key: "import_batch", label: t("colImportBatch"), render: (c) => c.import_batch ?? "—" },
    {
      key: "created_at",
      label: t("colCreatedAt"),
      sortable: true,
      render: (c) => new Date(c.created_at).toLocaleDateString("vi-VN"),
    },
  ];
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(100);
  const [textFilters, setTextFilters] = useState<Record<string, string>>({});
  const debouncedTextFilters = useDebouncedValue(textFilters);
  const [batchFilter, setBatchFilter] = useState(ALL_CUSTOMERS_BATCH);
  const [groupFilter, setGroupFilter] = useState(ALL_GROUPS);
  const [sortColumn, setSortColumn] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadedPageRef = useRef(1);

  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [groups, setGroups] = useState<CustomerGroup[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deletingBatch, setDeletingBatch] = useState(false);

  const [editing, setEditing] = useState<Customer | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [newGroupNameInline, setNewGroupNameInline] = useState("");

  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [createGroupName, setCreateGroupName] = useState("");

  const [assignGroupOpen, setAssignGroupOpen] = useState(false);
  const [assignGroupId, setAssignGroupId] = useState("");
  const [assigningGroup, setAssigningGroup] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [messagesFor, setMessagesFor] = useState<Customer | null>(null);
  const [messages, setMessages] = useState<MessageLogEntry[] | null>(null);
  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(null);

  const buildParams = useCallback(
    (page: number) => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sort: sortColumn,
        dir: sortDir,
      });
      for (const [key, value] of Object.entries(debouncedTextFilters)) {
        if (value) params.set(key, value);
      }
      if (batchFilter !== ALL_CUSTOMERS_BATCH) params.set("batch", batchFilter);
      if (groupFilter !== ALL_GROUPS) params.set("groupId", groupFilter);
      return params;
    },
    [pageSize, sortColumn, sortDir, debouncedTextFilters, batchFilter, groupFilter]
  );

  const load = useCallback(
    async (mode: "reset" | "more") => {
      if (mode === "reset") setLoading(true);
      else setLoadingMore(true);
      const page = mode === "reset" ? 1 : loadedPageRef.current + 1;
      const res = await fetch(`/api/customers?${buildParams(page).toString()}`);
      const json = await res.json();
      if (mode === "reset") setLoading(false);
      else setLoadingMore(false);
      if (!res.ok) {
        toast.error(json.error ?? "Không tải được danh sách khách hàng");
        return;
      }
      setTotal(json.total);
      if (mode === "reset") {
        setCustomers(json.data);
        loadedPageRef.current = 1;
        setSelectedIds(new Set());
      } else {
        setCustomers((prev) => [...prev, ...json.data]);
        loadedPageRef.current = page;
      }
    },
    [buildParams]
  );

  const loadBatches = useCallback(async () => {
    const res = await fetch("/api/customers/import-batches");
    const json = await res.json();
    if (res.ok) setBatches(json.data ?? []);
  }, []);

  const loadGroups = useCallback(async () => {
    const res = await fetch("/api/customer-groups");
    const json = await res.json();
    if (res.ok) setGroups(json.data ?? []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load("reset");
  }, [load]);

  useEffect(() => {
    // Standard fetch-on-mount: both await before calling setState, neither is synchronous.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadBatches();
    loadGroups();
  }, [loadBatches, loadGroups]);

  function handleSort(column: string) {
    if (sortColumn === column) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDir("asc");
    }
  }

  function setColumnFilter(param: string, value: string) {
    setTextFilters((prev) => ({ ...prev, [param]: value }));
  }

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
    load("reset");
    loadBatches();
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllLoaded() {
    setSelectedIds((prev) =>
      prev.size === customers.length ? new Set() : new Set(customers.map((c) => c.id))
    );
  }

  async function handleCreateGroupFromSelection() {
    if (!createGroupName.trim()) return toast.error("Đặt tên nhóm");
    const res = await fetch("/api/customer-groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: createGroupName.trim(), customer_ids: [...selectedIds] }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error ? JSON.stringify(json.error) : "Tạo nhóm thất bại");
      return;
    }
    toast.success(`Đã tạo nhóm "${createGroupName.trim()}" với ${selectedIds.size} khách hàng`);
    setCreateGroupOpen(false);
    setCreateGroupName("");
    setSelectedIds(new Set());
    loadGroups();
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Xoá ${selectedIds.size} khách hàng đang chọn? Không thể hoàn tác.`)) return;
    setBulkDeleting(true);
    const res = await fetch("/api/customers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selectedIds] }),
    });
    const json = await res.json();
    setBulkDeleting(false);
    if (!res.ok) {
      toast.error(json.error ? JSON.stringify(json.error) : "Xoá thất bại");
      return;
    }
    toast.success(`Đã xoá ${json.deleted} khách hàng`);
    setSelectedIds(new Set());
    load("reset");
  }

  async function handleAddSelectedToGroup() {
    if (!assignGroupId) return toast.error("Chọn 1 nhóm");
    setAssigningGroup(true);
    const res = await fetch(`/api/customer-groups/${assignGroupId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer_ids: [...selectedIds] }),
    });
    setAssigningGroup(false);
    if (!res.ok) {
      toast.error("Thêm vào nhóm thất bại");
      return;
    }
    toast.success(`Đã thêm ${selectedIds.size} khách hàng vào nhóm`);
    setAssignGroupOpen(false);
    loadGroups();
  }

  async function handleRemoveSelectedFromGroup() {
    if (!assignGroupId) return toast.error("Chọn 1 nhóm");
    setAssigningGroup(true);
    const res = await fetch(`/api/customer-groups/${assignGroupId}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer_ids: [...selectedIds] }),
    });
    setAssigningGroup(false);
    if (!res.ok) {
      toast.error("Gỡ khỏi nhóm thất bại");
      return;
    }
    toast.success(`Đã gỡ ${selectedIds.size} khách hàng khỏi nhóm`);
    setAssignGroupOpen(false);
    loadGroups();
    if (groupFilter === assignGroupId) load("reset");
  }

  async function handleCreateGroupInline() {
    if (!newGroupNameInline.trim()) return;
    const res = await fetch("/api/customer-groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newGroupNameInline.trim() }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error ? JSON.stringify(json.error) : "Tạo nhóm thất bại");
      return;
    }
    setNewGroupNameInline("");
    loadGroups();
  }

  async function handleRenameGroup(groupId: string, currentName: string) {
    const name = prompt("Tên nhóm mới:", currentName);
    if (!name || !name.trim() || name.trim() === currentName) return;
    const res = await fetch(`/api/customer-groups/${groupId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (!res.ok) return toast.error("Đổi tên thất bại");
    loadGroups();
  }

  async function handleDeleteGroup(groupId: string, name: string) {
    if (!confirm(`Xoá nhóm "${name}"? Khách hàng trong nhóm không bị xoá, chỉ gỡ khỏi nhóm này.`)) return;
    const res = await fetch(`/api/customer-groups/${groupId}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Xoá thất bại");
    toast.success("Đã xoá nhóm");
    if (groupFilter === groupId) setGroupFilter(ALL_GROUPS);
    loadGroups();
  }

  async function openMessages(customer: Customer) {
    setMessagesFor(customer);
    setMessages(null);
    setExpandedMessageId(null);
    const res = await fetch(`/api/customers/${customer.id}/messages`);
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error ?? "Không tải được lịch sử tin nhắn");
      return;
    }
    setMessages(json.data ?? []);
  }

  function openNew() {
    setEditing({
      id: "",
      customer_code: "",
      name: "",
      phone: "",
      zalo_uid: "",
      import_batch: null,
      created_at: "",
    });
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
        name: editing.name || (isNew ? undefined : null),
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
    load("reset");
  }

  async function handleDelete(id: string) {
    if (!confirm("Xoá khách hàng này?")) return;
    const res = await fetch(`/api/customers/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Không xoá được");
      return;
    }
    toast.success("Đã xoá");
    load("reset");
  }

  function exportUrl(format: "xlsx" | "csv") {
    const params = buildParams(1);
    params.set("format", format);
    params.delete("page");
    params.delete("pageSize");
    return `/api/customers/export?${params.toString()}`;
  }

  const batchItems = {
    [ALL_CUSTOMERS_BATCH]: `— ${ALL_CUSTOMERS_LABEL} —`,
    ...Object.fromEntries(batches.map((b) => [b.import_batch, `${b.import_batch} (${b.customer_count})`])),
  };
  const groupItems = {
    [ALL_GROUPS]: "— Tất cả nhóm —",
    ...Object.fromEntries(groups.map((g) => [g.group_id, `${g.name} (${g.customer_count})`])),
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <div className="flex gap-2">
          <Button variant="outline" render={<Link href={exportUrl("xlsx")} />}>
            {t("exportExcel")}
          </Button>
          <Button variant="outline" render={<Link href={exportUrl("csv")} />}>
            {t("exportCsv")}
          </Button>
          <Button variant="outline" onClick={() => setGroupDialogOpen(true)}>
            {t("manageGroups")}
          </Button>
          <Button variant="outline" render={<Link href="/customers/import" />}>
            {t("importFile")}
          </Button>
          <Button onClick={openNew}>{t("addCustomer")}</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={batchFilter} onValueChange={(v) => setBatchFilter(v ?? ALL_CUSTOMERS_BATCH)} items={batchItems}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder={t("filterByBatch")} />
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
            {deletingBatch ? tc("deleting") : t("deleteBatch")}
          </Button>
        )}

        <Select value={groupFilter} onValueChange={(v) => setGroupFilter(v ?? ALL_GROUPS)} items={groupItems}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder={t("filterByGroup")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_GROUPS}>— {t("allGroups")} —</SelectItem>
            {groups.map((g) => (
              <SelectItem key={g.group_id} value={g.group_id}>
                {g.name} ({g.customer_count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v) || 100)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n} {t("rowsPerPage")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 p-3">
          <span className="text-sm">
            {selectedIds.size} {t("selectedCount")}
          </span>
          <Button size="sm" onClick={() => setCreateGroupOpen(true)}>
            {t("createGroupFromSelection")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAssignGroupOpen(true)}>
            {t("addRemoveGroup")}
          </Button>
          <Button size="sm" variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleting}>
            {bulkDeleting ? tc("deleting") : t("deleteSelected")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
            Bỏ chọn
          </Button>
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        {t("totalPrefix")} <strong className="text-foreground">{total}</strong> {t("totalMatching")}
        {customers.length < total && ` — ${t("loadedSoFar")} ${customers.length}`}
      </p>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  checked={customers.length > 0 && selectedIds.size === customers.length}
                  onChange={toggleSelectAllLoaded}
                />
              </TableHead>
              {COLUMNS.map((col) => (
                <TableHead
                  key={col.key}
                  className={col.sortable ? "cursor-pointer select-none" : undefined}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  {col.label}
                  {sortColumn === col.key && (sortDir === "asc" ? " ▲" : " ▼")}
                </TableHead>
              ))}
              <TableHead className="text-right">{t("colActions")}</TableHead>
            </TableRow>
            <TableRow>
              <TableHead />
              {COLUMNS.map((col) => (
                <TableHead key={col.key}>
                  {col.filterParam ? (
                    <Input
                      className="h-7 text-xs"
                      placeholder={t("filterPlaceholder")}
                      value={textFilters[col.filterParam] ?? ""}
                      onChange={(e) => setColumnFilter(col.filterParam!, e.target.value)}
                    />
                  ) : null}
                </TableHead>
              ))}
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={COLUMNS.length + 2} className="text-center text-muted-foreground">
                  {tc("loading")}
                </TableCell>
              </TableRow>
            ) : customers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COLUMNS.length + 2} className="text-center text-muted-foreground">
                  {t("noCustomers")}
                </TableCell>
              </TableRow>
            ) : (
              customers.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)} />
                  </TableCell>
                  {COLUMNS.map((col) => (
                    <TableCell key={col.key}>{col.render(c)}</TableCell>
                  ))}
                  <TableCell className="text-right space-x-1 whitespace-nowrap">
                    <Button variant="ghost" size="sm" onClick={() => openMessages(c)}>
                      {t("lookupMessages")}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>
                      {tc("edit")}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(c.id)}>
                      {tc("delete")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {customers.length < total && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => load("more")} disabled={loadingMore}>
            {loadingMore ? tc("loading") : `${t("loadMore")} (${customers.length}/${total})`}
          </Button>
        </div>
      )}

      {/* Add/edit customer */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? t("editCustomer") : t("addCustomerTitle")}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>{t("fieldCode")}</Label>
                <Input
                  value={editing.customer_code ?? ""}
                  onChange={(e) => setEditing({ ...editing, customer_code: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>{t("fieldName")}</Label>
                <Input
                  value={editing.name ?? ""}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>{t("fieldPhone")}</Label>
                <Input
                  value={editing.phone ?? ""}
                  onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">{t("fieldPhoneHint")}</p>
              </div>
              <div className="space-y-1">
                <Label>{t("fieldZaloUid")}</Label>
                <Input
                  value={editing.zalo_uid ?? ""}
                  onChange={(e) => setEditing({ ...editing, zalo_uid: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button onClick={handleSave}>{tc("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create group from selection */}
      <Dialog open={createGroupOpen} onOpenChange={setCreateGroupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("createGroupTitle")} {selectedIds.size} {t("customersSuffix")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <Label>{t("groupName")}</Label>
            <Input value={createGroupName} onChange={(e) => setCreateGroupName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateGroupOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button onClick={handleCreateGroupFromSelection}>{t("createGroup")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/remove selected customers to/from an existing group */}
      <Dialog open={assignGroupOpen} onOpenChange={setAssignGroupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("assignGroupTitle")} {selectedIds.size} {t("customersSuffix")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <Label>{t("chooseGroup")}</Label>
            <Select
              value={assignGroupId}
              onValueChange={(v) => setAssignGroupId(v ?? "")}
              items={Object.fromEntries(groups.map((g) => [g.group_id, `${g.name} (${g.customer_count})`]))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("chooseGroupPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {groups.map((g) => (
                  <SelectItem key={g.group_id} value={g.group_id}>
                    {g.name} ({g.customer_count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignGroupOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button variant="destructive" onClick={handleRemoveSelectedFromGroup} disabled={assigningGroup}>
              {t("removeFromGroup")}
            </Button>
            <Button onClick={handleAddSelectedToGroup} disabled={assigningGroup}>
              {t("addToGroup")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Group management */}
      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("manageGroupsTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder={t("newGroupName")}
                value={newGroupNameInline}
                onChange={(e) => setNewGroupNameInline(e.target.value)}
              />
              <Button onClick={handleCreateGroupInline}>{tc("add")}</Button>
            </div>
            <div className="max-h-80 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("colGroupName")}</TableHead>
                    <TableHead className="text-right">{t("colCustomerCount")}</TableHead>
                    <TableHead className="text-right">{t("colActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        {t("noGroups")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    groups.map((g) => (
                      <TableRow key={g.group_id}>
                        <TableCell>{g.name}</TableCell>
                        <TableCell className="text-right">{g.customer_count}</TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button variant="ghost" size="sm" onClick={() => handleRenameGroup(g.group_id, g.name)}>
                            {tc("edit")}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDeleteGroup(g.group_id, g.name)}>
                            {tc("delete")}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Message history lookup */}
      <Dialog open={messagesFor != null} onOpenChange={(open) => !open && setMessagesFor(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {t("messageHistoryTitle")} — {messagesFor?.name ?? messagesFor?.phone ?? t("customerFallback")}
            </DialogTitle>
          </DialogHeader>
          {messages == null ? (
            <p className="text-sm text-muted-foreground">{tc("loading")}</p>
          ) : messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noMessages")}</p>
          ) : (
            <div className="max-h-[60vh] space-y-2 overflow-y-auto">
              {messages.map((m) => (
                <div key={m.id} className="rounded-md border p-3">
                  <div
                    className="flex cursor-pointer items-center justify-between"
                    onClick={() => setExpandedMessageId(expandedMessageId === m.id ? null : m.id)}
                  >
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">
                        {m.templateLabel} <span className="text-muted-foreground">· {m.sourceLabel}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {m.at ? new Date(m.at).toLocaleString("vi-VN") : "—"} · {t("sentVia")} {m.sendMode}
                      </p>
                    </div>
                    <Badge variant={m.success ? "success" : "destructive"}>
                      {m.success ? t("success") : t("failed")}
                    </Badge>
                  </div>
                  {expandedMessageId === m.id && (
                    <div className="mt-2 space-y-1 border-t pt-2 text-xs">
                      <p>
                        <span className="text-muted-foreground">{t("templateIdLabel")}</span>{" "}
                        <span className="font-mono">{m.templateId}</span>
                      </p>
                      <p>
                        <span className="text-muted-foreground">{t("params")}</span>{" "}
                        <span className="font-mono">{JSON.stringify(m.templateData)}</span>
                      </p>
                      {m.zaloMsgId && (
                        <p>
                          <span className="text-muted-foreground">{t("zaloMsgId")}</span>{" "}
                          <span className="font-mono">{m.zaloMsgId}</span>
                        </p>
                      )}
                      {!m.success && (
                        <p className="text-destructive">
                          {t("errorLabel")} {m.errorCode}: {m.errorMessage}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
