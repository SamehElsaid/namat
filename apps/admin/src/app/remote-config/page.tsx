"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button, Input } from "@namat/ui";
import type { RemoteConfig } from "@namat/shared";
import { AdminShell } from "@/components/AdminShell";
import { AdminApiError, adminApi } from "@/lib/api";
import { getAdminToken } from "@/lib/session";
import { Tx } from "@/lib/locale";

export default function RemoteConfigPage() {
  const [config, setConfig] = useState<RemoteConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    const token = getAdminToken();
    if (!token) return;
    try {
      const cfg = await adminApi.remoteConfig(token);
      setConfig(cfg);
      setMessage(cfg.message ?? "");
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Load failed");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(patch: Partial<RemoteConfig>) {
    const token = getAdminToken();
    if (!token) return;
    try {
      const cfg = await adminApi.updateRemoteConfig(token, patch);
      setConfig(cfg);
      setError(null);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Save failed");
    }
  }

  async function onMessage(e: FormEvent) {
    e.preventDefault();
    await save({ message });
  }

  return (
    <AdminShell title="Remote config">
      {error ? <div className="banner danger">{error}</div> : null}
      {config?.killSwitchApply ? (
        <div className="banner danger">
          <Tx en="Apply kill switch is ON — clients should refuse Apply." ar="إيقاف التطبيق مفعّل — يجب أن يرفض العملاء التطبيق." />
        </div>
      ) : (
        <div className="banner"><Tx en="Apply kill switch is off." ar="إيقاف التطبيق غير مفعّل." /></div>
      )}

      <div className="panel" style={{ marginBottom: "1rem" }}>
        <div className="actions" style={{ marginBottom: "1rem" }}>
          <Button
            variant={config?.killSwitchApply ? "secondary" : "danger"}
            onClick={() =>
              void save({ killSwitchApply: !config?.killSwitchApply })
            }
          >
            {config?.killSwitchApply ? (
              <Tx en="Disable Apply kill switch" ar="إيقاف مفتاح إيقاف التطبيق" />
            ) : (
              <Tx en="Enable Apply kill switch" ar="تفعيل مفتاح إيقاف التطبيق" />
            )}
          </Button>
          <p className="muted">
            <Tx
              en="Restore of a valid local original stays available. There is no control to block it."
              ar="استعادة النسخة المحلية الصالحة تبقى متاحة. لا يوجد تحكم لمنعها."
            />
          </p>
          <Button
            variant="secondary"
            onClick={() =>
              void save({ maintenanceMode: !config?.maintenanceMode })
            }
          >
            Toggle maintenance ({config?.maintenanceMode ? "ON" : "off"})
          </Button>
        </div>
        <form className="form-row" onSubmit={onMessage}>
          <Input
            label="Operator message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <div className="form-row two">
            <Input
              label="Min app version"
              value={config?.minAppVersion ?? ""}
              onChange={(e) =>
                setConfig((c) =>
                  c ? { ...c, minAppVersion: e.target.value } : c,
                )
              }
            />
            <Input
              label="Min iOS version"
              value={config?.minIosVersion ?? ""}
              onChange={(e) =>
                setConfig((c) =>
                  c ? { ...c, minIosVersion: e.target.value } : c,
                )
              }
            />
          </div>
          <Button
            type="button"
            onClick={() =>
              void save({
                message,
                minAppVersion: config?.minAppVersion,
                minIosVersion: config?.minIosVersion,
              })
            }
          >
            Save config
          </Button>
        </form>
      </div>
    </AdminShell>
  );
}
