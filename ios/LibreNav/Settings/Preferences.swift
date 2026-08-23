import Foundation
import Observation
import SwiftUI

enum ThemeChoice: String, CaseIterable, Identifiable {
    case system, light, dark

    var id: String { rawValue }

    var label: String {
        switch self {
        case .system: return "System"
        case .light: return "Light"
        case .dark: return "Dark"
        }
    }

    /// nil hands the decision back to iOS, which is what "System" means.
    var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }
}

/// Stored settings, mirroring the web app's so a driver moving between them
/// finds the same switches under the same names.
///
/// UserDefaults rather than a file: these are a handful of scalars, they have
/// to survive a cold launch, and they are read during view updates where a disk
/// read would be the wrong shape entirely.
@Observable
final class Preferences {
    var theme: ThemeChoice {
        didSet { defaults.set(theme.rawValue, forKey: Key.theme) }
    }

    /// Miles and feet instead of kilometres and metres.
    var imperial: Bool {
        didSet { defaults.set(imperial, forKey: Key.imperial) }
    }

    /// Speak turn instructions.
    var voiceGuidance: Bool {
        didSet { defaults.set(voiceGuidance, forKey: Key.voice) }
    }

    var mapStyleID: String {
        didSet { defaults.set(mapStyleID, forKey: Key.style) }
    }

    /// Draw charging stations, and fetch them at all.
    var showChargers: Bool {
        didSet { defaults.set(showChargers, forKey: Key.chargers) }
    }

    private enum Key {
        static let theme = "librenav.theme"
        static let imperial = "librenav.imperial"
        static let voice = "librenav.voiceGuidance"
        static let style = "librenav.mapStyle"
        static let chargers = "librenav.showChargers"
    }

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults

        theme = ThemeChoice(rawValue: defaults.string(forKey: Key.theme) ?? "") ?? .system
        // object(forKey:) rather than bool(forKey:): the latter returns false
        // for a key that was never written, which would silently default these
        // to off instead of to the value below.
        imperial = defaults.object(forKey: Key.imperial) as? Bool ?? Self.localeIsImperial
        voiceGuidance = defaults.object(forKey: Key.voice) as? Bool ?? true
        mapStyleID = defaults.string(forKey: Key.style) ?? MapStyleOption.fallback.id
        showChargers = defaults.object(forKey: Key.chargers) as? Bool ?? true
    }

    /// Follow the region's convention rather than assuming metric.
    private static var localeIsImperial: Bool {
        Locale.current.measurementSystem != .metric
    }
}
