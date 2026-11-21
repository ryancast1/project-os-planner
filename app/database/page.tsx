"use client";

import Link from "next/link";
import { useEffect, useState, useMemo, useRef } from "react";
import { localDateTime, planClockTime, planScheduleFields } from "@/lib/planSchedule";
import { supabase } from "@/lib/supabaseClient";

// Column type definitions
type ColumnType = "text" | "number" | "boolean" | "date" | "datetime" | "timestampTime" | "planTime" | "time" | "select" | "relation";

type RelationConfig = {
  table: string;
  valueColumn: string;
  labelColumn: string;
  orderColumn?: string;
};

type ColumnConfig = {
  name: string;
  label?: string;
  type: ColumnType;
  options?: string[];
  readonly?: boolean;
  keepEmptyString?: boolean;
  relation?: RelationConfig;
};

type TableConfig = {
  label: string;
  columns: ColumnConfig[];
  primaryKey: string;
  defaultSort: { column: string; desc: boolean };
  userScoped?: boolean;
};

type RelationOption = { value: string; label: string };
type RelationOptions = Record<string, RelationOption[]>;
type DatabaseValue = string | number | boolean | null;
type DatabaseRow = Record<string, DatabaseValue | undefined>;

function stringValue(value: DatabaseValue | undefined) {
  return typeof value === "string" ? value : null;
}

const GOAL_RELATION: RelationConfig = {
  table: "projects_goals",
  valueColumn: "id",
  labelColumn: "goal",
  orderColumn: "goal",
};

