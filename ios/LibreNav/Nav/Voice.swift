import AVFoundation
import Foundation

/// Spoken guidance.
///
/// The audio session is the fiddly half. `.duckOthers` lowers music rather than
/// stopping it, and `.mixWithOthers` keeps someone else's podcast alive between
/// turns. Without `.spokenAudio` iOS treats guidance as ambient and can drop it
/// on a route change; without deactivating on stop, whatever was playing stays
/// ducked long after the trip ended.
final class Voice: NSObject, AVSpeechSynthesizerDelegate {
    private let synthesizer = AVSpeechSynthesizer()
    private var sessionActive = false

    var isMuted = false

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    func activate() {
        guard !sessionActive else { return }
        do {
            try AVAudioSession.sharedInstance().setCategory(
                .playback,
                mode: .spokenAudio,
                options: [.duckOthers, .mixWithOthers, .interruptSpokenAudioAndMixWithOthers]
            )
            try AVAudioSession.sharedInstance().setActive(true)
            sessionActive = true
        } catch {
            // Guidance is still useful on screen without audio, so a session
            // that will not start is not worth failing navigation over.
            sessionActive = false
        }
    }

    func deactivate() {
        synthesizer.stopSpeaking(at: .immediate)
        guard sessionActive else { return }
        // notifyOthersOnDeactivation is what tells the music app it can come
        // back up to full volume.
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        sessionActive = false
    }

    func say(_ text: String) {
        guard !isMuted, !text.isEmpty else { return }
        activate()

        // A turn that has just been superseded should not finish speaking over
        // the one that replaced it.
        if synthesizer.isSpeaking {
            synthesizer.stopSpeaking(at: .word)
        }

        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: Locale.current.identifier)
            ?? AVSpeechSynthesisVoice(language: "en-US")
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate
        utterance.prefersAssistiveTechnologySettings = false
        synthesizer.speak(utterance)
    }
}
