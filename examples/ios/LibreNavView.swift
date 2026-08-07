import CoreLocation
import SwiftUI
import WebKit

/// Embeds LibreNav in a SwiftUI app via WKWebView.
///
/// The web app runs unchanged; this only supplies the host side of the bridge.
/// Commands go in through `evaluateJavaScript`, events come back on a script
/// message handler — WKWebView has no usable parent frame, so the ordinary
/// `window.parent.postMessage` path browsers use does not apply here.
///
/// Two things bite if they are missed:
///
/// 1. **Location.** WKWebView only grants `navigator.geolocation` when the host
///    app itself holds location permission, so the app must request it and
///    Info.plist must carry `NSLocationWhenInUseUsageDescription`. Without both,
///    LibreNav loads but never gets a fix and navigation cannot start.
/// 2. **Voice.** Speech synthesis is silenced by the ring/silent switch unless
///    the audio session is configured for playback. See `configureAudio()`.

// MARK: - Events from LibreNav

public enum LibreNavEvent {
    case ready
    case route(distanceKm: Double, durationMin: Double, eta: Date?, stops: Int)
    case progress(remainingKm: Double, remainingMin: Double, eta: Date?, speedKmh: Double?, fraction: Double)
    case arrived
    case cancelled
    case error(message: String)
}

// MARK: - Commands to LibreNav

public struct LibreNavStop {
    public let latitude: Double
    public let longitude: Double
    public let name: String?

    public init(latitude: Double, longitude: Double, name: String? = nil) {
        self.latitude = latitude
        self.longitude = longitude
        self.name = name
    }
}

public final class LibreNavController: ObservableObject {
    fileprivate weak var webView: WKWebView?

    public init() {}

    /// Route through the given stops. The first is the origin, the last the
    /// destination; anything between is a via.
    public func navigate(stops: [LibreNavStop], autostart: Bool = false) {
        let payload = stops.map { stop -> [String: Any] in
            var dict: [String: Any] = ["lat": stop.latitude, "lng": stop.longitude]
            if let name = stop.name { dict["name"] = name }
            return dict
        }
        send(["type": "librenav:navigate", "stops": payload, "autostart": autostart])
    }

    public func cancel() { send(["type": "librenav:cancel"]) }

    public func recenter() { send(["type": "librenav:recenter"]) }

    /// Hand over the vehicle the host already knows about, so the driver does
    /// not re-enter it. Any subset of the fields is accepted.
    public func setVehicle(batteryKwh: Double? = nil,
                           consumptionKwh100km: Double? = nil,
                           socPercent: Double? = nil,
                           reservePercent: Double? = nil) {
        var vehicle: [String: Any] = [:]
        if let value = batteryKwh { vehicle["batteryKwh"] = value }
        if let value = consumptionKwh100km { vehicle["consumptionKwh100km"] = value }
        if let value = socPercent { vehicle["socPercent"] = value }
        if let value = reservePercent { vehicle["reservePercent"] = value }
        send(["type": "librenav:setVehicle", "vehicle": vehicle])
    }

    public func setUnits(imperial: Bool) {
        send(["type": "librenav:setUnits", "imperial": imperial])
    }

    private func send(_ message: [String: Any]) {
        guard let webView,
              let data = try? JSONSerialization.data(withJSONObject: message),
              let json = String(data: data, encoding: .utf8)
        else { return }

        // Delivered to the page's own message listener. Origin is '*' because
        // the page and the host share a process here; LibreNav still validates
        // the payload shape before acting on it.
        webView.evaluateJavaScript("window.postMessage(\(json), '*')")
    }
}

// MARK: - View

public struct LibreNavView: UIViewRepresentable {
    private let url: URL
    private let controller: LibreNavController
    private let onEvent: (LibreNavEvent) -> Void

    /// - Parameter baseURL: where LibreNav is hosted.
    public init(baseURL: URL = URL(string: "https://rike4545.github.io/LibreNav/")!,
                controller: LibreNavController,
                onEvent: @escaping (LibreNavEvent) -> Void) {
        // embed=1 hides the chrome the host app provides for itself.
        var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)!
        var items = components.queryItems ?? []
        items.append(URLQueryItem(name: "embed", value: "1"))
        components.queryItems = items

