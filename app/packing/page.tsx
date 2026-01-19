"use client";

import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";

type Category = "Toiletries" | "Clothes" | "Electronics" | "Other";
const CATEGORIES: Category[] = ["Toiletries", "Clothes", "Electronics", "Other"];

type TemplateItem = {
  id: string;
  category: Category;
  item_name: string;
  sort_order: number;
};

type Trip = {
  id: string;
  trip_name: string;
  is_archived: boolean;
  archived_at: string | null;
  created_at: string;
};

type TripItem = {
  id: string;
  trip_id: string;
  category: Category;
  item_name: string;
  is_packed: boolean;
  is_hidden: boolean;
  is_one_off: boolean;
  sort_order: number;
};

export default function PackingPage() {
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"current" | "template" | "archived">("current");

  // Template items
  const [templateItems, setTemplateItems] = useState<TemplateItem[]>([]);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateCategory, setNewTemplateCategory] = useState<Category>("Toiletries");

  // Trips
  const [trips, setTrips] = useState<Trip[]>([]);
  const [currentTrip, setCurrentTrip] = useState<Trip | null>(null);
  const [tripItems, setTripItems] = useState<TripItem[]>([]);
  const [newTripName, setNewTripName] = useState("");

  // Trip items
  const [newItemName, setNewItemName] = useState("");
  const [newItemCategory, setNewItemCategory] = useState<Category>("Clothes");

  // Editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setErr(null);

    // Load template items
    const { data: templateData, error: templateError } = await supabase
      .from("packing_template_items")
      .select("*")
      .order("category")
      .order("sort_order")
      .order("created_at");

    if (templateError) {
      setErr(templateError.message);
      setLoading(false);
      return;
    }

    setTemplateItems((templateData as TemplateItem[]) || []);

    // Load trips
    const { data: tripsData, error: tripsError } = await supabase
      .from("packing_trips")
      .select("*")
      .order("created_at", { ascending: false });

    if (tripsError) {
      setErr(tripsError.message);
      setLoading(false);
      return;
    }

    const allTrips = (tripsData as Trip[]) || [];
    setTrips(allTrips);

    // Set current trip to most recent non-archived
    const active = allTrips.find((t) => !t.is_archived);
    setCurrentTrip(active || null);

    // Load trip items if there's a current trip
    if (active) {
      await loadTripItems(active.id);
    }

    setLoading(false);
  }

  async function loadTripItems(tripId: string) {
    const { data, error } = await supabase
      .from("packing_trip_items")
      .select("*")
      .eq("trip_id", tripId)
      .order("category")
      .order("sort_order")
      .order("created_at");

    if (error) {
      setErr(error.message);
      return;
    }

    setTripItems((data as TripItem[]) || []);
  }

  async function createTrip() {
    const name = newTripName.trim();
    if (!name) {
      setErr("Please enter a trip name");
      return;
    }

    setErr(null);

    // Create trip
    const { data: tripData, error: tripError } = await supabase
      .from("packing_trips")
      .insert({ trip_name: name, is_archived: false })
      .select()
      .single();

    if (tripError) {
      setErr(tripError.message);
      return;
    }

    const newTrip = tripData as Trip;

    // Copy template items to trip items
    const tripItemsToInsert = templateItems.map((t) => ({
      trip_id: newTrip.id,
      category: t.category,
      item_name: t.item_name,
      is_packed: false,
      is_hidden: false,
      is_one_off: false,
      sort_order: t.sort_order,
    }));

    if (tripItemsToInsert.length > 0) {
      const { error: itemsError } = await supabase
        .from("packing_trip_items")
        .insert(tripItemsToInsert);

      if (itemsError) {
        setErr(itemsError.message);
        return;
      }
    }

    setNewTripName("");
    await loadData();
  }

  async function addTemplateItem() {
    const name = newTemplateName.trim();
    if (!name) {
      setErr("Please enter an item name");
      return;
    }

    setErr(null);

    const { error } = await supabase.from("packing_template_items").insert({
      category: newTemplateCategory,
      item_name: name,
      sort_order: 0,
    });

    if (error) {
      setErr(error.message);
      return;
    }

    setNewTemplateName("");
    await loadData();
  }

  async function deleteTemplateItem(id: string) {
    const { error } = await supabase
      .from("packing_template_items")
      .delete()
      .eq("id", id);

    if (error) {
      setErr(error.message);
      return;
    }

    await loadData();
  }

  async function addTripItem() {
    if (!currentTrip) return;

    const name = newItemName.trim();
    if (!name) {
      setErr("Please enter an item name");
      return;
    }

    setErr(null);

    const { error } = await supabase.from("packing_trip_items").insert({
      trip_id: currentTrip.id,
      category: newItemCategory,
      item_name: name,
      is_packed: false,
      is_hidden: false,
      is_one_off: true,
      sort_order: 0,
    });

    if (error) {
      setErr(error.message);
      return;
    }

    setNewItemName("");
    await loadTripItems(currentTrip.id);
  }

  async function togglePacked(itemId: string, currentPacked: boolean) {
    if (!currentTrip) return;

    const { error } = await supabase
      .from("packing_trip_items")
      .update({ is_packed: !currentPacked })
      .eq("id", itemId);

    if (error) {
      setErr(error.message);
      return;
    }

    await loadTripItems(currentTrip.id);
  }

  async function toggleHidden(itemId: string, currentHidden: boolean) {
    if (!currentTrip) return;

    const { error } = await supabase
      .from("packing_trip_items")
      .update({ is_hidden: !currentHidden })
      .eq("id", itemId);

    if (error) {
      setErr(error.message);
      return;
    }

    await loadTripItems(currentTrip.id);
  }

  async function addToTemplate(itemName: string, category: Category) {
    const { error } = await supabase.from("packing_template_items").insert({
      category,
      item_name: itemName,
      sort_order: 0,
    });

    if (error) {
      setErr(error.message);
      return;
    }

    await loadData();
  }

  function startEdit(item: TripItem) {
    if (editingId === item.id) return;
    setErr(null);
    setEditingId(item.id);
    setEditingText(item.item_name ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingText("");
  }

  async function saveEdit(id: string) {
    if (!currentTrip) return;

    const next = editingText.trim();
    if (!next) {
      setErr("Item name cannot be empty");
      return;
    }

    setErr(null);

    const { error } = await supabase
      .from("packing_trip_items")
      .update({ item_name: next })
      .eq("id", id);

    if (error) {
      setErr(error.message);
      return;
    }

    cancelEdit();
    await loadTripItems(currentTrip.id);
  }

  async function archiveTrip() {
    if (!currentTrip) return;

    const { error } = await supabase
      .from("packing_trips")
      .update({ is_archived: true, archived_at: new Date().toISOString() })
      .eq("id", currentTrip.id);

    if (error) {
      setErr(error.message);
      return;
    }

    await loadData();
  }

  async function viewArchivedTrip(tripId: string) {
    await loadTripItems(tripId);
    const trip = trips.find((t) => t.id === tripId);
    setCurrentTrip(trip || null);
    setView("current");
  }

  const itemsByCategory = useMemo(() => {
    const map = new Map<Category, TripItem[]>();
    for (const cat of CATEGORIES) {
      map.set(
        cat,
        tripItems.filter((item) => item.category === cat && !item.is_hidden)
      );
    }
    return map;
  }, [tripItems]);

  const templateByCategory = useMemo(() => {
    const map = new Map<Category, TemplateItem[]>();
    for (const cat of CATEGORIES) {
      map.set(
        cat,
        templateItems.filter((item) => item.category === cat)
      );
    }
    return map;
  }, [templateItems]);

  const packedCount = useMemo(() => {
    return tripItems.filter((i) => !i.is_hidden && i.is_packed).length;
  }, [tripItems]);

  const totalCount = useMemo(() => {
    return tripItems.filter((i) => !i.is_hidden).length;
  }, [tripItems]);

  return (
    <main className="min-h-[calc(100vh-80px)] bg-black px-4 pb-28 pt-4 text-neutral-100">
      <div className="mx-auto w-full max-w-2xl">
        <div className="flex items-center justify-between gap-3">
          <div className="text-base font-semibold tracking-wide text-neutral-200">Packing</div>
          <Link
            href="/"
            className="rounded-full border border-neutral-700 bg-neutral-950/40 px-4 py-2 text-sm font-semibold text-neutral-100"
          >
            Home
          </Link>
        </div>

        {/* View tabs */}
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setView("current")}
            className={
              "rounded-full px-4 py-2 text-sm font-semibold " +
              (view === "current"
                ? "bg-neutral-100 text-neutral-950"
                : "border border-neutral-800 bg-neutral-950/40 text-neutral-200")
            }
          >
            Current Trip
          </button>
          <button
            onClick={() => setView("template")}
            className={
              "rounded-full px-4 py-2 text-sm font-semibold " +
              (view === "template"
                ? "bg-neutral-100 text-neutral-950"
                : "border border-neutral-800 bg-neutral-950/40 text-neutral-200")
            }
          >
            Template
          </button>
          <button
            onClick={() => setView("archived")}
            className={
              "rounded-full px-4 py-2 text-sm font-semibold " +
              (view === "archived"
                ? "bg-neutral-100 text-neutral-950"
                : "border border-neutral-800 bg-neutral-950/40 text-neutral-200")
            }
          >
            Archived Trips
          </button>
        </div>

        {err && (
          <div className="mt-4 rounded-xl border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-200">
            {err}
          </div>
        )}

        {loading ? (
          <div className="mt-4 text-sm text-neutral-500">Loading...</div>
        ) : view === "current" ? (
          <>
            {!currentTrip ? (
              <section className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
                <div className="text-sm font-semibold text-neutral-300 mb-3">Start a New Trip</div>
                <div className="flex gap-2">
                  <input
                    value={newTripName}
                    onChange={(e) => setNewTripName(e.target.value)}
                    placeholder="Trip name (e.g. Florida - Feb 26)"
                    className="flex-1 rounded-xl border border-neutral-800 bg-black/40 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-500"
                  />
                  <button
                    onClick={createTrip}
                    className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-950"
                  >
                    Create
                  </button>
                </div>
              </section>
            ) : (
              <>
                {/* Trip header */}
                <section className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-lg font-semibold text-neutral-100">{currentTrip.trip_name}</div>
                      <div className="mt-1 text-xs text-neutral-400">
                        {packedCount} / {totalCount} packed
                      </div>
                    </div>
                    <button
                      onClick={archiveTrip}
                      className="rounded-xl border border-neutral-700 bg-black/30 px-4 py-2 text-sm font-semibold text-neutral-100"
                    >
                      Archive Trip
                    </button>
                  </div>
                </section>

                {/* Add one-off item */}
                <section className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
                  <div className="text-sm font-semibold text-neutral-300 mb-3">Add One-Off Item</div>
                  <div className="flex gap-2">
                    <select
                      value={newItemCategory}
                      onChange={(e) => setNewItemCategory(e.target.value as Category)}
                      className="rounded-xl border border-neutral-800 bg-black/40 px-3 py-2 text-sm text-neutral-100 outline-none"
                    >
                      {CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                    <input
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      placeholder="Item name"
                      className="flex-1 rounded-xl border border-neutral-800 bg-black/40 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-500"
                    />
                    <button
                      onClick={addTripItem}
                      className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-950"
                    >
                      Add
                    </button>
                  </div>
                </section>

                {/* Packing list by category */}
                <div className="mt-4 space-y-4">
                  {CATEGORIES.map((category) => {
                    const items = itemsByCategory.get(category) || [];
                    if (items.length === 0) return null;

                    return (
                      <section key={category} className="rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
                        <div className="mb-3 text-sm font-semibold text-neutral-300">{category}</div>
                        <div className="space-y-2">
                          {items.map((item) => (
                            <div key={item.id}>
                              {editingId === item.id ? (
                                <div className="rounded-xl border border-neutral-800 bg-black/20 px-3 py-2">
                                  <input
                                    value={editingText}
                                    onChange={(e) => setEditingText(e.target.value)}
                                    className="w-full rounded-lg border border-neutral-700 bg-black/40 px-2 py-1 text-sm text-neutral-100 outline-none focus:border-neutral-500"
                                  />
                                  <div className="mt-2 flex gap-2">
                                    <button
                                      onClick={() => saveEdit(item.id)}
                                      className="rounded-lg bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-950"
                                    >
                                      Save
                                    </button>
                                    <button
                                      onClick={cancelEdit}
                                      className="rounded-lg border border-neutral-700 bg-black/30 px-3 py-1 text-xs font-semibold text-neutral-100"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div
                                  className={
                                    "flex items-center justify-between gap-3 rounded-xl border px-3 py-2 " +
                                    (item.is_packed
                                      ? "border-emerald-700 bg-emerald-950/30"
                                      : "border-neutral-800 bg-black/20")
                                  }
                                >
                                  <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <button
                                      onClick={() => togglePacked(item.id, item.is_packed)}
                                      className={
                                        "h-5 w-5 shrink-0 rounded border-2 " +
                                        (item.is_packed
                                          ? "border-emerald-400 bg-emerald-400"
                                          : "border-neutral-600 bg-transparent")
                                      }
                                    >
                                      {item.is_packed && (
                                        <svg className="h-full w-full text-neutral-950" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                        </svg>
                                      )}
                                    </button>
                                    {item.is_one_off ? (
                                      <button
                                        onClick={() => startEdit(item)}
                                        className={
                                          "text-left text-sm " + (item.is_packed ? "text-neutral-300" : "text-neutral-100")
                                        }
                                      >
                                        {item.item_name}
                                      </button>
                                    ) : (
                                      <span className={"text-sm " + (item.is_packed ? "text-neutral-300" : "text-neutral-100")}>
                                        {item.item_name}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex gap-2">
                                    {item.is_one_off && (
                                      <button
                                        onClick={() => addToTemplate(item.item_name, item.category)}
                                        className="text-xs text-neutral-400 hover:text-neutral-200"
                                      >
                                        + Template
                                      </button>
                                    )}
                                    <button
                                      onClick={() => toggleHidden(item.id, item.is_hidden)}
                                      className="text-xs text-neutral-400 hover:text-neutral-200"
                                    >
                                      Hide
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </>
            )}
          </>
        ) : view === "template" ? (
          <>
            {/* Add template item */}
            <section className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
              <div className="text-sm font-semibold text-neutral-300 mb-3">Add Template Item</div>
              <div className="flex gap-2">
                <select
                  value={newTemplateCategory}
                  onChange={(e) => setNewTemplateCategory(e.target.value as Category)}
                  className="rounded-xl border border-neutral-800 bg-black/40 px-3 py-2 text-sm text-neutral-100 outline-none"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <input
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="Item name"
                  className="flex-1 rounded-xl border border-neutral-800 bg-black/40 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-500"
                />
                <button
                  onClick={addTemplateItem}
                  className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-950"
                >
                  Add
                </button>
              </div>
            </section>

            {/* Template items by category */}
            <div className="mt-4 space-y-4">
              {CATEGORIES.map((category) => {
                const items = templateByCategory.get(category) || [];
                if (items.length === 0) return null;

                return (
                  <section key={category} className="rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
                    <div className="mb-3 text-sm font-semibold text-neutral-300">{category}</div>
                    <div className="space-y-2">
                      {items.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-black/20 px-3 py-2"
                        >
                          <span className="text-sm text-neutral-100">{item.item_name}</span>
                          <button
                            onClick={() => {
                              if (confirm(`Delete "${item.item_name}" from template?`)) {
                                deleteTemplateItem(item.id);
                              }
                            }}
                            className="text-xs text-red-400 hover:text-red-300"
                          >
                            Delete
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </>
        ) : (
          <>
            {/* Archived trips */}
            <section className="mt-4 space-y-2">
              {trips
                .filter((t) => t.is_archived)
                .map((trip) => (
                  <button
                    key={trip.id}
                    onClick={() => viewArchivedTrip(trip.id)}
                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4 text-left hover:bg-neutral-950/50"
                  >
                    <div className="text-sm font-semibold text-neutral-100">{trip.trip_name}</div>
                    <div className="mt-1 text-xs text-neutral-400">
                      Archived {trip.archived_at ? new Date(trip.archived_at).toLocaleDateString() : ""}
                    </div>
                  </button>
                ))}
              {trips.filter((t) => t.is_archived).length === 0 && (
                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/20 px-4 py-3 text-sm text-neutral-500">
                  No archived trips yet.
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
