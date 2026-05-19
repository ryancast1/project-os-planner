"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type BoxStatus = "Open" | "Packed" | "Unpacked";

type MovingBox = {
  id: string;
  box_id: string;
  room: string | null;
  notes: string | null;
  priority: string | null;
  status: BoxStatus | string | null;
  created_at: string;
  updated_at: string | null;
};

type MovingItem = {
  id: string;
  item: string;
  box_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
};

const STATUS_ORDER: Record<BoxStatus, number> = {
  Open: 0,
  Packed: 1,
  Unpacked: 2,
};

function cleanStatus(status: MovingBox["status"]): BoxStatus {
  if (status === "Packed" || status === "Unpacked") return status;
  return "Open";
}

function statusClass(status: MovingBox["status"]) {
  switch (cleanStatus(status)) {
    case "Packed":
      return "border-sky-300/40 bg-sky-400/10 text-sky-100";
    case "Unpacked":
      return "border-emerald-300/40 bg-emerald-400/10 text-emerald-100";
    default:
      return "border-amber-300/40 bg-amber-400/10 text-amber-100";
  }
}

function nextStatus(status: MovingBox["status"]): BoxStatus {
  if (cleanStatus(status) === "Open") return "Packed";
  if (cleanStatus(status) === "Packed") return "Unpacked";
  return "Open";
}

