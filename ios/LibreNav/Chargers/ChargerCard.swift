import SwiftUI

/// What you get when you tap a charger pin.
struct ChargerCard: View {
    let charger: ChargerSite
    let distanceKm: Double?
    let imperial: Bool
    let onNavigate: () -> Void
    let onClose: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "bolt.fill")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(.green)
                    .frame(width: 40, height: 40)
                    .background(Color.green.opacity(0.15), in: RoundedRectangle(cornerRadius: 12, style: .continuous))

                VStack(alignment: .leading, spacing: 2) {
                    Text(charger.name)
                        .font(.headline)
                        .lineLimit(2)
                    Text(subtitle)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                Spacer(minLength: 0)

                Button(action: onClose) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 22))
                        .foregroundStyle(.secondary)
                }
                .accessibilityLabel("Close")
            }

            if !charger.plugs.isEmpty {
                // Wraps rather than scrolls: a site with six connector types
                // should show all six, not hide them behind a swipe.
                FlowRow(spacing: 6) {
                    ForEach(charger.plugs, id: \.self) { plug in
                        Text(plug)
                            .font(.caption.weight(.medium))
                            .padding(.horizontal, 9)
                            .padding(.vertical, 5)
                            .background(.thinMaterial, in: Capsule())
                    }
                }
            }

            if let detail = accessDetail {
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Button(action: onNavigate) {
                Label("Route here", systemImage: "location.north.fill")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
            }
            .buttonStyle(.borderedProminent)
            .buttonBorderShape(.capsule)
        }
        .padding(16)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
        .padding(.horizontal, 12)
        .shadow(color: .black.opacity(0.18), radius: 16, y: 5)
    }

    private var subtitle: String {
        var parts: [String] = [charger.network]
        if let power = charger.powerKw {
            parts.append("\(Int(power.rounded())) kW")
        }
        if let distanceKm {
            parts.append(Format.distance(distanceKm, imperial: imperial))
        }
        return parts.joined(separator: " · ")
    }

    private var accessDetail: String? {
        var parts: [String] = []
        if let capacity = charger.capacity { parts.append("\(capacity) bays") }
        if let access = charger.access, access != "yes" { parts.append("Access: \(access)") }
        if let fee = charger.fee { parts.append(fee == "yes" ? "Paid" : fee == "no" ? "Free" : "Fee: \(fee)") }
        if let address = charger.address { parts.append(address) }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}

/// Chips that wrap onto as many lines as they need.
///
/// SwiftUI has no wrapping stack, and an HStack would push six connectors off
/// the edge of the card. Layout is the supported way to do this without
/// measuring in a GeometryReader and guessing.
struct FlowRow: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, lineHeight: CGFloat = 0

        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x + size.width > maxWidth, x > 0 {
                x = 0
                y += lineHeight + spacing
                lineHeight = 0
            }
            x += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }
        return CGSize(width: maxWidth, height: y + lineHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, lineHeight: CGFloat = 0

        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX, x > bounds.minX {
                x = bounds.minX
                y += lineHeight + spacing
                lineHeight = 0
            }
            view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }
    }
}
