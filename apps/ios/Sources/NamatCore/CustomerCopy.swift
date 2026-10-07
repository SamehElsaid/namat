import Foundation

/// Customer-facing copy. Callers must not show raw service codes.
public enum CustomerCopy {
    public static func authMessage(status: Int, code: String?, arabic: Bool) -> String {
        switch code {
        case "EmailDeliveryUnavailable":
            return arabic
                ? "تعذر إرسال رمز التحقق الآن. حاول مرة أخرى لاحقًا."
                : "The verification code could not be sent. Try again later."
        case "OtpInvalid":
            return arabic ? "رمز التحقق غير صحيح." : "That code is not correct."
        case "OtpExpired":
            return arabic
                ? "انتهت صلاحية الرمز. اطلب رمزًا جديدًا."
                : "That code has expired. Request a new one."
        case "OtpAttemptsExceeded":
            return arabic
                ? "محاولات كثيرة. اطلب رمزًا جديدًا."
                : "Too many attempts. Request a new code."
        case "OtpCooldown":
            return arabic
                ? "انتظر قليلًا قبل طلب رمز جديد."
                : "Wait a moment before requesting another code."
        case "OtpRateLimited":
            return arabic
                ? "طلبات كثيرة. حاول مرة أخرى لاحقًا."
                : "Too many requests. Try again later."
        case "InvalidEmail":
            return arabic
                ? "أدخل بريدًا إلكترونيًا صحيحًا."
                : "Enter a valid email address."
        case "GoogleAuthFailed", "GoogleTokenInvalid", "GoogleEmailUnverified",
             "GoogleAccountConflict", "GoogleNotConfigured":
            return arabic
                ? "تعذر تسجيل الدخول باستخدام Google. حاول مرة أخرى."
                : "Google sign-in could not be completed. Try again."
        default:
            break
        }
        if status == 503 {
            return arabic
                ? "تعذر إرسال رمز التحقق الآن. حاول مرة أخرى لاحقًا."
                : "The verification code could not be sent. Try again later."
        }
        if status == 429 {
            return arabic
                ? "انتظر قليلًا قبل طلب رمز جديد."
                : "Wait a moment before requesting another code."
        }
        if status == 0 {
            return arabic
                ? "تعذر الاتصال. تحقق من الإنترنت وحاول مرة أخرى."
                : "Could not connect. Check your internet and try again."
        }
        return arabic
            ? "تعذر إكمال الدخول. حاول مرة أخرى."
            : "Sign-in could not be completed. Try again."
    }

    public static func flowMessage(code: String, arabic: Bool) -> String {
        switch code {
        case "entitlement_required":
            return arabic
                ? "فعّل نَمَط على هذا الحساب للمتابعة."
                : "Activate NAMAT on this account to continue."
        case "activation_required", "ActivationRequired", "ActivationProofRequired",
             "ActivationProofInvalid", "DeviceKeyMismatch", "ActivationAttestationRequired":
            return arabic
                ? "فعّل نَمَط على هذا الآيفون للمتابعة."
                : "Activate NAMAT on this iPhone to continue."
        case "DeviceLimitExceeded":
            return arabic
                ? "نَمَط مفعّل على آيفون آخر. انقل التفعيل أولاً."
                : "NAMAT is active on another iPhone. Transfer activation first."
        case "DeviceTransferLimited":
            return arabic
                ? "نقل التفعيل غير متاح الآن. حاول لاحقًا."
                : "Activation transfer is unavailable right now. Try later."
        case "compatibility_testing":
            return arabic
                ? "التوافق ما زال قيد الاختبار على هذا الجهاز."
                : "Compatibility is still being tested on this iPhone."
        case "compatibility_blocked", "BLOCKED", "unsupported", "UNSUPPORTED":
            return arabic
                ? "هذا الإصدار غير مدعوم حاليًا."
                : "This version is not supported right now."
        case "artwork_missing":
            return arabic ? "تعذر تجهيز التصميم." : "The skin could not be prepared."
        case "remote_config", "compatibility":
            return arabic
                ? "تعذر الاتصال. تحقق من الإنترنت وحاول مرة أخرى."
                : "Could not connect. Check your internet and try again."
        default:
            let lowered = code.lowercased()
            if lowered.contains("pairing") || lowered.contains("vpn") {
                return arabic
                    ? "أكمل إعداد الجهاز ثم حاول مرة أخرى."
                    : "Finish device setup, then try again."
            }
            if lowered.contains("unsupported") || lowered.contains("blocked") {
                return arabic
                    ? "هذا الإصدار غير مدعوم حاليًا."
                    : "This version is not supported right now."
            }
            return arabic
                ? "تعذر إكمال العملية. حاول مرة أخرى."
                : "That could not be completed. Try again."
        }
    }

    /// Drops messages that would leak internal engine or account terms.
    public static func safeDetail(_ text: String?) -> String? {
        guard let text, !text.isEmpty else { return nil }
        let lowered = text.lowercased()
        let banned = [
            "airlift", "ffi", "afc", "localkey", "passhash", "cardhash",
            "udid", "cms", "entitlement", "provision", "exploit", "stub",
        ]
        if banned.contains(where: { lowered.contains($0) }) {
            return nil
        }
        return text
    }
}
