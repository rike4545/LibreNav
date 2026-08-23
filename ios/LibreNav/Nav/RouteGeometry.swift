import CoreLocation
import Foundation

/// Where on the route a position matched.
struct Snap {
    /// Index of the segment's first vertex.
    let index: Int
    /// How far along that segment, 0–1.
    let t: Double
    /// Perpendicular distance from the route, in metres.
    let distance: CLLocationDistance
    let coordinate: CLLocationCoordinate2D
}

enum RouteGeometry {
    static let earthRadius: Double = 6_371_008.8

    static func distance(_ a: CLLocationCoordinate2D, _ b: CLLocationCoordinate2D) -> CLLocationDistance {
        let lat1 = a.latitude * .pi / 180
        let lat2 = b.latitude * .pi / 180
        let dLat = lat2 - lat1
        let dLon = (b.longitude - a.longitude) * .pi / 180
        let h = sin(dLat / 2) * sin(dLat / 2)
            + cos(lat1) * cos(lat2) * sin(dLon / 2) * sin(dLon / 2)
        return 2 * earthRadius * asin(min(1, sqrt(h)))
    }

    /// Local flat-earth projection of `point` relative to `origin`, in metres.
    /// Good enough over the tens of metres a snap actually spans, and far
    /// cheaper than doing this properly on every GPS tick.
    private static func project(_ point: CLLocationCoordinate2D, from origin: CLLocationCoordinate2D) -> (Double, Double) {
        let scale = cos(origin.latitude * .pi / 180)
        let x = (point.longitude - origin.longitude) * .pi / 180 * earthRadius * scale
        let y = (point.latitude - origin.latitude) * .pi / 180 * earthRadius
        return (x, y)
    }

    /// Running distance to each vertex, so distance-along is a lookup rather
    /// than a walk of the whole line every tick.
    static func cumulativeDistances(_ path: [CLLocationCoordinate2D]) -> [CLLocationDistance] {
        var totals: [CLLocationDistance] = [0]
        totals.reserveCapacity(path.count)
        for i in 1..<max(path.count, 1) {
            totals.append(totals[i - 1] + distance(path[i - 1], path[i]))
        }
        return totals
    }

    /// Nearest point on the route to `point`.
    ///
    /// Scans a window around the last known vertex rather than the whole line:
    /// on a long route the full scan is thousands of segments per fix, and the
    /// driver only ever moves a little between fixes. The widen below is for
    /// when that assumption breaks — a tunnel exit, or the app resuming.
    static func snap(
        _ point: CLLocationCoordinate2D,
        to path: [CLLocationCoordinate2D],
        hint: Int = 0,
        window: Int = 60
    ) -> Snap? {
        guard path.count >= 2 else { return nil }

        let from = max(0, hint - 5)
        let to = min(path.count - 1, hint + window)
        var best: Snap?

        for i in from..<max(to, from + 1) where i + 1 < path.count {
            let a = path[i]
            let b = path[i + 1]
            let (px, py) = project(point, from: a)
            let (bx, by) = project(b, from: a)
            let lengthSquared = bx * bx + by * by

            let t = lengthSquared == 0 ? 0 : max(0, min(1, (px * bx + py * by) / lengthSquared))
            let dx = px - bx * t
            let dy = py - by * t
            let d = sqrt(dx * dx + dy * dy)

            if best == nil || d < best!.distance {
                best = Snap(
                    index: i,
                    t: t,
                    distance: d,
                    coordinate: CLLocationCoordinate2D(
                        latitude: a.latitude + (b.latitude - a.latitude) * t,
                        longitude: a.longitude + (b.longitude - a.longitude) * t
                    )
                )
            }
        }

        // A windowed scan can miss badly when the position jumps. Widen once.
        if let found = best, found.distance > 120, from > 0 || to < path.count - 1 {
            if let full = snap(point, to: path, hint: 0, window: path.count), full.distance < found.distance {
                return full
            }
        }

        return best
    }

    /// Metres from the route's start to a snapped position.
    static func distanceAlong(_ snap: Snap, path: [CLLocationCoordinate2D], cumulative: [CLLocationDistance]) -> CLLocationDistance {
        guard snap.index < cumulative.count, snap.index + 1 < path.count else { return 0 }
        let segment = distance(path[snap.index], path[snap.index + 1])
        return cumulative[snap.index] + segment * snap.t
    }

    /// Bearing of the road a little way ahead, smoothed over a few vertices so
    /// the follow camera does not jitter on every kink in the geometry.
    static func course(of path: [CLLocationCoordinate2D], at index: Int) -> CLLocationDirection? {
        let ahead = min(path.count - 1, index + 3)
        guard ahead > index else { return nil }

        let a = path[index]
        let b = path[ahead]
        let dLon = (b.longitude - a.longitude) * .pi / 180
        let lat1 = a.latitude * .pi / 180
        let lat2 = b.latitude * .pi / 180

        let y = sin(dLon) * cos(lat2)
        let x = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dLon)
        return (atan2(y, x) * 180 / .pi + 360).truncatingRemainder(dividingBy: 360)
    }
}
