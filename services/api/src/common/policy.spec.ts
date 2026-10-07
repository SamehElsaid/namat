import {
  compareVersions,
  evaluateApply,
  evaluateCompatibility,
  evaluateRestore,
} from "@namat/shared";

const base = {
  killSwitchApply: false,
  killSwitchRestore: false,
  minAppVersion: "1.0.0",
  minIosVersion: "17.0",
  maintenanceMode: false,
  message: null,
};

describe("remote policy", () => {
  it("blocks apply on kill switch without blocking restore", () => {
    const policy = { ...base, killSwitchApply: true, message: "Paused" };
    expect(evaluateApply(policy, "1.2.0", "18.0").allowed).toBe(false);
    expect(evaluateApply(policy, "1.2.0", "18.0").reason).toBe("Paused");
    expect(evaluateRestore(policy).allowed).toBe(true);
  });

  it("blocks restore only when killSwitchRestore is set", () => {
    const policy = { ...base, killSwitchRestore: true };
    expect(evaluateApply(policy, "1.2.0", "18.0").allowed).toBe(true);
    expect(evaluateRestore(policy).allowed).toBe(false);
  });

  it("compares versions semantically and allows the current 0.1.0 build", () => {
    expect(compareVersions("0.1.0", "0.1.0")).toBe(0);
    expect(compareVersions("0.1.0", "1.0.0")).toBeLessThan(0);
    expect(compareVersions("1.0.0", "0.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
    const current = { ...base, minAppVersion: "0.1.0" };
    expect(evaluateApply(current, "0.1.0", "18.0").allowed).toBe(true);
    expect(evaluateApply(base, "0.1.0", "18.0").code).toBe("app_version");
  });

  it("blocks maintenance and old versions", () => {
    expect(
      evaluateApply({ ...base, maintenanceMode: true }, "1.2.0", "18.0").code,
    ).toBe("maintenance");
    expect(evaluateApply(base, "0.9.0", "18.0").code).toBe("app_version");
    expect(evaluateApply(base, "1.0.0", "16.4").code).toBe("ios_version");
  });

  it("evaluates compatibility states", () => {
    expect(
      evaluateCompatibility({
        state: "BLOCKED",
        iosVersion: "18.0",
        appVersion: "1.0.0",
      }).allowed,
    ).toBe(false);
    expect(
      evaluateCompatibility({
        state: "SUPPORTED",
        minIosVersion: "17.0",
        maxIosVersion: "18.2",
        supportedModels: ["iPhone16,1"],
        iosVersion: "18.1",
        appVersion: "1.0.0",
        deviceModel: "iPhone16,1",
      }).allowed,
    ).toBe(true);
    expect(
      evaluateCompatibility({
        state: "TESTING",
        iosVersion: "18.0",
        appVersion: "1.0.0",
      }).code,
    ).toBe("compatibility_testing");
    expect(
      evaluateCompatibility({
        state: "UNSUPPORTED",
        iosVersion: "18.0",
        appVersion: "1.0.0",
      }).allowed,
    ).toBe(false);
  });
});
