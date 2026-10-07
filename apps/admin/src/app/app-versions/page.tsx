"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button, Input } from "@namat/ui";
import type { AppVersion } from "@namat/shared";
import { AdminShell } from "@/components/AdminShell";
import { AdminApiError, adminApi } from "@/lib/api";
import { getAdminToken } from "@/lib/session";
import { Tx } from "@/lib/locale";

export default function AppVersionsPage() {
  const [versions, setVersions] = useState<AppVersion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [isMandatory, setIsMandatory] = useState(false);

  async function load() {
    const token = getAdminToken();
    if (!token) return;
    try {
      setVersions(await adminApi.appVersions(token));
      setError(null);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Load failed");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    const token = getAdminToken();
    if (!token) return;
    try {
      await adminApi.createAppVersion(token, {
        version,
        downloadUrl: downloadUrl || null,
        releaseNotes: notes || null,
        isActive,
        isMandatory,
      });
      setVersion("");
      setDownloadUrl("");
      setNotes("");
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Create failed");
    }
  }

  async function upload(id: string, file: File | undefined) {
    const token = getAdminToken();
    if (!token || !file) return;
    try {
      await adminApi.uploadIpa(token, id, file);
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "IPA upload failed");
    }
  }

  async function flags(row: AppVersion, next: Partial<Pick<AppVersion, "isActive" | "isMandatory">>) {
    const token = getAdminToken();
    if (!token) return;
    try {
      await adminApi.setAppVersionFlags(token, row.id, next);
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Update failed");
    }
  }

  return (
    <AdminShell title="App versions">
      {error ? <div className="banner danger">{error}</div> : null}
      <div className="panel" style={{ marginBottom: "1rem" }}>
        <form className="form-row two" onSubmit={create}>
          <Input label="Version" value={version} onChange={(e) => setVersion(e.target.value)} required placeholder="1.0.0" />
          <Input label="Optional download URL" value={downloadUrl} onChange={(e) => setDownloadUrl(e.target.value)} />
          <Input label="Release notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <label>
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Active
          </label>
          <label>
            <input type="checkbox" checked={isMandatory} onChange={(e) => setIsMandatory(e.target.checked)} /> Mandatory
          </label>
          <div>
            <Button type="submit"><Tx en="Create version" ar="إنشاء إصدار" /></Button>
          </div>
        </form>
        <p className="muted">Uploading an IPA stores it and does not publish it. Customer download requires a separate publication after signature verification. A filename or signature file is not enough, and verification cannot be skipped.</p>
      </div>
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th><Tx en="Version" ar="الإصدار" /></th>
              <th><Tx en="Notes" ar="ملاحظات الإصدار" /></th>
              <th><Tx en="Checksum" ar="البصمة" /></th>
              <th><Tx en="Signature" ar="التوقيع" /></th>
              <th><Tx en="Download" ar="التنزيل" /></th>
              <th><Tx en="Controls" ar="التحكم" /></th>
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id}>
                <td>{v.version}</td>
                <td>{v.releaseNotes ?? "—"}</td>
                <td className="muted">{v.checksum ?? "—"}</td>
                <td>{v.published ? "published" : "unpublished"} · {v.signatureStatus ?? "unverified"}</td>
                <td>
                  {v.ipaPath ? "IPA stored" : "not uploaded"}
                  <div>
                    <input
                      type="file"
                      accept=".ipa,application/octet-stream"
                      aria-label={`Upload IPA for ${v.version}`}
                      onChange={(e) => void upload(v.id, e.target.files?.[0])}
                    />
                  </div>
                </td>
                <td className="actions">
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!window.confirm("Publish this release to customers after signature verification?")) return;
                      const token = getAdminToken();
                      if (!token) return;
                      void adminApi.publishRelease(token, v.id).then(load).catch((err) => {
                        setError(err instanceof AdminApiError ? err.message : "Publication blocked");
                      });
                    }}
                  >
                    Publish
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const token = getAdminToken();
                      if (!token) return;
                      void adminApi.unpublishRelease(token, v.id).then(load).catch((err) => {
                        setError(err instanceof AdminApiError ? err.message : "Unpublish failed");
                      });
                    }}
                  >
                    Unpublish
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => void flags(v, { isActive: !v.isActive })}>
                    {v.isActive ? "Deactivate" : "Activate"}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => void flags(v, { isMandatory: !v.isMandatory })}>
                    {v.isMandatory ? "Optional" : "Mandatory"}
                  </Button>
                </td>
              </tr>
            ))}
            {versions.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  No versions.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