function makeNextBoxId(boxes: MovingBox[]) {
  let max = 0;
  for (const box of boxes) {
    const match = box.box_id.match(/(\d+)$/);
    if (!match) continue;
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `BOX-${String(max + 1).padStart(2, "0")}`;
}

function inferRoomFromBoxId(boxId: string): string | null {
  const prefix = boxId.trim().slice(0, 3).toUpperCase();
  const rooms: Record<string, string> = {
    OFF: "Office",
    KIT: "Kitchen",
    BAT: "Bathroom",
    BED: "Bedroom",
    DIN: "Dining Room",
    LIV: "Living Room",
    CLO: "Closet",
  };
  return rooms[prefix] ?? null;
}

export default function MovingPage() {
  const [boxes, setBoxes] = useState<MovingBox[]>([]);
  const [items, setItems] = useState<MovingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [addingBox, setAddingBox] = useState(false);
  const [newBoxId, setNewBoxId] = useState("");

  const [newItemName, setNewItemName] = useState("");

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemName, setEditItemName] = useState("");
  const [editItemBoxId, setEditItemBoxId] = useState("");
  const [editItemNotes, setEditItemNotes] = useState("");
  const [confirmingDeleteBox, setConfirmingDeleteBox] = useState(false);
  const [confirmingDeleteItem, setConfirmingDeleteItem] = useState(false);

  async function loadData() {
    setLoading(true);
    setErr(null);

    const [boxesRes, itemsRes] = await Promise.all([
      supabase.from("moving_boxes").select("*"),
      supabase.from("moving_items").select("*").order("item", { ascending: true }),
    ]);

    if (boxesRes.error) {
      setErr(boxesRes.error.message);
      setLoading(false);
      return;
    }

    if (itemsRes.error) {
      setErr(itemsRes.error.message);
      setLoading(false);
      return;
    }

    setBoxes((boxesRes.data ?? []) as MovingBox[]);
    setItems((itemsRes.data ?? []) as MovingItem[]);
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const sortedBoxes = useMemo(() => {
    return [...boxes].sort((a, b) => {
      const statusDiff = STATUS_ORDER[cleanStatus(a.status)] - STATUS_ORDER[cleanStatus(b.status)];
      if (statusDiff !== 0) return statusDiff;
      return a.box_id.localeCompare(b.box_id, undefined, { numeric: true, sensitivity: "base" });
    });
  }, [boxes]);

  const selectedBox = useMemo(
    () => boxes.find((box) => box.id === selectedBoxId) ?? null,
    [boxes, selectedBoxId]
  );

  const selectedItems = useMemo(() => {
    if (!selectedBox) return [];
    return items
      .filter((item) => item.box_id === selectedBox.box_id)
      .sort((a, b) => a.item.localeCompare(b.item, undefined, { sensitivity: "base" }));
  }, [items, selectedBox]);

  const itemCountsByBoxId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      if (!item.box_id) continue;
      counts.set(item.box_id, (counts.get(item.box_id) ?? 0) + 1);
    }
    return counts;
  }, [items]);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return items
      .filter((item) => {
        return (
          item.item.toLowerCase().includes(q) ||
          (item.notes ?? "").toLowerCase().includes(q) ||
          (item.box_id ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const boxCompare = (a.box_id ?? "").localeCompare(b.box_id ?? "", undefined, {
          numeric: true,
          sensitivity: "base",
        });
        if (boxCompare !== 0) return boxCompare;
        return a.item.localeCompare(b.item, undefined, { sensitivity: "base" });
      });
  }, [items, search]);

  const editingItem = useMemo(
    () => items.find((item) => item.id === editingItemId) ?? null,
    [items, editingItemId]
  );

  async function createBox(e: FormEvent) {
    e.preventDefault();
    const boxId = (newBoxId.trim() || makeNextBoxId(boxes)).toUpperCase();
    const room = inferRoomFromBoxId(boxId);

    const { data, error } = await supabase
      .from("moving_boxes")
      .insert({ box_id: boxId, room, status: "Open" })
      .select("*")
      .single();

    if (error) {
      setErr(error.message);
      return;
    }

    const created = data as MovingBox;
    setBoxes((prev) => [...prev, created]);
    setSelectedBoxId(created.id);
    setNewBoxId("");
    setAddingBox(false);
  }

  function updateBoxDraft(id: string, patch: Partial<MovingBox>) {
    setBoxes((prev) => prev.map((box) => (box.id === id ? { ...box, ...patch } : box)));
  }

  async function saveBox(id: string, patch: Partial<Pick<MovingBox, "room" | "notes" | "priority" | "status">>) {
    updateBoxDraft(id, patch);
    const { error } = await supabase.from("moving_boxes").update(patch).eq("id", id);
    if (error) {
      setErr(error.message);
      await loadData();
    }
  }

  async function renameBox(box: MovingBox, rawBoxId: string) {
    const nextBoxId = rawBoxId.trim().toUpperCase();
    if (!nextBoxId || nextBoxId === box.box_id) return;

    if (boxes.some((candidate) => candidate.id !== box.id && candidate.box_id === nextBoxId)) {
      setErr(`${nextBoxId} already exists.`);
      return;
    }

    setErr(null);
    const { data: createdBox, error: createError } = await supabase
      .from("moving_boxes")
      .insert({
        box_id: nextBoxId,
        room: box.room,
        notes: box.notes,
        priority: box.priority,
        status: cleanStatus(box.status),
      })
      .select("*")
      .single();

    if (createError) {
      setErr(createError.message);
      return;
    }

    const { error: itemsError } = await supabase
      .from("moving_items")
      .update({ box_id: nextBoxId })
      .eq("box_id", box.box_id);

    if (itemsError) {
      setErr(itemsError.message);
      await supabase.from("moving_boxes").delete().eq("id", (createdBox as MovingBox).id);
      await loadData();
      return;
    }

    const { error: deleteError } = await supabase.from("moving_boxes").delete().eq("id", box.id);
    if (deleteError) {
      setErr(deleteError.message);
      await loadData();
      return;
    }

    const renamedBox = createdBox as MovingBox;
    setBoxes((prev) => prev.filter((candidate) => candidate.id !== box.id).concat(renamedBox));
    setItems((prev) =>
      prev.map((item) => (item.box_id === box.box_id ? { ...item, box_id: nextBoxId } : item))
    );
    setSelectedBoxId(renamedBox.id);
  }

  async function deleteBox(box: MovingBox) {
    const { error: itemsError } = await supabase.from("moving_items").delete().eq("box_id", box.box_id);
    if (itemsError) {
      setErr(itemsError.message);
      return;
    }

    const { error: boxError } = await supabase.from("moving_boxes").delete().eq("id", box.id);
    if (boxError) {
      setErr(boxError.message);
      await loadData();
      return;
    }

    setItems((prev) => prev.filter((item) => item.box_id !== box.box_id));
    setBoxes((prev) => prev.filter((candidate) => candidate.id !== box.id));
    setSelectedBoxId(null);
    setConfirmingDeleteBox(false);
  }

  async function addItem(e: FormEvent) {
    e.preventDefault();
    if (!selectedBox) return;
    const name = newItemName.trim();
    if (!name) return;

    const { data, error } = await supabase
      .from("moving_items")
      .insert({ item: name, box_id: selectedBox.box_id })
      .select("*")
      .single();

    if (error) {
      setErr(error.message);
      return;
    }

    setItems((prev) => [...prev, data as MovingItem]);
    setNewItemName("");
  }

  function openItemEditor(item: MovingItem) {
    setEditingItemId(item.id);
    setEditItemName(item.item);
    setEditItemBoxId(item.box_id ?? "");
    setEditItemNotes(item.notes ?? "");
    setConfirmingDeleteItem(false);
  }

  function closeItemEditor() {
    setEditingItemId(null);
    setEditItemName("");
    setEditItemBoxId("");
    setEditItemNotes("");
    setConfirmingDeleteItem(false);
  }

  async function saveItemEditor(e: FormEvent) {
    e.preventDefault();
    if (!editingItem) return;

    const patch = {
      item: editItemName.trim() || editingItem.item,
      box_id: editItemBoxId || null,
      notes: editItemNotes.trim() || null,
    };

    setItems((prev) => prev.map((item) => (item.id === editingItem.id ? { ...item, ...patch } : item)));

    const { error } = await supabase.from("moving_items").update(patch).eq("id", editingItem.id);
    if (error) {
      setErr(error.message);
      await loadData();
      return;
    }

    closeItemEditor();
  }

  async function deleteItem(item: MovingItem) {
    const { error } = await supabase.from("moving_items").delete().eq("id", item.id);
    if (error) {
      setErr(error.message);
      return;
    }

    setItems((prev) => prev.filter((candidate) => candidate.id !== item.id));
    closeItemEditor();
  }

  return (
    <main className="min-h-dvh bg-neutral-950 text-neutral-100">
      <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 py-4 sm:px-6">
        <header className="mb-4 flex items-center justify-between gap-3">
          <Link
            href="/"
            className="grid h-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 px-3 text-sm font-semibold text-white/80 active:scale-[0.98]"
            aria-label="Back to home"
            title="Back"
          >
            Home
          </Link>
          <div className="min-w-0 flex-1 text-center">
            <h1 className="truncate text-xl font-semibold tracking-normal">Moving</h1>
            <p className="mt-0.5 text-xs text-neutral-400">
              {boxes.length} boxes / {items.length} items
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setAddingBox((value) => !value);
              setSelectedBoxId(null);
            }}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white text-xl font-semibold text-neutral-950 active:scale-[0.98]"
            aria-label="Add box"
            title="Add box"
          >
            +
          </button>
        </header>

        {err ? (
          <div className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
            {err}
          </div>
        ) : null}

        {selectedBox ? (
          <section className="flex min-h-0 flex-1 flex-col">
            <button
              type="button"
              onClick={() => {
                setSelectedBoxId(null);
                setConfirmingDeleteBox(false);
              }}
              className="mb-3 w-fit rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 active:scale-[0.98]"
            >
              Back to boxes
            </button>

            <div className="mb-3 flex items-start justify-between gap-3">
              <label className="min-w-0 flex-1">
                <span className="mb-1 block text-xs uppercase text-neutral-500">Box ID</span>
                <input
                  key={selectedBox.id}
                  defaultValue={selectedBox.box_id}
                  onBlur={(e) => renameBox(selectedBox, e.target.value)}
                  className="h-12 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-2xl font-semibold text-white outline-none focus:border-white/30"
                />
              </label>
              <button
                type="button"
                onClick={() => saveBox(selectedBox.id, { status: nextStatus(selectedBox.status) })}
                className={`rounded-full border px-3 py-1 text-xs font-semibold active:scale-[0.98] ${statusClass(selectedBox.status)}`}
                aria-label={`Current status ${cleanStatus(selectedBox.status)}. Change status to ${nextStatus(selectedBox.status)}.`}
                title={`Change to ${nextStatus(selectedBox.status)}`}
              >
                {cleanStatus(selectedBox.status)}
              </button>
            </div>

            <section className="mt-4 min-h-0 flex-1">
              <form onSubmit={addItem} className="mb-4 flex gap-2">
                <input
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="h-14 min-w-0 flex-1 rounded-2xl border border-white/25 bg-white/10 px-4 text-[16px] font-semibold text-white outline-none placeholder:text-white/55 focus:border-white/50"
                  placeholder="Add Item to box"
                />
                <button
                  type="submit"
                  className="h-14 rounded-2xl border border-white/10 bg-white px-5 text-base font-semibold text-neutral-950 active:scale-[0.98]"
                >
                  Add
                </button>
              </form>

              <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
                {selectedItems.length === 0 ? (
                  <div className="px-4 py-5 text-sm text-neutral-400">No items in this box yet.</div>
                ) : (
                  selectedItems.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => openItemEditor(item)}
                      className="flex w-full items-center justify-between gap-3 border-b border-white/5 px-4 py-3 text-left last:border-b-0 active:bg-white/10"
                    >
                      <span className="min-w-0 truncate text-sm font-medium text-white">{item.item}</span>
                      {item.notes ? <span className="shrink-0 text-xs text-neutral-500">Notes</span> : null}
                    </button>
                  ))
                )}
              </div>
            </section>

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-neutral-500">Room</span>
                <input
                  value={selectedBox.room ?? ""}
                  onChange={(e) => updateBoxDraft(selectedBox.id, { room: e.target.value })}
                  onBlur={(e) => saveBox(selectedBox.id, { room: e.target.value.trim() || null })}
                  className="h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-[16px] text-white outline-none focus:border-white/25"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-neutral-500">Priority</span>
                <input
                  value={selectedBox.priority ?? ""}
                  onChange={(e) => updateBoxDraft(selectedBox.id, { priority: e.target.value })}
                  onBlur={(e) => saveBox(selectedBox.id, { priority: e.target.value.trim() || null })}
                  className="h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-[16px] text-white outline-none focus:border-white/25"
                />
              </label>
            </div>

            <label className="mt-5 block">
              <span className="mb-1 block text-xs font-semibold text-neutral-400">Box notes</span>
              <textarea
                value={selectedBox.notes ?? ""}
                onChange={(e) => updateBoxDraft(selectedBox.id, { notes: e.target.value })}
                onBlur={(e) => saveBox(selectedBox.id, { notes: e.target.value.trim() || null })}
                className="min-h-36 w-full resize-y rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-[16px] text-white outline-none focus:border-white/30"
              />
            </label>

            <div className="mt-3 flex justify-end gap-2">
              {confirmingDeleteBox ? (
                <>
                  <button
                    type="button"
                    onClick={() => setConfirmingDeleteBox(false)}
                    className="h-10 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white/80 active:scale-[0.98]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteBox(selectedBox)}
                    className="h-10 rounded-xl border border-red-300/30 bg-red-500 px-4 text-sm font-semibold text-white active:scale-[0.98]"
                  >
                    Confirm delete
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDeleteBox(true)}
                  className="h-10 rounded-xl border border-red-300/30 bg-red-500/10 px-4 text-sm font-semibold text-red-100 active:scale-[0.98]"
                >
                  Delete box
                </button>
              )}
            </div>
          </section>
        ) : (
          <section>
            {addingBox ? (
              <form onSubmit={createBox} className="mb-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-neutral-400">Box ID</span>
                    <input
                      value={newBoxId}
                      onChange={(e) => setNewBoxId(e.target.value)}
                      className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-[16px] text-white outline-none focus:border-white/30"
                    />
                  </label>
                  <button
                    type="submit"
                    className="h-11 rounded-xl border border-white/10 bg-white px-4 text-sm font-semibold text-neutral-950 active:scale-[0.98] sm:self-end"
                  >
                    Create
                  </button>
                </div>
              </form>
            ) : null}

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search items"
              className="mb-3 h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-base text-white outline-none focus:border-white/30"
            />

            {search.trim() ? (
              <div className="mb-4 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
                <div className="border-b border-white/5 px-4 py-2 text-xs font-semibold uppercase text-neutral-500">
                  Item matches
                </div>
                {searchResults.length === 0 ? (
                  <div className="px-4 py-4 text-sm text-neutral-400">No matching items.</div>
                ) : (
                  searchResults.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => openItemEditor(item)}
                      className="flex w-full items-center justify-between gap-3 border-b border-white/5 px-4 py-3 text-left last:border-b-0 active:bg-white/10"
                    >
                      <span className="min-w-0 truncate text-sm font-medium text-white">{item.item}</span>
                      <span className="shrink-0 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs font-semibold text-neutral-300">
                        {item.box_id || "No box"}
                      </span>
                    </button>
                  ))
                )}
              </div>
            ) : null}

            <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
              {loading ? (
                <div className="px-4 py-5 text-sm text-neutral-400">Loading boxes...</div>
              ) : sortedBoxes.length === 0 ? (
                <div className="px-4 py-5 text-sm text-neutral-400">No boxes yet.</div>
              ) : (
                sortedBoxes.map((box) => (
                  <button
                    type="button"
                    key={box.id}
                    onClick={() => setSelectedBoxId(box.id)}
                    className="grid w-full grid-cols-[1fr_auto] gap-3 border-b border-white/5 px-4 py-3 text-left last:border-b-0 active:bg-white/10"
                  >
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-baseline gap-2">
                        <span className="truncate text-base font-semibold text-white">{box.box_id}</span>
                        {box.room ? <span className="truncate text-sm text-neutral-400">{box.room}</span> : null}
                      </div>
                      <div className="mt-1 text-xs text-neutral-500">
                        {itemCountsByBoxId.get(box.box_id) ?? 0} items
                        {box.priority ? ` / ${box.priority}` : ""}
                      </div>
                    </div>
                    <span className={`self-center rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(box.status)}`}>
                      {cleanStatus(box.status)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </section>
        )}
      </div>

      {editingItem ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4">
          <form
            onSubmit={saveItemEditor}
            className="w-full max-w-md rounded-2xl border border-white/10 bg-neutral-950 p-4 shadow-2xl"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs uppercase text-neutral-500">Item</div>
                <h2 className="truncate text-lg font-semibold text-white">Edit item</h2>
              </div>
              <button
                type="button"
                onClick={closeItemEditor}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-lg text-white/80 active:scale-[0.98]"
                aria-label="Close item editor"
                title="Close"
              >
                x
              </button>
            </div>

            <label className="mb-3 block">
              <span className="mb-1 block text-xs font-semibold text-neutral-400">Name</span>
              <input
                value={editItemName}
                onChange={(e) => setEditItemName(e.target.value)}
                className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-[16px] text-white outline-none focus:border-white/30"
              />
            </label>

            <label className="mb-3 block">
              <span className="mb-1 block text-xs font-semibold text-neutral-400">Box</span>
              <select
                value={editItemBoxId}
                onChange={(e) => setEditItemBoxId(e.target.value)}
                className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-[16px] text-white outline-none focus:border-white/30"
              >
                <option value="">No box</option>
                {sortedBoxes.map((box) => (
                  <option key={box.id} value={box.box_id}>
                    {box.box_id}
                    {box.room ? ` / ${box.room}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="mb-4 block">
              <span className="mb-1 block text-xs font-semibold text-neutral-400">Item notes</span>
              <textarea
                value={editItemNotes}
                onChange={(e) => setEditItemNotes(e.target.value)}
                className="min-h-32 w-full resize-y rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-[16px] text-white outline-none focus:border-white/30"
              />
            </label>

            <div className="flex flex-wrap justify-between gap-2">
              {confirmingDeleteItem ? (
                <button
                  type="button"
                  onClick={() => deleteItem(editingItem)}
                  className="h-11 rounded-xl border border-red-300/30 bg-red-500 px-4 text-sm font-semibold text-white active:scale-[0.98]"
                >
                  Confirm delete
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDeleteItem(true)}
                  className="h-11 rounded-xl border border-red-300/30 bg-red-500/10 px-4 text-sm font-semibold text-red-100 active:scale-[0.98]"
                >
                  Delete item
                </button>
              )}
              <div className="flex gap-2">
              <button
                type="button"
                onClick={closeItemEditor}
                className="h-11 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white/80 active:scale-[0.98]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="h-11 rounded-xl border border-white/10 bg-white px-4 text-sm font-semibold text-neutral-950 active:scale-[0.98]"
              >
                Save
              </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}
