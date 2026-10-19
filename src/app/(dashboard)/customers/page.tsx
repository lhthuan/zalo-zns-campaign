"use client";

import { useState } from "react";
import Link from "next/link";
import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FolderTree, History, Pencil, Plus, Trash2, Upload } from "lucide-react";
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
import { PageHeader } from "@/components/page-header";
import { TableMessageRow, TableSkeletonRows } from "@/components/table-states";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, apiSend } from "@/lib/api-client";
import { customerGroupsQuery, importBatchesQuery, queryKeys } from "@/lib/queries";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

interface Customer {
  id: string;
  customer_code: string | null;
  name: string | null;
  phone: string | null;
  zalo_uid: string | null;
  import_batch: string | null;
  created_at: string;
}

interface ImportHistoryEntry {
  id: string;
  import_batch: string;
  imported_at: string;
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
  const queryClient = useQueryClient();
  const [pageSize, setPageSize] = useState(100);
  const [textFilters, setTextFilters] = useState<Record<string, string>>({});
  const debouncedTextFilters = useDebouncedValue(textFilters, 350);
  const [batchFilter, setBatchFilter] = useState(ALL_CUSTOMERS_BATCH);
  const [groupFilter, setGroupFilter] = useState(ALL_GROUPS);
  const [sortColumn, setSortColumn] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const { data: batches = [] } = useQuery(importBatchesQuery);
  const { data: groups = [] } = useQuery(customerGroupsQuery);
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
  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(null);

  const baseParams = new URLSearchParams({ pageSize: String(pageSize), sort: sortColumn, dir: sortDir });
  for (const [key, value] of Object.entries(debouncedTextFilters)) {
    if (value) baseParams.set(key, value);
  }
  if (batchFilter !== ALL_CUSTOMERS_BATCH) baseParams.set("batch", batchFilter);
  if (groupFilter !== ALL_GROUPS) baseParams.set("groupId", groupFilter);
  const listQueryString = baseParams.toString();

