import Foundation
import WalletSkinEngine

public enum CustomerAccessFailure: Error, Equatable, Sendable {
    case unauthenticated
    case network
    case server
    case decoding

    public init(_ error: NamatAPIError) {
        switch error {
        case .notAuthenticated:
            self = .unauthenticated
        case .decoding:
            self = .decoding
        case .network:
            self = .network
        case .privacyViolationAttempt:
            self = .server
        case .http(let status, _, _):
            self = status == 401 ? .unauthenticated : .server
        }
    }
}

public struct CustomerDeviceFact: Equatable, Sendable {
    public let installationId: String
    public let status: String

    public init(installationId: String, status: String) {
        self.installationId = installationId
        self.status = status
    }
}

public enum CustomerAccess: Equatable, Sendable {
    case purchase
    case activate(otherDeviceActive: Bool)
    case setup
    case cards
    case retryEntitlement(holdingSetup: Bool)
    case retryDevices(holdingSetup: Bool)
    case recoverAuthentication

    public var offersPurchase: Bool {
        if case .purchase = self { return true }
        return false
    }

    public var offersActivation: Bool {
        if case .activate = self { return true }
        return false
    }

    public var opensMyCards: Bool {
        if case .cards = self { return true }
        return false
    }
}

public enum CustomerAccessPlanner {
    /// A failed request never becomes purchase or activation.
    /// `previouslyConfirmedSetup` only keeps the setup screen visible. It cannot open My Cards.
    public static func decide(
        entitlement: Result<Bool, CustomerAccessFailure>,
        devices: Result<[CustomerDeviceFact], CustomerAccessFailure>?,
        setup: SetupVerification,
        installationId: String,
        previouslyConfirmedSetup: Bool
    ) -> CustomerAccess {
        switch entitlement {
        case .failure(.unauthenticated):
            return .recoverAuthentication
        case .failure:
            return .retryEntitlement(holdingSetup: previouslyConfirmedSetup)
        case .success(false):
            return .purchase
        case .success(true):
            break
        }
        guard let devices else {
            return .retryDevices(holdingSetup: previouslyConfirmedSetup)
        }
        switch devices {
        case .failure(.unauthenticated):
            return .recoverAuthentication
        case .failure:
            return .retryDevices(holdingSetup: previouslyConfirmedSetup)
        case .success(let list):
            let thisActive = list.contains { $0.installationId == installationId && $0.status == "active" }
            if !thisActive {
                let other = list.contains { $0.status == "active" && $0.installationId != installationId }
                return .activate(otherDeviceActive: other)
            }
            return setup == .verified ? .cards : .setup
        }
    }
}

public enum ApplyEntitlementDecision: Equatable, Sendable {
    case allow
    case purchase
    case retry
    case recoverAuthentication
}

public enum ApplyEntitlementGate {
    /// Apply requires a fresh successful entitlement. A cached true is not an input.
    public static func decide(_ result: Result<Bool, CustomerAccessFailure>) -> ApplyEntitlementDecision {
        switch result {
        case .success(true):
            return .allow
        case .success(false):
            return .purchase
        case .failure(.unauthenticated):
            return .recoverAuthentication
        case .failure:
            return .retry
        }
    }
}
