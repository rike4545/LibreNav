import SwiftUI

/// The bottom sheet: search, results, and the trip once there is one.
///
/// Uses the system sheet detents rather than a hand-rolled drag, so the
/// gesture, the rubber-banding and the accessibility all come from UIKit —
/// the web app had to build that by hand and it is the part that took the
/// longest to get right.
struct SearchSheet: View {
    @Bindable var model: MapModel
    @FocusState private var searchFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            searchField

            if let route = model.route, let destination = model.destination {
                Divider()
                tripSummary(route: route, destination: destination)
            } else if model.isRouting {
                Divider()
                ProgressView("Finding the best route…")
                    .font(.subheadline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
            } else if let error = model.errorMessage {
                Divider()
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .font(.subheadline)
                    .foregroundStyle(.orange)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(16)
            }

            if !model.results.isEmpty {
                Divider()
                results
            }
        }
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .padding(.horizontal, 10)
        .padding(.bottom, 8)
        .shadow(color: .black.opacity(0.18), radius: 18, y: 6)
    }

    private var searchField: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)

            TextField("Search places or addresses", text: $model.query)
                .focused($searchFocused)
                .submitLabel(.search)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.words)

            if model.isSearching {
                ProgressView().controlSize(.small)
            } else if !model.query.isEmpty {
                Button {
                    model.query = ""
                } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                }
                .accessibilityLabel("Clear search")
            }
        }
        .font(.body)
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }

    private var results: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(model.results) { place in
                    Button {
                        searchFocused = false
                        model.select(place)
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "mappin.circle.fill")
                                .foregroundStyle(.blue)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(place.name)
                                    .font(.subheadline.weight(.medium))
                                    .foregroundStyle(.primary)
                                if !place.label.isEmpty {
                                    Text(place.label)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            Spacer()
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 11)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    Divider().padding(.leading, 48)
                }
            }
        }
        .frame(maxHeight: 260)
    }

    private func tripSummary(route: Route, destination: Place) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(destination.name)
                        .font(.headline)
                        .lineLimit(1)
                    Text(Format.duration(route.summary.durationMin) + " · " + Format.distance(route.summary.distanceKm))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
                Spacer()
                Button("Clear") { model.clearRoute() }
                    .font(.subheadline.weight(.medium))
            }

            Button {
                model.startNavigating()
            } label: {
                Label("Start", systemImage: "location.north.fill")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 13)
            }
            .buttonStyle(.borderedProminent)
            .buttonBorderShape(.capsule)

            Picker("Travel mode", selection: $model.mode) {
                ForEach(TravelMode.allCases) { mode in
                    Label(mode.label, systemImage: mode.symbolName).tag(mode)
                }
            }
            .pickerStyle(.segmented)

            if let next = route.maneuvers.first(where: { $0.kind != .start }) ?? route.maneuvers.first {
                Label(next.instruction, systemImage: next.kind.symbolName)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
        }
        .padding(16)
    }
}

enum Format {
    static func distance(_ km: Double) -> String {
        km < 1
            ? "\(Int((km * 1000).rounded())) m"
            : String(format: "%.1f km", km)
    }

    /// Metres, rounded the way a driver reads them: to the nearest 10 up close,
    /// to a tenth of a kilometre further out.
    static func distanceM(_ metres: Double) -> String {
        if metres < 1000 {
            return "\(Int((metres / 10).rounded()) * 10) m"
        }
        return String(format: "%.1f km", metres / 1000)
    }

    /// What a voice should say, which is coarser than what a screen shows.
    static func spokenDistance(_ metres: Double, imperial: Bool) -> String {
        if imperial {
            let feet = metres * 3.28084
            if feet < 1000 { return "\(Int((feet / 50).rounded()) * 50) feet" }
            return String(format: "%.1f miles", metres / 1609.34)
        }
        if metres < 1000 { return "\(Int((metres / 50).rounded()) * 50) metres" }
        return String(format: "%.1f kilometres", metres / 1000)
    }

    static func duration(_ minutes: Double) -> String {
        let total = Int(minutes.rounded())
        if total < 60 { return "\(total) min" }
        return "\(total / 60) h \(total % 60) min"
    }

    /// Clock time of arrival, which is what people actually plan around.
    static func eta(_ remainingSeconds: TimeInterval) -> String {
        let arrival = Date().addingTimeInterval(remainingSeconds)
        return arrival.formatted(date: .omitted, time: .shortened)
    }
}
