import Foundation

/// The same basemaps the web app offers, minus the ones that need a key.
///
/// Each is a choice of cartography paired with its dark rendering, so the id
/// says which map and the colour scheme says which of its two faces — exactly
/// the split the web app settled on.
struct MapStyleOption: Identifiable, Hashable {
    let id: String
    let label: String
    let hint: String
    let light: URL
    let dark: URL

    func url(dark isDark: Bool) -> URL { isDark ? dark : light }

    static let all: [MapStyleOption] = [
        MapStyleOption(
            id: "liberty",
            label: "Streets",
            hint: "Full detail, every road named.",
            light: URL(string: "https://tiles.openfreemap.org/styles/liberty")!,
            dark: URL(string: "https://tiles.openfreemap.org/styles/dark")!
        ),
        MapStyleOption(
            id: "positron",
            label: "Minimal",
            hint: "Quiet greys; your route does the talking.",
            light: URL(string: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json")!,
            dark: URL(string: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json")!
        ),
        MapStyleOption(
            id: "voyager",
            label: "Voyager",
            hint: "Warm and readable at speed.",
            light: URL(string: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json")!,
            dark: URL(string: "https://tiles.openfreemap.org/styles/fiord")!
        ),
        MapStyleOption(
            id: "bright",
            label: "Bright",
            hint: "Higher contrast for glare.",
            light: URL(string: "https://tiles.openfreemap.org/styles/bright")!,
            dark: URL(string: "https://tiles.openfreemap.org/styles/dark")!
        )
    ]

    static let fallback = all[0]

    static func named(_ id: String) -> MapStyleOption {
        all.first { $0.id == id } ?? fallback
    }
}
