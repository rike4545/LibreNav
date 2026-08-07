# Embedding LibreNav in a Swift app

`LibreNavView.swift` wraps the hosted LibreNav in a `WKWebView` and gives you a
typed bridge in both directions.

## Setup

**Info.plist** — without this the web view silently never receives a fix:

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Used to show your position and give turn-by-turn directions.</string>
```

Then request permission *before* presenting the view, and configure audio so
voice guidance is not muted by the ring/silent switch:

```swift
struct NavigationScreen: View {
    @StateObject private var gate = LibreNavLocationGate()
    @StateObject private var nav = LibreNavController()

    var body: some View {
        LibreNavView(controller: nav) { event in
            switch event {
            case .ready:
                nav.setUnits(imperial: true)
                nav.setVehicle(batteryKwh: 75, consumptionKwh100km: 17, socPercent: 82)
            case let .route(distanceKm, durationMin, eta, _):
                print("route \(distanceKm) km, \(durationMin) min, arriving \(eta as Any)")
            case let .progress(remainingKm, _, eta, _, _):
                print("\(remainingKm) km left, ETA \(eta as Any)")
            case .arrived:
                print("arrived")
            case .cancelled:
                print("driver cancelled")
            case let .error(message):
                print("librenav error: \(message)")
            }
        }
        .ignoresSafeArea()
        .onAppear {
            gate.request()
            configureAudioForGuidance()
        }
    }
}
```

Start a trip from your own UI:

```swift
nav.navigate(
    stops: [
        LibreNavStop(latitude: 40.7128, longitude: -74.0060, name: "Home"),
        LibreNavStop(latitude: 40.7580, longitude: -73.9855, name: "Times Square")
    ],
    autostart: true
)
```

## How the bridge works

Commands travel in through `evaluateJavaScript` and land on the page's own
`message` listener. Events come back on a script message handler named
`librenav` — `WKWebView` has no usable parent frame, so the `window.parent.postMessage`
route browsers use does not work here.

| Direction | Mechanism |
| --- | --- |
| Swift → LibreNav | `webView.evaluateJavaScript("window.postMessage(…)")` |
| LibreNav → Swift | `window.webkit.messageHandlers.librenav.postMessage(…)` |

Commands: `navigate`, `cancel`, `recenter`, `setVehicle`, `setUnits`.
Events: `ready`, `route`, `progress`, `arrived`, `cancelled`, `error`.

`?embed=1` is appended automatically, which hides the chrome your app supplies
itself. Initial state can also be passed purely in the URL (`?trip=…&autostart=1`),
which survives a cold start and a reload — useful if you would rather deep-link
than send a command.

## Worth knowing

- **Location is the usual failure.** `WKWebView` gates `navigator.geolocation`
  on the *app's* permission. If the app has not been granted it, LibreNav loads
  normally and simply never gets a fix, so navigation cannot start.
- **This file has not been compiled here.** It is written against the documented
  WebKit and AVFoundation APIs but was authored outside Xcode, so build it once
  and check the geolocation prompt and voice on a real device — the Simulator
  reports location differently and its audio session behaves differently too.
- **A `WKWebView` is not CarPlay.** CarPlay needs a native `CPTemplate`
  interface; a web view cannot be presented on the car screen.