// Only user-facing fields belong here. Primary keys are fetched and used
// internally, but IDs and user IDs are deliberately absent from every column
// list so they never appear in the grid, search, or edit forms.
const TABLE_CONFIG: Record<string, TableConfig> = {
  alcohol_entries: {
    label: "Alcohol Entries",
    primaryKey: "id",
    userScoped: true,
    defaultSort: { column: "occurred_on", desc: true },
    columns: [
      { name: "occurred_on", type: "date" },
      { name: "occurred_at", type: "time" },
      { name: "label", type: "text" },
      { name: "amount_oz", type: "number" },
      { name: "abv", type: "number" },
      { name: "standard_drinks", type: "number" },
      { name: "created_at", type: "datetime", readonly: true },
    ],
  },
  books: {
    label: "Books",
    primaryKey: "id",
    userScoped: true,
    defaultSort: { column: "date_added", desc: true },
    columns: [
      { name: "title", type: "text" },
      { name: "author", type: "text" },
      { name: "reading_status", type: "select", options: ["unread", "reading", "read"] },
      { name: "owned", type: "boolean" },
      { name: "re_read", type: "boolean" },
      { name: "pages", type: "number" },
      { name: "original_pub_year", type: "number" },
      { name: "date_added", type: "date" },
      { name: "date_read", type: "date" },
      { name: "rank", type: "number" },
      { name: "source", type: "text" },
      { name: "first_page", type: "number" },
      { name: "pages_of_text", type: "number" },
      { name: "current_page", type: "number" },
      { name: "rating", type: "number" },
      { name: "notes", type: "text" },
    ],
  },
  content_items: {
    label: "Content Items",
    primaryKey: "id",
    userScoped: true,
    defaultSort: { column: "created_at", desc: true },
    columns: [
      { name: "title", type: "text" },
      { name: "notes", type: "text" },
      { name: "category", type: "select", options: ["cook", "watch", "listen", "read", "city"] },
      { name: "is_ongoing", type: "boolean" },
      { name: "status", type: "select", options: ["active", "done"] },
      { name: "scheduled_for", type: "date" },
      { name: "window_kind", type: "select", options: ["workweek", "weekend"] },
      { name: "window_start", type: "date" },
      { name: "sort_order", type: "number" },
      { name: "day_sort_order", type: "number" },
      { name: "created_at", type: "datetime", readonly: true },
      { name: "completed_at", type: "datetime" },
    ],
  },
  focuses: {
    label: "Focuses",
    primaryKey: "id",
    defaultSort: { column: "created_at", desc: true },
    columns: [
      { name: "title", type: "text" },
      { name: "notes", type: "text" },
      { name: "status", type: "select", options: ["active", "archived"] },
      { name: "scheduled_for", type: "date" },
      { name: "window_kind", type: "select", options: ["workweek", "weekend"] },
      { name: "window_start", type: "date" },
      { name: "content_category", type: "select", options: ["cook", "watch", "listen", "read", "city"] },
      { name: "project_goal_id", type: "relation", relation: GOAL_RELATION },
      { name: "sort_order", type: "number" },
      { name: "created_at", type: "datetime", readonly: true },
    ],
  },
  habit_logs: {
    label: "Habit Logs",
    primaryKey: "id",
    defaultSort: { column: "done_on", desc: true },
    columns: [
      { name: "habit_id", type: "relation", relation: { table: "habits", valueColumn: "id", labelColumn: "name", orderColumn: "name" } },
      { name: "done_on", type: "date" },
    ],
  },
  movie_tracker: {
    label: "Movies",
    primaryKey: "id",
    defaultSort: { column: "created_at", desc: true },
    columns: [
      { name: "title", type: "text" },
      { name: "category", type: "select", options: ["movie", "documentary"] },
      { name: "year", type: "number" },
      { name: "length_minutes", type: "number" },
      { name: "status", type: "select", options: ["to_watch", "watched"] },
      { name: "date_watched", type: "date" },
      { name: "priority", type: "number" },
      { name: "rewatch", type: "boolean" },
      { name: "source", type: "text" },
      { name: "location", type: "text" },
      { name: "note", type: "text" },
      { name: "created_at", type: "datetime", readonly: true },
    ],
  },
  packing_trips: {
    label: "Packing Trips",
    primaryKey: "id",
    defaultSort: { column: "created_at", desc: true },
    columns: [
      { name: "trip_name", type: "text" },
      { name: "is_archived", type: "boolean" },
      { name: "archived_at", type: "datetime" },
      { name: "created_at", type: "datetime", readonly: true },
    ],
  },
  plans: {
    label: "Plans",
    primaryKey: "id",
    defaultSort: { column: "created_at", desc: true },
    columns: [
      { name: "title", type: "text" },
      { name: "scheduled_for", label: "Start date", type: "date" },
      { name: "end_date", label: "End date", type: "date" },
      { name: "starts_at", label: "Start time", type: "planTime" },
      { name: "ends_at", label: "End time", type: "planTime" },
      { name: "notes", type: "text" },
      { name: "day_off", type: "boolean" },
      { name: "status", type: "select", options: ["open", "done", "canceled"] },
      { name: "window_kind", type: "select", options: ["workweek", "weekend"] },
      { name: "window_start", type: "date" },
      { name: "project_goal_id", type: "relation", relation: GOAL_RELATION },
      { name: "created_at", type: "datetime", readonly: true },
      { name: "completed_at", type: "datetime" },
    ],
  },
  projects_goals: {
    label: "Goals",
    primaryKey: "id",
    defaultSort: { column: "created_at", desc: true },
    columns: [
      { name: "goal", type: "text" },
      { name: "bucket", type: "text" },
      { name: "rating", type: "number" },
      { name: "actions", type: "text" },
      { name: "notes", type: "text" },
      { name: "archived", type: "boolean" },
      { name: "sort_order", type: "number" },
      { name: "created_at", type: "datetime", readonly: true },
    ],
  },
  reading_log: {
    label: "Reading Log",
    primaryKey: "id",
    userScoped: true,
    defaultSort: { column: "logged_on", desc: true },
    columns: [
      { name: "book_id", type: "relation", relation: { table: "books", valueColumn: "id", labelColumn: "title", orderColumn: "title" } },
      { name: "page_number", type: "number" },
      { name: "logged_on", type: "date" },
      { name: "created_at", type: "datetime", readonly: true },
    ],
  },
  running_runs: {
    label: "Runs",
    primaryKey: "id",
    userScoped: true,
    defaultSort: { column: "run_date", desc: true },
    columns: [
      { name: "run_date", type: "date" },
      { name: "duration_seconds", type: "number" },
      { name: "distance", type: "number" },
      { name: "distance_unit", type: "select", options: ["km", "mi"] },
      { name: "temperature_f", type: "number" },
      { name: "notes", type: "text", keepEmptyString: true },
      { name: "is_east_river_3k", type: "boolean" },
      { name: "created_at", type: "datetime", readonly: true },
      { name: "updated_at", type: "datetime", readonly: true },
    ],
  },
  tasks: {
    label: "Tasks",
    primaryKey: "id",
    defaultSort: { column: "created_at", desc: true },
    columns: [
      { name: "title", type: "text" },
      { name: "notes", type: "text" },
      { name: "status", type: "select", options: ["open", "done", "canceled"] },
      { name: "scheduled_for", type: "date" },
      { name: "window_kind", type: "select", options: ["workweek", "weekend"] },
      { name: "window_start", type: "date" },
      { name: "project_goal_id", type: "relation", relation: GOAL_RELATION },
      { name: "sort_order", type: "number" },
      { name: "created_at", type: "datetime", readonly: true },
      { name: "completed_at", type: "datetime" },
    ],
  },
  trich_events: {
    label: "Trich Events",
    primaryKey: "id",
    userScoped: true,
    defaultSort: { column: "occurred_on", desc: true },
    columns: [
      { name: "occurred_on", type: "date" },
      { name: "submitted_at", label: "time (ET)", type: "timestampTime" },
      { name: "trich", type: "number" },
    ],
  },
  weed_hits: {
    label: "Weed Hits",
    primaryKey: "id",
    userScoped: true,
    defaultSort: { column: "occurred_on", desc: true },
    columns: [
      { name: "occurred_on", type: "date" },
      { name: "occurred_at", type: "time" },
      { name: "created_at", type: "datetime", readonly: true },
    ],
  },
  workout_sessions: {
    label: "Workout Sessions",
    primaryKey: "id",
    defaultSort: { column: "performed_on", desc: true },
    columns: [
      { name: "workout_slug", type: "text" },
      { name: "workout_name", type: "text" },
      { name: "performed_on", type: "date" },
      { name: "weight", type: "number" },
      { name: "set1_reps", type: "number" },
      { name: "set2_reps", type: "number" },
      { name: "set3_reps", type: "number" },
      { name: "set4_reps", type: "number" },
      { name: "set5_reps", type: "number" },
      { name: "set6_reps", type: "number" },
      { name: "compact", type: "text" },
      { name: "notes", type: "text" },
      { name: "submitted_at", type: "datetime", readonly: true },
    ],
  },
};

