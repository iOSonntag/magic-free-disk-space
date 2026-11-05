import Cocoa
import FlutterMacOS

class MainFlutterWindow: NSWindow {
  private static let windowMotionChannelName = "magic_free_disk_space/window_motion"

  private var windowMotionChannel: FlutterMethodChannel?
  private var reduceMotionObserver: NSObjectProtocol?
  private var occlusionObserver: NSObjectProtocol?

  override func awakeFromNib() {
    let flutterViewController = FlutterViewController()
    let windowFrame = self.frame
    self.contentViewController = flutterViewController
    self.setFrame(windowFrame, display: true)
    styleAsCinematicStage()

    RegisterGeneratedPlugins(registry: flutterViewController)
    connectWindowMotionChannel(binaryMessenger: flutterViewController.engine.binaryMessenger)

    super.awakeFromNib()
  }

  deinit {
    if let observer = reduceMotionObserver {
      NSWorkspace.shared.notificationCenter.removeObserver(observer)
    }
    if let observer = occlusionObserver {
      NotificationCenter.default.removeObserver(observer)
    }
  }

  private func styleAsCinematicStage() {
    self.styleMask.insert(.fullSizeContentView)
    self.titlebarAppearsTransparent = true
    self.titleVisibility = .hidden
    self.appearance = NSAppearance(named: .darkAqua)
    self.contentMinSize = NSSize(width: 960, height: 640)
  }

  /// Flutter reads Reduce Motion on no desktop, and pauses nothing while a
  /// window is hidden, so the app's MotionScope loads both here and takes
  /// each change.
  private func connectWindowMotionChannel(binaryMessenger: FlutterBinaryMessenger) {
    let channel = FlutterMethodChannel(
      name: MainFlutterWindow.windowMotionChannelName,
      binaryMessenger: binaryMessenger
    )
    channel.setMethodCallHandler { [weak self] call, result in
      guard let window = self, call.method == "loadMotionState" else {
        result(FlutterMethodNotImplemented)
        return
      }
      result(window.buildMotionState())
    }
    windowMotionChannel = channel

    reduceMotionObserver = NSWorkspace.shared.notificationCenter.addObserver(
      forName: NSWorkspace.accessibilityDisplayOptionsDidChangeNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      self?.sendMotionState()
    }
    occlusionObserver = NotificationCenter.default.addObserver(
      forName: NSWindow.didChangeOcclusionStateNotification,
      object: self,
      queue: .main
    ) { [weak self] _ in
      self?.sendMotionState()
    }
  }

  private func buildMotionState() -> [String: Bool] {
    return [
      "reducesMotion": NSWorkspace.shared.accessibilityDisplayShouldReduceMotion,
      "isWindowVisible": self.occlusionState.contains(.visible),
    ]
  }

  private func sendMotionState() {
    windowMotionChannel?.invokeMethod("motionStateChanged", arguments: buildMotionState())
  }
}
