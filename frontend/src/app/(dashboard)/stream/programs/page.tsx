"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/components/use-api";

interface Program {
  id: number;
  name: string;
  overlay_path: string;
  description: string;
}

export default function ProgramsPage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", overlayPath: "/default", description: "" });

  const load = useCallback(async () => {
    const data = await apiFetch<{ programs: Program[] }>("/programs");
    setPrograms(data.programs);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openAdd = () => {
    setEditingId(null);
    setForm({ name: "", overlayPath: "/default", description: "" });
    setShowModal(true);
  };

  const openEdit = (p: Program) => {
    setEditingId(p.id);
    setForm({ name: p.name, overlayPath: p.overlay_path, description: p.description });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name) return;
    if (editingId) {
      await apiFetch(`/programs/${editingId}`, { method: "PUT", body: JSON.stringify(form) });
    } else {
      await apiFetch("/programs", { method: "POST", body: JSON.stringify(form) });
    }
    setShowModal(false);
    await load();
  };

  const handleDelete = async (id: number) => {
    await apiFetch(`/programs/${id}`, { method: "DELETE" });
    await load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Programs</h2>
        <button
          onClick={openAdd}
          className="px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded text-sm hover:bg-neutral-700 transition"
        >
          + Add
        </button>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-800 text-neutral-400">
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-left px-4 py-3 font-medium">Overlay Path</th>
              <th className="text-left px-4 py-3 font-medium">Description</th>
              <th className="w-24 px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {programs.map((p) => (
              <tr key={p.id} className="border-b border-neutral-800/50 hover:bg-neutral-800/30">
                <td className="px-4 py-3 font-mono text-white">{p.name}</td>
                <td className="px-4 py-3 text-neutral-400 font-mono">{p.overlay_path}</td>
                <td className="px-4 py-3 text-neutral-400">{p.description}</td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button onClick={() => openEdit(p)} className="text-neutral-500 hover:text-white">Edit</button>
                  <button onClick={() => handleDelete(p.id)} className="text-neutral-500 hover:text-red-400">Del</button>
                </td>
              </tr>
            ))}
            {programs.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-neutral-500">No programs</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 w-96 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">{editingId ? "Edit Program" : "Add Program"}</h3>

            <div>
              <label className="block text-xs text-neutral-400 mb-1">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. chat:golden"
                className="w-full px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded text-sm"
              />
            </div>

            <div>
              <label className="block text-xs text-neutral-400 mb-1">Overlay Path</label>
              <input
                type="text"
                value={form.overlayPath}
                onChange={(e) => setForm({ ...form, overlayPath: e.target.value })}
                placeholder="e.g. /default"
                className="w-full px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded text-sm"
              />
            </div>

            <div>
              <label className="block text-xs text-neutral-400 mb-1">Description</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="e.g. Golden time chat"
                className="w-full px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded text-sm"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSave}
                className="flex-1 py-2 bg-white text-black rounded font-medium text-sm hover:bg-neutral-200 transition"
              >
                {editingId ? "Update" : "Create"}
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2 bg-neutral-800 border border-neutral-700 rounded text-sm hover:bg-neutral-700 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
