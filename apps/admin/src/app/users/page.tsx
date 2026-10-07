"use client";

import { useEffect, useState } from "react";
import { Button } from "@namat/ui";
import type { Entitlement, NamatUser } from "@namat/shared";
import { AdminShell } from "@/components/AdminShell";
import { AdminApiError, adminApi } from "@/lib/api";
import { getAdminToken } from "@/lib/session";
import { Tx } from "@/lib/locale";

type Row = NamatUser & { entitlement?: Entitlement | null };

export default function UsersPage() {
  const [users, setUsers] = useState<Row[]>([]);
  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ownerView = viewerRole === "owner";

  async function load() {
    const token = getAdminToken();
    if (!token) return;
    try {
      const me = await adminApi.me(token);
      setViewerRole(me.role);
      setUsers(await adminApi.users(token));
      setError(null);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Load failed");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function issue(userId: string) {
    const token = getAdminToken();
    if (!token || !ownerView) return;
    const reason = window.prompt("Reason for this manual entitlement");
    if (!reason || reason.trim().length < 3) return;
    try {
      await adminApi.issueEntitlement(token, userId, reason.trim());
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Issue failed");
    }
  }

  async function revoke(userId: string) {
    const token = getAdminToken();
    if (!token || !ownerView) return;
    const reason = window.prompt("Reason for revoking this entitlement");
    if (!reason || reason.trim().length < 3) return;
    try {
      await adminApi.revokeEntitlement(token, userId, reason.trim());
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Revoke failed");
    }
  }

  async function setRole(userId: string, role: "user" | "admin") {
    const token = getAdminToken();
    if (!token || !ownerView) return;
    try {
      await adminApi.setUserRole(token, userId, role);
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Role update failed");
    }
  }

  async function setActive(userId: string, isActive: boolean) {
    const token = getAdminToken();
    if (!token || !ownerView) return;
    try {
      await adminApi.setUserActive(token, userId, isActive);
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Account update failed");
    }
  }

  return (
    <AdminShell title="Users / entitlements">
      {error ? <div className="banner danger">{error}</div> : null}
      {ownerView ? (
        <p className="muted">Owner controls are visible. The owner account cannot be demoted or disabled.</p>
      ) : (
        <p className="muted">Role and account status changes are limited to the owner.</p>
      )}
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th><Tx en="Email" ar="البريد" /></th>
              <th><Tx en="Role" ar="الدور" /></th>
              <th><Tx en="Account" ar="الحساب" /></th>
              <th><Tx en="Entitlement" ar="الصلاحية" /></th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const protectedOwner = u.role === "owner";
              return (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>
                    {u.role}
                    {protectedOwner ? " · protected owner" : ""}
                  </td>
                  <td>{u.isActive === false ? "disabled" : "active"}</td>
                  <td>
                    {u.entitlement?.status === "active"
                      ? `${u.entitlement.plan === "lifetime" ? "lifetime" : u.entitlement.plan}`
                      : u.entitlement?.status ?? "none"}
                  </td>
                  <td className="actions">
                    {ownerView ? (
                      <>
                        <Button size="sm" onClick={() => void issue(u.id)}>
                          Issue
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => void revoke(u.id)}>
                          Revoke
                        </Button>
                      </>
                    ) : null}
                    {ownerView && !protectedOwner ? (
                      <>
                        {u.role === "admin" ? (
                          <Button size="sm" variant="secondary" onClick={() => void setRole(u.id, "user")}>
                            Demote admin
                          </Button>
                        ) : (
                          <Button size="sm" variant="secondary" onClick={() => void setRole(u.id, "admin")}>
                            Promote admin
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void setActive(u.id, u.isActive === false)}
                        >
                          {u.isActive === false ? "Enable" : "Disable"}
                        </Button>
                      </>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {users.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  No users loaded.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
