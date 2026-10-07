"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/AdminShell";
import {
  AdminApiError,
  adminApi,
  type AdminEnrollment,
  type AppleCapacity,
} from "@/lib/api";
import { getAdminToken } from "@/lib/session";
import { Button } from "@namat/ui";
import { Tx, tr, useAdminLocale } from "@/lib/locale";

type SignedBuild = Awaited<ReturnType<typeof adminApi.signedBuild>>;

export default function EnrollmentsPage() {
  const [locale] = useAdminLocale();
  const [rows, setRows] = useState<AdminEnrollment[]>([]);
  const [capacity, setCapacity] = useState<AppleCapacity | null>(null);
  const [build, setBuild] = useState<SignedBuild | null>(null);
  const [buildVisible, setBuildVisible] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const token = getAdminToken();
    if (!token) return;
    const [list, cap] = await Promise.all([
      adminApi.deviceEnrollments(token),
      adminApi.appleCapacity(token),
    ]);
    setRows(list);
    setCapacity(cap);
    // Owner-only: the build panel appears only when this endpoint is allowed.
    try {
      setBuild(await adminApi.signedBuild(token));
      setBuildVisible(true);
    } catch {
      setBuildVisible(false);
    }
  }

  useEffect(() => {
    void load().catch((err) =>
      setError(err instanceof AdminApiError ? err.message : "Load failed"),
    );
  }, []);

  async function downloadBuild() {
    const token = getAdminToken();
    if (!token) return;
    setDownloading(true);
    setError(null);
    try {
      const blob = await adminApi.downloadSignedBuild(token);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "NAMAT.ipa";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  }

  async function act(id: string, kind: "sign" | "profile" | "stop") {
    const token = getAdminToken();
    if (!token) return;
    setError(null);
    try {
      if (kind === "sign") await adminApi.retryEnrollmentSigning(token, id);
      if (kind === "profile") await adminApi.retryEnrollmentProvisioning(token, id);
      if (kind === "stop") await adminApi.deactivateEnrollment(token, id);
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Action failed");
    }
  }

  return (
    <AdminShell title="Installations">
      {error ? <div className="banner danger">{error}</div> : null}
      {buildVisible ? (
        <div className="panel" style={{ marginBottom: "1rem" }}>
          <h2>
            <Tx en="Signed app build" ar="نسخة التطبيق الموقّعة" />
          </h2>
          {build?.available ? (
            <>
              <p>
                <Tx en="Version" ar="الإصدار" />: {build.appVersion ?? "—"}
                {build.buildNumber ? ` (${build.buildNumber})` : ""}
                {build.sizeBytes ? ` · ${(build.sizeBytes / 1_000_000).toFixed(1)} MB` : ""}
                {build.createdAt ? ` · ${build.createdAt.slice(0, 10)}` : ""}
              </p>
              <p className="muted" style={{ wordBreak: "break-all" }}>
                SHA-256: {build.ipaSha256 ?? "—"}
              </p>
              <Button onClick={() => void downloadBuild()} disabled={downloading}>
                {downloading
                  ? tr(locale, "Downloading…", "جارٍ التنزيل…")
                  : tr(locale, "Download signed app (.ipa)", "تنزيل التطبيق الموقّع (.ipa)")}
              </Button>
              <p className="muted" style={{ marginTop: "0.6rem" }}>
                <Tx
                  en="Ad Hoc signing: this build installs only on iPhones whose UDID is in its provisioning profile. Use it to verify the signed build on a registered device."
                  ar="توقيع Ad Hoc: هذه النسخة تُثبَّت فقط على الآيفونات التي رقم UDID لها ضمن ملف التزويد. استخدمها للتحقق من النسخة الموقّعة على جهاز مسجّل."
                />
              </p>
            </>
          ) : (
            <p className="muted">
              <Tx
                en="No signed build yet. A build appears here after a customer signing job completes."
                ar="لا توجد نسخة موقّعة بعد. تظهر النسخة هنا بعد اكتمال مهمة توقيع."
              />
            </p>
          )}
        </div>
      ) : null}
      <div className="panel" style={{ marginBottom: "1rem" }}>
        <h2>
          <Tx en="Apple device capacity" ar="سعة أجهزة Apple" />
        </h2>
        <p>
          <Tx
            en="This is the Ad Hoc registration pool. It is separate from the two NAMAT installations included with a purchase."
            ar="هذه سعة تسجيل Ad Hoc. وهي منفصلة عن تثبيتي NAMAT المشمولين مع الشراء."
          />
        </p>
        <p>
          <Tx en="Strategy" ar="الطريقة" />: {capacity?.strategy ?? "—"}
        </p>
        <p>
          <Tx en="Registered iPhones" ar="أجهزة iPhone المسجلة" />:{" "}
          {capacity?.registeredIphoneCount ?? "—"} / {capacity?.limit ?? "—"}
        </p>
        <p>
          <Tx en="Remaining" ar="المتبقي" />: {capacity?.remaining ?? "—"}
        </p>
        <p>
          <Tx en="Pending" ar="قيد الانتظار" />: {capacity?.pendingRegistrations ?? 0}
          {" · "}
          <Tx en="Failures" ar="الإخفاقات" />: {capacity?.registrationFailures ?? 0}
        </p>
        {capacity && capacity.configured === false ? (
          <p className="muted">
            <Tx
              en="Apple credentials are not configured, so new installations stay unavailable."
              ar="بيانات Apple غير مهيأة، لذلك تبقى التثبيتات الجديدة غير متاحة."
            />
          </p>
        ) : null}
      </div>
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th><Tx en="Customer" ar="العميل" /></th>
              <th><Tx en="Enrollment" ar="التسجيل" /></th>
              <th><Tx en="Apple" ar="Apple" /></th>
              <th><Tx en="Signing" ar="التوقيع" /></th>
              <th><Tx en="App" ar="التطبيق" /></th>
              <th><Tx en="Failure" ar="السبب" /></th>
              <th><Tx en="Actions" ar="إجراءات" /></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.userId}</td>
                <td>
                  {row.status}
                  {row.fingerprintPrefix ? ` · ${row.fingerprintPrefix}` : ""}
                  {row.deactivatedAt ? " · inactive" : ""}
                </td>
                <td>{row.appleState ?? "—"}</td>
                <td>{row.signingStatus ?? "—"}</td>
                <td>
                  {row.appVersion ?? "—"}
                  {row.activatedAt ? ` · ${row.activatedAt}` : ""}
                </td>
                <td>{row.failureCode ?? "—"}</td>
                <td>
                  <button type="button" onClick={() => void act(row.id, "profile")}>
                    <Tx en="Retry provisioning" ar="إعادة التجهيز" />
                  </button>
                  <button type="button" onClick={() => void act(row.id, "sign")}>
                    <Tx en="Retry signing" ar="إعادة التوقيع" />
                  </button>
                  <button type="button" onClick={() => void act(row.id, "stop")}>
                    <Tx en="Deactivate" ar="إيقاف" />
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted">
                  <Tx en="No enrollments." ar="لا توجد عمليات تسجيل." />
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
