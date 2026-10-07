"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button, Input } from "@namat/ui";
import type { NamatPackage } from "@namat/shared";
import { AdminShell } from "@/components/AdminShell";
import { AdminApiError, adminApi } from "@/lib/api";
import { getAdminToken } from "@/lib/session";
import { Tx, tr, useAdminLocale } from "@/lib/locale";

type Draft = {
  nameEn: string;
  nameAr: string;
  priceMajor: string;
  maxDevices: string;
  durationDays: string;
  sortOrder: string;
};

function majorFromMinor(minor: number): string {
  return (minor / 100).toFixed(2).replace(/\.00$/, "");
}

function minorFromMajor(major: string): number | null {
  const n = Number(major);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export default function PackagesPage() {
  const [locale] = useAdminLocale();
  const [items, setItems] = useState<NamatPackage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [priceMajor, setPriceMajor] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({
    nameEn: "",
    nameAr: "",
    priceMajor: "",
    maxDevices: "1",
    durationDays: "",
    sortOrder: "0",
  });

  async function load() {
    const token = getAdminToken();
    if (!token) return;
    try {
      setItems(await adminApi.packages(token));
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
    const priceMinor = minorFromMajor(priceMajor);
    if (priceMinor === null || priceMinor < 100) {
      setError(tr(locale, "Enter a valid price.", "أدخل سعرًا صحيحًا."));
      return;
    }
    try {
      await adminApi.createPackage(token, {
        code: code.trim(),
        nameEn: nameEn.trim(),
        nameAr: nameAr.trim(),
        priceMinor,
      });
      setCode("");
      setNameEn("");
      setNameAr("");
      setPriceMajor("");
      setNotice(tr(locale, "Package created (draft).", "تم إنشاء الباقة (مسودة)."));
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Create failed");
    }
  }

  function startEdit(p: NamatPackage) {
    setEditing(p.id);
    setDraft({
      nameEn: p.nameEn,
      nameAr: p.nameAr,
      priceMajor: majorFromMinor(p.priceMinor),
      maxDevices: String(p.maxDevices),
      durationDays: p.durationDays == null ? "" : String(p.durationDays),
      sortOrder: String(p.sortOrder ?? 0),
    });
  }

  async function saveEdit(id: string) {
    const token = getAdminToken();
    if (!token) return;
    const priceMinor = minorFromMajor(draft.priceMajor);
    if (priceMinor === null || priceMinor < 100) {
      setError(tr(locale, "Enter a valid price.", "أدخل سعرًا صحيحًا."));
      return;
    }
    const maxDevices = Number(draft.maxDevices);
    const durationRaw = draft.durationDays.trim();
    const durationDays = durationRaw === "" ? null : Number(durationRaw);
    const sortOrder = Number(draft.sortOrder);
    try {
      await adminApi.updatePackage(token, id, {
        nameEn: draft.nameEn.trim(),
        nameAr: draft.nameAr.trim(),
        priceMinor,
        maxDevices: Number.isFinite(maxDevices) && maxDevices > 0 ? maxDevices : 1,
        durationDays:
          durationDays === null ? null : Number.isFinite(durationDays) ? durationDays : null,
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
      });
      setEditing(null);
      setNotice(tr(locale, "Saved.", "تم الحفظ."));
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Save failed");
    }
  }

  async function togglePublished(p: NamatPackage) {
    const token = getAdminToken();
    if (!token) return;
    try {
      await adminApi.updatePackage(token, p.id, { isPublished: !p.isPublished });
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Update failed");
    }
  }

  return (
    <AdminShell title="Packages & pricing">
      {error ? <div className="banner danger">{error}</div> : null}
      {notice ? <div className="banner">{notice}</div> : null}
      <div className="panel" style={{ marginBottom: "1rem" }}>
        <form className="form-row two" onSubmit={create}>
          <Input
            label={tr(locale, "Code (unique)", "الرمز (فريد)")}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="namat-lifetime"
            required
          />
          <Input label={tr(locale, "English name", "الاسم الإنجليزي")} value={nameEn} onChange={(e) => setNameEn(e.target.value)} required />
          <Input label={tr(locale, "Arabic name", "الاسم العربي")} value={nameAr} onChange={(e) => setNameAr(e.target.value)} required />
          <Input
            label={tr(locale, "Price (SAR)", "السعر (ريال)")}
            value={priceMajor}
            inputMode="decimal"
            onChange={(e) => setPriceMajor(e.target.value)}
            required
          />
          <div>
            <Button type="submit"><Tx en="Add package" ar="إضافة باقة" /></Button>
          </div>
        </form>
      </div>
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th><Tx en="Code" ar="الرمز" /></th>
              <th><Tx en="English" ar="الإنجليزية" /></th>
              <th><Tx en="Arabic" ar="العربية" /></th>
              <th><Tx en="Price (SAR)" ar="السعر (ريال)" /></th>
              <th><Tx en="Devices" ar="الأجهزة" /></th>
              <th><Tx en="Days" ar="الأيام" /></th>
              <th><Tx en="Order" ar="الترتيب" /></th>
              <th><Tx en="Published" ar="منشور" /></th>
              <th><Tx en="Actions" ar="إجراءات" /></th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) =>
              editing === p.id ? (
                <tr key={p.id}>
                  <td>{p.code}</td>
                  <td><input value={draft.nameEn} onChange={(e) => setDraft({ ...draft, nameEn: e.target.value })} /></td>
                  <td><input value={draft.nameAr} onChange={(e) => setDraft({ ...draft, nameAr: e.target.value })} /></td>
                  <td><input value={draft.priceMajor} inputMode="decimal" style={{ width: "5rem" }} onChange={(e) => setDraft({ ...draft, priceMajor: e.target.value })} /></td>
                  <td><input value={draft.maxDevices} inputMode="numeric" style={{ width: "3.5rem" }} onChange={(e) => setDraft({ ...draft, maxDevices: e.target.value })} /></td>
                  <td><input value={draft.durationDays} inputMode="numeric" style={{ width: "4rem" }} placeholder={tr(locale, "lifetime", "دائم")} onChange={(e) => setDraft({ ...draft, durationDays: e.target.value })} /></td>
                  <td><input value={draft.sortOrder} inputMode="numeric" style={{ width: "3.5rem" }} onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value })} /></td>
                  <td>{p.isPublished ? tr(locale, "yes", "نعم") : tr(locale, "no", "لا")}</td>
                  <td className="actions">
                    <Button size="sm" onClick={() => void saveEdit(p.id)}><Tx en="Save" ar="حفظ" /></Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditing(null)}><Tx en="Cancel" ar="إلغاء" /></Button>
                  </td>
                </tr>
              ) : (
                <tr key={p.id}>
                  <td>{p.code}</td>
                  <td>{p.nameEn}</td>
                  <td>{p.nameAr}</td>
                  <td>{majorFromMinor(p.priceMinor)} {p.currency}</td>
                  <td>{p.maxDevices}</td>
                  <td>{p.durationDays == null ? <Tx en="lifetime" ar="دائم" /> : p.durationDays}</td>
                  <td>{p.sortOrder}</td>
                  <td>{p.isPublished ? tr(locale, "yes", "نعم") : tr(locale, "no", "لا")}</td>
                  <td className="actions">
                    <Button size="sm" variant="secondary" onClick={() => startEdit(p)}><Tx en="Edit" ar="تعديل" /></Button>
                    <Button size="sm" variant="secondary" onClick={() => void togglePublished(p)}>
                      {p.isPublished ? <Tx en="Unpublish" ar="إلغاء النشر" /> : <Tx en="Publish" ar="نشر" />}
                    </Button>
                  </td>
                </tr>
              ),
            )}
            {items.length === 0 ? (
              <tr>
                <td colSpan={9} className="muted"><Tx en="No packages yet." ar="لا توجد باقات بعد." /></td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
