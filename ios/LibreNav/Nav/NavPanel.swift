import SwiftUI

/// The turn banner and trip strip shown while guidance is running.
///
/// Deliberately the loudest thing on screen: at speed the driver gets a glance,
/// so the distance and the maneuver icon carry the message and everything else
/// is secondary.
struct NavPanel: View {
    let route: Route
    let progress: NavProgress?
    let isMuted: Bool
    let onToggleMute: () -> Void
    let onStop: () -> Void

    private var step: Maneuver? {
        guard let progress, progress.stepIndex < route.maneuvers.count else {
            return route.maneuvers.first
        }
        return route.maneuvers[progress.stepIndex]
    }

    private var following: Maneuver? {
        guard let progress, progress.stepIndex + 1 < route.maneuvers.count else { return nil }
        return route.maneuvers[progress.stepIndex + 1]
    }

    /// Inside this distance the turn is imminent and the banner says so.
    private var isImminent: Bool {
        (progress?.distanceToManeuver ?? .greatestFiniteMagnitude) < 150
    }

    var body: some View {
        VStack(spacing: 10) {
            banner
            Spacer()
            tripStrip
        }
    }

    private var banner: some View {
        HStack(spacing: 16) {
            Image(systemName: step?.kind.symbolName ?? "arrow.up")
                .font(.system(size: 34, weight: .semibold))
                .foregroundStyle(isImminent ? Color.white : Color.accentColor)
                .frame(width: 66, height: 66)
                .background(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .fill(isImminent ? Color.accentColor : Color.accentColor.opacity(0.14))
                )

            VStack(alignment: .leading, spacing: 4) {
                if let progress {
                    Text(Format.distanceM(progress.distanceToManeuver))
                        .font(.system(size: 30, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                }
                Text(step?.instruction ?? "Starting…")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)
        }
        .padding(16)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
        .overlay(alignment: .bottom) {
            if let following, isImminent {
                Text("then \(following.instruction)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 5)
                    .background(.thinMaterial, in: Capsule())
                    .offset(y: 16)
            }
        }
        .padding(.horizontal, 12)
        .shadow(color: .black.opacity(0.16), radius: 14, y: 5)
    }

    private var tripStrip: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 1) {
                Text(Format.eta(progress?.remainingSeconds ?? route.summary.durationMin * 60))
                    .font(.title3.weight(.semibold))
                    .monospacedDigit()
                Text("arrival")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            Divider().frame(height: 30)

            VStack(alignment: .leading, spacing: 1) {
                Text(Format.duration((progress?.remainingSeconds ?? 0) / 60))
                    .font(.subheadline.weight(.medium))
                    .monospacedDigit()
                Text(Format.distance((progress?.remainingDistance ?? 0) / 1000))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }

            Spacer()

            Button(action: onToggleMute) {
                Image(systemName: isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                    .font(.system(size: 15, weight: .semibold))
                    .frame(width: 42, height: 42)
                    .background(.thinMaterial, in: Circle())
            }
            .accessibilityLabel(isMuted ? "Unmute guidance" : "Mute guidance")

            Button(action: onStop) {
                Text("End")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 12)
                    .background(Color.red, in: Capsule())
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
        .padding(.horizontal, 12)
        .padding(.bottom, 10)
        .shadow(color: .black.opacity(0.16), radius: 14, y: 5)
    }
}
