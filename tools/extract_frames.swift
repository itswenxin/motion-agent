// Extract evenly spaced frames from a video with AVFoundation (macOS, no ffmpeg needed).
// Usage: extract_frames <video> <outdir> [fps=12] [maxWidth=640]
// Prints JSON: {"duration","width","height","nominalFps","frames"}.
import AVFoundation
import AppKit

let a = CommandLine.arguments
guard a.count >= 3 else { FileHandle.standardError.write("usage: extract_frames <video> <outdir> [fps] [maxWidth]\n".data(using: .utf8)!); exit(2) }
let url = URL(fileURLWithPath: a[1])
let outDir = URL(fileURLWithPath: a[2])
let fps = a.count > 3 ? Double(a[3]) ?? 12 : 12
let maxW = a.count > 4 ? Double(a[4]) ?? 640 : 640
try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

let asset = AVURLAsset(url: url)
let sem = DispatchSemaphore(value: 0)
Task {
  do {
    let dur = try await asset.load(.duration).seconds
    let tracks = try await asset.loadTracks(withMediaType: .video)
    guard let track = tracks.first else { print("{\"error\":\"no video track\"}"); sem.signal(); return }
    let size = try await track.load(.naturalSize)
    let nominal = try await track.load(.nominalFrameRate)
    let g = AVAssetImageGenerator(asset: asset)
    g.appliesPreferredTrackTransform = true
    g.maximumSize = CGSize(width: maxW, height: maxW * 4)
    g.requestedTimeToleranceBefore = .zero
    g.requestedTimeToleranceAfter = .zero
    var n = 0
    var t = 0.0
    while t < dur - 0.0001 {
      let (img, _) = try await g.image(at: CMTime(seconds: t, preferredTimescale: 6000))
      let rep = NSBitmapImageRep(cgImage: img)
      let name = String(format: "f_%05d_%07.3f.jpg", n, t)
      try rep.representation(using: .jpeg, properties: [.compressionFactor: 0.9])!.write(to: outDir.appendingPathComponent(name))
      n += 1
      t += 1.0 / fps
    }
    print("{\"duration\":\(dur),\"width\":\(Int(size.width)),\"height\":\(Int(size.height)),\"nominalFps\":\(nominal),\"frames\":\(n)}")
  } catch { print("{\"error\":\"\(error)\"}") }
  sem.signal()
}
sem.wait()
