"use client";

import { useState } from "react";
import type { SavedView } from "../_lib/types";

export default function ViewsBar({
  savedViews,
  activeViewId,
  isDirty,
  onLoadView,
  onSaveView,
  onCreateView,
  onDeleteView,
}: {
  savedViews: SavedView[];
  activeViewId: string | null;
  isDirty: boolean;
  onLoadView: (view: SavedView) => void;
  onSaveView: () => Promise<void>;
  onCreateView: (title: string) => Promise<void>;
  onDeleteView: (id: string) => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!titleInput.trim()) return;
    setBusy(true);
    await onCreateView(titleInput.trim());
    setBusy(false);
    setTitleInput("");
    setCreating(false);
  }

  async function handleSave() {
    setBusy(true);
    await onSaveView();
    setBusy(false);
  }

  async function handleDelete() {
    if (!activeViewId) return;
    const view = savedViews.find((v) => v.id === activeViewId);
    const name = view?.title ?? "this view";
    if (!window.confirm(`Delete "${name}"?`)) return;
    setBusy(true);
    await onDeleteView(activeViewId);
    setBusy(false);
  }

  // -- Creating mode --
  if (creating) {
    return (
      <form onSubmit={handleCreate} className="flex items-center gap-2">
        <input
          type="text"
          value={titleInput}
          onChange={(e) => setTitleInput(e.target.value)}
          placeholder="View name..."
          autoFocus
          className="w-40 md:w-56 rounded-lg border border-white/10 bg-white/5 text-white text-xs px-2 py-1.5 outline-none focus:border-white/25"
        />
        <button
          type="submit"
          disabled={busy || !titleInput.trim()}
          className="shrink-0 px-3 py-1.5 text-xs rounded-lg bg-white/15 text-white hover:bg-white/20 transition disabled:opacity-40"
        >
          {busy ? "..." : "Create"}
        </button>
        <button
          type="button"
          onClick={() => {
            setCreating(false);
            setTitleInput("");
          }}
          className="shrink-0 text-xs text-white/40 hover:text-white/70 transition"
        >
          Cancel
        </button>
      </form>
    );
  }

  // -- Normal mode --
  const activeView = savedViews.find((v) => v.id === activeViewId);

  return (
    <div className="flex items-center gap-2">
      {/* Views dropdown */}
      <select
        value={activeViewId ?? ""}
        onChange={(e) => {
          const view = savedViews.find((v) => v.id === e.target.value);
          if (view) onLoadView(view);
        }}
        className="w-36 md:w-52 rounded-lg border border-white/10 bg-white/5 text-white text-xs px-2 py-1.5 outline-none focus:border-white/25 truncate"
      >
        <option value="" className="bg-zinc-900">
          {savedViews.length === 0 ? "No saved views" : "— select a view —"}
        </option>
        {savedViews.map((v) => (
          <option key={v.id} value={v.id} className="bg-zinc-900">
            {v.title}
          </option>
        ))}
      </select>

      {/* Save button — only enabled when view selected */}
      <button
        onClick={handleSave}
        disabled={!activeViewId || busy}
        className={`shrink-0 px-3 py-1.5 text-xs rounded-lg transition disabled:opacity-30 disabled:cursor-not-allowed ${
          isDirty && activeViewId
            ? "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30"
            : "bg-white/8 text-white/60 hover:bg-white/12 hover:text-white/80"
        }`}
        title={activeView ? `Save changes to "${activeView.title}"` : "Select a view to save"}
      >
        {isDirty && activeViewId ? "Save*" : "Save"}
      </button>

      {/* New view button */}
      <button
        onClick={() => setCreating(true)}
        className="shrink-0 px-3 py-1.5 text-xs rounded-lg bg-white/8 text-white/60 hover:bg-white/12 hover:text-white/80 transition"
        title="Save current layout as a new view"
      >
        + New
      </button>

      {/* Delete — only visible when a view is selected */}
      {activeViewId && (
        <button
          onClick={handleDelete}
          disabled={busy}
          className="shrink-0 text-xs text-red-400/50 hover:text-red-400 transition disabled:opacity-30"
          title="Delete this view"
        >
          ✕
        </button>
      )}
    </div>
  );
}
