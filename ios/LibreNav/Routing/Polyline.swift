import CoreLocation

/// Google's encoded-polyline format, at Valhalla's precision.
///
/// Valhalla encodes shapes at six decimal places rather than the five the
/// original format assumed, so the divisor is 1e6. Decoding at 1e5 does not
/// fail — it silently returns a route compressed into a tenth of its extent,
/// somewhere off the coast of wherever you meant to go.
enum Polyline {
    static func decode(_ encoded: String, precision: Double = 1e6) -> [CLLocationCoordinate2D] {
        var coordinates: [CLLocationCoordinate2D] = []
        var index = encoded.startIndex
        var lat = 0
        var lng = 0

        func nextValue() -> Int? {
            var result = 0
            var shift = 0
            while index < encoded.endIndex {
                guard let ascii = encoded[index].asciiValue else { return nil }
                index = encoded.index(after: index)
                let chunk = Int(ascii) - 63
                result |= (chunk & 0x1F) << shift
                shift += 5
                if chunk < 0x20 {
                    // The low bit is the sign, and the rest is the magnitude.
                    return (result & 1) != 0 ? ~(result >> 1) : (result >> 1)
                }
            }
            return nil
        }

        while index < encoded.endIndex {
            guard let dLat = nextValue(), let dLng = nextValue() else { break }
            lat += dLat
            lng += dLng
            coordinates.append(
                CLLocationCoordinate2D(
                    latitude: Double(lat) / precision,
                    longitude: Double(lng) / precision
                )
            )
        }

        return coordinates
    }
}
