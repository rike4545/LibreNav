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
                recenterToken: model.recenterToken,
                fitRouteToken: model.fitRouteToken,
                onCenterChanged: { model.mapCenter = $0 },
                onLongPress: { model.dropDestination(at: $0) }
            )
            .ignoresSafeArea()

            header

            VStack {
                Spacer()
                SearchSheet(model: model)
            }
        }
        .task {
            model.location.requestAuthorization()
            model.location.start()
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
