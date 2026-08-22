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
    /// Bumped to recentre on the driver without the camera fighting a drag.
    var recenterToken: Int
    /// Bumped to frame the whole route.
    var fitRouteToken: Int
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
        if map.style != nil {
            context.coordinator.applyRoute(to: map)
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
