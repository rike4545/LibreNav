import CoreLocation
import SwiftUI

struct ContentView: View {
    @State private var model = MapModel()
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        ZStack(alignment: .top) {
            MapView(
                styleURL: model.style.url(dark: colorScheme == .dark),
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
                    isMuted: model.isMuted,
                    onToggleMute: { model.toggleMute() },
                    onStop: { model.stopNavigating() }
                )
            } else {
                header

                VStack {
                    Spacer()
                    SearchSheet(model: model)
                }
            }
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

            Menu {
                Picker("Basemap", selection: $model.styleID) {
                    ForEach(MapStyleOption.all) { style in
                        Text(style.label).tag(style.id)
                    }
                }
            } label: {
                Image(systemName: "square.3.layers.3d")
                    .font(.system(size: 16, weight: .semibold))
                    .frame(width: 40, height: 40)
                    .background(.regularMaterial, in: Circle())
            }

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