const TABLE_NAMES = Object.keys(TABLE_CONFIG);
const PAGE_SIZE = 50;

function noRowsChangedMessage(action: "update" | "delete", table: string) {
  const verb = action === "update" ? "updated" : "deleted";
  return `No rows were ${verb} in ${table}. The record may no longer exist, or this table's row-level security policy may not allow ${action}s.`;
}

function errorMessage(error: unknown) {
  return error && typeof error === "object" && "message" in error
    ? String(error.message)
    : "An unexpected error occurred.";
}

async function fetchAllRows(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; count: number | null; error: unknown }>,
  signal: AbortSignal,
) {
  const result: DatabaseRow[] = [];
  let total: number | null = null;
  while (!signal.aborted) {
    const { data, count, error } = await fetchPage(result.length, result.length + 999);
    if (error) throw error;
    if (!data?.length) break;
    total = count ?? total;
    result.push(...data as DatabaseRow[]);
    if (total !== null && result.length >= total) break;
  }
  return result;
}

function formatPlanTime(value: string) {
  return planClockTime(value)
    ? new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : "";
}

const planScheduleColumns = ["scheduled_for", "end_date", "starts_at", "ends_at"];

function collectPlanDates(form: DatabaseRow, original?: DatabaseRow) {
  return planScheduleFields(
    stringValue(form.scheduled_for) || null,
    stringValue(form.end_date) || null,
    stringValue(form.starts_at) || "",
    stringValue(form.ends_at) || "",
    original ? { scheduled_for: stringValue(original.scheduled_for), starts_at: stringValue(original.starts_at), ends_at: stringValue(original.ends_at) } : undefined,
  );
}

function MutationError({ message }: { message: string | null }) {
  return message && <p role="alert" className="my-2 text-sm text-red-300">{message}</p>;
}

