"use client";

import { useEffect, useState } from "react";
import type { Device } from "@namat/shared";
import { Button } from "@namat/ui";
import { AdminShell } from "@/components/AdminShell";
import { AdminApiError, adminApi } from "@/lib/api";
import { getAdminToken } from "@/lib/session";
import { Tx } from "@/lib/locale";

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const token = getAdminToken();
    if (!token) return;
    try {
      setDevices(await adminApi.devices(token));
      setError(null);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Load failed");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function remove(device: Device) {
    const token = getAdminToken();
    if (!token) return;
    const reason = window.prompt("Reason for removing this iPhone");
    if (!reason || reason.trim().length < 3) return;
    if (!window.confirm("Remove this iPhone from the account?")) return;
    try {
      await adminApi.revokeDevice(token, device.id, reason.trim());
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Remove failed");
    }
  }

  async function transfer(device: Device) {
    const token = getAdminToken();
    if (!token) return;
    const reason = window.prompt("Reason for transferring activation");
    if (!reason || reason.trim().length < 3) return;
    if (!window.confirm("Revoke the active iPhone so another one can activate?")) return;
    try {
      await adminApi.transferActivation(token, device.userId, reason.trim());
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Transfer failed");
    }
  }

  return (
    <AdminShell title="Devices">
      {error ? <div className="banner danger">{error}</div> : null}
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th><Tx en="Installation ID" ar="معرّف التثبيت" /></th>
              <th><Tx en="User" ar="المستخدم" /></th>
              <th><Tx en="Status" ar="الحالة" /></th>
              <th><Tx en="App" ar="التطبيق" /></th>
              <th>iOS</th>
              <th><Tx en="Last seen" ar="آخر ظهور" /></th>
              <th />
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => (
              <tr key={d.id}>
                <td>{d.installationId}</td>
                <td>{d.userId}</td>
                <td>{d.status}</td>
                <td>{d.appVersion ?? "—"}</td>
                <td>{d.iosVersion ?? "—"}</td>
                <td>{d.lastSeenAt ?? "—"}</td>
                <td className="actions">
                  {d.status === "active" ? (
                    <>
                      <Button size="sm" variant="danger" onClick={() => void remove(d)}>
                        <Tx en="Remove" ar="إزالة" />
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => void transfer(d)}>
                        <Tx en="Transfer" ar="نقل" />
                      </Button>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
            {devices.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted">
                  <Tx en="No devices." ar="لا توجد أجهزة." />
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
