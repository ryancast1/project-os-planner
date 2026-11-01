"use client";

import { useState } from "react";
import type { SavedView } from "../_lib/types";
import styles from "./Toolbar.module.css";

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
  onSaveView: () => Promise<boolean>;
  onCreateView: (title: string) => Promise<boolean>;
  onDeleteView: (id: string) => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!titleInput.trim()) return;
    setBusy(true);
    try {
      if (await onCreateView(titleInput.trim())) {
        setTitleInput("");
        setCreating(false);
      }
    } finally {
      setBusy(false);
    }
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
      <form onSubmit={handleCreate} className={styles.views}>
        <input
          type="text"
          value={titleInput}
          onChange={(e) => setTitleInput(e.target.value)}
          placeholder="View name..."
          autoFocus
          className={styles.nameInput}
        />
        <button
          type="submit"
          disabled={busy || !titleInput.trim()}
          className={`${styles.button} ${styles.action}`}
        >
          {busy ? "..." : "Create"}
        </button>
        <button
          type="button"
          onClick={() => {
            setCreating(false);
            setTitleInput("");
          }}
          className={styles.button}
        >
          Cancel
        </button>
      </form>
    );
  }

  // -- Normal mode --
  const activeView = savedViews.find((v) => v.id === activeViewId);

  return (
    <div className={styles.views}>
      {/* Views dropdown */}
      <select
        aria-label="Saved market views"
        value={activeViewId ?? ""}
        onChange={(e) => {
          const view = savedViews.find((v) => v.id === e.target.value);
          if (view) onLoadView(view);
        }}
        className={styles.viewSelect}
        title={activeView?.title ?? "Saved market views"}
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
        className={`${styles.button} ${styles.action} ${isDirty && activeViewId ? styles.dirty : ""}`}
        title={activeView ? `Save changes to "${activeView.title}"` : "Select a view to save"}
      >
        {isDirty && activeViewId ? "Save*" : "Save"}
      </button>

      {/* New view button */}
      <button
        onClick={() => setCreating(true)}
        className={`${styles.button} ${styles.action}`}
        title="Save current layout as a new view"
      >
        + New
      </button>

      {/* Delete — only visible when a view is selected */}
      {activeViewId && (
        <button
          onClick={handleDelete}
          disabled={busy}
          className={`${styles.button} ${styles.delete}`}
          aria-label="Delete this view"
          title="Delete this view"
        >
          ✕
        </button>
      )}
    </div>
  );
}