        self.url = components.url ?? baseURL
        self.controller = controller
        self.onEvent = onEvent
    }

    public func makeCoordinator() -> Coordinator { Coordinator(onEvent: onEvent) }

    public func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.add(context.coordinator, name: "librenav")

        // Voice guidance is audio playback; without these it is muted or
        // requires a tap that a driver should not have to make.
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.uiDelegate = context.coordinator
        webView.navigationDelegate = context.coordinator
        webView.scrollView.bounces = false
        // The map handles its own gestures; page-level zoom fights it.
        webView.scrollView.pinchGestureRecognizer?.isEnabled = false

        controller.webView = webView
        webView.load(URLRequest(url: url))
        return webView
    }

    public func updateUIView(_ webView: WKWebView, context: Context) {
        controller.webView = webView
    }

    public final class Coordinator: NSObject, WKScriptMessageHandler, WKUIDelegate, WKNavigationDelegate {
        private let onEvent: (LibreNavEvent) -> Void
        private let isoFormatter = ISO8601DateFormatter()

        init(onEvent: @escaping (LibreNavEvent) -> Void) {
            self.onEvent = onEvent
            super.init()
            isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        }

        public func userContentController(_ controller: WKUserContentController,
                                          didReceive message: WKScriptMessage) {
            guard let body = message.body as? [String: Any],
                  let type = body["type"] as? String
            else { return }

            let eta = (body["etaIso"] as? String).flatMap { isoFormatter.date(from: $0) }

            switch type {
            case "librenav:ready":
                onEvent(.ready)
            case "librenav:route":
                onEvent(.route(distanceKm: body["distanceKm"] as? Double ?? 0,
                               durationMin: body["durationMin"] as? Double ?? 0,
                               eta: eta,
                               stops: body["stops"] as? Int ?? 0))
            case "librenav:progress":
                onEvent(.progress(remainingKm: body["remainingKm"] as? Double ?? 0,
                                  remainingMin: body["remainingMin"] as? Double ?? 0,
                                  eta: eta,
                                  speedKmh: body["speedKmh"] as? Double,
                                  fraction: body["fraction"] as? Double ?? 0))
            case "librenav:arrived":
                onEvent(.arrived)
            case "librenav:cancelled":
                onEvent(.cancelled)
            case "librenav:error":
                onEvent(.error(message: body["message"] as? String ?? "Unknown error"))
            default:
                break
            }
        }

        /// Grant the page's geolocation request. WKWebView still gates this on
        /// the *app* holding location permission, so requesting it up front (see
        /// `LibreNavLocationGate`) is what actually makes this succeed.
        public func webView(_ webView: WKWebView,
                            requestGeolocationPermissionFor origin: WKSecurityOrigin,
                            initiatedByFrame frame: WKFrameInfo,
                            decisionHandler: @escaping (WKPermissionDecision) -> Void) {
            decisionHandler(.grant)
        }
    }
}

// MARK: - Location and audio setup

/// Requests location before showing LibreNav.
///
/// WKWebView will not hand `navigator.geolocation` to the page unless the host
/// app already has permission, and the failure is silent from the web side —
/// the app simply never gets a fix.
public final class LibreNavLocationGate: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published public private(set) var authorized = false
    private let manager = CLLocationManager()

    public override init() {
        super.init()
        manager.delegate = self
    }

    public func request() {
        manager.requestWhenInUseAuthorization()
    }

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            authorized = true
        default:
            authorized = false
        }
    }
}

import AVFoundation

/// Let voice guidance play even with the ring/silent switch set to silent, and
/// duck rather than stop whatever else is playing.
public func configureAudioForGuidance() {
    try? AVAudioSession.sharedInstance().setCategory(
        .playback,
        mode: .voicePrompt,
        options: [.duckOthers, .mixWithOthers]
    )
    try? AVAudioSession.sharedInstance().setActive(true)
}
