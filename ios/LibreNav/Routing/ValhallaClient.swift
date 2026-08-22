import CoreLocation
import Foundation

enum RoutingError: LocalizedError {
    case tooFewStops
    case unreachable
    case service(String)
    case noRoute

    var errorDescription: String? {
        switch self {
        case .tooFewStops: return "A route needs at least an origin and a destination."
        case .unreachable: return "Could not reach the routing service. Check your connection."
        case .service(let message): return message
        case .noRoute: return "No route found between these stops."
        }
    }
}

/// Valhalla, on the public FOSSGIS instance the web app uses. Fair-use, no key.
struct ValhallaClient {
    var baseURL = URL(string: "https://valhalla1.openstreetmap.de")!
    var session: URLSession = .shared

    func route(stops: [CLLocationCoordinate2D], mode: TravelMode) async throws -> Route {
        guard stops.count >= 2 else { throw RoutingError.tooFewStops }

        let locations = stops.enumerated().map { index, stop -> [String: Any] in
            [
                "lat": stop.latitude,
                "lon": stop.longitude,
                // Intermediate stops are break_through so Valhalla emits a
                // per-leg arrival rather than routing straight past them.
                "type": (index == 0 || index == stops.count - 1) ? "break" : "break_through"
            ]
        }

        let body: [String: Any] = [
            "locations": locations,
            "costing": mode.rawValue,
            "directions_options": ["units": "kilometers"],
            // Valhalla only offers alternates on a two-point route.
            "alternates": stops.count == 2 ? 2 : 0
        ]

        var request = URLRequest(url: baseURL.appendingPathComponent("route"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            // URLSession reports a cancelled task as URLError, not
            // CancellationError, so ask the task rather than the error.
            if Task.isCancelled { throw CancellationError() }
            throw RoutingError.unreachable
        }

        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0

        // Valhalla explains itself in the body even on a non-2xx, and that
        // message is far more useful than the status code alone.
        if let message = json?["error"] as? String {
            throw RoutingError.service(message)
        }
        guard (200..<300).contains(status), let json else {
            throw RoutingError.service("Routing failed (HTTP \(status)).")
        }
        guard let trip = json["trip"] as? [String: Any], let parsed = Self.parse(trip: trip) else {
            throw RoutingError.noRoute
        }
        return parsed
    }

    /// A Valhalla trip is a list of legs; the shape and maneuvers concatenate,
    /// with maneuver shape indices rebased onto the joined line.
    static func parse(trip: [String: Any]) -> Route? {
        guard let legs = trip["legs"] as? [[String: Any]], !legs.isEmpty else { return nil }

        var coordinates: [CLLocationCoordinate2D] = []
        var maneuvers: [Maneuver] = []

        for leg in legs {
            let offset = coordinates.count
            if let shape = leg["shape"] as? String {
                coordinates.append(contentsOf: Polyline.decode(shape))
            }
            for raw in (leg["maneuvers"] as? [[String: Any]]) ?? [] {
                let type = raw["type"] as? Int ?? 0
                let instruction = raw["instruction"] as? String ?? ""
                guard !instruction.isEmpty else { continue }
                maneuvers.append(
                    Maneuver(
                        kind: .from(valhallaType: type),
                        instruction: instruction,
                        verbal: raw["verbal_pre_transition_instruction"] as? String,
                        streetNames: raw["street_names"] as? [String] ?? [],
                        distanceKm: raw["length"] as? Double ?? 0,
                        durationMin: (raw["time"] as? Double ?? 0) / 60,
                        beginShapeIndex: offset + (raw["begin_shape_index"] as? Int ?? 0)
                    )
                )
            }
        }

        guard !coordinates.isEmpty else { return nil }

        let summary = trip["summary"] as? [String: Any]
        return Route(
            coordinates: coordinates,
            maneuvers: maneuvers,
            summary: RouteSummary(
                distanceKm: summary?["length"] as? Double ?? 0,
                durationMin: (summary?["time"] as? Double ?? 0) / 60,
                hasToll: summary?["has_toll"] as? Bool ?? false,
                hasFerry: summary?["has_ferry"] as? Bool ?? false
            )
        )
    }
}
