import CoreLocation
import SwiftUI

struct ContentView: View {
    @State private var model = MapModel()
    @State private var showingSettings = false
    @Environment(\.colorScheme) private var colorScheme

    private var isDark: Bool { model.prefersDark(systemIsDark: colorScheme == .dark) }

    var body: some View {
        ZStack(alignment: .top) {
            MapView(
                styleURL: model.style.url(dark: isDark),
                initialCenter: model.mapCenter,
                route: model.route?.coordinates ?? [],
                destination: model.destination?.coordinate,
                userCoordinate: model.location.coordinate,
                navSnapped: model.nav.progress?.snapped,
                navCourse: model.nav.progress?.course,
                isNavigating: model.isNavigating,
                recenterToken: model.recenterToken,
                fitRouteToken: model.fitRouteToken,
                routeToken: model.routeToken,
                onCenterChanged: { model.mapCenter = $0 },
                onLongPress: { model.dropDestination(at: $0) }
            )
            .ignoresSafeArea()

            if model.isNavigating, let route = model.route {
                NavPanel(
                    route: route,
                    progress: model.nav.progress,
                    imperial: model.preferences.imperial,
                    isMuted: model.isMuted,
                    onToggleMute: { model.toggleMute() },
                    onStop: { model.stopNavigating() }
                )
            } else {
                VStack(spacing: 10) {
                    header
                    if model.location.isDenied {
                        LocationBanner()
                    }
                }

                VStack {
                    Spacer()
                    SearchSheet(model: model)
                }
            }
        }
        .preferredColorScheme(model.preferences.theme.colorScheme)
        .sheet(isPresented: $showingSettings) {
            SettingsSheet(preferences: model.preferences)
        }
        .task {
            model.location.requestAuthorization()
            model.location.start()
        }
        .alert("You have arrived", isPresented: .init(
            get: { model.nav.hasArrived },
            set: { if !$0 { model.stopNavigating() } }
        )) {
            Button("Done") { model.stopNavigating() }
        } message: {
            Text(model.destination?.name ?? "")
        }
    }

    private var header: some View {
        HStack(spacing: 10) {
            Label("LibreNav", systemImage: "location.north.circle.fill")
                .font(.subheadline.weight(.semibold))
                .labelStyle(.titleAndIcon)
                .padding(.horizontal, 14)
                .padding(.vertical, 9)
                .background(.regularMaterial, in: Capsule())

            Spacer()

            Button {
                showingSettings = true
            } label: {
                Image(systemName: "slider.horizontal.3")
                    .font(.system(size: 16, weight: .semibold))
                    .frame(width: 40, height: 40)
                    .background(.regularMaterial, in: Circle())
            }
            .accessibilityLabel("Settings")

            Button {
                model.recenter()
            } label: {
                Image(systemName: "location.fill")
                    .font(.system(size: 15, weight: .semibold))
                    .frame(width: 40, height: 40)
                    .background(.regularMaterial, in: Circle())
            }
            .accessibilityLabel("Recentre on me")
        }
        .padding(.horizontal, 16)
    }
}

#Preview {
    ContentView()
}