function formatDatetime(val: string | null): string {
  if (!val) return "";
  const d = new Date(val);
  if (isNaN(d.getTime())) return val;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(val: string | null): string {
  if (!val) return "";
  return val;
}

function formatTimestampTime(val: string | null): string {
  if (!val) return "";
  const date = new Date(val);
  if (Number.isNaN(date.getTime())) return val;
  return date.toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTimestampTimeInput(val: string | null): string {
  if (!val) return "";
  const date = new Date(val);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function replaceTimestampTimeInEastern(val: string | null, nextTime: string): string | null {
  const date = new Date(val ?? "");
  if (Number.isNaN(date.getTime()) || !nextTime) return null;

  const dateParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(dateParts.find((item) => item.type === type)?.value ?? 0);
  const [hour, minute, second = 0] = nextTime.split(":").map(Number);
  const targetAsUTC = Date.UTC(part("year"), part("month") - 1, part("day"), hour, minute, second);
  let guess = targetAsUTC;

  // Convert the Eastern wall-clock value back to an absolute timestamp. The
  // small iteration keeps this correct on both EST and EDT dates.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const renderedParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(guess));
    const renderedPart = (type: Intl.DateTimeFormatPartTypes) =>
      Number(renderedParts.find((item) => item.type === type)?.value ?? 0);
    const renderedAsUTC = Date.UTC(
      renderedPart("year"),
      renderedPart("month") - 1,
      renderedPart("day"),
      renderedPart("hour"),
      renderedPart("minute"),
      renderedPart("second")
    );
    guess += targetAsUTC - renderedAsUTC;
  }

  return new Date(guess).toISOString();
}

function truncate(val: string | null, max: number): string {
  if (!val) return "";
  return val.length > max ? val.slice(0, max) + "..." : val;
}

function columnLabel(col: ColumnConfig) {
  if (col.label) return col.label;
  return col.type === "relation" ? col.name.replace(/_id$/, "") : col.name;
}

export default function DatabasePage() {
  const [selectedTable, setSelectedTable] = useState<string>("tasks");
  const [rows, setRows] = useState<DatabaseRow[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [refreshVersion, refresh] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDesc, setSortDesc] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingRow, setEditingRow] = useState<DatabaseRow | null>(null);
  const [addingRow, setAddingRow] = useState(false);
  const [page, setPage] = useState(0);
  const [deleteSelection, setDeleteSelection] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [relationOptions, setRelationOptions] = useState<RelationOptions>({});

  const config = TABLE_CONFIG[selectedTable];

  const [mutationError, setMutationError] = useState<string | null>(null);
  const [relationError, setRelationError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const searching = Boolean(searchQuery.trim());
  const sortCol = sortColumn ?? config.defaultSort.column;
  const sortAsc = sortColumn ? !sortDesc : !config.defaultSort.desc;
  const queryPage = searching ? 0 : page;
  const requestKey = JSON.stringify([selectedTable, sortCol, sortAsc, searching, queryPage, refreshVersion]);
  const loading = loadedKey !== requestKey;

  function reload() {
    setSelectedIds(new Set());
    refresh((version) => version + 1);
  }

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const orderedRows = (from: number) => {
      const query = supabase.from(selectedTable).select("*", from === 0 || !searching ? { count: "exact" } : {})
        .order(sortCol, { ascending: sortAsc, nullsFirst: false });
      return (sortCol === config.primaryKey ? query : query.order(config.primaryKey)).abortSignal(signal);
    };

    async function load() {
      setError(null);
      try {
        if (searching) {
          const allRows = await fetchAllRows((from, to) => orderedRows(from).range(from, to), signal);
          if (!signal.aborted) {
            setRows(allRows);
            setTotalCount(allRows.length);
          }
        } else {
          const { data, count, error } = await orderedRows(queryPage * PAGE_SIZE).range(queryPage * PAGE_SIZE, (queryPage + 1) * PAGE_SIZE - 1);
          if (signal.aborted) return;
          if (error?.code === "PGRST103" && queryPage > 0) {
            setPage(0);
            return;
          }
          if (error) throw error;
          const lastPage = Math.max(0, Math.ceil((count ?? 0) / PAGE_SIZE) - 1);
          if (queryPage > lastPage) {
            setPage(lastPage);
            return;
          }
          setRows(data ?? []);
          setTotalCount(count ?? 0);
        }
      } catch (error) {
        if (!signal.aborted) {
          setRows([]);
          setTotalCount(0);
          setError(errorMessage(error));
        }
      } finally {
        if (!signal.aborted) setLoadedKey(requestKey);
      }
    }

    void load();
    return () => controller.abort();
  }, [selectedTable, config.primaryKey, sortCol, sortAsc, queryPage, searching, requestKey]);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setRelationError(null);
    const loadOptions = async () => {
      const entries = await Promise.all(config.columns.flatMap((col) => {
        const relation = col.relation;
        if (!relation) return [];
        return [fetchAllRows((from, to) => supabase.from(relation.table)
          .select(`${relation.valueColumn},${relation.labelColumn}`, from === 0 ? { count: "exact" } : {})
          .order(relation.orderColumn ?? relation.labelColumn)
          .order(relation.valueColumn)
          .range(from, to)
          .abortSignal(signal), signal).then((records) => [col.name, records.map((item) => ({
            value: String(item[relation.valueColumn]),
            label: String(item[relation.labelColumn] || "Unnamed"),
          }))] as const)];
      }));
      if (!signal.aborted) setRelationOptions(Object.fromEntries(entries));
    };
    loadOptions().catch((error: unknown) => {
      if (!signal.aborted) setRelationError(`Could not load related names. ${errorMessage(error)}`);
    });
    return () => controller.abort();
  }, [config, refreshVersion]);

  // Reset page when changing table
  function handleTableChange(newTable: string) {
    setSelectedTable(newTable);
    setRelationOptions({});
    setMutationError(null);
    setDeleteSelection(null);
    setEditingRow(null);
    setAddingRow(false);
    setPage(0);
    setSortColumn(null);
    setSortDesc(true);
    setSearchQuery("");
    setSelectedIds(new Set());
  }

  // Filter rows by search (client-side)
  const matchingSearchRows = useMemo(() => {
    if (!searchQuery.trim() || loading) return [];
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((row) =>
      config.columns.some((col) => {
        const val = row[col.name];
        if (val == null) return false;
        if (col.type === "relation") {
          return relationOptions[col.name]?.some((option) => option.value === String(val) && option.label.toLowerCase().includes(q));
        }
        const displayVal = col.type === "timestampTime" ? formatTimestampTime(String(val))
          : col.type === "planTime" ? formatPlanTime(String(val)) : col.type === "boolean" ? (val ? "Yes" : "No") : val;
        return String(displayVal).toLowerCase().includes(q) || String(val).toLowerCase().includes(q);
      })
    );
  }, [loading, rows, searchQuery, config.columns, relationOptions]);

  const displayedTotalCount = loading ? 0 : searching ? matchingSearchRows.length : totalCount;
  const visiblePage = Math.min(page, Math.max(0, Math.ceil(displayedTotalCount / PAGE_SIZE) - 1));
  const filteredRows = loading ? [] : searching
    ? matchingSearchRows.slice(visiblePage * PAGE_SIZE, (visiblePage + 1) * PAGE_SIZE)
    : rows;
  const visibleIds = filteredRows.map((row) => String(row[config.primaryKey]));
  const visibleSelection = visibleIds.filter((id) => selectedIds.has(id));
  const allVisibleSelected = visibleIds.length > 0 && visibleSelection.length === visibleIds.length;

  // Toggle row selection
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Select all visible
  function toggleSelectAll() {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleIds));
    }
  }

  async function mutate(action: string, operation: () => Promise<void>) {
    if (savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    setMutationError(null);
    try {
      await operation();
      reload();
      return true;
    } catch (error) {
      setMutationError(`${action} failed. ${errorMessage(error)}`);
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function updateRow(id: string, patch: Record<string, unknown>) {
    return mutate("Update", async () => {
      const { data, error } = await supabase.from(selectedTable).update(patch)
        .eq(config.primaryKey, id).select("*").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error(noRowsChangedMessage("update", selectedTable));
      if (selectedTable === "plans") {
        for (const field of planScheduleColumns) {
          if (!(field in patch)) continue;
          const expected = patch[field];
          const actual = data[field];
          const matches = expected === actual ||
            (field.endsWith("_at") && typeof expected === "string" && typeof actual === "string"
              && Date.parse(expected) === Date.parse(actual));
          if (!matches) {
            reload();
            throw new Error("Supabase returned different Plan dates or times. Review the row before retrying.");
          }
        }
      }
    });
  }

  function insertRow(row: Record<string, unknown>) {
    return mutate("Insert", async () => {
      let payload = row;
      if (config.userScoped) {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        if (!data.user) throw new Error("You must be signed in.");
        payload = { ...row, user_id: data.user.id };
      }
      const { data, error } = await supabase.from(selectedTable).insert(payload).select(config.primaryKey);
      if (error) throw error;
      if (data?.length !== 1) throw new Error("Supabase did not confirm the inserted row.");
    });
  }

  function deleteRows(ids: string[]) {
    return mutate("Delete", async () => {
      const { data, error } = await supabase.from(selectedTable).delete().in(config.primaryKey, ids).select(config.primaryKey);
      if (error) throw error;
      const deleted = data?.length ?? 0;
      if (deleted !== ids.length) {
        if (deleted) {
          reload();
          setDeleteSelection(null);
          throw new Error(`Deleted ${deleted} of ${ids.length} selected rows. The rest may already be gone or protected by permissions.`);
        }
        throw new Error(noRowsChangedMessage("delete", selectedTable));
      }
    });
  }

  // Handle sort click
  function handleSort(colName: string) {
    setSelectedIds(new Set());
    if (sortColumn === colName) {
      setSortDesc(!sortDesc);
    } else {
      setSortColumn(colName);
      setSortDesc(true);
    }
    setPage(0);
  }

  // Render cell value for grid
  function renderCellValue(col: ColumnConfig, val: DatabaseValue | undefined): string {
    if (val == null) return "";
    if (col.type === "boolean") return val ? "Yes" : "No";
    if (col.type === "datetime") return formatDatetime(String(val));
    if (col.type === "planTime") return formatPlanTime(String(val));
    if (col.type === "timestampTime") return formatTimestampTime(String(val));
    if (col.type === "date") return formatDate(String(val));
    if (col.type === "relation") {
      return relationOptions[col.name]?.find((option) => option.value === String(val))?.label ?? "Unknown";
    }
    return truncate(String(val), 30);
  }

  // Get display columns (first few that fit)
  const displayColumns = config.columns.slice(0, 5);

  const startRow = visiblePage * PAGE_SIZE + 1;
  const endRow = Math.min((visiblePage + 1) * PAGE_SIZE, displayedTotalCount);

  return (
    <main className="min-h-screen bg-gradient-to-b from-black to-zinc-950 px-4 py-6 text-white">
      <div className="mx-auto w-full max-w-4xl">
        {/* Header */}
        <header className="mb-4 relative flex items-center justify-between">
          <Link
            href="/"
            className="h-9 w-9 rounded-xl border border-white/10 bg-white/5 grid place-items-center text-white/70 hover:text-white hover:bg-white/10 active:scale-[0.97] transition"
            aria-label="Home"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path
                fillRule="evenodd"
                d="M9.293 2.293a1 1 0 0 1 1.414 0l7 7A1 1 0 0 1 17 11h-1v6a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6H3a1 1 0 0 1-.707-1.707l7-7Z"
                clipRule="evenodd"
              />
            </svg>
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">Database</h1>
          <button
            onClick={reload}
            disabled={loading || saving}
            className="h-9 w-9 rounded-xl border border-white/10 bg-white/5 grid place-items-center text-white/70 hover:text-white hover:bg-white/10 active:scale-[0.97] transition disabled:opacity-50"
            aria-label="Refresh"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path
                fillRule="evenodd"
                d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.22z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </header>

        {/* Table Selector */}
        <div className="mb-4">
          <select
            value={selectedTable}
            onChange={(e) => handleTableChange(e.target.value)}
            disabled={saving}
            className="w-full h-11 rounded-xl border border-white/10 bg-white/5 px-3 text-white text-[16px]"
          >
            {TABLE_NAMES.map((name) => (
              <option key={name} value={name}>
                {TABLE_CONFIG[name].label} ({name})
              </option>
            ))}
          </select>
        </div>

        {/* Search + Add */}
        <div className="mb-4 flex gap-2">
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(0);
              setSelectedIds(new Set());
            }}
            style={{ fontSize: "16px" }}
            className="min-w-0 flex-1 h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-white placeholder:text-white/40 outline-none"
          />
          <button
            onClick={() => { setMutationError(null); setAddingRow(true); }}
            className="h-10 px-4 rounded-xl border border-white/10 bg-white/5 text-white text-sm font-medium hover:bg-white/10 active:scale-[0.98] transition"
          >
            + Add
          </button>
        </div>

        {/* Error */}
        <MutationError message={loading ? null : error} />
        <MutationError message={relationError} />
        {!editingRow && !addingRow && !deleteSelection && mutationError && (
          <div role="alert" className="mb-4 text-sm text-red-300">{mutationError}</div>
        )}

        {/* Loading */}
        {loading && <div className="mb-4 text-sm text-white/60">{searching ? "Searching all rows..." : "Loading..."}</div>}

        {/* Data Grid */}
        <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-black/20">
                  <th className="w-10 px-2 py-2">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded"
                    />
                  </th>
                  {displayColumns.map((col) => (
                    <th
                      key={col.name}
                      onClick={() => handleSort(col.name)}
                      className="px-2 py-2 text-left text-white/70 font-medium cursor-pointer hover:text-white"
                    >
                      <div className="flex items-center gap-1">
                        {columnLabel(col)}
                        {sortColumn === col.name && <span className="text-xs">{sortDesc ? "▼" : "▲"}</span>}
                      </div>
                    </th>
                  ))}
                  <th className="px-2 py-2 text-white/50 text-xs">...</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={displayColumns.length + 2} className="px-4 py-8 text-center text-white/50">
                      {loading ? "Loading..." : searching ? "No matches" : "No data"}
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => {
                    const id = String(row[config.primaryKey]);
                    return (
                      <tr
                        key={id}
                        onClick={() => { setMutationError(null); setEditingRow(row); }}
                        className="border-t border-white/5 hover:bg-white/5 cursor-pointer"
                      >
                        <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(id)}
                            onChange={() => toggleSelect(id)}
                            className="w-4 h-4 rounded"
                          />
                        </td>
                        {displayColumns.map((col) => (
                          <td key={col.name} className="px-2 py-2 text-white/80 whitespace-nowrap">
                            {renderCellValue(col, row[col.name])}
                          </td>
                        ))}
                        <td className="px-2 py-2 text-white/40">→</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        <div className="mt-3 flex items-center justify-between text-sm text-white/60">
          <div>
            {displayedTotalCount > 0 ? `${startRow}–${endRow} of ${displayedTotalCount}` : "0 rows"}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setPage(visiblePage - 1); setSelectedIds(new Set()); }}
              disabled={loading || visiblePage === 0}
              className="px-3 py-1 rounded-lg border border-white/10 bg-white/5 disabled:opacity-30"
            >
              Prev
            </button>
            <button
              onClick={() => { setPage(visiblePage + 1); setSelectedIds(new Set()); }}
              disabled={loading || endRow >= displayedTotalCount}
              className="px-3 py-1 rounded-lg border border-white/10 bg-white/5 disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>

        {/* Bulk Delete Button */}
        {visibleSelection.length > 0 && (
          <div className="mt-4">
            <button
              onClick={() => { setMutationError(null); setDeleteSelection(visibleSelection); }}
              className="w-full h-11 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 font-medium hover:bg-red-500/20 active:scale-[0.99] transition"
            >
              Delete Selected ({visibleSelection.length})
            </button>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteSelection && (
          <div className="fixed inset-0 z-50 grid place-items-center px-5">
            <div className="absolute inset-0 bg-black/70" onClick={() => { if (!savingRef.current) setDeleteSelection(null); }} />
            <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-950 p-5 shadow-2xl">
              <h2 className="text-lg font-semibold mb-3">Confirm Delete</h2>
              <p className="text-white/70 text-sm mb-4">
                Delete {deleteSelection.length} row{deleteSelection.length !== 1 ? "s" : ""}? This cannot be undone.
              </p>
              <MutationError message={mutationError} />
              <div className="flex gap-2">
                <button
                  disabled={saving}
                  onClick={() => { setMutationError(null); setDeleteSelection(null); }}
                  className="flex-1 h-10 rounded-xl border border-white/10 bg-white/5 text-white font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (await deleteRows(deleteSelection)) setDeleteSelection(null);
                  }}
                  disabled={saving}
                  className="flex-1 h-10 rounded-xl bg-red-500 text-white font-medium disabled:opacity-50"
                >
                  {saving ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {editingRow && (
          <EditModal
            config={config}
            row={editingRow}
            relationOptions={relationOptions}
            error={mutationError}
            onClose={() => { if (!savingRef.current) { setMutationError(null); setEditingRow(null); } }}
            onSave={async (patch) => {
              const success = await updateRow(String(editingRow[config.primaryKey]), patch);
              if (success) setEditingRow(null);
            }}
            onDelete={async () => {
              const success = await deleteRows([String(editingRow[config.primaryKey])]);
              if (success) setEditingRow(null);
            }}
            saving={saving}
          />
        )}

        {/* Add Modal */}
        {addingRow && (
          <AddModal
            config={config}
            relationOptions={relationOptions}
            error={mutationError}
            onClose={() => { if (!savingRef.current) { setMutationError(null); setAddingRow(false); } }}
            onSave={async (row) => {
              const success = await insertRow(row);
              if (success) setAddingRow(false);
            }}
            saving={saving}
          />
        )}
      </div>
    </main>
  );
}

// Edit Modal Component
function EditModal({
  config,
  row,
  relationOptions,
  onClose,
  onSave,
  onDelete,
  saving,
  error,
}: {
  config: TableConfig;
  row: DatabaseRow;
  relationOptions: RelationOptions;
  onClose: () => void;
  onSave: (patch: DatabaseRow) => Promise<void>;
  onDelete: () => Promise<void>;
  saving: boolean;
  error: string | null;
}) {
  const isPlan = config === TABLE_CONFIG.plans;
  const [form, setForm] = useState<DatabaseRow>(() => isPlan
    ? { ...row, starts_at: planClockTime(stringValue(row.starts_at)), ends_at: planClockTime(stringValue(row.ends_at)) }
    : { ...row });
  const [validationError, setValidationError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function updateField(name: string, value: DatabaseValue) {
    setValidationError(null);
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleSave() {
    // Build patch with only changed fields
    const patch: DatabaseRow = {};
    for (const col of config.columns) {
      if (col.readonly) continue;
      if (isPlan && planScheduleColumns.includes(col.name)) continue;
      if (form[col.name] !== row[col.name]) {
        patch[col.name] = form[col.name] === "" && !col.keepEmptyString ? null : form[col.name];
      }
    }
    if (isPlan && (form.scheduled_for !== row.scheduled_for || form.end_date !== row.end_date
      || form.starts_at !== planClockTime(stringValue(row.starts_at)) || form.ends_at !== planClockTime(stringValue(row.ends_at)))) {
      try {
        const schedule = collectPlanDates(form, row);
        for (const [field, value] of Object.entries(schedule)) {
          if (value !== row[field]) patch[field] = value;
        }
      } catch (error) {
        setValidationError(errorMessage(error));
        return;
      }
    }
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    onSave(patch);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center px-4 py-8 overflow-y-auto">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950 p-4 shadow-2xl my-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Edit Record</h2>
          <button onClick={onClose} className="text-white/60 hover:text-white text-xl">
            ×
          </button>
        </div>

        <fieldset disabled={saving} className="min-w-0 space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {config.columns.map((col) => (
            <FieldInput
              key={col.name}
              col={col}
              value={form[col.name]}
              relationOptions={relationOptions[col.name] ?? []}
              onChange={(val) => updateField(col.name, val)}
            />
          ))}
        </fieldset>

        <MutationError message={validationError ?? error} />
        <div className="mt-4 space-y-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full h-11 rounded-xl bg-white text-black font-semibold disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>

          {!confirmDelete ? (
            <button
              disabled={saving}
              onClick={() => setConfirmDelete(true)}
              className="w-full h-10 rounded-xl border border-red-500/30 text-red-300 text-sm"
            >
              Delete Row
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 h-10 rounded-xl border border-white/10 bg-white/5 text-white text-sm"
              >
                Cancel
              </button>
              <button
                onClick={onDelete}
                disabled={saving}
                className="flex-1 h-10 rounded-xl bg-red-500 text-white text-sm font-medium disabled:opacity-50"
              >
                {saving ? "..." : "Confirm Delete"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Add Modal Component
function AddModal({
  config,
  relationOptions,
  onClose,
  onSave,
  saving,
  error,
}: {
  config: TableConfig;
  relationOptions: RelationOptions;
  onClose: () => void;
  onSave: (row: DatabaseRow) => Promise<void>;
  saving: boolean;
  error: string | null;
}) {
  const [form, setForm] = useState<DatabaseRow>({});
  const [validationError, setValidationError] = useState<string | null>(null);

  function updateField(name: string, value: DatabaseValue) {
    setValidationError(null);
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleSave() {
    const row: DatabaseRow = {};
    for (const col of config.columns) {
      if (col.readonly) continue;
      const val = form[col.name];
      if (val !== "" && val != null) {
        row[col.name] = val;
      }
    }
    if (config === TABLE_CONFIG.plans && planScheduleColumns.some((field) => row[field] != null)) {
      try {
        Object.assign(row, collectPlanDates(form));
      } catch (error) {
        setValidationError(errorMessage(error));
        return;
      }
    }
    onSave(row);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center px-4 py-8 overflow-y-auto">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950 p-4 shadow-2xl my-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Add Row</h2>
          <button onClick={onClose} className="text-white/60 hover:text-white text-xl">
            ×
          </button>
        </div>

        <fieldset disabled={saving} className="min-w-0 space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {config.columns
            .filter((col) => !col.readonly)
            .map((col) => (
              <FieldInput
                key={col.name}
                col={col}
                value={form[col.name]}
                relationOptions={relationOptions[col.name] ?? []}
                onChange={(val) => updateField(col.name, val)}
              />
            ))}
        </fieldset>

        <MutationError message={validationError ?? error} />
        <div className="mt-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full h-11 rounded-xl bg-white text-black font-semibold disabled:opacity-50"
          >
            {saving ? "Adding..." : "Add Row"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Field Input Component
function FieldInput({
  col,
  value,
  relationOptions,
  onChange,
}: {
  col: ColumnConfig;
  value: DatabaseValue | undefined;
  relationOptions: RelationOption[];
  onChange: (val: DatabaseValue) => void;
}) {
  const inputClass =
    "w-full h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-white text-[16px] outline-none disabled:opacity-50 disabled:cursor-not-allowed";
  const text = stringValue(value);
  const inputValue = typeof value === "number" ? value : text ?? "";

  if (col.type === "boolean") {
    return (
      <div>
        <label className="block text-xs text-white/60 mb-1">{col.name}</label>
        <button
          type="button"
          onClick={() => !col.readonly && onChange(!value)}
          disabled={col.readonly}
          className={`h-10 px-4 rounded-xl border text-sm font-medium transition ${
            value
              ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-300"
              : "border-white/10 bg-white/5 text-white/60"
          } ${col.readonly ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {value === undefined ? "Default" : value ? "Yes" : "No"}
        </button>
      </div>
    );
  }

  if (col.type === "select" && col.options) {
    return (
      <div>
        <label className="block text-xs text-white/60 mb-1">{col.name}</label>
        <select
          value={inputValue}
          onChange={(e) => onChange(e.target.value)}
          disabled={col.readonly}
          className={inputClass}
        >
          <option value="">—</option>
          {col.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt || "(empty)"}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (col.type === "relation") {
    return (
      <div>
        <label className="block text-xs text-white/60 mb-1">{columnLabel(col)}</label>
        <select
          value={text ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          disabled={col.readonly}
          className={inputClass}
        >
          <option value="">—</option>
          {text && !relationOptions.some((option) => option.value === text) && (
            <option value={text}>Current selection unavailable</option>
          )}
          {relationOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>
    );
  }

  if (col.type === "date") {
    return (
      <div>
        <label className="block text-xs text-white/60 mb-1">{columnLabel(col)}</label>
        <input
          type="date"
          value={text ?? ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={col.readonly}
          className={inputClass}
        />
      </div>
    );
  }

  if (col.type === "time" || col.type === "planTime") {
    return (
      <div>
        <label className="block text-xs text-white/60 mb-1">{columnLabel(col)}</label>
        <input
          type="time"
          step="1"
          value={value ? String(value).slice(0, 8) : ""}
          onChange={(e) => onChange(e.target.value || null)}
          disabled={col.readonly}
          className={inputClass}
        />
      </div>
    );
  }

  if (col.type === "datetime") {
    return (
      <div>
        <label className="block text-xs text-white/60 mb-1">
          {col.name} {col.readonly && <span className="text-white/40">(readonly)</span>}
        </label>
        {col.readonly ? (
          <div className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 flex items-center text-white/50 text-[16px]">
            {formatDatetime(text)}
          </div>
        ) : (
          <input
            type="datetime-local"
            step="1"
            value={localDateTime(text)}
            onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
            className={inputClass}
          />
        )}
      </div>
    );
  }

  if (col.type === "timestampTime") {
    return (
      <div>
        <label className="block text-xs text-white/60 mb-1">
          {columnLabel(col)} {col.readonly && <span className="text-white/40">(readonly)</span>}
        </label>
        {col.readonly ? (
          <div className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 flex items-center text-white/50 text-[16px]">
            {formatTimestampTime(text)}
          </div>
        ) : (
          <input
            type="time"
            step="1"
            value={formatTimestampTimeInput(text)}
            onChange={(e) => onChange(replaceTimestampTimeInEastern(text, e.target.value))}
            className={inputClass}
          />
        )}
      </div>
    );
  }

  if (col.type === "number") {
    return (
      <div>
        <label className="block text-xs text-white/60 mb-1">{col.name}</label>
        <input
          type="number"
          step="any"
          value={inputValue}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          disabled={col.readonly}
          className={inputClass}
        />
      </div>
    );
  }

  // Default: text
  const isLong = col.name === "notes" || col.name === "note" || col.name === "actions";
  return (
    <div>
      <label className="block text-xs text-white/60 mb-1">
        {col.name} {col.readonly && <span className="text-white/40">(readonly)</span>}
      </label>
      {isLong ? (
        <textarea
          value={inputValue}
          onChange={(e) => onChange(e.target.value)}
          disabled={col.readonly}
          rows={3}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white text-[16px] outline-none resize-none disabled:opacity-50"
        />
      ) : (
        <input
          type="text"
          value={inputValue}
          onChange={(e) => onChange(e.target.value)}
          disabled={col.readonly}
          className={inputClass}
        />
      )}
    </div>
  );
}
