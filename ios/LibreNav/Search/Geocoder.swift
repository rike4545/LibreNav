import CoreLocation
import Foundation

struct Place: Identifiable, Equatable {
    let id: String
    let name: String
    /// Everything under the name: street, city, country.
    let label: String
    let coordinate: CLLocationCoordinate2D

    static func == (lhs: Place, rhs: Place) -> Bool { lhs.id == rhs.id }
}

/// Photon, on Komoot's public instance — the same geocoder the web app uses.
/// Fair-use, no key.
struct Geocoder {
    var baseURL = URL(string: "https://photon.komoot.io")!
    var session: URLSession = .shared

    /// - Parameter near: biases results toward the map's current centre, which
    ///   is the difference between "Springfield" meaning the one down the road
    ///   and the one four states away.
    func search(_ query: String, near: CLLocationCoordinate2D?, limit: Int = 8) async throws -> [Place] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 2 else { return [] }

        var components = URLComponents(url: baseURL.appendingPathComponent("api"), resolvingAgainstBaseURL: false)!
        var items = [
            URLQueryItem(name: "q", value: trimmed),
            URLQueryItem(name: "limit", value: String(limit))
        ]
        if let near {
            items.append(URLQueryItem(name: "lat", value: String(near.latitude)))
            items.append(URLQueryItem(name: "lon", value: String(near.longitude)))
        }
        components.queryItems = items

        let (data, _) = try await session.data(from: components.url!)
        guard
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let features = json["features"] as? [[String: Any]]
        else { return [] }

        return features.compactMap(Self.place(from:))
    }

    /// GeoJSON in, one row of a result list out.
    static func place(from feature: [String: Any]) -> Place? {
        guard
            let geometry = feature["geometry"] as? [String: Any],
            let coords = geometry["coordinates"] as? [Double], coords.count >= 2
        else { return nil }

        let props = feature["properties"] as? [String: Any] ?? [:]
        let name = props["name"] as? String
            ?? [props["street"] as? String, props["housenumber"] as? String]
                .compactMap { $0 }.joined(separator: " ")
        guard !name.isEmpty else { return nil }

        // Photon has no stable id across queries; the position is what makes a
        // row distinct, and it is also what dedupes two spellings of one place.
        let id = props["osm_id"].map { "\($0)" } ?? "\(coords[1]),\(coords[0])"
        let label = [props["city"] as? String, props["state"] as? String, props["country"] as? String]
            .compactMap { $0 }
            .joined(separator: " · ")

        return Place(
            id: id,
            name: name,
            label: label,
            coordinate: CLLocationCoordinate2D(latitude: coords[1], longitude: coords[0])
        )
    }
}
