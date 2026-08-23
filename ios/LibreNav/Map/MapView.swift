import CoreLocation
import MapLibre
import SwiftUI

/// MapLibre Native, wrapped for SwiftUI.
///
/// The route lives in a source and layer added once and updated in place.
/// Removing and re-adding them on every route change makes the line blink and
/// costs a style reload; setting the shape on the existing source does not.
struct MapView: UIViewRepresentable {
    var styleURL: URL
    /// Where to open the camera before there is a fix to follow.
    var initialCenter: CLLocationCoordinate2D
    var route: [CLLocationCoordinate2D]
    var destination: CLLocationCoordinate2D?
    var userCoordinate: CLLocationCoordinate2D?
    /// While guiding: the position snapped to the road, and the road's bearing.
    var navSnapped: CLLocationCoordinate2D?
    var navCourse: CLLocationDirection?
    var isNavigating: Bool
    /// Bumped to recentre on the driver without the camera fighting a drag.
    var recenterToken: Int
    /// Bumped to frame the whole route.
    var fitRouteToken: Int
    /// Bumped when the route itself changes, so the line is only rebuilt then.
    var routeToken: Int
    var onCenterChanged: (CLLocationCoordinate2D) -> Void
    var onLongPress: (CLLocationCoordinate2D) -> Void

    private static let routeSourceID = "route-src"
    private static let routeLayerID = "route-line"
    private static let routeCasingID = "route-casing"

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> MLNMapView {
        let map = MLNMapView(frame: .zero, styleURL: styleURL)
        map.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        // Without this the camera opens on the whole globe, which is not a
        // useful first frame for a navigation app.
        map.setCenter(userCoordinate ?? initialCenter, zoomLevel: 12, animated: false)
        map.delegate = context.coordinator
        map.showsUserLocation = true
        map.logoView.isHidden = false
        map.attributionButton.isHidden = false
        map.compassView.compassVisibility = .adaptive

        let press = UILongPressGestureRecognizer(
            target: context.coordinator,
            action: #selector(Coordinator.handleLongPress(_:))
        )
        map.addGestureRecognizer(press)

        return map
    }

    func updateUIView(_ map: MLNMapView, context: Context) {
        context.coordinator.parent = self

        if map.styleURL != styleURL {
            map.styleURL = styleURL
        }

        // The style has to be loaded before a source can be attached to it; a
        // style swap re-runs this through the delegate callback instead.
        //
        // Gated on the token because updateUIView runs on every SwiftUI pass,
        // which while guiding is once per GPS fix. Rebuilding an
        // MLNPolylineFeature from a few hundred coordinates every second, for
        // a line that has not changed, is pure waste.
        if map.style != nil, context.coordinator.appliedRouteToken != routeToken {
            context.coordinator.appliedRouteToken = routeToken
            context.coordinator.applyRoute(to: map)
        }

        // The follow camera: tilted, turned to the road ahead, and holding the
        // driver low in the frame so the space goes to what is coming rather
        // than what is behind. Driven off the snapped position so the camera
        // rides the road instead of the raw fix wandering beside it.
        if isNavigating, let snapped = navSnapped {
            let heading = navCourse ?? map.camera.heading

            // Fixes arrive about once a second at navigation accuracy. A 0.9s
            // animation restarted on each one never finishes, which costs work
            // continuously and reads as jitter; and standing at a light there
            // is nothing to animate towards at all. So move only when the
            // camera would actually go somewhere, and animate over roughly the
            // gap between fixes so the motion completes.
            let moved = context.coordinator.lastCameraCentre.map {
                RouteGeometry.distance($0, snapped)
            } ?? .greatestFiniteMagnitude
            let turned = context.coordinator.lastCameraHeading.map {
                abs(($0 - heading).truncatingRemainder(dividingBy: 360))
            } ?? .greatestFiniteMagnitude

            if moved > 2 || turned > 2 {
                context.coordinator.lastCameraCentre = snapped
                context.coordinator.lastCameraHeading = heading
                map.setCamera(
                    MLNMapCamera(lookingAtCenter: snapped, altitude: 600, pitch: 55, heading: heading),
                    withDuration: 1.0,
                    animationTimingFunction: CAMediaTimingFunction(name: .linear),
                    edgePadding: UIEdgeInsets(top: 260, left: 0, bottom: 40, right: 0),
                    completionHandler: nil
                )
            }
        }

        if context.coordinator.appliedRecenterToken != recenterToken {
            context.coordinator.appliedRecenterToken = recenterToken
            if let userCoordinate {
                map.setCenter(userCoordinate, zoomLevel: max(map.zoomLevel, 15), animated: true)
            }
        }

        if context.coordinator.appliedFitToken != fitRouteToken, route.count > 1 {
            context.coordinator.appliedFitToken = fitRouteToken
            let bounds = Self.bounds(of: route)
            map.setVisibleCoordinateBounds(
                bounds,
                edgePadding: UIEdgeInsets(top: 80, left: 40, bottom: 320, right: 40),
                animated: true,
                completionHandler: nil
            )
        }
    }

