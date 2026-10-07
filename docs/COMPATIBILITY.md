# Compatibility

Policy states are SUPPORTED, TESTING, UNSUPPORTED, and BLOCKED. iOS Apply fetches `/compatibility` and evaluates rules for the real app version, the real iOS version, and the device model when available. BLOCKED and UNSUPPORTED stop Apply. TESTING allows Apply and returns `compatibility_testing` so the UI can say the combination is not production-verified. Restore is blocked only by killSwitchRestore. Device execution of these gates is PHYSICAL DEVICE REQUIRED.


## Product disclosure

NAMAT changes **Wallet card artwork appearance** on supported iPhones. It does **not** change banking data, card numbers, or Apple Pay transaction credentials.

Compatibility can change after iOS updates. Do not claim “works forever”.

## Engine prerequisites (on-device)

| Requirement | Notes |
|-------------|-------|
| Supported iPhone + iOS | Matrix managed via admin Compatibility + Remote Config `minIosVersion` |
| Pairing record | Local lockdown / RPPairing material stays on device |
| LocalDevVPN / loopback tunnel | Required for Airlift write path (AirCard reference) |
| Sideloaded IPA | Outside App Store |

Exact supported OS versions remain **device-proven TBD** until real-device matrix testing completes. Remote config + kill switches must be used when an iOS release breaks the exploit/write path.

## Remote controls

| Flag | Effect |
|------|--------|
| `killSwitchApply` | App must refuse Apply |
| `killSwitchRestore` | App must refuse Restore |
| `minAppVersion` | Force update gate |
| `minIosVersion` | Compatibility messaging |
| `maintenanceMode` | Soft outage banner |

## App versions

Admin App Versions list drives mandatory update messaging. IPA distribution is sideload/enterprise — URLs are operator-managed, not App Store.

## Backend vs device

Backend stores **NAMAT installation IDs** only. Wallet pass hashes / local keys never sync to the API.
