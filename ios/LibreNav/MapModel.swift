import CoreLocation
import Observation
import SwiftUI

/// Everything the map screen needs to know, in one place.
///
/// Search and routing are cancellable tasks rather than fire-and-forget: typing
/// starts a request per keystroke otherwise, and a slow one landing after a
/// fast one would overwrite newer results with older.
@Observable
@MainActor
final class MapModel {
    var location = LocationProvider()

    var styleID = MapStyleOption.fallback.id
    var style: MapStyleOption { MapStyleOption.named(styleID) }

    var mapCenter = CLLocationCoordinate2D(latitude: 40.7128, longitude: -74.0060)

    var query = "" {
        didSet { scheduleSearch() }
    }
    private(set) var results: [Place] = []
    private(set) var isSearching = false

    var destination: Place?
    private(set) var route: Route?
    private(set) var isRouting = false
    private(set) var errorMessage: String?

    var mode: TravelMode = .auto {
        didSet { if destination != nil { requestRoute() } }
    }

    var recenterToken = 0
    var fitRouteToken = 0

    /// Turn-by-turn, once it is running.
    let nav = NavigationSession()
    var isNavigating: Bool { nav.isActive }
    var isMuted = false

    private let geocoder = Geocoder()
    private let router = ValhallaClient()
    private var searchTask: Task<Void, Never>?
    private var routeTask: Task<Void, Never>?
    /// The last fix fed to the session, so a reroute starts from where the
    /// driver actually is rather than where the trip began.
    private var lastFix: CLLocationCoordinate2D?

    init() {
        nav.onNeedsReroute = { [weak self] in
            self?.reroute()
        }
        location.onFix = { [weak self] coordinate, accuracy in
            self?.handleFix(coordinate, accuracy: accuracy)
        }
    }

    /// Where a route starts: the driver if we have them, the map if not, so
    /// the app is still useful before the first fix arrives.
    var origin: CLLocationCoordinate2D { location.coordinate ?? mapCenter }

    func recenter() {
        recenterToken += 1
    }

    func dropDestination(at coordinate: CLLocationCoordinate2D) {
        let name = String(format: "%.4f, %.4f", coordinate.latitude, coordinate.longitude)
        select(Place(id: name, name: "Dropped pin", label: name, coordinate: coordinate))
    }

    func select(_ place: Place) {
        destination = place
        query = ""
        results = []
        requestRoute()
    }

    func clearRoute() {
        routeTask?.cancel()
        stopNavigating()
        destination = nil
        route = nil
        errorMessage = nil
    }

    // MARK: - Navigation

    func startNavigating() {
        guard let route else { return }
        location.isNavigating = true
        nav.imperial = false
        nav.start(route: route, imperial: false)
    }

    func stopNavigating() {
        nav.stop()
        location.isNavigating = false
    }

    func toggleMute() {
        isMuted.toggle()
        nav.setMuted(isMuted)
    }

    /// A fix arrived. Drives the session, and the follow camera through it.
    func handleFix(_ coordinate: CLLocationCoordinate2D, accuracy: CLLocationAccuracy) {
        lastFix = coordinate
        guard nav.isActive else { return }
        nav.update(with: coordinate, accuracy: accuracy)
    }

    /// Re-ask Valhalla from the driver's current position, keeping the
    /// destination. The session restarts on the new line once it lands.
    private func reroute() {
        guard let destination else { return }
        let from = lastFix ?? origin
        routeTask?.cancel()

        routeTask = Task { [weak self] in
            guard let self else { return }
            do {
                let fresh = try await self.router.route(stops: [from, destination.coordinate], mode: self.mode)
                guard !Task.isCancelled else { return }
                self.route = fresh
                self.nav.start(route: fresh, imperial: false)
            } catch {
                // Keep guiding on the old line rather than dropping the driver
                // mid-trip; the next off-route run will try again.
                return
            }
        }
    }

    // MARK: - Search

    private func scheduleSearch() {
        searchTask?.cancel()
        let text = query

        guard text.trimmingCharacters(in: .whitespaces).count >= 2 else {
            results = []
            isSearching = false
            return
        }

        searchTask = Task { [weak self] in
            // Debounce: one request per pause, not per keystroke.
            try? await Task.sleep(for: .milliseconds(280))
            guard !Task.isCancelled, let self else { return }

            self.isSearching = true
            defer { self.isSearching = false }

            do {
                let found = try await self.geocoder.search(text, near: self.mapCenter)
                guard !Task.isCancelled else { return }
                self.results = found
            } catch {
                guard !Task.isCancelled else { return }
                self.results = []
            }
        }
    }

    // MARK: - Routing

    func requestRoute() {
        guard let destination else { return }
        routeTask?.cancel()
        errorMessage = nil

        let stops = [origin, destination.coordinate]
        let mode = mode

        routeTask = Task { [weak self] in
            guard let self else { return }
            self.isRouting = true
            defer { self.isRouting = false }

            do {
                let found = try await self.router.route(stops: stops, mode: mode)
                guard !Task.isCancelled else { return }
                self.route = found
                self.fitRouteToken += 1
            } catch is CancellationError {
                return
            } catch {
                guard !Task.isCancelled else { return }
                self.route = nil
                self.errorMessage = error.localizedDescription
            }
        }
    }
}
