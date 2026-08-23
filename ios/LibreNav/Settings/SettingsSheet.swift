import SwiftUI

/// The settings panel.
///
/// A plain grouped Form rather than the hand-built sheets elsewhere in this
/// app: settings are a list of labelled controls, which is exactly what Form
/// is for, and it brings the scrolling, the grouping, Dynamic Type and
/// VoiceOver ordering with it for free.
struct SettingsSheet: View {
    @Bindable var preferences: Preferences
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("Display") {
                    Picker("Theme", selection: $preferences.theme) {
                        ForEach(ThemeChoice.allCases) { choice in
                            Text(choice.label).tag(choice)
                        }
                    }
                    .pickerStyle(.segmented)

                    Picker("Basemap", selection: $preferences.mapStyleID) {
                        ForEach(MapStyleOption.all) { style in
                            Text(style.label).tag(style.id)
                        }
                    }
                }

                Section {
                    Toggle("Imperial units", isOn: $preferences.imperial)
                } header: {
                    Text("Units")
                } footer: {
                    Text(preferences.imperial
                         ? "Distances in miles and feet."
                         : "Distances in kilometres and metres.")
                }

                Section {
                    Toggle("Show chargers", isOn: $preferences.showChargers)
                } header: {
                    Text("Map")
                } footer: {
                    Text("Charging stations from OpenStreetMap. Off also stops fetching them.")
                }

                Section {
                    Toggle("Voice guidance", isOn: $preferences.voiceGuidance)
                } header: {
                    Text("Guidance")
                } footer: {
                    Text("Speaks each turn as you approach it. Ducks other audio rather than stopping it.")
                }

                Section {
                    LabeledContent("Routing", value: "Valhalla · FOSSGIS")
                    LabeledContent("Search", value: "Photon · Komoot")
                    LabeledContent("Maps", value: currentStyleCredit)
                } header: {
                    Text("Data")
                } footer: {
                    Text("Open data, no account and no API key. The same services the web app uses.")
                }

                Section {
                    LabeledContent("Version", value: Self.version)
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    /// Read off the chosen style, so switching basemap credits the right one.
    private var currentStyleCredit: String {
        MapStyleOption.named(preferences.mapStyleID).credit
    }

    private static var version: String {
        let bundle = Bundle.main
        let short = bundle.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0"
        let build = bundle.infoDictionary?["CFBundleVersion"] as? String ?? "0"
        return "\(short) (\(build))"
    }
}
