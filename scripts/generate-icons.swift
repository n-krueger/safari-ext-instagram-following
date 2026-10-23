// Draw the Instagram-inspired camera + 🫂 identity using AppKit and Apple Color Emoji.
// Run from any directory on macOS:
// DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun swift scripts/generate-icons.swift
import AppKit

let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
let app = root.appendingPathComponent("safari/Instagram Following/Shared (App)")
let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!

func bitmap(_ size: Int, transparent: Bool) -> CGContext {
    CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: size * 4,
              space: colorSpace, bitmapInfo: (transparent ? CGImageAlphaInfo.premultipliedLast : .noneSkipLast).rawValue)!
}

func artwork(macOS: Bool) -> CGImage {
    let context = bitmap(1024, transparent: macOS)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: false)
    defer { NSGraphicsContext.restoreGraphicsState() }
    context.setShouldAntialias(true)

    // iOS supplies its own icon mask. macOS needs a rounded tile and Dock padding.
    if macOS {
        context.translateBy(x: 52, y: 52)
        context.scaleBy(x: 920.0 / 1024, y: 920.0 / 1024)
    }
    let bounds = NSRect(x: 0, y: 0, width: 1024, height: 1024)
    NSGraphicsContext.saveGraphicsState()
    if macOS { NSBezierPath(roundedRect: bounds, xRadius: 220, yRadius: 220).addClip() }

    // Warm lower-left light, vivid pink center, violet upper-right.
    let colors: [NSColor] = [
        NSColor(srgbRed: 1.00, green: 0.83, blue: 0.42, alpha: 1),
        NSColor(srgbRed: 1.00, green: 0.38, blue: 0.24, alpha: 1),
        NSColor(srgbRed: 0.90, green: 0.12, blue: 0.43, alpha: 1),
        NSColor(srgbRed: 0.67, green: 0.13, blue: 0.72, alpha: 1),
        NSColor(srgbRed: 0.34, green: 0.25, blue: 0.84, alpha: 1)
    ]
    let locations: [CGFloat] = [0, 0.24, 0.49, 0.76, 1]
    NSGradient(colors: colors, atLocations: locations, colorSpace: .sRGB)!.draw(in: bounds, angle: 65)

    NSColor.white.setStroke()
    let camera = NSBezierPath(roundedRect: NSRect(x: 205, y: 235, width: 610, height: 610), xRadius: 176, yRadius: 176)
    camera.lineWidth = 49
    camera.stroke()
    let lens = NSBezierPath(ovalIn: NSRect(x: 359, y: 389, width: 302, height: 302))
    lens.lineWidth = 49
    lens.stroke()
    NSColor.white.setFill()
    NSBezierPath(ovalIn: NSRect(x: 678, y: 707, width: 71, height: 71)).fill()

    // Overlay the embrace directly, with no badge or background behind the emoji.
    let emojiBounds = NSRect(x: 546, y: 42, width: 428, height: 428)
    let emoji = NSAttributedString(string: "🫂", attributes: [
        .font: NSFont(name: "Apple Color Emoji", size: 354)!
    ])
    let emojiSize = emoji.size()
    emoji.draw(at: NSPoint(x: emojiBounds.midX - emojiSize.width / 2, y: emojiBounds.midY - emojiSize.height / 2))
    NSGraphicsContext.restoreGraphicsState()
    return context.makeImage()!
}

func write(_ image: CGImage, size: Int, to url: URL, transparent: Bool = false) throws {
    let context = bitmap(size, transparent: transparent)
    context.interpolationQuality = .high
    context.draw(image, in: CGRect(x: 0, y: 0, width: size, height: size))
    let data = NSBitmapImageRep(cgImage: context.makeImage()!).representation(using: .png, properties: [:])!
    try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    try data.write(to: url)
    print(url.path.replacingOccurrences(of: root.path + "/", with: ""))
}

let fullBleed = artwork(macOS: false)
let dock = artwork(macOS: true)
for size in [128, 256, 512, 1024] {
    try write(fullBleed, size: size, to: root.appendingPathComponent("extension/icons/icon-\(size).png"))
}

// Read the catalog rather than duplicating its filenames/sizes in the generator.
let catalog = app.appendingPathComponent("Assets.xcassets/AppIcon.appiconset")
let contents = try JSONSerialization.jsonObject(with: Data(contentsOf: catalog.appendingPathComponent("Contents.json"))) as! [String: Any]
var written = Set<String>()
for entry in contents["images"] as! [[String: Any]] {
    guard let filename = entry["filename"] as? String, written.insert(filename).inserted else { continue }
    let points = Double((entry["size"] as! String).components(separatedBy: "x")[0])!
    let scale = Double((entry["scale"] as? String ?? "1x").dropLast())!
    let isMac = entry["idiom"] as? String == "mac"
    try write(isMac ? dock : fullBleed, size: Int(points * scale), to: catalog.appendingPathComponent(filename), transparent: isMac)
}
try write(fullBleed, size: 256, to: app.appendingPathComponent("Assets.xcassets/LargeIcon.imageset/icon-256.png"))
try write(fullBleed, size: 256, to: app.appendingPathComponent("Resources/Icon.png"))
