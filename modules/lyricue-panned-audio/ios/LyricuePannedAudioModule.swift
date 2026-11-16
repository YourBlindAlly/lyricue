import ExpoModulesCore
import AVFoundation

/// Lets LyriCue's voice and sound effects be panned hard left or hard right.
///
/// Why this exists: Rusty performs with a hard-wired stereo feed out of the
/// phone. VoiceOver can be panned to one side so it only reaches his monitor,
/// and the other side stays clean for the PA. LyriCue's own voice (expo-speech
/// / AVSpeechSynthesizer.speak) and its beeps (expo-audio) have no pan control
/// at all, so neither could be kept out of the PA.
///
/// How: when a pan is set, speech is synthesized with AVSpeechSynthesizer's
/// `write(_:toBufferCallback:)` (raw audio buffers instead of built-in
/// playback) and played through our own AVAudioEngine, where each player node
/// has a `pan`. Sound effects play through the same engine. The same pattern
/// (a mono AVAudioPlayerNode with `.pan`, session `.playback` + `.mixWithOthers`)
/// is the one proven in MidiClick and MidiBed.
///
/// At center this module is never called: the JS side keeps using the normal
/// expo-speech / expo-audio path, so nobody who doesn't use pan is affected.
///
/// Every piece of state below is only touched on `queue`.
public class LyricuePannedAudioModule: Module {
  /// One utterance being spoken through the engine.
  private final class SpeechSession {
    let synth = AVSpeechSynthesizer()
    let promise: Promise
    let volume: Float
    var node: AVAudioPlayerNode?
    var pending = 0
    var synthFinished = false
    var gotAudio = false
    var finished = false

    init(promise: Promise, volume: Float) {
      self.promise = promise
      self.volume = volume
    }
  }

