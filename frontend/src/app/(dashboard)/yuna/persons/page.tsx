"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/components/use-api";
import { modal } from "@/components/modal";
import {
  AdminTable,
  type AdminColumn,
  type SortDir,
} from "@/components/admin-table";
import { Field, Select } from "@/components/ui";

const PAGE_SIZE = 50;

interface Person {
  id: string;
  primary_name: string;
  nickname: string | null;
  my_nickname: string | null;
  type: string;
  note: string;
  interaction_count: number;
  familiarity: number;
  sentiment: number;
  trust: number;
  gratitude: number;
  donation_total: number;
  relationship_level: number;
  first_seen_at: string;
  last_seen_at: string;
}

interface Identity {
  platform: string;
  platform_user_id: string;
  display_name: string | null;
  verified: boolean;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "2-digit", month: "2-digit", day: "2-digit",
  });
}

function fmtFullDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export default function PersonsPage() {
  const [rows, setRows] = useState<Person[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<string>("last_seen_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({
      page: String(page), limit: String(PAGE_SIZE), sort: sortKey, order: sortDir,
    });
    try {
      const data = await apiFetch<{ persons: Person[]; total: number }>(`/persons?${qs}`);
      setRows(data.persons);
      setTotal(data.total);
    } catch { setRows([]); setTotal(0); }
    finally { setLoading(false); }
  }, [page, sortKey, sortDir]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [sortKey, sortDir]);

  const openEdit = async (p: Person) => {
    let identities: Identity[] = [];
    try {
      const d = await apiFetch<{ person: Person; identities: Identity[] }>(`/persons/${p.id}`);
      identities = d.identities;
    } catch { /* ignore */ }
    modal.open({
      title: `Person ${p.primary_name}`,
      size: "lg",
      content: (
        <PersonForm
          initial={p}
          identities={identities}
          onSaved={() => { modal.close(); void load(); }}
        />
      ),
    });
  };

  const columns: AdminColumn<Person>[] = [
    {
      key: "primary_name", label: "Name", sortable: true,
      cellClass: "text-text",
      render: (p) => (
        <div>
          <div>{p.primary_name}</div>
          {p.nickname && <div className="text-[10px] text-text-faint">({p.nickname})</div>}
        </div>
      ),
    },
    {
      key: "type", label: "Type", width: "w-20", sortable: true,
      cellClass: "text-text-soft text-xs font-mono",
      render: (p) => p.type,
    },
    {
      key: "relationship_level", label: "Lv", width: "w-12", sortable: true,
      cellClass: "text-text-muted tabular-nums",
      render: (p) => p.relationship_level,
    },
    {
      key: "interaction_count", label: "Int", width: "w-14", sortable: true,
      cellClass: "text-text-muted tabular-nums",
      render: (p) => p.interaction_count,
    },
    {
      key: "familiarity", label: "Fam", width: "w-14", sortable: true,
      cellClass: "text-text-muted tabular-nums",
      render: (p) => p.familiarity.toFixed(2),
    },
    {
      key: "trust", label: "Trust", width: "w-14", sortable: true,
      cellClass: "text-text-muted tabular-nums",
      render: (p) => p.trust.toFixed(2),
    },
    {
      key: "sentiment", label: "Sent", width: "w-14", sortable: true,
      cellClass: "text-text-muted tabular-nums",
      render: (p) => p.sentiment.toFixed(2),
    },
    {
      key: "donation_total", label: "Donated", width: "w-20", sortable: true,
      cellClass: "text-text-muted tabular-nums",
      render: (p) => `$${p.donation_total.toFixed(0)}`,
    },
    {
      key: "last_seen_at", label: "Last seen", width: "w-24", sortable: true,
      cellClass: "text-text-faint tabular-nums",
      render: (p) => fmtDate(p.last_seen_at),
    },
  ];

  return (
    <div className="h-full flex flex-col gap-4">
      <header className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xl font-semibold">Persons</h2>
          <p className="text-xs text-text-muted mt-0.5">
            persons — Yuna が認識してる人物
          </p>
        </div>
      </header>

      <AdminTable<Person>
        columns={columns}
        rows={rows}
        rowKey={(p) => p.id}
        loading={loading}
        emptyLabel={loading ? "Loading…" : "No persons"}
        sort={{ key: sortKey, dir: sortDir }}
        onSortChange={(k, d) => { setSortKey(k); setSortDir(d); }}
        sortDescDefaults={["interaction_count", "familiarity", "trust", "sentiment", "donation_total", "last_seen_at", "first_seen_at", "relationship_level"]}
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
        onRowClick={openEdit}
      />
    </div>
  );
}

