import CoreLocation
import Foundation

struct ChargerSite: Identifiable, Equatable {
    let id: String
    let name: String
    let network: String
    let plugs: [String]
    /// Best power figure the tags offer, in kW. Nil when nothing said.
    let powerKw: Double?
    let coordinate: CLLocationCoordinate2D
    let address: String?
    let access: String?
    let fee: String?
    let capacity: Int?

    static func == (lhs: ChargerSite, rhs: ChargerSite) -> Bool { lhs.id == rhs.id }
}

/// Charging stations from OpenStreetMap, via Overpass.
///
/// Overpass is community infrastructure and any given mirror is regularly
/// overloaded, so this walks a list. The per-mirror deadline matters more than
/// it looks: a mirror that hangs is worse than one that returns 503, because
/// without a deadline the whole failover chain stalls behind it.
struct Overpass {
    /// Tried in order. The first is the main instance; the rest are community
    /// mirrors that pick up when it is saturated.
    static let mirrors = [
        URL(string: "https://overpass-api.de/api/interpreter")!,
        URL(string: "https://overpass.kumi.systems/api/interpreter")!,
        URL(string: "https://overpass.private.coffee/api/interpreter")!
    ]

    /// Give up on a mirror after this and try the next. Deliberately tight —
    /// the budget is cumulative, and a driver waiting a minute for charger pins
    /// has already put the phone down.
    static let mirrorTimeout: TimeInterval = 12

    var session: URLSession = .shared

    func chargers(near centre: CLLocationCoordinate2D, radiusKm: Double) async throws -> [ChargerSite] {
        let radius = Int(min(max(radiusKm, 1), 50) * 1000)
        let query = """
        [out:json][timeout:25];
        (
          node["amenity"="charging_station"](around:\(radius),\(String(format: "%.5f", centre.latitude)),\(String(format: "%.5f", centre.longitude)));
          way["amenity"="charging_station"](around:\(radius),\(String(format: "%.5f", centre.latitude)),\(String(format: "%.5f", centre.longitude)));
        );
        out center tags 200;
        """

        let elements = try await run(query)
        return elements
            .compactMap(Self.site(from:))
            .sorted {
                RouteGeometry.distance(centre, $0.coordinate) < RouteGeometry.distance(centre, $1.coordinate)
            }
    }

    private func run(_ query: String) async throws -> [[String: Any]] {
        var lastError: Error?

        for mirror in Self.mirrors {
            var request = URLRequest(url: mirror)
            request.httpMethod = "POST"
            request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
            request.httpBody = "data=\(query.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? query)"
                .data(using: .utf8)
            request.timeoutInterval = Self.mirrorTimeout

            do {
                let (data, response) = try await session.data(for: request)
                let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                guard (200..<300).contains(status) else {
                    lastError = OverpassError.badStatus(status)
                    continue
                }
                let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
                return (json?["elements"] as? [[String: Any]]) ?? []
            } catch {
                // Only the caller cancelling should stop the chain; a mirror
                // timing out is exactly what the next one is for.
                if Task.isCancelled { throw CancellationError() }
                lastError = error
            }
        }

        throw lastError ?? OverpassError.allMirrorsFailed
    }

    /// OSM tags in, a charger out. Nil when there is no usable position.
    static func site(from element: [String: Any]) -> ChargerSite? {
        let tags = element["tags"] as? [String: String] ?? [:]

        // A node carries its own position; a way carries the centroid Overpass
        // computed for it because of `out center`.
        let lat = element["lat"] as? Double ?? (element["center"] as? [String: Double])?["lat"]
        let lon = element["lon"] as? Double ?? (element["center"] as? [String: Double])?["lon"]
        guard let lat, let lon else { return nil }

        let type = element["type"] as? String ?? "node"
        let osmID = element["id"] as? Int ?? 0

        let plugs = socketLabels.compactMap { key, label -> String? in
            guard let value = tags[key], value != "no" else { return nil }
            return label
        }

        return ChargerSite(
            id: "\(type)/\(osmID)",
            name: tags["name"] ?? tags["operator"] ?? tags["brand"] ?? "Charging station",
            network: tags["network"] ?? tags["operator"] ?? tags["brand"] ?? "Unknown network",
            plugs: plugs.isEmpty ? ["Unlisted connector"] : plugs,
            powerKw: power(from: tags),
            coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lon),
            address: address(from: tags),
            access: tags["access"],
            fee: tags["fee"],
            capacity: tags["capacity"].flatMap(Int.init)
        )
    }

    /// Connector tags, in the order worth showing them.
    private static let socketLabels: [(String, String)] = [
        ("socket:type2", "Type 2"),
        ("socket:type2_cable", "Type 2 (tethered)"),
        ("socket:type2_combo", "CCS2"),
        ("socket:ccs", "CCS"),
        ("socket:chademo", "CHAdeMO"),
        ("socket:tesla_supercharger", "Supercharger"),
        ("socket:tesla_supercharger_ccs", "Supercharger CCS"),
        ("socket:tesla_destination", "Tesla Destination"),
        ("socket:type1", "Type 1"),
        ("socket:type1_combo", "CCS1"),
        ("socket:schuko", "Schuko")
    ]

    /// Power is tagged three different ways in the wild: a site-wide `charge`
    /// or `maxpower`, or a per-socket `socket:*:output`. Take the largest,
    /// since that is the figure a driver is choosing on.
    private static func power(from tags: [String: String]) -> Double? {
        let candidates = tags
            .filter { key, _ in
                key == "charge" || key == "maxpower" || (key.hasPrefix("socket:") && key.hasSuffix(":output"))
            }
            .compactMap { _, value -> Double? in
                // Values look like "50 kW", "150kw", or a bare number.
                let cleaned = value.lowercased().replacingOccurrences(of: "kw", with: "")
                return Double(cleaned.trimmingCharacters(in: .whitespaces))
            }
        return candidates.max()
    }

    private static func address(from tags: [String: String]) -> String? {
        let parts = [
            [tags["addr:housenumber"], tags["addr:street"]].compactMap { $0 }.joined(separator: " "),
            tags["addr:city"]
        ].compactMap { $0 }.filter { !$0.isEmpty }
        return parts.isEmpty ? nil : parts.joined(separator: ", ")
    }
}

enum OverpassError: LocalizedError {
    case badStatus(Int)
    case allMirrorsFailed

    var errorDescription: String? {
        switch self {
        case .badStatus(let code): return "Overpass returned HTTP \(code)."
        case .allMirrorsFailed: return "Every Overpass mirror failed to respond."
        }
    }
}
