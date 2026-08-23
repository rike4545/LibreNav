import CoreLocation
import Observation

/// The driver's position, permission state, and nothing else.
///
/// Deliberately not a singleton: SwiftUI owns the lifetime, so the delegate
/// stops when the view does. Navigation raises the accuracy and asks for
/// background updates; browsing the map does not need either and should not
/// pay for them in battery.
@Observable
final class LocationProvider: NSObject, CLLocationManagerDelegate {
    private(set) var coordinate: CLLocationCoordinate2D?
    private(set) var course: CLLocationDirection?
    private(set) var speedMetersPerSecond: CLLocationSpeed?
    private(set) var authorization: CLAuthorizationStatus = .notDetermined
    private(set) var accuracy: CLLocationAccuracy = -1

    /// Every fix, for whoever is driving turn-by-turn off it.
    var onFix: ((CLLocationCoordinate2D, CLLocationAccuracy) -> Void)?

    /// True once the user has said yes to something, either level.
    var isAuthorized: Bool {
        authorization == .authorizedWhenInUse || authorization == .authorizedAlways
    }

    /// Set while turn-by-turn is running.
    var isNavigating = false {
        didSet {
            applyAccuracy()
            // Guidance has to keep arriving with the screen off. Asking for
            // this outside navigation would be a battery cost with no payoff.
            manager.allowsBackgroundLocationUpdates = isNavigating
            manager.pausesLocationUpdatesAutomatically = !isNavigating
        }
    }

    private let manager = CLLocationManager()

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
        authorization = manager.authorizationStatus
    }

    func requestAuthorization() {
        manager.requestWhenInUseAuthorization()
    }

    func start() {
        guard isAuthorized else {
            requestAuthorization()
            return
        }
        applyAccuracy()
        manager.startUpdatingLocation()
        manager.startUpdatingHeading()
    }

    func stop() {
        manager.stopUpdatingLocation()
        manager.stopUpdatingHeading()
    }

    private func applyAccuracy() {
        // Best accuracy only while it is being used to say "turn here".
        manager.desiredAccuracy = isNavigating
            ? kCLLocationAccuracyBestForNavigation
            : kCLLocationAccuracyNearestTenMeters
        manager.distanceFilter = isNavigating ? kCLDistanceFilterNone : 10
    }

    // MARK: - CLLocationManagerDelegate

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        authorization = manager.authorizationStatus
        if isAuthorized { start() }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let latest = locations.last else { return }
        coordinate = latest.coordinate
        accuracy = latest.horizontalAccuracy
        // A negative course means CoreLocation has no fix on heading yet —
        // usually because the device is stationary. Keeping the last good one
        // is better than spinning the puck to north.
        if latest.course >= 0 { course = latest.course }
        speedMetersPerSecond = latest.speed >= 0 ? latest.speed : nil
        onFix?(latest.coordinate, latest.horizontalAccuracy)
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // A transient failure is normal in a tunnel or a car park; the last
        // known position stays on screen rather than the puck vanishing.
    }
}
