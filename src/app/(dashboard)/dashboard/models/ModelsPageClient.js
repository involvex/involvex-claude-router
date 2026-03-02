"use client";

import { useState, useEffect, useMemo } from "react";
import Button from "@/shared/components/Button";
import Input from "@/shared/components/Input";
import Card from "@/shared/components/Card";

function formatCost(cost) {
  if (cost === null || cost === undefined) return "—";
  if (cost === 0) return "Free";
  if (cost < 0.01) return `$${(cost * 1000).toFixed(3)}/M`;
  return `$${Number(cost).toFixed(2)}/M`;
}

function formatContext(ctx) {
  if (!ctx) return "—";
  const n = Number(ctx);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export default function ModelsPageClient() {
  const [allModels, setAllModels] = useState([]);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true); // true = loading on mount
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [selectedProviders, setSelectedProviders] = useState([]);
  const [freeOnly, setFreeOnly] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  useEffect(() => {
    fetch("/api/models-dev")
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setAllModels(data.models || []);
        setProviders(data.providers || []);
        setLoading(false);
      })
      .catch(e => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return allModels.filter(m => {
      if (
        q &&
        !m.name.toLowerCase().includes(q) &&
        !m.id.toLowerCase().includes(q)
      )
        return false;
      if (
        selectedProviders.length > 0 &&
        !selectedProviders.includes(m.provider)
      )
        return false;
      if (freeOnly && !m.free) return false;
      return true;
    });
  }, [allModels, search, selectedProviders, freeOnly]);

  const paginated = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  function toggleProvider(id) {
    setPage(1);
    setSelectedProviders(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id],
    );
  }

  function handleSearch(v) {
    setSearch(v);
    setPage(1);
  }

  function handleFreeOnly(v) {
    setFreeOnly(v);
    setPage(1);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-text-muted">
        <span className="material-symbols-outlined animate-spin text-3xl mr-3">
          progress_activity
        </span>
        Loading models from models.dev…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-24 text-red-500">
        <span className="material-symbols-outlined mr-2">error</span>
        Failed to load: {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-main">Models</h1>
          <p className="text-sm text-text-muted mt-1">
            {filtered.length.toLocaleString()} of{" "}
            {allModels.length.toLocaleString()} models from{" "}
            <a
              href="https://models.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-primary"
            >
              models.dev
            </a>
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input
                placeholder="Search models…"
                value={search}
                onChange={e => handleSearch(e.target.value)}
                icon="search"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={freeOnly}
                onChange={e => handleFreeOnly(e.target.checked)}
                className="accent-primary w-4 h-4"
              />
              <span className="text-sm font-medium">Free only</span>
              <span className="text-xs bg-green-500/10 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full font-semibold">
                FREE
              </span>
            </label>
          </div>

          {/* Provider chips */}
          <div className="flex flex-wrap gap-2">
            {providers.map(p => (
              <button
                key={p.id}
                onClick={() => toggleProvider(p.id)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  selectedProviders.includes(p.id)
                    ? "bg-primary text-white border-primary"
                    : "border-border text-text-muted hover:border-primary/50 hover:text-text-main"
                }`}
              >
                {p.name}
              </button>
            ))}
            {selectedProviders.length > 0 && (
              <button
                onClick={() => setSelectedProviders([])}
                className="px-3 py-1 rounded-full text-xs font-medium border border-border text-text-muted hover:border-red-400 hover:text-red-500 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/5 dark:border-white/5 text-text-muted text-left">
                <th className="px-4 py-3 font-medium">Model</th>
                <th className="px-4 py-3 font-medium">Provider</th>
                <th className="px-4 py-3 font-medium text-right">Input /1M</th>
                <th className="px-4 py-3 font-medium text-right">Output /1M</th>
                <th className="px-4 py-3 font-medium text-right">Context</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-text-muted"
                  >
                    No models found
                  </td>
                </tr>
              ) : (
                paginated.map(m => (
                  <tr
                    key={`${m.provider}/${m.id}`}
                    className="border-b border-black/5 dark:border-white/5 last:border-0 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-text-main">{m.name}</div>
                      <div className="text-xs text-text-muted font-mono">
                        {m.id}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-text-muted">
                      {m.providerName}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {m.free ? (
                        <span className="text-green-600 dark:text-green-400">
                          Free
                        </span>
                      ) : (
                        formatCost(m.inputCost)
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {m.free ? (
                        <span className="text-green-600 dark:text-green-400">
                          Free
                        </span>
                      ) : (
                        formatCost(m.outputCost)
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-text-muted font-mono">
                      {formatContext(m.context)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {m.free && (
                        <span className="text-xs bg-green-500/10 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full font-semibold">
                          FREE
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-black/5 dark:border-white/5">
            <span className="text-sm text-text-muted">
              Page {page} of {totalPages} ({filtered.length} models)
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                icon="chevron_left"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              />
              <Button
                size="sm"
                variant="secondary"
                icon="chevron_right"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              />
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
