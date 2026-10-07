import SwiftUI

@main
struct WalletCardBindingTests {
    static func main() {
        let first = CardItem(id: "first")
        let second = CardItem(id: "second")
        var storage = [first, second]
        let cards = Binding(get: { storage }, set: { storage = $0 })

        // Reproduce the old index binding using the same test sequence.
        func row(_ snapshot: CardItem, index: Int) -> Binding<CardItem> {
#if LEGACY_INDEX_BINDINGS
            return cards[index]
#else
            return walletCardBinding(in: cards, snapshot: snapshot)
#endif
        }

        let firstRow = row(first, index: 0)
        let secondRow = row(second, index: 1)
        firstRow.isSelected.wrappedValue = false
        precondition(!storage[0].isSelected)

        // The original Clear All crash: a retained binding reads an empty array.
        storage.removeAll()
        precondition(secondRow.wrappedValue.id == second.id)
        storage = [first, second]

        // A retained row must follow its card when a preceding card is deleted.
        storage.removeFirst()
        precondition(secondRow.wrappedValue.id == second.id)
        secondRow.isSelected.wrappedValue = false
        precondition(!storage[0].isSelected)
        firstRow.isSelected.wrappedValue = true
        precondition(!storage[0].isSelected, "Deleted row must not edit its replacement")

        // Clear all while SwiftUI still retains rows and nested bindings.
        let delayedImageWrite = secondRow.customImageURL
        storage.removeAll()
        precondition(secondRow.wrappedValue.id == second.id)
        delayedImageWrite.wrappedValue = URL(fileURLWithPath: "/tmp/late-image.png")
        precondition(storage.isEmpty, "Late callbacks must not resurrect deleted cards")

        // LazyVGrid may construct a row from its previous snapshot after clear.
        let lateRow = row(second, index: 1)
        precondition(lateRow.wrappedValue.id == second.id)
        lateRow.isSelected.wrappedValue = false
        precondition(storage.isEmpty)

        // Scanner appends another card after clear; stale writes must ignore it.
        storage.append(CardItem(id: "new-scan"))
        secondRow.isSelected.wrappedValue = false
        precondition(storage[0].id == "new-scan" && storage[0].isSelected)
        print("PASS: retained rows, single deletion, clear all, late row creation, delayed image writes, scanner append")
    }
}
