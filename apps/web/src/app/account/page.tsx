"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@namat/ui";
import type { Device, NamatUser } from "@namat/shared";
import {
  ApiError,
  api,
  type CustomerEntitlement,
  type CustomerPurchase,
} from "@/lib/api";
import {
  clearStoredSession,
  getStoredToken,
} from "@/lib/session";
import { useTx } from "@/components/Copy";
import { TelegramLink } from "@/components/TelegramLink";

function money(amountMinor: number, currency: string) {
  return `${(amountMinor / 100).toFixed(2)} ${currency}`;
}

function purchaseStatusLabel(
  status: CustomerPurchase["status"],
  tx: (en: string, ar: string) => string,
) {
  switch (status) {
    case "completed":
      return tx("Completed", "مكتملة");
    case "pending":
      return tx("Pending", "معلقة");
    case "failed":
      return tx("Failed", "فشلت");
    case "refunded":
      return tx("Refunded", "مستردة");
    case "cancelled":
      return tx("Cancelled", "ملغاة");
  }
}

export default function AccountPage() {
  const router = useRouter();
  const tx = useTx();
  const [user, setUser] = useState<NamatUser | null>(null);
  const [entitlement, setEntitlement] = useState<CustomerEntitlement | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [purchases, setPurchases] = useState<CustomerPurchase[]>([]);
  const [openPurchase, setOpenPurchase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const token = getStoredToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    setError(null);
    try {
      const [me, ent, devs, history] = await Promise.all([
        api.me(token),
        api.entitlement(token).catch(() => null),
        api.devices(token).catch(() => [] as Device[]),
        api.purchases(token).catch(() => [] as CustomerPurchase[]),
      ]);
      setUser(me);
      setEntitlement(ent);
      setDevices(devs);
      setPurchases(history);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearStoredSession();
        router.replace("/login");
        return;
      }
      setError(
        err instanceof ApiError
          ? err.message
          : tx("Could not load account. Is the API running?", "تعذر تحميل الحساب. هل الواجهة تعمل؟"),
      );
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const onFocus = () => {
      void load();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function rename(deviceId: string, label: string) {
    const token = getStoredToken();
    if (!token || !label.trim()) return;
    try {
      await api.renameDevice(token, deviceId, label.trim());
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tx("Could not rename.", "تعذر تغيير الاسم."));
    }
  }

  async function transfer() {
    const token = getStoredToken();
    if (!token) return;
    const confirmed = window.confirm(
      tx(
        "Transfer activation? The current iPhone will be deactivated.",
        "نقل التفعيل؟ سيُوقف الآيفون الحالي.",
      ),
    );
    if (!confirmed) return;
    try {
      await api.transferDevice(token);
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? tx(
              "Activation transfer is unavailable right now. Try later.",
              "نقل التفعيل غير متاح الآن. حاول لاحقًا.",
            )
          : tx(
              "Activation transfer is unavailable right now. Try later.",
              "نقل التفعيل غير متاح الآن. حاول لاحقًا.",
            ),
      );
    }
  }

  async function deactivate(deviceId: string) {
    const token = getStoredToken();
    if (!token) return;
    const confirmed = window.confirm(
      tx(
        "Remove this iPhone from NAMAT?",
        "إزالة هذا الآيفون من نَمَط؟",
      ),
    );
    if (!confirmed) return;
    try {
      await api.deactivateDevice(token, deviceId);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tx("Could not deactivate.", "تعذر إيقاف الجهاز."));
    }
  }

  function IpaPanel({ active }: { active: boolean }) {
    const tx = useTx();
    const [info, setInfo] = useState<{
      id?: string;
      version: string | null;
      releaseNotes?: string | null;
      checksum?: string | null;
      downloadAvailable?: boolean;
    } | null>(null);
    const [ipaError, setIpaError] = useState<string | null>(null);
    useEffect(() => {
      void api
        .latestAppVersion()
        .then(setInfo)
        .catch((err) =>
          setIpaError(err instanceof ApiError ? err.message : tx("App version unavailable", "إصدار التطبيق غير متاح")),
        );
    }, []);
    return (
      <div className="notice">
        {ipaError ? <p>{ipaError}</p> : null}
        {info?.version ? (
          <>
            <p>
              {tx("Published version", "الإصدار المنشور")} {info.version}
            </p>
            {info.releaseNotes ? <p>{info.releaseNotes}</p> : null}
          </>
        ) : (
          <p>{tx("No app version has been published.", "لم يُنشر إصدار تطبيق.")}</p>
        )}
        {active && info?.downloadAvailable && info.id ? (
          <p>
            <a href={`/api/v1/app-versions/${info.id}/download`}>{tx("Download the signed app", "تنزيل التطبيق الموقّع")}</a>
          </p>
        ) : (
          <p>
            {tx(
              "Download stays unavailable until a lifetime entitlement is active and a signed app is published.",
              "يبقى التنزيل غير متاح حتى يتم تفعيل نَمَط ويُنشر تطبيق موقّع.",
            )}
          </p>
        )}
        {info?.checksum ? (
          <details>
            <summary>{tx("Support details", "تفاصيل الدعم")}</summary>
            <p>SHA-256 {info.checksum}</p>
          </details>
        ) : null}
      </div>
    );
  }

  function signOut(all = false) {
    const token = getStoredToken();
    if (token) {
      const call = all ? api.logoutAll(token) : api.logout(token);
      void call.catch(() => undefined);
    }
    clearStoredSession();
    router.push("/");
  }

  const linkedPurchase = purchases.find((purchase) => purchase.id === entitlement?.purchaseId);

  if (loading && !user) {
    return (
      <div className="container">
        <header className="page-hero">
          <h1>{tx("Account", "الحساب")}</h1>
          <p>{tx("Loading…", "جارٍ التحميل…")}</p>
        </header>
      </div>
    );
  }

  return (
    <div className="container">
      <header className="page-hero">
        <h1>{tx("Account", "الحساب")}</h1>
        <p>{user?.email}</p>
      </header>

      {error ? (
        <div className="notice warn" style={{ marginBottom: "1.25rem" }}>
          {error}
        </div>
      ) : null}

      <div className="account-grid" style={{ maxWidth: "40rem" }}>
        <section className="account-block">
          <h2>{tx("NAMAT", "نَمَط")}</h2>
          <p>{tx("One-time purchase · lifetime access", "شراء لمرة واحدة · صلاحية دائمة")}</p>
          {entitlement?.status === "active" ? (
            <div className="notice">
              {tx("Activated", "مفعّل")}
              {entitlement.createdAt
                ? ` · ${tx("Activated", "تاريخ التفعيل")} ${entitlement.createdAt.slice(0, 10)}`
                : ""}
            </div>
          ) : (
            <div className="notice">
              {tx("Not activated", "غير مفعّل")}{" "}
              <Link href="/checkout">{tx("Activate NAMAT", "فعّل نَمَط")}</Link>
            </div>
          )}
          {linkedPurchase ? (
            <p className="muted">
              {tx("Purchase", "الشراء")} {linkedPurchase.reference}
            </p>
          ) : null}
        </section>

        <section className="account-block">
          <h2>{tx("Purchases", "المشتريات")}</h2>
          {purchases.length === 0 ? (
            <div className="notice">
              {tx("You have not purchased NAMAT yet.", "لم تشترِ نَمَط بعد.")}{" "}
              <Link href="/checkout">{tx("Activate NAMAT", "فعّل نَمَط")}</Link>
            </div>
          ) : (
            purchases.map((purchase) => (
              <div className="device-row" key={purchase.id}>
                <div>
                  <div style={{ fontWeight: 600 }}>{purchase.reference}</div>
                  <div className="muted" style={{ fontSize: "0.85rem" }}>
                    {purchase.createdAt.slice(0, 10)} · {money(purchase.amountMinor, purchase.currency)} ·{" "}
                    {purchaseStatusLabel(purchase.status, tx)}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setOpenPurchase((current) => (current === purchase.id ? null : purchase.id))
                  }
                >
                  {tx("View details", "عرض التفاصيل")}
                </Button>
                {openPurchase === purchase.id ? (
                  <p className="muted">
                    {money(purchase.amountMinor, purchase.currency)} ·{" "}
                    {purchase.paymentMethod === "card"
                      ? tx("Card", "بطاقة")
                      : purchase.paymentMethod === "wallet"
                        ? tx("Wallet", "محفظة")
                        : purchase.paymentMethod === "terminal"
                          ? tx("In-person payment", "دفع عبر الجهاز")
                          : tx("Payment", "الدفع")}
                    {purchase.test ? ` · ${tx("Test", "تجريبي")}` : ""}
                  </p>
                ) : null}
              </div>
            ))
          )}
        </section>

        <section className="account-block">
          <h2>{tx("This iPhone", "هذا الآيفون")}</h2>
          {devices.length === 0 ? (
            <p className="muted">{tx("No iPhone is activated yet.", "لا يوجد آيفون مفعّل بعد.")}</p>
          ) : (
            devices.map((d) => (
              <div className="device-row" key={d.id}>
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {d.label || "iPhone"} —{" "}
                    {d.status === "active"
                      ? tx("Active", "مفعّل")
                      : tx("Inactive", "غير مفعّل")}
                  </div>
                  <div className="muted" style={{ fontSize: "0.85rem" }}>
                    {d.iosVersion ? `iOS ${d.iosVersion}` : tx("iPhone", "آيفون")}
                    {d.appVersion ? ` · NAMAT ${d.appVersion}` : ""}
                    {d.lastSeenAt ? ` · ${d.lastSeenAt.slice(0, 10)}` : ""}
                  </div>
                </div>
                <form
                  key={`${d.id}-${d.label ?? ""}`}
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    void rename(d.id, String(data.get("label") ?? ""));
                  }}
                  style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
                >
                  <input
                    name="label"
                    defaultValue={d.label || ""}
                    aria-label={tx("Device name", "اسم الجهاز")}
                    maxLength={64}
                    style={{ width: "8rem" }}
                  />
                  <Button size="sm" variant="secondary" type="submit">
                    {tx("Rename", "تسمية")}
                  </Button>
                  {d.status === "active" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void deactivate(d.id)}
                    >
                      {tx("Remove device", "إزالة الجهاز")}
                    </Button>
                  ) : null}
                </form>
              </div>
            ))
          )}
        </section>

        <section className="account-block">
          <h2>{tx("Transfer activation", "نقل التفعيل")}</h2>
          <p className="muted">
            {tx(
              "Remove this iPhone so another one can be activated. Only one iPhone stays active.",
              "أزل هذا الآيفون ليتمكن آيفون آخر من التفعيل. يبقى آيفون واحد مفعّلًا.",
            )}
          </p>
          <Button variant="secondary" onClick={() => void transfer()}>
            {tx("Transfer activation", "نقل التفعيل")}
          </Button>
        </section>

        <section className="account-block">
          <h2>{tx("App", "التطبيق")}</h2>
          <IpaPanel active={entitlement?.status === "active"} />
          <div className="cta-row" style={{ marginTop: "1rem" }}>
            <Link href="/support">{tx("Support", "الدعم")}</Link>
            <Link href="/privacy">{tx("Privacy", "الخصوصية")}</Link>
            <Link href="/terms">{tx("Terms", "الشروط")}</Link>
          </div>
          <div className="cta-row" style={{ marginTop: "1rem" }}>
            <Link href="/account/install">
              <Button>{tx("Set up this iPhone", "إعداد هذا الآيفون")}</Button>
            </Link>
            <Button variant="ghost" onClick={() => signOut(false)}>
              {tx("Sign out", "خروج")}
            </Button>
            <Button variant="ghost" onClick={() => signOut(true)}>
              {tx("Sign out everywhere", "خروج من كل الأجهزة")}
            </Button>
          </div>
        </section>
        <TelegramLink />
      </div>
    </div>
  );
}
