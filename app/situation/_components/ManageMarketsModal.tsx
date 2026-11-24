"use client";

import { useState } from "react";
import type { MarketUpdates, SavedMarket } from "../_lib/types";
import { extractSlug, fetchEvent, lookupStock } from "../_lib/api";
import { addSavedMarket, removeSavedMarket } from "../_lib/markets";
import { normalizeStockTicker } from "../_lib/stockMarkets";
import MarketEditor from "./MarketEditor";
import { resolveMarketLabel } from "../_lib/marketLabel";
import styles from "./ManageMarkets.module.css";

export default function ManageMarketsModal({ open, onClose, savedMarkets, userId, onMarketsChange, onMarketSettingsChange }: {
  open: boolean;
  onClose: () => void;
  savedMarkets: SavedMarket[];
  userId: string;
  onMarketsChange: () => void;
  onMarketSettingsChange: (marketId: string, changes: MarketUpdates) => void;
}) {
  const [source, setSource] = useState<"polymarket" | "stock">("polymarket");
  const [urlInput, setUrlInput] = useState("");
  const [tickerInput, setTickerInput] = useState("");
  const [labelInput, setLabelInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingMarketId, setEditingMarketId] = useState<string | null>(null);
  const [savingMarketId, setSavingMarketId] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<{ marketId: string; message: string } | null>(null);
  const busy = adding || removingId !== null || savingMarketId !== null;
  const isStock = source === "stock";

  if (!open) return null;

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setNotice(null);
    const slug = isStock ? normalizeStockTicker(tickerInput) : extractSlug(urlInput);
    if (!slug) {
      setError(isStock ? "Enter a stock symbol, such as AAPL, MSFT, or BRK-B." : "Paste a valid Polymarket URL.");
      return;
    }
    const duplicate = savedMarkets.some((market) => market.source === source
      && (isStock ? normalizeStockTicker(market.slug) === slug : market.slug === slug));
    if (duplicate) {
      setError(isStock ? `${slug} is already in your saved stocks.` : "This Polymarket is already saved.");
      return;
    }

    setAdding(true);
    try {
      let defaultLabel = slug;
      if (isStock) {
        const stock = await lookupStock(slug);
        if (!stock) {
          setError(`Could not verify ${slug}. Check the symbol or try again if the price feed is unavailable.`);
          return;
        }
        defaultLabel = stock.label;
      } else if (!labelInput.trim()) {
        defaultLabel = (await fetchEvent(slug))?.title ?? slug;
      }
      const label = resolveMarketLabel(labelInput, defaultLabel) ?? slug;
      const result = await addSavedMarket(userId, label, slug, source);
      if (!result) { setError("Could not save. Your entry is still here; please try again."); return; }
      setUrlInput("");
      setTickerInput("");
      setLabelInput("");
      setNotice(`${label} added. Select it from any chart's market menu.`);
      onMarketsChange();
    } catch {
      setError("Could not save. Your entry is still here; please try again.");
    } finally { setAdding(false); }
  }

  async function handleRemove(market: SavedMarket) {
    if (busy) return;
    setRemovingId(market.id);
    setError(null);
    setNotice(null);
    try {
      if (!(await removeSavedMarket(market.id))) { setError(`Could not remove ${market.label}. Please try again.`); return; }
      if (editingMarketId === market.id) setEditingMarketId(null);
      onMarketsChange();
    } catch { setError(`Could not remove ${market.label}. Please try again.`); }
    finally { setRemovingId(null); }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.backdrop} onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="manage-markets-title" className={styles.dialog}>
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>TERMINAL / WATCHLIST</span>
            <h2 id="manage-markets-title">Manage Markets</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close Manage Markets" className={styles.close}>&times;</button>
        </header>
        <div className={styles.scroll}>
          <form onSubmit={handleAdd} className={styles.addForm} aria-label="Add to watchlist">
            <div className={styles.sourcePicker} role="group" aria-label="Market type">
              {(["polymarket", "stock"] as const).map((type) => (
                <button key={type} type="button" aria-pressed={source === type} disabled={busy}
                  onClick={() => { setSource(type); setError(null); setNotice(null); }}>
                  {type === "stock" ? "Stock" : "Polymarket"}
                </button>
              ))}
            </div>
            <label className={styles.field}>
              <span>{isStock ? "Stock symbol" : "Event URL"}</span>
              <input type="text" aria-label={isStock ? "Stock symbol" : "Polymarket event URL"}
                value={isStock ? tickerInput : urlInput} disabled={busy} autoComplete="off" autoCorrect="off" spellCheck={false}
                autoCapitalize={isStock ? "characters" : "none"}
                onChange={(event) => { if (isStock) setTickerInput(event.target.value); else setUrlInput(event.target.value); setError(null); setNotice(null); }}
                placeholder={isStock ? "AAPL, MSFT, SPY..." : "Polymarket event URL..."} />
            </label>
            <div className={styles.addRow}>
              <label className={styles.field}>
                <span>Label <small>optional</small></span>
                <input type="text" aria-label="Label (optional)" value={labelInput} disabled={busy}
                  onChange={(event) => setLabelInput(event.target.value)}
                  placeholder={isStock ? "Company name if blank" : "Event title if blank"} />
              </label>
              <button type="submit" disabled={busy || !(isStock ? tickerInput : urlInput).trim()} className={styles.addButton}>
                {adding ? isStock ? "Checking..." : "Adding..." : isStock ? "Add Stock" : "Add Market"}
              </button>
            </div>
            <p className={styles.hint}>{isStock
              ? "Stocks and ETFs. Use the Yahoo Finance symbol, such as BRK-B for Berkshire Hathaway. Prices use the same feed as the built-in stocks."
              : "Paste an event link. You can edit its label and outcome colors after adding it."}</p>
            {error && <p role="alert" className={styles.error}>{error}</p>}
            {notice && <p role="status" className={styles.notice}>{notice}</p>}
          </form>
          <div className={styles.watchlist}>
            {savedMarkets.length === 0 && <p className={styles.empty}>Your saved watchlist is empty. Add a market or stock above. Built-in markets are always available in the chart menus.</p>}
            {(["stock", "polymarket"] as const).map((type) => {
              const markets = savedMarkets.filter((market) => type === "stock" ? market.source === "stock" : market.source !== "stock");
              if (!markets.length) return null;
              return (
                <section key={type} aria-label={type === "stock" ? "Saved stocks" : "Saved Polymarkets"} className={styles.section}>
                  <h3>{type === "stock" ? "Stocks" : "Polymarkets"}<span>{markets.length}</span></h3>
                  <ul className={styles.list}>
                    {markets.map((market) => (
                      <li key={market.id} data-market-id={market.id} className={styles.market}>
                        <div className={styles.marketRow}>
                          <div className={styles.marketText}>
                            <div className={styles.marketName}>{market.label}</div>
                            <div className={styles.marketDetail}>{market.source === "stock" ? `STOCK / ${market.slug}` : market.slug}</div>
                          </div>
                          <button type={editingMarketId === market.id ? "submit" : "button"}
                            form={editingMarketId === market.id ? `market-editor-${market.id}` : undefined}
                            onClick={editingMarketId === market.id ? undefined : (event) => { event.preventDefault(); setEditingMarketId(market.id); setSaveNotice(null); }}
                            disabled={busy} aria-expanded={editingMarketId === market.id}
                            aria-label={editingMarketId === market.id ? `Save ${market.label}` : `Edit ${market.label}`} className={styles.editButton}>
                            {savingMarketId === market.id ? "Saving..." : editingMarketId === market.id ? "Save" : "Edit"}
                          </button>
                          <button type="button" onClick={() => handleRemove(market)} disabled={busy}
                            aria-label={`Remove ${market.label}`} className={styles.removeButton}>
                            {removingId === market.id ? "Removing..." : "Remove"}
                          </button>
                        </div>
                        {editingMarketId === market.id && <MarketEditor key={market.id} market={market} userId={userId}
                          onSettingsSaved={onMarketSettingsChange} onSavingChange={(saving) => setSavingMarketId(saving ? market.id : null)}
                          onSaved={(message) => { setEditingMarketId(null); setSaveNotice(message ? { marketId: market.id, message } : null); }} />}
                        {editingMarketId !== market.id && saveNotice?.marketId === market.id && <p role="status" className={styles.savedNotice}>{saveNotice.message}</p>}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
