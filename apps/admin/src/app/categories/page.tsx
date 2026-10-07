"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button, Input } from "@namat/ui";
import type { Category } from "@namat/shared";
import { AdminShell } from "@/components/AdminShell";
import { AdminApiError, adminApi } from "@/lib/api";
import { getAdminToken } from "@/lib/session";
import { Tx, tr, useAdminLocale } from "@/lib/locale";

type Draft = { name: string; nameAr: string; slug: string; sortOrder: string };

export default function CategoriesPage() {
  const [locale] = useAdminLocale();
  const [items, setItems] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ name: "", nameAr: "", slug: "", sortOrder: "0" });

  async function load() {
    const token = getAdminToken();
    if (!token) return;
    try {
      setItems(await adminApi.categories(token));
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
      await adminApi.createCategory(token, { name, slug, nameAr: nameAr || undefined });
      setName("");
      setSlug("");
      setNameAr("");
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Create failed");
    }
  }

  function startEdit(c: Category) {
    setEditing(c.id);
    setDraft({
      name: c.name,
      nameAr: c.nameAr ?? "",
      slug: c.slug,
      sortOrder: String(c.sortOrder ?? 0),
    });
  }

  async function saveEdit(id: string) {
    const token = getAdminToken();
    if (!token) return;
    const sortOrder = Number(draft.sortOrder);
    try {
      await adminApi.updateCategory(token, id, {
        name: draft.name.trim(),
        nameAr: draft.nameAr.trim(),
        slug: draft.slug.trim(),
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
      });
      setEditing(null);
      setNotice(tr(locale, "Saved.", "تم الحفظ."));
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Save failed");
    }
  }

  async function toggleActive(c: Category) {
    const token = getAdminToken();
    if (!token) return;
    try {
      await adminApi.updateCategory(token, c.id, { isActive: !c.isActive });
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Update failed");
    }
  }

  async function remove(c: Category) {
    const token = getAdminToken();
    if (!token) return;
    if (!window.confirm(tr(locale, `Delete category "${c.name}"?`, `حذف التصنيف "${c.name}"؟`))) return;
    try {
      await adminApi.deleteCategory(token, c.id);
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Delete failed");
    }
  }

  return (
    <AdminShell title="Categories">
      {error ? <div className="banner danger">{error}</div> : null}
      {notice ? <div className="banner">{notice}</div> : null}
      <div className="panel" style={{ marginBottom: "1rem" }}>
        <form className="form-row two" onSubmit={create}>
          <Input label={tr(locale, "Name", "الاسم")} value={name} onChange={(e) => setName(e.target.value)} required />
          <Input label={tr(locale, "Slug", "المسار")} value={slug} onChange={(e) => setSlug(e.target.value)} required />
          <Input label={tr(locale, "Arabic name", "الاسم العربي")} value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
          <div>
            <Button type="submit"><Tx en="Add category" ar="إضافة تصنيف" /></Button>
          </div>
        </form>
      </div>
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th><Tx en="Name" ar="الاسم" /></th>
              <th><Tx en="Arabic" ar="العربية" /></th>
              <th><Tx en="Slug" ar="المسار" /></th>
              <th><Tx en="Order" ar="الترتيب" /></th>
              <th><Tx en="Active" ar="نشط" /></th>
              <th><Tx en="Actions" ar="إجراءات" /></th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) =>
              editing === c.id ? (
                <tr key={c.id}>
                  <td><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></td>
                  <td><input value={draft.nameAr} onChange={(e) => setDraft({ ...draft, nameAr: e.target.value })} /></td>
                  <td><input value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} /></td>
                  <td><input value={draft.sortOrder} inputMode="numeric" style={{ width: "4rem" }} onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value })} /></td>
                  <td>{c.isActive ? tr(locale, "yes", "نعم") : tr(locale, "no", "لا")}</td>
                  <td className="actions">
                    <Button size="sm" onClick={() => void saveEdit(c.id)}><Tx en="Save" ar="حفظ" /></Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditing(null)}><Tx en="Cancel" ar="إلغاء" /></Button>
                  </td>
                </tr>
              ) : (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.nameAr ?? "—"}</td>
                  <td>{c.slug}</td>
                  <td>{c.sortOrder}</td>
                  <td>{c.isActive ? tr(locale, "yes", "نعم") : tr(locale, "no", "لا")}</td>
                  <td className="actions">
                    <Button size="sm" variant="secondary" onClick={() => startEdit(c)}><Tx en="Edit" ar="تعديل" /></Button>
                    <Button size="sm" variant="secondary" onClick={() => void toggleActive(c)}>
                      {c.isActive ? <Tx en="Deactivate" ar="تعطيل" /> : <Tx en="Activate" ar="تفعيل" />}
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => void remove(c)}><Tx en="Delete" ar="حذف" /></Button>
                  </td>
                </tr>
              ),
            )}
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted"><Tx en="No categories." ar="لا توجد تصنيفات." /></td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
