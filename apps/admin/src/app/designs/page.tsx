"use client";

import { FormEvent, Fragment, useEffect, useState } from "react";
import { Button, Input } from "@namat/ui";
import type { Skin } from "@namat/shared";
import { AdminShell } from "@/components/AdminShell";
import { AdminApiError, adminApi } from "@/lib/api";
import { getAdminToken } from "@/lib/session";
import { Tx } from "@/lib/locale";

type VersionRow = {
  id: string;
  version: number;
  contentHash: string;
  artworkPath?: string | null;
  createdAt: string;
};

export default function DesignsPage() {
  const [skins, setSkins] = useState<Skin[]>([]);
  const [versions, setVersions] = useState<Record<string, VersionRow[]>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  async function load() {
    const token = getAdminToken();
    if (!token) return;
    try {
      setSkins(await adminApi.skins(token));
      setError(null);
      if (openId) await loadVersions(openId);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Failed to load skins");
    }
  }

  async function loadVersions(skinId: string) {
    const token = getAdminToken();
    if (!token) return;
    const rows = await adminApi.skinVersions(token, skinId);
    setVersions((current) => ({ ...current, [skinId]: rows }));
  }

  useEffect(() => {
    void load();
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    const token = getAdminToken();
    if (!token) return;
    try {
      await adminApi.createSkin(token, { name, slug });
      setName("");
      setSlug("");
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Create failed");
    }
  }

  async function upload(id: string, file: File | undefined) {
    const token = getAdminToken();
    if (!token || !file) return;
    try {
      await adminApi.uploadArtwork(token, id, file);
      await load();
      await loadVersions(id);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Upload failed");
    }
  }

  async function publish(id: string, next: boolean) {
    const token = getAdminToken();
    if (!token) return;
    try {
      if (next) await adminApi.publishSkin(token, id);
      else await adminApi.unpublishSkin(token, id);
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Update failed");
    }
  }

  async function toggleHistory(id: string) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    try {
      await loadVersions(id);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "History failed");
    }
  }

  async function rollback(skinId: string, version: number) {
    const token = getAdminToken();
    if (!token) return;
    if (!window.confirm(`Roll this skin back to version ${version}? A new version row will point at that artwork.`)) {
      return;
    }
    try {
      await adminApi.rollbackSkin(token, skinId, version);
      await load();
      await loadVersions(skinId);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Rollback failed");
    }
  }

  return (
    <AdminShell title="Designs / skins">
      {error ? <div className="banner danger">{error}</div> : null}
      <div className="panel" style={{ marginBottom: "1rem" }}>
        <form className="form-row two" onSubmit={create}>
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input label="Slug" value={slug} onChange={(e) => setSlug(e.target.value)} required />
          <div style={{ gridColumn: "1 / -1" }}>
            <Button type="submit"><Tx en="Create draft" ar="إنشاء مسودة" /></Button>
          </div>
        </form>
      </div>
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th><Tx en="Preview" ar="معاينة" /></th>
              <th><Tx en="Name" ar="الاسم" /></th>
              <th><Tx en="Status" ar="الحالة" /></th>
              <th><Tx en="Order" ar="الترتيب" /></th>
              <th><Tx en="Version" ar="الإصدار" /></th>
              <th><Tx en="Hash" ar="البصمة" /></th>
              <th />
            </tr>
          </thead>
          <tbody>
            {skins.map((s) => (
              <Fragment key={s.id}>
                <tr>
                  <td>
                    {s.artworkPath ? (
                      <img
                        src={`/uploads/${s.artworkPath}`}
                        alt=""
                        width={96}
                        height={60}
                        style={{ objectFit: "cover", borderRadius: 8 }}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {s.name}
                    <div className="muted">{s.slug}</div>
                  </td>
                  <td>{s.status}</td>
                  <td>
                    <input
                      aria-label={`Order for ${s.name}`}
                      defaultValue={s.sortOrder}
                      inputMode="numeric"
                      style={{ width: "4rem" }}
                      onBlur={(event) => {
                        const next = Number(event.target.value);
                        if (!Number.isFinite(next) || next === s.sortOrder) return;
                        const token = getAdminToken();
                        if (!token) return;
                        void adminApi.updateSkin(token, s.id, { sortOrder: next }).then(load).catch((err) => {
                          setError(err instanceof AdminApiError ? err.message : "Order update failed");
                        });
                      }}
                    />
                  </td>
                  <td>{s.currentVersion}</td>
                  <td className="muted">{s.contentHash ? s.contentHash.slice(0, 12) : "—"}</td>
                  <td className="actions">
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      aria-label={`Upload artwork for ${s.name}`}
                      onChange={(e) => void upload(s.id, e.target.files?.[0])}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        const next = window.prompt("Design name", s.name);
                        if (!next || !next.trim()) return;
                        const token = getAdminToken();
                        if (!token) return;
                        void adminApi.updateSkin(token, s.id, { name: next.trim() }).then(load).catch((err) => {
                          setError(err instanceof AdminApiError ? err.message : "Rename failed");
                        });
                      }}
                    >
                      Edit
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => void toggleHistory(s.id)}>
                      {openId === s.id ? "Hide history" : "History"}
                    </Button>
                    {s.status === "published" ? (
                      <Button size="sm" variant="secondary" onClick={() => void publish(s.id, false)}>
                        Unpublish
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => void publish(s.id, true)}>
                        Publish
                      </Button>
                    )}
                  </td>
                </tr>
                {openId === s.id ? (
                  <tr key={`${s.id}-history`}>
                    <td colSpan={7}>
                      <ul>
                        {(versions[s.id] ?? []).map((v) => (
                          <li key={v.id}>
                            v{v.version} · {v.contentHash} · {v.createdAt}
                            {v.artworkPath ? (
                              <img
                                src={`/uploads/${v.artworkPath}`}
                                alt=""
                                width={64}
                                height={40}
                                style={{ objectFit: "cover", marginLeft: 8 }}
                              />
                            ) : null}
                            <Button size="sm" variant="secondary" onClick={() => void rollback(s.id, v.version)}>
                              Roll back to this version
                            </Button>
                          </li>
                        ))}
                        {(versions[s.id] ?? []).length === 0 ? <li>No versions yet.</li> : null}
                      </ul>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
            {skins.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted">
                  No skins yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