    static func bounds(of coordinates: [CLLocationCoordinate2D]) -> MLNCoordinateBounds {
        var minLat = 90.0, maxLat = -90.0, minLon = 180.0, maxLon = -180.0
        for c in coordinates {
            minLat = min(minLat, c.latitude);  maxLat = max(maxLat, c.latitude)
            minLon = min(minLon, c.longitude); maxLon = max(maxLon, c.longitude)
        }
        return MLNCoordinateBounds(
            sw: CLLocationCoordinate2D(latitude: minLat, longitude: minLon),
            ne: CLLocationCoordinate2D(latitude: maxLat, longitude: maxLon)
        )
    }

    final class Coordinator: NSObject, MLNMapViewDelegate {
        var parent: MapView
        var appliedRecenterToken = 0
        var appliedFitToken = 0
        var appliedRouteToken = -1
        var lastCameraCentre: CLLocationCoordinate2D?
        var lastCameraHeading: CLLocationDirection?

        init(_ parent: MapView) {
            self.parent = parent
        }

        @objc func handleLongPress(_ gesture: UILongPressGestureRecognizer) {
            guard gesture.state == .began, let map = gesture.view as? MLNMapView else { return }
            let point = gesture.location(in: map)
            parent.onLongPress(map.convert(point, toCoordinateFrom: map))
        }

        func mapView(_ mapView: MLNMapView, didFinishLoading style: MLNStyle) {
            // A style swap drops every source and layer with it, so the route
            // has to be reinstalled each time rather than only once at start.
            // This path ignores the token deliberately: the line is genuinely
            // gone from the new style even though the route never changed.
            applyRoute(to: mapView)
        }

        func mapView(_ mapView: MLNMapView, regionDidChangeAnimated animated: Bool) {
            parent.onCenterChanged(mapView.centerCoordinate)
        }

        func applyRoute(to map: MLNMapView) {
            guard let style = map.style else { return }

            let coordinates = parent.route
            guard coordinates.count > 1 else {
                // Emptying the shape keeps the layers in place for next time.
                if let source = style.source(withIdentifier: MapView.routeSourceID) as? MLNShapeSource {
                    source.shape = nil
                }
                return
            }

            let polyline = MLNPolylineFeature(coordinates: coordinates, count: UInt(coordinates.count))

            if let source = style.source(withIdentifier: MapView.routeSourceID) as? MLNShapeSource {
                source.shape = polyline
                return
            }

            let source = MLNShapeSource(identifier: MapView.routeSourceID, shape: polyline, options: nil)
            style.addSource(source)

            // Casing under the line, so the route reads against a busy basemap.
            let casing = MLNLineStyleLayer(identifier: MapView.routeCasingID, source: source)
            casing.lineColor = NSExpression(forConstantValue: UIColor.white)
            casing.lineWidth = NSExpression(forConstantValue: 11)
            casing.lineCap = NSExpression(forConstantValue: "round")
            casing.lineJoin = NSExpression(forConstantValue: "round")
            style.addLayer(casing)

            let line = MLNLineStyleLayer(identifier: MapView.routeLayerID, source: source)
            line.lineColor = NSExpression(forConstantValue: UIColor(red: 0.22, green: 0.60, blue: 0.95, alpha: 1))
            line.lineWidth = NSExpression(forConstantValue: 7)
            line.lineCap = NSExpression(forConstantValue: "round")
            line.lineJoin = NSExpression(forConstantValue: "round")
            style.addLayer(line)
        }
    }
}
