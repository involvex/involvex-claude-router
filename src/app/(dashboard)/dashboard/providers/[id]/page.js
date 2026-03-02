"use client";

import { APIKEY_PROVIDERS, OAUTH_PROVIDERS } from "@/shared/constants/config";
import { Card, Badge, Button, Modal, Toggle } from "@/shared/components";
import { useNotificationStore } from "@/store/notificationStore";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import { getRelativeTime } from "@/shared/utils";
import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

function ConnectionRow({ conn, onToggle, onDelete }) {
  const [deleting, setDeleting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const statusVariant =
    conn.testStatus === "connected"
      ? "success"
      : conn.testStatus === "error"
        ? "error"
        : "default";

  return (
    <>
      <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{conn.name}</p>
            {conn.lastError && (
              <p className="text-xs text-error truncate mt-0.5">
                {conn.lastError}
              </p>
            )}
            {conn.lastErrorAt && !conn.lastError && (
              <p className="text-xs text-text-muted mt-0.5">
                Last checked {getRelativeTime(conn.lastErrorAt)}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Badge
            variant={statusVariant}
            size="sm"
            dot
          >
            {conn.testStatus || "unknown"}
          </Badge>
          <Toggle
            checked={conn.isActive}
            onChange={() => onToggle(conn.id, !conn.isActive)}
            size="sm"
          />
          <button
            onClick={() => setShowDelete(true)}
            className="text-text-muted hover:text-error transition-colors"
            title="Delete connection"
          >
            <span className="material-symbols-outlined text-base">delete</span>
          </button>
        </div>
      </div>

      <Modal
        isOpen={showDelete}
        onClose={() => setShowDelete(false)}
        title="Delete Connection"
        size="sm"
      >
        <p className="text-sm text-text-muted mb-4">
          Are you sure you want to delete <strong>{conn.name}</strong>? This
          cannot be undone.
        </p>
        <div className="flex gap-2 justify-end">
          <Button
            variant="ghost"
            onClick={() => setShowDelete(false)}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={deleting}
            onClick={async () => {
              setDeleting(true);
              await onDelete(conn.id);
              setShowDelete(false);
              setDeleting(false);
            }}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </>
  );
}

export default function ProviderDetailPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const { addNotification } = useNotificationStore();
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);

  const providerInfo =
    AI_PROVIDERS[id] ?? APIKEY_PROVIDERS[id] ?? OAUTH_PROVIDERS?.[id] ?? null;

  useEffect(() => {
    fetchConnections();
  }, [id]);

  async function fetchConnections() {
    setLoading(true);
    try {
      const res = await fetch("/api/providers");
      const data = await res.json();
      const filtered = (data.connections ?? []).filter(c => c.provider === id);
      setConnections(filtered);
    } catch {
      addNotification({ type: "error", message: "Failed to load connections" });
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(connId, isActive) {
    try {
      const res = await fetch(`/api/providers/${connId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (res.ok) {
        setConnections(prev =>
          prev.map(c => (c.id === connId ? { ...c, isActive } : c)),
        );
      } else {
        addNotification({
          type: "error",
          message: "Failed to update connection",
        });
      }
    } catch {
      addNotification({
        type: "error",
        message: "Failed to update connection",
      });
    }
  }

  async function handleDelete(connId) {
    try {
      const res = await fetch(`/api/providers/${connId}`, { method: "DELETE" });
      if (res.ok) {
        setConnections(prev => prev.filter(c => c.id !== connId));
        addNotification({ type: "success", message: "Connection deleted" });
      } else {
        addNotification({
          type: "error",
          message: "Failed to delete connection",
        });
      }
    } catch {
      addNotification({
        type: "error",
        message: "Failed to delete connection",
      });
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/dashboard/providers"
          className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-primary transition-colors mb-4"
        >
          <span className="material-symbols-outlined text-lg">arrow_back</span>
          Back to Providers
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight capitalize">
              {providerInfo?.name ?? id}
            </h1>
            <p className="text-text-muted mt-1">
              {connections.length} connection
              {connections.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Link href={`/dashboard/providers/new?provider=${id}`}>
            <Button icon="add">Add Connection</Button>
          </Link>
        </div>
      </div>

      {/* Connections List */}
      <Card>
        <Card.Section>
          <h2 className="font-semibold mb-1">Connections</h2>
          <p className="text-sm text-text-muted">
            API keys and accounts configured for this provider.
          </p>
        </Card.Section>

        {loading ? (
          <Card.Section>
            <div className="space-y-3">
              {[1, 2].map(i => (
                <div
                  key={i}
                  className="h-12 rounded-lg bg-muted animate-pulse"
                />
              ))}
            </div>
          </Card.Section>
        ) : connections.length === 0 ? (
          <Card.Section>
            <div className="text-center py-8">
              <span className="material-symbols-outlined text-4xl text-text-muted mb-3 block">
                key_off
              </span>
              <p className="text-text-muted text-sm">No connections yet.</p>
              <Link
                href={`/dashboard/providers/new?provider=${id}`}
                className="mt-3 inline-block"
              >
                <Button
                  size="sm"
                  icon="add"
                >
                  Add First Connection
                </Button>
              </Link>
            </div>
          </Card.Section>
        ) : (
          <Card.Section>
            {connections.map(conn => (
              <ConnectionRow
                key={conn.id}
                conn={conn}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ))}
          </Card.Section>
        )}
      </Card>
    </div>
  );
}