  private let queue = DispatchQueue(label: "net.lyricue.pannedaudio")
  private let engine = AVAudioEngine()
  private var effectNode: AVAudioPlayerNode?
  private let effectFormat = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 1)!
  private var effects: [String: AVAudioPCMBuffer] = [:]
  private var pan: Float = 0
  private var current: SpeechSession?
  private var observers: [NSObjectProtocol] = []

  public func definition() -> ModuleDefinition {
    Name("LyricuePannedAudio")

    OnCreate {
      self.registerObservers()
    }

    OnDestroy {
      for observer in self.observers { NotificationCenter.default.removeObserver(observer) }
      self.observers.removeAll()
      self.queue.sync {
        if let session = self.current { self.finish(session, outcome: "stopped") }
        self.pan = 0
        self.stopEngineIfIdle()
      }
    }

    AsyncFunction("setPan") { (value: Double) in
      self.queue.async {
        self.pan = Float(min(max(value, -1.0), 1.0))
        if self.pan != 0 {
          // Bring the engine up now so the first line spoken or beep played
          // doesn't pay the engine's start-up delay.
          try? self.ensureEngineRunning()
          self.effectNode?.pan = self.pan
          self.current?.node?.pan = self.pan
        } else {
          self.stopEngineIfIdle()
        }
      }
    }

    AsyncFunction("loadEffect") { (name: String, uri: String, promise: Promise) in
      self.queue.async {
        do {
          let url = uri.hasPrefix("/") ? URL(fileURLWithPath: uri) : (URL(string: uri) ?? URL(fileURLWithPath: uri))
          let file = try AVAudioFile(forReading: url)
          guard file.processingFormat.channelCount == 1,
                file.processingFormat.sampleRate == self.effectFormat.sampleRate,
                let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat,
                                              frameCapacity: AVAudioFrameCount(file.length))
          else {
            promise.reject("ERR_LYRICUE_PAN", "Sound file \(name) isn't mono 44.1 kHz")
            return
          }
          try file.read(into: buffer)
          self.effects[name] = buffer
          promise.resolve()
        } catch {
          promise.reject("ERR_LYRICUE_PAN", "Couldn't load sound \(name): \(error.localizedDescription)")
        }
      }
    }

    AsyncFunction("playEffect") { (name: String) in
      self.queue.async {
        guard self.pan != 0, let buffer = self.effects[name] else { return }
        do {
          try self.ensureEngineRunning()
        } catch {
          return
        }
        guard let node = self.effectNode else { return }
        node.pan = self.pan
        // .interrupts: a new beep replaces one still sounding, matching how
        // the centered path restarts its player from the beginning.
        node.scheduleBuffer(buffer, at: nil, options: .interrupts, completionHandler: nil)
        if !node.isPlaying { node.play() }
      }
    }

    AsyncFunction("speak") { (text: String, voice: String?, rate: Double, pitch: Double, volume: Double, promise: Promise) in
      self.queue.async {
        self.startSpeech(text: text, voice: voice, rate: rate, pitch: pitch, volume: volume, promise: promise)
      }
    }

    AsyncFunction("stopSpeech") { () in
      self.queue.async {
        if let session = self.current {
          session.synth.stopSpeaking(at: .immediate)
          self.finish(session, outcome: "stopped")
        }
      }
    }
  }

  // MARK: - Engine

  private func ensureEngineRunning() throws {
    if effectNode == nil {
      let node = AVAudioPlayerNode()
      engine.attach(node)
      engine.connect(node, to: engine.mainMixerNode, format: effectFormat)
      effectNode = node
    }
    if engine.isRunning { return }
    let session = AVAudioSession.sharedInstance()
    // Same category MidiClick uses: playback that mixes with other apps, so
    // Loopy Pro / Stage Traxx 4 keep playing underneath LyriCue.
    try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
    try session.setActive(true)
    engine.prepare()
    try engine.start()
    effectNode?.pan = pan
  }

  /// Lets the engine go quiet when pan is back at center and nothing is speaking.
  private func stopEngineIfIdle() {
    guard pan == 0, current == nil else { return }
    effectNode?.stop()
    if engine.isRunning { engine.stop() }
  }

  private func registerObservers() {
    let center = NotificationCenter.default
    // A route change (adapter unplugged and replugged) or another app grabbing
    // audio stops the engine; bring it back so panned sound keeps working.
    observers.append(center.addObserver(
      forName: .AVAudioEngineConfigurationChange, object: engine, queue: nil
    ) { [weak self] _ in
      self?.queue.async { self?.recoverEngine() }
    })
    observers.append(center.addObserver(
      forName: AVAudioSession.interruptionNotification, object: nil, queue: nil
    ) { [weak self] notification in
      guard
        let info = notification.userInfo,
        let typeValue = info[AVAudioSessionInterruptionTypeKey] as? UInt,
        AVAudioSession.InterruptionType(rawValue: typeValue) == .ended
      else { return }
      self?.queue.async { self?.recoverEngine() }
    })
  }

  private func recoverEngine() {
    // A line cut off by the engine stopping would never get its completion
    // callbacks, so end it now instead of leaving the JS side waiting.
    if let session = current, !engine.isRunning {
      session.synth.stopSpeaking(at: .immediate)
      finish(session, outcome: "stopped")
    }
    if pan != 0 { try? ensureEngineRunning() }
  }

  // MARK: - Speech

  private func startSpeech(text: String, voice: String?, rate: Double, pitch: Double, volume: Double, promise: Promise) {
    if let previous = current {
      previous.synth.stopSpeaking(at: .immediate)
      finish(previous, outcome: "stopped")
    }

    let utterance = AVSpeechUtterance(string: text)
    if let voice = voice {
      guard let chosen = AVSpeechSynthesisVoice(identifier: voice) else {
        promise.reject("ERR_LYRICUE_PAN", "Voice \(voice) isn't installed")
        return
      }
      utterance.voice = chosen
    }
    // Same mapping expo-speech uses, so panned and centered speech sound alike.
    utterance.rate = Float(rate) * AVSpeechUtteranceDefaultSpeechRate
    utterance.pitchMultiplier = Float(pitch)

    do {
      try ensureEngineRunning()
    } catch {
      promise.reject("ERR_LYRICUE_PAN", "Audio engine wouldn't start: \(error.localizedDescription)")
      return
    }

    let session = SpeechSession(promise: promise, volume: Float(min(max(volume, 0.0), 1.0)))
    current = session

    // write() hands back raw audio buffers instead of playing them. Started
    // from the main queue since that's where AVSpeechSynthesizer is normally
    // driven from.
    DispatchQueue.main.async {
      session.synth.write(utterance) { [weak self] buffer in
        self?.queue.async { self?.handle(buffer: buffer, session: session) }
      }
    }

    // Some voices produce no audio through write(); don't leave JS waiting.
    queue.asyncAfter(deadline: .now() + 3) { [weak self] in
      guard let self = self, !session.finished, !session.gotAudio else { return }
      session.synth.stopSpeaking(at: .immediate)
      self.fail(session, "This voice produced no audio when panned")
    }
  }

  private func handle(buffer: AVAudioBuffer, session: SpeechSession) {
    if session.finished || session !== current { return }
    guard let pcm = buffer as? AVAudioPCMBuffer else {
      fail(session, "Unexpected audio buffer type")
      return
    }
    if pcm.frameLength == 0 {
      // The synthesizer's end-of-speech marker.
      session.synthFinished = true
      completeIfDone(session)
      return
    }
    guard let mono = toMonoFloat(pcm) else {
      fail(session, "Unsupported audio format from this voice")
      return
    }
    guard engine.isRunning else {
      fail(session, "Audio engine stopped")
      return
    }
    if session.node == nil {
      let node = AVAudioPlayerNode()
      engine.attach(node)
      engine.connect(node, to: engine.mainMixerNode, format: mono.format)
      node.pan = pan
      node.volume = session.volume
      node.play()
      session.node = node
    }
    session.gotAudio = true
    session.pending += 1
    session.node?.scheduleBuffer(mono, completionCallbackType: .dataPlayedBack) { [weak self] _ in
      self?.queue.async {
        session.pending -= 1
        self?.completeIfDone(session)
      }
    }
  }

  private func completeIfDone(_ session: SpeechSession) {
    guard !session.finished, session.synthFinished, session.pending <= 0 else { return }
    if session.gotAudio {
      finish(session, outcome: "done")
    } else {
      fail(session, "This voice produced no audio when panned")
    }
  }

  private func finish(_ session: SpeechSession, outcome: String) {
    guard !session.finished else { return }
    session.finished = true
    if session === current { current = nil }
    tearDown(session)
    session.promise.resolve(outcome)
    stopEngineIfIdle()
  }

  private func fail(_ session: SpeechSession, _ message: String) {
    guard !session.finished else { return }
    session.finished = true
    if session === current { current = nil }
    tearDown(session)
    session.promise.reject("ERR_LYRICUE_PAN", message)
    stopEngineIfIdle()
  }

  private func tearDown(_ session: SpeechSession) {
    if let node = session.node {
      node.stop()
      engine.detach(node)
      session.node = nil
    }
  }

  /// Speech buffers can arrive as 16-bit or float, at various sample rates.
  /// Pan only acts on a mono source, so everything is folded down to mono
  /// float at the buffer's own sample rate (the mixer handles the rate).
  private func toMonoFloat(_ pcm: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
    let frames = Int(pcm.frameLength)
    let channels = Int(pcm.format.channelCount)
    guard frames > 0, channels > 0,
          let format = AVAudioFormat(commonFormat: .pcmFormatFloat32,
                                     sampleRate: pcm.format.sampleRate,
                                     channels: 1,
                                     interleaved: false),
          let out = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: pcm.frameLength),
          let dst = out.floatChannelData?[0]
    else { return nil }
    out.frameLength = pcm.frameLength

    let interleaved = pcm.format.isInterleaved
    if let src = pcm.floatChannelData {
      for i in 0..<frames {
        var sum: Float = 0
        for c in 0..<channels {
          sum += interleaved ? src[0][i * channels + c] : src[c][i]
        }
        dst[i] = sum / Float(channels)
      }
      return out
    }
    if let src = pcm.int16ChannelData {
      for i in 0..<frames {
        var sum: Float = 0
        for c in 0..<channels {
          let sample = interleaved ? src[0][i * channels + c] : src[c][i]
          sum += Float(sample) / 32768.0
        }
        dst[i] = sum / Float(channels)
      }
      return out
    }
    return nil
  }
}
