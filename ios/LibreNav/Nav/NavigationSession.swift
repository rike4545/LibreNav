import CoreLocation
import Foundation
import Observation

struct NavProgress {
    /// Index into the route's maneuvers of the turn being approached.
    let stepIndex: Int
    let distanceToManeuver: CLLocationDistance
    let remainingDistance: CLLocationDistance
    let remainingSeconds: TimeInterval
    let offRouteDistance: CLLocationDistance
    let isOffRoute: Bool
    /// Snapped position, so the puck sits on the road rather than beside it.
    let snapped: CLLocationCoordinate2D
    let course: CLLocationDirection?
    /// 0–1 along the route.
    let fraction: Double
    let shapeIndex: Int
}

/// Turn-by-turn state for one route.
///
/// Holds the per-route tables so a GPS tick is a couple of lookups rather than
/// a walk of the whole line, and owns the announcement bookkeeping so a turn is
/// spoken once per band instead of on every fix inside it.
@Observable
@MainActor
final class NavigationSession {
    private(set) var progress: NavProgress?
    private(set) var isActive = false
    private(set) var hasArrived = false

    var route: Route?
    var imperial = false

    private var cumulative: [CLLocationDistance] = []
    private var maneuverDistances: [CLLocationDistance] = []
    private var totalDistance: CLLocationDistance = 0
    private var totalSeconds: TimeInterval = 0

    private var shapeHint = 0
    private var announced: Set<String> = []
    /// Consecutive off-route fixes. One bad fix is not a wrong turn.
    private var offRouteRuns = 0

    private let voice = Voice()

    /// Beyond this perpendicular distance the driver has left the route.
    private let offRouteMetres: CLLocationDistance = 55
    /// How many fixes in a row before we believe it.
    private let offRouteRunsBeforeReroute = 3
    /// Within this of the destination, the trip is done.
    private let arrivalMetres: CLLocationDistance = 30

    /// Called when the driver has been off-route long enough to mean it.
    var onNeedsReroute: (() -> Void)?

    func start(route: Route, imperial: Bool) {
        self.route = route
        self.imperial = imperial

        cumulative = RouteGeometry.cumulativeDistances(route.coordinates)
        totalDistance = cumulative.last ?? 0
        totalSeconds = route.summary.durationMin * 60
        maneuverDistances = route.maneuvers.map { maneuver in
            maneuver.beginShapeIndex < cumulative.count ? cumulative[maneuver.beginShapeIndex] : totalDistance
        }

        shapeHint = 0
        announced.removeAll()
        offRouteRuns = 0
        hasArrived = false
        isActive = true
        progress = nil

        voice.activate()
        if let first = route.maneuvers.first {
            voice.say(first.verbal ?? first.instruction)
        }
    }

    func setMuted(_ muted: Bool) {
        voice.isMuted = muted
    }

    func stop() {
        isActive = false
        progress = nil
        route = nil
        voice.deactivate()
    }

    /// Feed a fix in. Returns nothing; read `progress` afterwards.
    func update(with coordinate: CLLocationCoordinate2D, accuracy: CLLocationAccuracy) {
        guard isActive, let route, route.coordinates.count > 1 else { return }
        guard let snap = RouteGeometry.snap(coordinate, to: route.coordinates, hint: shapeHint) else { return }

        shapeHint = snap.index

        let travelled = RouteGeometry.distanceAlong(snap, path: route.coordinates, cumulative: cumulative)
        let remaining = max(0, totalDistance - travelled)

        // The upcoming maneuver is the first still ahead. The 5 m tolerance
        // stops the step flapping while sitting in the intersection itself.
        var stepIndex = max(0, route.maneuvers.count - 1)
        for (i, distance) in maneuverDistances.enumerated() where distance > travelled + 5 {
            stepIndex = i
            break
        }

        let toManeuver = stepIndex < maneuverDistances.count
            ? max(0, maneuverDistances[stepIndex] - travelled)
            : 0

        // Scale the plan's remaining time by progress, so a slow driver's ETA
        // drifts out instead of staying pinned to Valhalla's first guess.
        let fraction = totalDistance > 0 ? travelled / totalDistance : 0

        // GPS accuracy varies wildly; a wide fix should not trigger a reroute.
        let offRouteLimit = max(offRouteMetres, accuracy * 1.5)
        let off = snap.distance > offRouteLimit
        offRouteRuns = off ? offRouteRuns + 1 : 0

        progress = NavProgress(
            stepIndex: stepIndex,
            distanceToManeuver: toManeuver,
            remainingDistance: remaining,
            remainingSeconds: totalSeconds * (1 - fraction),
            offRouteDistance: snap.distance,
            isOffRoute: off,
            snapped: snap.coordinate,
            course: RouteGeometry.course(of: route.coordinates, at: snap.index),
            fraction: min(1, max(0, fraction)),
            shapeIndex: snap.index
        )

        if remaining <= arrivalMetres, !hasArrived {
            hasArrived = true
            voice.say("You have arrived.")
            return
        }

        if offRouteRuns >= offRouteRunsBeforeReroute {
            offRouteRuns = 0
            announced.removeAll()
            voice.say("Rerouting.")
            onNeedsReroute?()
            return
        }

        if stepIndex < route.maneuvers.count {
            announce(route.maneuvers[stepIndex], distance: toManeuver)
        }
    }

    /// Distances at which a turn gets called.
    ///
    /// Ascending order matters: with a descending list every distance under
    /// 1600 m matches the 1600 m band first, that band is marked spoken, and
    /// the 800/250/60 m calls never fire — one announcement per turn instead
    /// of four.
    private static let announceBands: [CLLocationDistance] = [60, 250, 800, 1600]

    private func announce(_ maneuver: Maneuver, distance: CLLocationDistance) {
        guard let band = Self.announceBands.first(where: { distance <= $0 }) else { return }

        let key = "\(maneuver.beginShapeIndex):\(Int(band))"
        guard !announced.contains(key) else { return }
        announced.insert(key)

        let spoken = maneuver.verbal ?? maneuver.instruction
        // Close in, the distance preamble is noise — "in 60 metres turn right"
        // arrives after you needed to be in the lane.
        if band <= 60 {
            voice.say(spoken)
        } else {
            voice.say("In \(Format.spokenDistance(band, imperial: imperial)), \(spoken.lowercasedFirst)")
        }
    }
}

extension String {
    var lowercasedFirst: String {
        guard let first else { return self }
        return first.lowercased() + dropFirst()
    }
}