  const customersQuery = useInfiniteQuery({
    queryKey: [...queryKeys.customers, "list", listQueryString],
    queryFn: ({ pageParam }) =>
      apiFetch<{ data: Customer[]; total: number }>(`/api/customers?page=${pageParam}&${listQueryString}`),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((n, p) => n + p.data.length, 0);
      return loaded < lastPage.total && lastPage.data.length > 0 ? allPages.length + 1 : undefined;
    },
    placeholderData: keepPreviousData,
    meta: { errorMessage: "Không tải được danh sách khách hàng" },
  });
  const customers = customersQuery.data?.pages.flatMap((p) => p.data) ?? [];
  const total = customersQuery.data?.pages[0]?.total ?? 0;
  const loading = customersQuery.isPending;
  const loadingMore = customersQuery.isFetchingNextPage;

  // Selection belongs to one filtered list: changing a filter/sort drops it.
  const [selection, setSelection] = useState<{ listKey: string; ids: Set<string> }>({
    listKey: listQueryString,
    ids: new Set(),
  });
  const selectedIds = selection.listKey === listQueryString ? selection.ids : new Set<string>();
  function setSelectedIds(update: Set<string> | ((prev: Set<string>) => Set<string>)) {
    setSelection((prev) => {
      const current = prev.listKey === listQueryString ? prev.ids : new Set<string>();
      return { listKey: listQueryString, ids: typeof update === "function" ? update(current) : update };
    });
  }

  const messagesQuery = useQuery({
    queryKey: [...queryKeys.customers, "messages", messagesFor?.id],
    queryFn: () =>
      apiFetch<{ data: MessageLogEntry[] }>(`/api/customers/${messagesFor!.id}/messages`).then((j) => j.data ?? []),
    enabled: !!messagesFor,
    meta: { errorMessage: "Không tải được lịch sử tin nhắn" },
  });
  const importHistoryQuery = useQuery({
    queryKey: [...queryKeys.customers, "import-history", messagesFor?.id],
    queryFn: () =>
      apiFetch<{ data: ImportHistoryEntry[] }>(`/api/customers/${messagesFor!.id}/import-history`).then(
        (j) => j.data ?? []
      ),
    enabled: !!messagesFor,
  });
  const messages = messagesQuery.data ?? null;
  const importHistory = importHistoryQuery.data ?? null;

  const invalidateCustomers = () => queryClient.invalidateQueries({ queryKey: queryKeys.customers });
  const invalidateGroups = () => queryClient.invalidateQueries({ queryKey: queryKeys.customerGroups });
  const invalidateBatches = () => queryClient.invalidateQueries({ queryKey: queryKeys.importBatches });

  /** Runs a write request, toasting its error; resolves to the JSON on success or null on failure. */
  async function run<T>(request: () => Promise<T>, errorMessage: string): Promise<T | null> {
    try {
      return await request();
    } catch (err) {
      toast.error(`${errorMessage}: ${(err as Error).message}`);
      return null;
    }
  }

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
    const json = await run(
      () =>
        apiSend<{ deleted: number }>(`/api/customers/import-batches?batch=${encodeURIComponent(batchFilter)}`, "DELETE"),
      "Không xoá được lô này"
    );
    setDeletingBatch(false);
    if (!json) return;
    toast.success(`Đã xoá ${json.deleted} khách hàng thuộc lô "${batchFilter}"`);
    setBatchFilter(ALL_CUSTOMERS_BATCH);
    invalidateCustomers();
    invalidateBatches();
    invalidateGroups();
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
    const json = await run(
      () => apiSend("/api/customer-groups", "POST", { name: createGroupName.trim(), customer_ids: [...selectedIds] }),
      "Tạo nhóm thất bại"
    );
    if (!json) return;
    toast.success(`Đã tạo nhóm "${createGroupName.trim()}" với ${selectedIds.size} khách hàng`);
    setCreateGroupOpen(false);
    setCreateGroupName("");
    setSelectedIds(new Set());
    invalidateGroups();
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Xoá ${selectedIds.size} khách hàng đang chọn? Không thể hoàn tác.`)) return;
    setBulkDeleting(true);
    const json = await run(
      () => apiSend<{ deleted: number }>("/api/customers", "DELETE", { ids: [...selectedIds] }),
      "Xoá thất bại"
    );
    setBulkDeleting(false);
    if (!json) return;
    toast.success(`Đã xoá ${json.deleted} khách hàng`);
    setSelectedIds(new Set());
    invalidateCustomers();
    invalidateBatches();
    invalidateGroups();
  }

  async function handleAddSelectedToGroup() {
    if (!assignGroupId) return toast.error("Chọn 1 nhóm");
    setAssigningGroup(true);
    const json = await run(
      () => apiSend(`/api/customer-groups/${assignGroupId}/members`, "POST", { customer_ids: [...selectedIds] }),
      "Thêm vào nhóm thất bại"
    );
    setAssigningGroup(false);
    if (!json) return;
    toast.success(`Đã thêm ${selectedIds.size} khách hàng vào nhóm`);
    setAssignGroupOpen(false);
    invalidateGroups();
    if (groupFilter === assignGroupId) invalidateCustomers();
  }

  async function handleRemoveSelectedFromGroup() {
    if (!assignGroupId) return toast.error("Chọn 1 nhóm");
    setAssigningGroup(true);
    const json = await run(
      () => apiSend(`/api/customer-groups/${assignGroupId}/members`, "DELETE", { customer_ids: [...selectedIds] }),
      "Gỡ khỏi nhóm thất bại"
    );
    setAssigningGroup(false);
    if (!json) return;
    toast.success(`Đã gỡ ${selectedIds.size} khách hàng khỏi nhóm`);
    setAssignGroupOpen(false);
    invalidateGroups();
    if (groupFilter === assignGroupId) invalidateCustomers();
  }

  async function handleCreateGroupInline() {
    if (!newGroupNameInline.trim()) return;
    const json = await run(
      () => apiSend("/api/customer-groups", "POST", { name: newGroupNameInline.trim() }),
      "Tạo nhóm thất bại"
    );
    if (!json) return;
    setNewGroupNameInline("");
    invalidateGroups();
  }

  async function handleRenameGroup(groupId: string, currentName: string) {
    const name = prompt("Tên nhóm mới:", currentName);
    if (!name || !name.trim() || name.trim() === currentName) return;
    const json = await run(() => apiSend(`/api/customer-groups/${groupId}`, "PATCH", { name: name.trim() }), "Đổi tên thất bại");
    if (!json) return;
    invalidateGroups();
  }

  async function handleDeleteGroup(groupId: string, name: string) {
    if (!confirm(`Xoá nhóm "${name}"? Khách hàng trong nhóm không bị xoá, chỉ gỡ khỏi nhóm này.`)) return;
    const json = await run(() => apiSend(`/api/customer-groups/${groupId}`, "DELETE"), "Xoá thất bại");
    if (!json) return;
    toast.success("Đã xoá nhóm");
    if (groupFilter === groupId) setGroupFilter(ALL_GROUPS);
    invalidateGroups();
  }

  function openMessages(customer: Customer) {
    setMessagesFor(customer);
    setExpandedMessageId(null);
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
    const json = await run(
      () =>
        apiSend(url, isNew ? "POST" : "PUT", {
          customer_code: editing.customer_code || undefined,
          name: editing.name || (isNew ? undefined : null),
          phone: editing.phone || (isNew ? undefined : null),
          zalo_uid: editing.zalo_uid || (isNew ? undefined : null),
        }),
      isNew ? "Thêm khách hàng thất bại" : "Cập nhật thất bại"
    );
    if (!json) return;
    toast.success(isNew ? "Đã thêm khách hàng" : "Đã cập nhật khách hàng");
    setDialogOpen(false);
    invalidateCustomers();
  }

  async function handleDelete(id: string) {
    if (!confirm("Xoá khách hàng này?")) return;
    const json = await run(() => apiSend(`/api/customers/${id}`, "DELETE"), "Không xoá được");
    if (!json) return;
    toast.success("Đã xoá");
    invalidateCustomers();
    invalidateBatches();
    invalidateGroups();
  }

  function exportUrl(format: "xlsx" | "csv") {
    const params = new URLSearchParams(listQueryString);
    params.set("format", format);
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
      <PageHeader
        title={t("title")}
        actions={
          <>
            <Button variant="outline" nativeButton={false} render={<a href={exportUrl("xlsx")} />}>
              <Download className="size-4" />
              {t("exportExcel")}
            </Button>
            <Button variant="outline" nativeButton={false} render={<a href={exportUrl("csv")} />}>
              <Download className="size-4" />
              {t("exportCsv")}
            </Button>
            <Button variant="outline" onClick={() => setGroupDialogOpen(true)}>
              <FolderTree className="size-4" />
              {t("manageGroups")}
            </Button>
            <Button variant="outline" nativeButton={false} render={<Link href="/customers/import" />}>
              <Upload className="size-4" />
              {t("importFile")}
            </Button>
            <Button onClick={openNew}>
              <Plus className="size-4" />
              {t("addCustomer")}
            </Button>
          </>
        }
      />

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
        <div className="sticky top-16 z-20 flex flex-wrap items-center gap-3 rounded-xl border bg-secondary/90 p-3 shadow-sm backdrop-blur">
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

      <div
        className={`overflow-x-auto rounded-xl border bg-card transition-opacity ${
          customersQuery.isFetching && !loading && !loadingMore ? "opacity-70" : ""
        }`}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  className="accent-primary"
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
              <TableSkeletonRows cols={COLUMNS.length + 2} rows={10} />
            ) : customers.length === 0 ? (
              <TableMessageRow cols={COLUMNS.length + 2}>{t("noCustomers")}</TableMessageRow>
            ) : (
              customers.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={selectedIds.has(c.id)}
                      onChange={() => toggleSelect(c.id)}
                    />
                  </TableCell>
                  {COLUMNS.map((col) => (
                    <TableCell key={col.key}>{col.render(c)}</TableCell>
                  ))}
                  <TableCell className="text-right space-x-1 whitespace-nowrap">
                    <Button variant="ghost" size="sm" onClick={() => openMessages(c)} title={t("lookupMessages")}>
                      <History className="size-3.5" />
                      <span className="hidden xl:inline">{t("lookupMessages")}</span>
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(c)} title={tc("edit")}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(c.id)}
                      title={tc("delete")}
                    >
                      <Trash2 className="size-3.5" />
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
          <Button variant="outline" onClick={() => customersQuery.fetchNextPage()} disabled={loadingMore}>
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
          <div className="space-y-1 border-b pb-3">
            <p className="text-sm font-medium">{t("importHistoryTitle")}</p>
            {importHistory == null ? (
              <Skeleton className="h-5 w-48" />
            ) : importHistory.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("noImportHistory")}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {importHistory.map((h) => (
                  <Badge key={h.id} variant="outline" className="font-normal">
                    {h.import_batch}
                    <span className="ml-1 text-muted-foreground">
                      · {t("importedAtLabel")} {new Date(h.imported_at).toLocaleDateString("vi-VN")}
                    </span>
                  </Badge>
                ))}
              </div>
            )}
          </div>
          {messages == null ? (
            <div className="space-y-2">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
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