function PersonForm({
  initial,
  identities,
  onSaved,
}: {
  initial: Person;
  identities: Identity[];
  onSaved: () => void;
}) {
  const [primaryName, setPrimaryName] = useState(initial.primary_name);
  const [nickname, setNickname] = useState(initial.nickname ?? "");
  const [myNickname, setMyNickname] = useState(initial.my_nickname ?? "");
  const [note, setNote] = useState(initial.note ?? "");
  const [type, setType] = useState(initial.type);
  const [relationshipLevel, setRelationshipLevel] = useState(initial.relationship_level);
  const [trust, setTrust] = useState(initial.trust);
  const [gratitude, setGratitude] = useState(initial.gratitude);
  const [sentiment, setSentiment] = useState(initial.sentiment);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await apiFetch(`/persons/${initial.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          primary_name: primaryName,
          nickname: nickname || null,
          my_nickname: myNickname || null,
          note,
          type,
          relationship_level: relationshipLevel,
          trust,
          gratitude,
          sentiment,
        }),
      });
      onSaved();
    } catch { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 p-3 bg-panel-2 rounded-md">
        <KV label="ID" value={initial.id} />
        <KV label="Interactions" value={String(initial.interaction_count)} />
        <KV label="Familiarity" value={initial.familiarity.toFixed(3)} />
        <KV label="Donation total" value={`$${initial.donation_total.toFixed(2)}`} />
        <KV label="First seen" value={fmtFullDate(initial.first_seen_at)} />
        <KV label="Last seen" value={fmtFullDate(initial.last_seen_at)} />
      </div>

      {identities.length > 0 && (
        <div>
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Identities</div>
          <div className="space-y-1">
            {identities.map((i, idx) => (
              <div key={idx} className="text-xs text-text-muted font-mono bg-panel-2 p-2 rounded-md break-all">
                <span className="text-text">{i.platform}</span> · {i.platform_user_id}
                {i.display_name && <span className="text-text-faint"> · {i.display_name}</span>}
                {i.verified && <span className="text-accent"> ✓</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Primary name">
          <input type="text" value={primaryName} onChange={(e) => setPrimaryName(e.target.value)}
            className="w-full px-3 py-2 bg-panel-2 border border-border rounded-md text-sm focus:outline-none focus:border-accent" />
        </Field>
        <Field label="Type">
          <Select
            value={type}
            onChange={(v) => setType(v)}
            options={[
              { value: "user", label: "user" },
              { value: "admin", label: "admin" },
              { value: "bot", label: "bot" },
              { value: "other", label: "other" },
            ]}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nickname (theirs)">
          <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)}
            className="w-full px-3 py-2 bg-panel-2 border border-border rounded-md text-sm focus:outline-none focus:border-accent" />
        </Field>
        <Field label="My nickname (what Yuna calls them)">
          <input type="text" value={myNickname} onChange={(e) => setMyNickname(e.target.value)}
            className="w-full px-3 py-2 bg-panel-2 border border-border rounded-md text-sm focus:outline-none focus:border-accent" />
        </Field>
      </div>
      <Field label="Note">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
          className="w-full px-3 py-2 bg-panel-2 border border-border rounded-md text-sm focus:outline-none focus:border-accent resize-none" />
      </Field>
      <Field label={`Relationship level: ${relationshipLevel}`}>
        <input type="number" min={0} max={10} step={1} value={relationshipLevel}
          onChange={(e) => setRelationshipLevel(Math.max(0, Math.min(10, Number(e.target.value) | 0)))}
          className="w-full px-3 py-2 bg-panel-2 border border-border rounded-md text-sm focus:outline-none focus:border-accent" />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label={`Trust: ${trust.toFixed(2)}`}>
          <input type="range" min={-1} max={1} step={0.01} value={trust}
            onChange={(e) => setTrust(Number(e.target.value))} className="w-full" />
        </Field>
        <Field label={`Gratitude: ${gratitude.toFixed(2)}`}>
          <input type="range" min={-1} max={1} step={0.01} value={gratitude}
            onChange={(e) => setGratitude(Number(e.target.value))} className="w-full" />
        </Field>
        <Field label={`Sentiment: ${sentiment.toFixed(2)}`}>
          <input type="range" min={-1} max={1} step={0.01} value={sentiment}
            onChange={(e) => setSentiment(Number(e.target.value))} className="w-full" />
        </Field>
      </div>

      <div className="flex items-center gap-3 pt-2 border-t border-border -mx-6 px-6 -mb-2 pb-4">
        <div className="flex-1" />
        <button onClick={() => modal.close()}
          className="px-4 py-2 text-sm text-text-muted hover:text-text transition">Cancel</button>
        <button onClick={save} disabled={busy}
          className="px-4 py-2 text-sm bg-accent text-bg rounded-md font-medium hover:bg-accent-hover transition disabled:opacity-50">
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-text-muted uppercase tracking-wider">{label}</div>
      <div className="text-xs text-text font-mono break-all">{value}</div>
    </div>
  );
}
