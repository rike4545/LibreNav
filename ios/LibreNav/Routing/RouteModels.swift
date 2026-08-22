import CoreLocation
import Foundation

/// The shapes a maneuver icon can take. Mirrors the web app's ManeuverKind so
/// the two stay describable in the same words.
enum ManeuverKind: String {
    case start, destination, `continue`, merge, roundabout, ferry, uturn
    case slightLeft, left, sharpLeft
    case slightRight, right, sharpRight
    case rampLeft, rampRight, rampStraight
    case exitLeft, exitRight

    /// Valhalla maneuver type ids.
    /// https://valhalla.github.io/valhalla/api/turn-by-turn/api-reference/
    static func from(valhallaType type: Int) -> ManeuverKind {
        switch type {
        case 1, 2, 3: return .start
        case 4, 5, 6: return .destination
        case 7, 8, 22: return .continue
        case 9, 23: return .slightRight
        case 10: return .right
        case 11: return .sharpRight
        case 12, 13: return .uturn
        case 14: return .sharpLeft
        case 15: return .left
        case 16, 24: return .slightLeft
        case 17: return .rampStraight
        case 18: return .rampRight
        case 19: return .rampLeft
        case 20: return .exitRight
        case 21: return .exitLeft
        case 25, 37, 38: return .merge
        case 26, 27: return .roundabout
        case 28, 29: return .ferry
        default: return .continue
        }
    }

    /// SF Symbol standing in for the shape of the turn.
    var symbolName: String {
        switch self {
        case .start: return "location.fill"
        case .destination: return "flag.checkered"
        case .continue: return "arrow.up"
        case .merge: return "arrow.triangle.merge"
        case .roundabout: return "arrow.triangle.capsulepath"
        case .ferry: return "ferry.fill"
        case .uturn: return "arrow.uturn.down"
        case .slightLeft: return "arrow.up.left"
        case .left: return "arrow.turn.up.left"
        case .sharpLeft: return "arrow.turn.left.down"
        case .slightRight: return "arrow.up.right"
        case .right: return "arrow.turn.up.right"
        case .sharpRight: return "arrow.turn.right.down"
        case .rampLeft: return "arrow.up.left"
        case .rampRight: return "arrow.up.right"
        case .rampStraight: return "arrow.up"
        case .exitLeft: return "arrow.up.left"
        case .exitRight: return "arrow.up.right"
        }
    }
}

struct Maneuver: Identifiable {
    let id = UUID()
    let kind: ManeuverKind
    let instruction: String
    /// Spoken form, which Valhalla writes differently from the printed one.
    let verbal: String?
    let streetNames: [String]
    let distanceKm: Double
    let durationMin: Double
    let beginShapeIndex: Int
}

struct RouteSummary {
    let distanceKm: Double
    let durationMin: Double
    let hasToll: Bool
    let hasFerry: Bool
}

struct Route {
    let coordinates: [CLLocationCoordinate2D]
    let maneuvers: [Maneuver]
    let summary: RouteSummary
}

enum TravelMode: String, CaseIterable, Identifiable {
    case auto, truck, bicycle, pedestrian

    var id: String { rawValue }

    var label: String {
        switch self {
        case .auto: return "Drive"
        case .truck: return "Truck"
        case .bicycle: return "Bike"
        case .pedestrian: return "Walk"
        }
    }

    var symbolName: String {
        switch self {
        case .auto: return "car.fill"
        case .truck: return "truck.box.fill"
        case .bicycle: return "bicycle"
        case .pedestrian: return "figure.walk"
        }
    }
}
