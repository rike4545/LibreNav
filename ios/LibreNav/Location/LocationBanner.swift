import SwiftUI

/// Shown when location has been declined.
///
/// Without this the app is silently half-useless: no puck, and every route
/// starts from wherever the map happens to be centred rather than from the
/// driver. iOS will not re-prompt after a refusal, so the only honest thing to
/// do is say what is missing and open the one place it can be changed.
struct LocationBanner: View {
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "location.slash.fill")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(.orange)

            VStack(alignment: .leading, spacing: 2) {
                Text("Location is off")
                    .font(.subheadline.weight(.semibold))
                Text("Routes start from the map instead of from you.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)

            Button("Settings") {
                guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
                UIApplication.shared.open(url)
            }
            .font(.subheadline.weight(.semibold))
            .buttonStyle(.bordered)
            .buttonBorderShape(.capsule)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .padding(.horizontal, 12)
        .shadow(color: .black.opacity(0.14), radius: 12, y: 4)
    }
}
