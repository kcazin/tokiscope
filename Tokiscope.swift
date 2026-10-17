// Tokiscope: your agents at work (the machines carrying today's tokens) and the projects they go to, in a small window
// that floats over the desktop. It shows one of the layouts in lab/ (?only=<layout>), from the copy bundled in the app
// (BundlePages) or a local copy. A menu bar item picks the layout and its zoom, and sets the rest:
// click-through, move and resize, background, above windows or on the desktop. The stats come from the hub when it
// can be reached over the tailnet, so every repository shows by name (HubFeed); otherwise from the public relay
// (RelayFeed). Both are streamed, so a change shows within a second or two, and polled when there is no stream.
// In bubble mode it is a small floating bubble instead (lab/bubble.html): hover it for a card with more, click it
// for the layout, drag it anywhere. The window stays at the full size the page asks for (it never resizes on hover, which
// would make the web view flash) and lets the pointer through except over the bubble and whatever is showing.

import Cocoa
import ServiceManagement
import WebKit

// Each layout's page and its size in CSS px for four projects (a lab page says its real size once it knows the projects).
// The lab's layouts sit centred with `pad` round them; nil groups the menu.
private struct Layout { let key, name, path: String; let size: NSSize; let padded: Bool }
private let layouts: [Layout?] = [
    Layout(key: "haul", name: "Trucks, with Project Lines", path: "/lab/?only=haul", size: NSSize(width: 320, height: 120), padded: true),
    Layout(key: "pocket", name: "Trucks, Pocket", path: "/lab/?only=pocket", size: NSSize(width: 240, height: 96), padded: true),
    Layout(key: "strip", name: "Trucks, Strip", path: "/lab/?only=strip", size: NSSize(width: 380, height: 66), padded: true),
    Layout(key: "haulflow", name: "Trucks, at Speed", path: "/lab/?only=haulflow", size: NSSize(width: 320, height: 154), padded: true),
    nil,
    Layout(key: "dash", name: "Throughput Dashboard", path: "/lab/?only=dash", size: NSSize(width: 360, height: 344), padded: true),
    Layout(key: "odometer", name: "Odometer", path: "/lab/?only=odometer", size: NSSize(width: 360, height: 158), padded: true),
    Layout(key: "seismo", name: "Seismograph", path: "/lab/?only=seismo", size: NSSize(width: 360, height: 176), padded: true),
    Layout(key: "rain", name: "Token Rain", path: "/lab/?only=rain", size: NSSize(width: 360, height: 200), padded: true),
    Layout(key: "meters", name: "Level Meters", path: "/lab/?only=meters", size: NSSize(width: 240, height: 102), padded: true),
    nil,
    Layout(key: "gantry", name: "Gantry Crane", path: "/lab/?only=gantry", size: NSSize(width: 300, height: 120), padded: true),
    Layout(key: "city", name: "Tower Crane City", path: "/lab/?only=city", size: NSSize(width: 264, height: 150), padded: true),
    Layout(key: "belt", name: "Sorting Belt", path: "/lab/?only=belt", size: NSSize(width: 384, height: 48), padded: true),
    Layout(key: "silos", name: "Silos", path: "/lab/?only=silos", size: NSSize(width: 128, height: 104), padded: true),
]
private let sites = [("Built In", BundlePages.origin), ("Local Copy (localhost:8765)", "http://localhost:8765")]
private let zooms: [(String, CGFloat)] = [("Small", 1), ("Medium", 1.5), ("Large", 2)]
private let pad: CGFloat = 10
private let defaultRelay = "https://relay-production-908a.up.railway.app"
private let bubbles = [("orb", "Agents Orb"), ("ring", "Today Ring"), ("globe", "Squares Globe"), ("pulse", "Token Rate"),
                       ("tach", "Tachometer"), ("odo", "Odometer"), ("quake", "Seismograph"), ("rain", "Token Rain"), ("ecg", "Heartbeat")]
// The tokens the rates, meters and traces count (lab/flow.js ?kinds=): any of these, all by default.
private let tokenKinds = [("in", "Input"), ("cr", "Cache Read"), ("cw", "Cache Write"), ("out", "Output")]
// What the bubble shows beside it while the pointer is over it.
private let cards = [("classic", "Agents and Today"), ("speed", "Speed"), ("agents", "Agents, Live")]

private enum Pref {
    static let d = UserDefaults.standard
    static var layout: String { get { d.string(forKey: "layout") ?? "haul" } set { d.set(newValue, forKey: "layout") } }
    static var site: String { get { d.string(forKey: "site") ?? sites[0].1 } set { d.set(newValue, forKey: "site") } }
    static var zoom: CGFloat { get { d.object(forKey: "zoom") as? CGFloat ?? 1 } set { d.set(newValue, forKey: "zoom") } }
    static var customURL: String? { get { d.string(forKey: "customURL") } set { d.set(newValue, forKey: "customURL") } }
    static var relay: String? { get { d.string(forKey: "relay") } set { d.set(newValue, forKey: "relay") } }
    static var bubbleMode: Bool { get { d.bool(forKey: "bubbleMode") } set { d.set(newValue, forKey: "bubbleMode") } }
    static var bubble: String { get { d.string(forKey: "bubble") ?? "orb" } set { d.set(newValue, forKey: "bubble") } }
    static var card: String { get { d.string(forKey: "card") ?? "classic" } set { d.set(newValue, forKey: "card") } }
    static var kinds: [String] {
        get {
            let all = tokenKinds.map(\.0), k = (d.string(forKey: "kinds") ?? "").split(separator: ",").map(String.init).filter(all.contains)
            return k.isEmpty ? all : k
        }
        set { d.set(newValue.joined(separator: ","), forKey: "kinds") }
    }
    static var clickThrough: Bool { get { d.object(forKey: "clickThrough") as? Bool ?? true } set { d.set(newValue, forKey: "clickThrough") } }
    static var glass: Bool { get { d.object(forKey: "glass") as? Bool ?? true } set { d.set(newValue, forKey: "glass") } }
    static var onDesktop: Bool { get { d.bool(forKey: "onDesktop") } set { d.set(newValue, forKey: "onDesktop") } }
}

private extension NSRect { var area: CGFloat { isNull ? 0 : width * height } }

final class Panel: NSPanel {
    override var canBecomeKey: Bool { true }
    // No nudging below the menu bar: the app keeps what shows on screen itself, and the transparent margin round it
    // may go behind the menu bar so the bubble can sit right against it.
    override func constrainFrameRect(_ frameRect: NSRect, to screen: NSScreen?) -> NSRect { frameRect }
}

// Covers the page while moving: drag anywhere to move, drag the edges to resize.
final class MoveView: NSView {
    override func mouseDown(with event: NSEvent) { window?.performDrag(with: event) }
    override func resetCursorRects() { addCursorRect(bounds.insetBy(dx: 6, dy: 6), cursor: .openHand) }
    override func draw(_ dirtyRect: NSRect) {
        NSColor.white.withAlphaComponent(0.06).setFill()
        bounds.fill()
        let path = NSBezierPath(roundedRect: bounds.insetBy(dx: 1, dy: 1), xRadius: 11, yRadius: 11)
        path.lineWidth = 2
        path.setLineDash([6, 4], count: 2, phase: 0)
        NSColor.white.withAlphaComponent(0.6).setStroke()
        path.stroke()
    }
}

// Bubble mode: hover and clicks go to the page; a drag moves the window.
final class BubbleView: NSView {
    var onClick: (() -> Void)?
    var onDragBegan: (() -> Void)?
    var onDragMoved: ((NSPoint) -> Void)?
    var onDragEnded: (() -> Void)?
    private var dragged = false, start = NSPoint.zero
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    // A press that moves more than a few points is a drag (the app moves the window, kept on screen); otherwise a click.
    override func mouseDown(with event: NSEvent) { dragged = false; start = NSEvent.mouseLocation }
    override func mouseDragged(with event: NSEvent) {
        let p = NSEvent.mouseLocation
        if !dragged { guard hypot(p.x - start.x, p.y - start.y) > 3 else { return }; dragged = true; onDragBegan?() }
        onDragMoved?(p)
    }
    override func mouseUp(with event: NSEvent) { if dragged { onDragEnded?() } else { onClick?() } }
    override func resetCursorRects() { addCursorRect(bounds, cursor: .pointingHand) }
}

// ---- Streams ------------------------------------------------------------------------------------------------------
// One Server-Sent Events connection: `onEvent(name, data)` for each event, then `onEnd(status)` once: the HTTP status
// when it never opened (404: no stream there), nil when it couldn't connect or dropped. `close()` ends it quietly.
final class EventStream: NSObject, URLSessionDataDelegate {
    var onEvent: ((String, String) -> Void)?
    var onEnd: ((Int?) -> Void)?
    private(set) var opened = false, lastData = Date()
    private var session: URLSession?, buf = Data(), name = "", data: [String] = [], status: Int?
    // Open and sending: the servers send a comment at least every 15 s.
    var healthy: Bool { opened && Date().timeIntervalSince(lastData) < 40 }

    init(_ url: URL) {
        super.init()
        var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 45)
        req.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        session = URLSession(configuration: .ephemeral, delegate: self, delegateQueue: .main)
        session?.dataTask(with: req).resume()
    }
    func close() { session?.invalidateAndCancel(); session = nil }

    func urlSession(_ s: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
                    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        let res = response as? HTTPURLResponse
        opened = res?.statusCode == 200 && (res?.value(forHTTPHeaderField: "Content-Type") ?? "").hasPrefix("text/event-stream")
        if !opened { status = res?.statusCode ?? 0 }
        completionHandler(opened ? .allow : .cancel)
    }
    func urlSession(_ s: URLSession, dataTask: URLSessionDataTask, didReceive chunk: Data) {
        lastData = Date(); buf.append(chunk)
        var start = buf.startIndex
        while let nl = buf[start...].firstIndex(of: 10) {
            var line = String(decoding: buf[start..<nl], as: UTF8.self); start = nl + 1
            if line.hasSuffix("\r") { line.removeLast() }
            if line.isEmpty {                                                        // a blank line ends an event
                if !data.isEmpty { onEvent?(name.isEmpty ? "message" : name, data.joined(separator: "\n")) }
                name = ""; data = []; continue
            }
            if line.hasPrefix(":") { continue }                                     // a ping
            let field = line.prefix { $0 != ":" }
            var value = line.dropFirst(field.count + 1)
            if value.hasPrefix(" ") { value = value.dropFirst() }
            if field == "event" { name = String(value) } else if field == "data" { data.append(String(value)) }
        }
        buf = Data(buf[start...])
    }
    func urlSession(_ s: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard session != nil else { return }
        close(); onEnd?(status)
    }
}

// ---- The hub ------------------------------------------------------------------------------------------------------
// The overlay is private, so it can show every repository by name, which the public relay never sees: it follows the
// hub's /api/stream over the tailnet (`live` within a second of a change, `repos` when they change) and hands them to
// the page (window.hubFeed). It finds the hub the way this Mac's reporter does: agent-stats' config.toml, or the old
// reporter's launchd job (HUB_URL). Without the stream (an older hub: 404, or it keeps failing) it reads /api/state
// and /api/repos every 15 s, and tries the stream again every five minutes. When no route answers, the page goes back
// to the relay on its own.
final class HubFeed {
    private(set) var route: String?                       // the one that answered last
    private(set) var latest: String?                      // the arguments for window.hubFeed, as JS
    var onUpdate: ((String) -> Void)?
    private var timer: Timer?, busy = false
    private var stream: EventStream?, state: String?, repos: String?, fails = 0, retryAt = Date.distantPast
    var live: Bool { stream?.healthy == true }

    static func routes() -> [String] {
        var found: [String] = []
        let home = FileManager.default.homeDirectoryForCurrentUser
        let base = ProcessInfo.processInfo.environment["AGENT_STATS_CONFIG_DIR"].map { URL(fileURLWithPath: $0) }
            ?? home.appendingPathComponent(".config/agent-stats")
        if let toml = try? String(contentsOf: base.appendingPathComponent("config.toml"), encoding: .utf8) {
            for line in toml.split(separator: "\n") where line.trimmingCharacters(in: .whitespaces).hasPrefix("routes") {
                for part in line.split(separator: "\"").enumerated() where part.offset % 2 == 1 { found.append(String(part.element)) }
            }
        }
        let agents = home.appendingPathComponent("Library/LaunchAgents")
        for name in (try? FileManager.default.contentsOfDirectory(atPath: agents.path)) ?? [] where name.contains("agent-stats") {
            let plist = NSDictionary(contentsOf: agents.appendingPathComponent(name))
            if let url = (plist?["EnvironmentVariables"] as? [String: Any])?["HUB_URL"] as? String { found.append(url) }
        }
        var seen = Set<String>()
        return found.map { r -> String in
            var u = r.trimmingCharacters(in: .whitespaces)
            if !u.contains("://") { u = "http://" + u }
            while u.hasSuffix("/") { u.removeLast() }
            return u
        }.filter { !$0.isEmpty && seen.insert($0).inserted }
    }

    func start() {
        fetch()
        timer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] _ in if self?.live == false { self?.fetch() } }
    }
    func fetch() {
        guard !busy else { return }
        busy = true
        let all = HubFeed.routes()
        attempt((route.map { [$0] } ?? []) + all.filter { $0 != route })
    }
    private func attempt(_ list: [String]) {
        guard let base = list.first else { route = nil; busy = false; return }
        let next = { self.attempt(Array(list.dropFirst())) }
        get(base + "/api/state") { state in
            // Only what the page uses: the time and the sessions (the rest is the dashboard's history).
            guard let state = state as? [String: Any], let now = state["now"], let sessions = state["sessions"] else { return next() }
            self.get(base + "/api/repos") { repos in
                guard let repos = repos as? [[String: Any]],
                      let s = try? JSONSerialization.data(withJSONObject: ["now": now, "sessions": sessions]),
                      let r = try? JSONSerialization.data(withJSONObject: repos) else { return next() }
                self.route = base; self.busy = false
                if self.live { return }                    // the stream came up meanwhile
                self.latest = "\(String(decoding: s, as: UTF8.self)), \(String(decoding: r, as: UTF8.self))"
                self.onUpdate?(self.latest!)
                self.connect()
            }
        }
    }
    private func get(_ url: String, done: @escaping (Any?) -> Void) {
        guard let u = URL(string: url) else { return done(nil) }
        URLSession.shared.dataTask(with: URLRequest(url: u, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 5)) { data, res, _ in
            let ok = (res as? HTTPURLResponse)?.statusCode == 200
            let json = ok ? data.flatMap { try? JSONSerialization.jsonObject(with: $0) } : nil
            DispatchQueue.main.async { done(json) }
        }.resume()
    }

    // The stream, on the route that answered. Each `live` or `repos` goes to the page with the latest of the other,
    // and `true` so it paces itself for updates a second apart (an older page takes the first two).
    private func connect() {
        guard stream == nil, Date() >= retryAt, let base = route, let url = URL(string: base + "/api/stream") else { return }
        let s = EventStream(url)
        stream = s
        s.onEvent = { [weak self] name, data in
            guard let self, let json = try? JSONSerialization.jsonObject(with: Data(data.utf8)) else { return }
            if name == "live", json is [String: Any] { self.state = data } else if name == "repos", json is [Any] { self.repos = data } else { return }
            self.fails = 0
            guard let state = self.state, let repos = self.repos else { return }
            self.latest = "\(state), \(repos), true"
            self.onUpdate?(self.latest!)
        }
        // No stream on this hub: polls, and tries again in five minutes. Dropped: again at once, then after 2, 4, 8 s,
        // polling meanwhile, and after five failures in a row every five minutes.
        s.onEnd = { [weak self] status in
            guard let self else { return }
            self.stream = nil; self.state = nil; self.repos = nil; self.fails += 1
            let wait: Double = status != nil || self.fails > 5 ? 300 : self.fails == 1 ? 0 : pow(2, Double(self.fails - 1))
            self.retryAt = Date() + wait
            if wait < 300 { DispatchQueue.main.asyncAfter(deadline: .now() + wait) { [weak self] in self?.connect() } } else { self.fetch() }
        }
    }
}

// ---- The relay ----------------------------------------------------------------------------------------------------
// The built-in pages can't read the public relay themselves (it doesn't allow their origin, and they can't hold a
// stream through the app's scheme), so the app follows the relay's /stream: a full `stats`, then merge patches as the
// hub publishes. Each document goes to the page (window.relayFeed), and /relay/stats answers from it for older pages.
// A relay without the stream (404) is fetched by /relay/stats as before, and its stream tried again every five minutes.
final class RelayFeed {
    private(set) var latest: Data?                        // the current document, as JSON
    var onUpdate: ((String) -> Void)?
    private var stream: EventStream?, doc: [String: Any]?, fails = 0, retryAt = Date.distantPast, timer: Timer?
    var live: Bool { stream?.healthy == true && latest != nil }

    static var base: String {
        var b = Pref.relay ?? defaultRelay
        while b.hasSuffix("/") { b.removeLast() }
        if b.hasSuffix("/stats") { b.removeLast(6) }
        return b
    }
    // RFC 7386: objects merge key by key, a null removes the key, anything else replaces.
    static func merge(_ a: Any?, _ p: Any) -> Any? {
        guard let p = p as? [String: Any] else { return p is NSNull ? nil : p }
        var o = a as? [String: Any] ?? [:]
        for (k, v) in p { o[k] = v is NSNull ? nil : merge(o[k], v) }
        return o
    }

    func start() {
        connect()
        timer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in self?.connect() }
    }
    // Another relay picked in the menu.
    func restart() { stream?.close(); stream = nil; doc = nil; latest = nil; fails = 0; retryAt = .distantPast; connect() }

    private func connect() {
        guard stream == nil, Date() >= retryAt, let url = URL(string: Self.base + "/stream") else { return }
        let s = EventStream(url)
        stream = s
        s.onEvent = { [weak self] name, text in
            guard let self, let json = try? JSONSerialization.jsonObject(with: Data(text.utf8)) else { return }
            if name == "stats" { self.doc = json as? [String: Any] }
            else if name == "patch", let d = self.doc { self.doc = Self.merge(d, json) as? [String: Any] }
            else { return }
            guard let doc = self.doc, let data = try? JSONSerialization.data(withJSONObject: doc) else { return }
            self.latest = data; self.fails = 0
            self.onUpdate?(String(decoding: data, as: UTF8.self))
        }
        s.onEnd = { [weak self] status in
            guard let self else { return }
            self.stream = nil; self.doc = nil; self.latest = nil; self.fails += 1
            self.retryAt = Date() + (status != nil || self.fails > 5 ? 300 : self.fails == 1 ? 0 : pow(2, Double(self.fails - 1)))
        }
    }
}

// ---- The pages ----------------------------------------------------------------------------------------------------
// The app carries its pages (lab/ in its Resources) and serves them itself as tokiscope://app/…, so it needs no site.
// The public relay only answers pages from http://localhost and kilcazn.com, so these read it through the app:
// /relay/stats answers from the relay's stream (RelayFeed), or is fetched here, from the relay the menu picks.
final class BundlePages: NSObject, WKURLSchemeHandler {
    static let scheme = "tokiscope", origin = "tokiscope://app"
    private static let types = ["html": "text/html; charset=utf-8", "js": "text/javascript; charset=utf-8", "css": "text/css; charset=utf-8",
                                "json": "application/json", "jpg": "image/jpeg", "png": "image/png", "svg": "image/svg+xml"]
    private let root = Bundle.main.resourceURL!.standardizedFileURL
    private var open = Set<ObjectIdentifier>()            // relay requests WebKit hasn't stopped
    weak var feed: RelayFeed?

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        if url.path == "/relay/stats" { return relay(task, url) }
        var file = root.appendingPathComponent(url.path).standardizedFileURL, dir: ObjCBool = false
        if FileManager.default.fileExists(atPath: file.path, isDirectory: &dir), dir.boolValue { file.appendPathComponent("index.html") }
        guard file.path.hasPrefix(root.path + "/"), let data = try? Data(contentsOf: file) else { return respond(task, url, 404, "text/plain", Data()) }
        respond(task, url, 200, Self.types[file.pathExtension] ?? "application/octet-stream", data)
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) { open.remove(ObjectIdentifier(task)) }

    private func relay(_ task: WKURLSchemeTask, _ url: URL) {
        if feed?.live == true, let doc = feed?.latest { return respond(task, url, 200, "application/json", doc) }
        guard let u = URL(string: RelayFeed.base + "/stats") else { return respond(task, url, 502, "text/plain", Data()) }
        let id = ObjectIdentifier(task)
        open.insert(id)
        URLSession.shared.dataTask(with: URLRequest(url: u, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 10)) { data, res, _ in
            let res = res as? HTTPURLResponse
            DispatchQueue.main.async {
                guard self.open.remove(id) != nil else { return }      // answering a stopped task would crash
                self.respond(task, url, data == nil ? 502 : res?.statusCode ?? 502, res?.value(forHTTPHeaderField: "Content-Type") ?? "application/json", data ?? Data())
            }
        }.resume()
    }
    private func respond(_ task: WKURLSchemeTask, _ url: URL, _ status: Int, _ type: String, _ data: Data) {
        task.didReceive(HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": type, "Cache-Control": "no-store"])!)
        task.didReceive(data)
        task.didFinish()
    }
}

@main
final class App: NSObject, NSApplicationDelegate, NSMenuDelegate, NSWindowDelegate, WKScriptMessageHandler {
    private var panel: Panel!
    private var web: WKWebView!
    private var glass: NSVisualEffectView!
    private var mover: MoveView!
    private var handle: BubbleView!
    private var root: NSView!
    private var item: NSStatusItem!
    private var moving = false
    private let hub = HubFeed()
    private let relay = RelayFeed()
    private let pages = BundlePages()

    static func main() {
        let app = NSApplication.shared
        let delegate = App()
        app.delegate = delegate
        app.setActivationPolicy(.accessory)
        app.run()
    }

    func applicationDidFinishLaunching(_ note: Notification) {
        if let i = CommandLine.arguments.firstIndex(of: "--url"), i + 1 < CommandLine.arguments.count { Pref.customURL = CommandLine.arguments[i + 1] }
        if let i = CommandLine.arguments.firstIndex(of: "--site"), i + 1 < CommandLine.arguments.count { Pref.site = CommandLine.arguments[i + 1] }

        let size = windowSize(), screen = NSScreen.main?.visibleFrame ?? .zero
        panel = Panel(contentRect: NSRect(x: screen.maxX - size.width - 24, y: screen.minY + 24, width: size.width, height: size.height),
                      styleMask: [.borderless, .nonactivatingPanel, .resizable], backing: .buffered, defer: false)
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.hidesOnDeactivate = false
        panel.minSize = NSSize(width: 120, height: 48)
        panel.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle, .fullScreenAuxiliary]
        panel.setFrameAutosaveName("TokiscopeLayout")

        // Rounded corners: everything sits in a layer-backed view that clips to them.
        root = NSView(frame: NSRect(origin: .zero, size: panel.frame.size))
        root.autoresizingMask = [.width, .height]
        root.wantsLayer = true
        root.layer?.cornerRadius = 12
        root.layer?.masksToBounds = true

        glass = NSVisualEffectView(frame: root.bounds)
        glass.autoresizingMask = [.width, .height]
        glass.material = .hudWindow
        glass.blendingMode = .behindWindow
        glass.state = .active
        glass.appearance = NSAppearance(named: .darkAqua)
        let tint = NSView(frame: glass.bounds)                   // darker than the material alone, like the site
        tint.autoresizingMask = [.width, .height]
        tint.wantsLayer = true
        tint.layer?.backgroundColor = NSColor.black.withAlphaComponent(0.62).cgColor
        glass.addSubview(tint)

        let config = WKWebViewConfiguration()
        config.mediaTypesRequiringUserActionForPlayback = .all
        config.userContentController.add(self, name: "frame")
        config.userContentController.add(self, name: "rects")
        config.userContentController.add(self, name: "hub")
        config.setURLSchemeHandler(pages, forURLScheme: BundlePages.scheme)
        web = WKWebView(frame: root.bounds, configuration: config)
        web.autoresizingMask = [.width, .height]
        web.setValue(false, forKey: "drawsBackground")   // the page is transparent; show what's behind it

        mover = MoveView(frame: root.bounds)
        mover.autoresizingMask = [.width, .height]
        mover.isHidden = true

        handle = BubbleView(frame: root.bounds)
        handle.autoresizingMask = [.width, .height]
        handle.onClick = { [weak self] in self?.isOpen.toggle(); self?.web.evaluateJavaScript("window.bubble?.toggle()") }
        handle.onDragBegan = { [weak self] in self?.dragBegan() }
        handle.onDragMoved = { [weak self] p in self?.dragMoved(to: p) }
        handle.onDragEnded = { [weak self] in self?.dragEnded() }

        root.addSubview(glass)
        root.addSubview(web)
        root.addSubview(handle)
        root.addSubview(mover)
        panel.contentView = root

        item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        item.button?.image = NSImage(systemSymbolName: "box.truck", accessibilityDescription: "Tokiscope")
            ?? NSImage(systemSymbolName: "square.grid.3x3", accessibilityDescription: "Tokiscope")
        let menu = NSMenu()
        menu.delegate = self
        item.menu = menu

        apply()
        load()
        panel.orderFrontRegardless()
        hub.onUpdate = { [weak self] in self?.pushHub($0) }
        hub.start()
        pages.feed = relay
        relay.onUpdate = { [weak self] js in self?.feedPages().forEach { $0.evaluateJavaScript("window.relayFeed?.(\(js))") } }
        relay.start()
        if CommandLine.arguments.contains("--settings") { openSettings() }
    }

    private var layout: Layout { layouts.compactMap { $0 }.first { $0.key == Pref.layout } ?? layouts[0]! }
    private func windowSize() -> NSSize {
        if Pref.bubbleMode { return NSSize(width: 84 * Pref.zoom, height: 84 * Pref.zoom) }
        let s = pageSizes[layout.key] ?? layout.size, p = layout.padded ? pad * 2 : 0
        return NSSize(width: (s.width + p) * Pref.zoom, height: (s.height + p) * Pref.zoom)
    }

    // A lab page from where the pages load, reading the stats from the relay the menu picks.
    private func link(_ page: String, custom: String? = nil) -> URL? {
        var page = page
        // A local copy reads the stats from another relay when given one; the built-in pages always through the app.
        if let relay = Pref.relay, Pref.site != BundlePages.origin,
           let q = relay.addingPercentEncoding(withAllowedCharacters: .alphanumerics.union(CharacterSet(charactersIn: "-._~:/"))) { page += "&relay=\(q)" }
        var link = custom ?? Pref.site + page
        if link.hasPrefix(BundlePages.origin + "/"), !link.contains("relay=") {
            link += (link.contains("?") ? "&" : "?") + "relay=\(BundlePages.origin)/relay"
        }
        return URL(string: link)
    }

    private func load() {
        // In bubble mode the field opened on click is the layout, if it is one of the lab's.
        let art = layout.padded ? layout.key : "haul"
        let page = (Pref.bubbleMode ? "/lab/bubble.html?b=\(Pref.bubble)&card=\(Pref.card)&art=\(art)&app=1" : layout.path)
            + "&kinds=\(Pref.kinds.joined(separator: ","))"
        guard let url = link(page, custom: Pref.customURL) else { return }
        web.pageZoom = Pref.zoom
        hovering = false; hotRects = []; rectsTop = false; rectsLeft = false; isOpen = false; anchored = false   // the new page reports its own
        // Always the page's current code: drop WebKit's cache of it first.
        WKWebsiteDataStore.default().removeData(ofTypes: [WKWebsiteDataTypeDiskCache, WKWebsiteDataTypeMemoryCache], modifiedSince: .distantPast) { [weak self] in
            self?.web.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData))
        }
    }

    // Fit the window to the layout, keeping its bottom right corner where it is.
    private func fit() { resize(to: windowSize(), animate: !Pref.bubbleMode) }
    private func resize(to s: NSSize, animate: Bool) {
        let f = panel.frame
        panel.setFrame(NSRect(x: f.maxX - s.width, y: f.minY, width: s.width, height: s.height), display: true, animate: animate)
    }

    // The page says how big the window must be to hold everything (`frame`) and which parts take the pointer (`rects`,
    // in CSS px from the bottom right: r and b are the gaps to the right and bottom edges). A timer watches the pointer: over one of those parts the window takes the mouse and
    // the bubble is hovered; elsewhere clicks fall through, and hovering ends after a fifth of a second outside.
    private var hotRects: [NSRect] = [], rectsTop = false, rectsLeft = false   // and the corner they are measured from
    private var pointerTimer: Timer?
    private var hovering = false, outside = 0
    // A layout grows with the projects the stats name: its page says its size (`frame` with `widget`) when it is built.
    private var pageSizes: [String: NSSize] = [:]
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "hub" {                       // a page just loaded: the hub's view, else the relay's
            guard let page = message.webView else { return }
            if let js = hub.latest { page.evaluateJavaScript("window.hubFeed?.(\(js))") }
            if let doc = relay.latest { page.evaluateJavaScript("window.relayFeed?.(\(String(decoding: doc, as: UTF8.self)))") }
            return
        }
        if message.name == "pick", let d = message.body as? [String: String], let key = d["key"] { return pick(d["kind"] ?? "", key) }
        guard message.webView === web else { return }
        guard let d = message.body as? [String: Any] else { return }
        if !Pref.bubbleMode {
            guard message.name == "frame", d["widget"] as? Bool == true, let w = d["w"] as? Double, let h = d["h"] as? Double else { return }
            let s = NSSize(width: w, height: h)
            if s != (pageSizes[layout.key] ?? layout.size) { pageSizes[layout.key] = s; fit() }
            return
        }
        if message.name == "frame", let w = d["w"] as? Double, let h = d["h"] as? Double {
            fullSize = NSSize(width: CGFloat(w) * Pref.zoom, height: CGFloat(h) * Pref.zoom)
            fieldSize = NSSize(width: d["aw"] as? Double ?? 56, height: d["ah"] as? Double ?? 56)
            // A page that was just loaded (a new zoom, layout or bubble) starts in the bottom right corner: put it back
            // in the corner the bubble is pinned to.
            let pageTop = d["top"] as? Bool ?? false, pageLeft = d["left"] as? Bool ?? false
            if !anchored { reanchor() }
            else if pageTop != anchorTop || pageLeft != anchorLeft { web.evaluateJavaScript("window.bubble?.anchor(\(anchorTop), \(anchorLeft))") }
            else { place(bubbleBox(), size: fullSize) }
        } else if message.name == "rects", let list = d["rects"] as? [[String: Double]] {
            hotRects = list.map { NSRect(x: $0["x"] ?? 0, y: $0["y"] ?? 0, width: $0["w"] ?? 0, height: $0["h"] ?? 0) }
            rectsTop = d["top"] as? Bool ?? false; rectsLeft = d["left"] as? Bool ?? false
        }
    }

    // The bubble is pinned to one corner of the window, the one facing the middle of the screen, so its card and field
    // open into the screen. While dragged, the window is just the bubble, so it can go right up to any edge.
    private var fullSize = NSSize(width: 84, height: 84), fieldSize = NSSize(width: 56, height: 56)
    private var anchorTop = false, anchorLeft = false, anchored = false, isOpen = false, dragging = false
    // What shows in a window at `f`: the ball, or the open field, inset by the page's 14 px margin from the pinned corner.
    private func content(_ f: NSRect) -> NSRect {
        let z = Pref.zoom, pad = 14 * z, w = (isOpen ? fieldSize.width : 56) * z, h = (isOpen ? fieldSize.height : 56) * z
        return NSRect(x: anchorLeft ? f.minX + pad : f.maxX - pad - w, y: anchorTop ? f.maxY - pad - h : f.minY + pad, width: w, height: h)
    }
    // Moves `f` the least needed to keep what shows inside `vf`; the transparent margin may go past the edge.
    private func kept(_ f: NSRect, in vf: NSRect) -> NSRect {
        let c = content(f)
        var o = f.origin
        if c.minX < vf.minX { o.x += vf.minX - c.minX } else if c.maxX > vf.maxX { o.x -= c.maxX - vf.maxX }
        if c.minY < vf.minY { o.y += vf.minY - c.minY } else if c.maxY > vf.maxY { o.y -= c.maxY - vf.maxY }
        return NSRect(origin: o, size: f.size)
    }
    private func bubbleBox() -> NSRect {
        let f = panel.frame, s = 84 * Pref.zoom
        return NSRect(x: anchorLeft ? f.minX : f.maxX - s, y: anchorTop ? f.maxY - s : f.minY, width: s, height: s)
    }
    private func place(_ box: NSRect, size: NSSize) {
        panel.setFrame(NSRect(x: anchorLeft ? box.minX : box.maxX - size.width, y: anchorTop ? box.maxY - size.height : box.minY,
                              width: size.width, height: size.height), display: true)
    }
    // Shrink to the bubble, kept wholly on a screen (a drag can leave it past an edge), pick the corner for where it
    // is now, tell the page, then grow again from that corner.
    private func reanchor() {
        var box = bubbleBox()
        let screen = (NSScreen.screens.max { $0.frame.intersection(box).area < $1.frame.intersection(box).area }
            .flatMap { $0.frame.intersects(box) ? $0 : nil } ?? NSScreen.main)?.visibleFrame ?? box
        box = kept(box, in: screen)
        panel.setFrame(box, display: true)
        anchorTop = box.midY > screen.midY; anchorLeft = box.midX < screen.midX; anchored = true
        web.evaluateJavaScript("window.bubble?.anchor(\(anchorTop), \(anchorLeft))") { [weak self] _, _ in
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                guard let self, !self.dragging else { return }
                self.place(self.bubbleBox(), size: self.fullSize)
            }
        }
    }
    // Dragging moves the window with the pointer, keeping the bubble (or the open field) on screen, right up to the edges and corners. A closed bubble is
    // dragged as just the bubble and re-pinned where it is dropped; the open field moves as it is.
    private var grab = NSPoint.zero
    private func dragBegan() {
        dragging = true
        if hovering { hovering = false; web.evaluateJavaScript("window.bubble?.hover(false)") }
        if !isOpen { panel.setFrame(bubbleBox(), display: true) }
        let p = NSEvent.mouseLocation
        grab = NSPoint(x: p.x - panel.frame.minX, y: p.y - panel.frame.minY)
    }
    private func dragMoved(to p: NSPoint) {
        let vf = (NSScreen.screens.first { $0.frame.contains(p) } ?? panel.screen ?? NSScreen.main)?.visibleFrame ?? panel.frame
        panel.setFrameOrigin(kept(NSRect(origin: NSPoint(x: p.x - grab.x, y: p.y - grab.y), size: panel.frame.size), in: vf).origin)
    }
    private func dragEnded() {
        dragging = false
        if !isOpen { reanchor() }
    }
    private func watchPointer(_ on: Bool) {
        pointerTimer?.invalidate(); pointerTimer = nil
        guard on else { return }
        pointerTimer = Timer.scheduledTimer(withTimeInterval: 1 / 30, repeats: true) { [weak self] _ in self?.checkPointer() }
    }
    private func checkPointer() {
        // Until the page reports, the bubble's own corner counts.
        let p = NSEvent.mouseLocation, f = panel.frame, z = Pref.zoom
        let hot = hotRects.isEmpty ? [NSRect(x: 10, y: 10, width: 64, height: 64)] : hotRects
        let over = panel.isVisible && hot.contains { r in
            NSRect(x: rectsLeft ? f.minX + r.minX * z : f.maxX - (r.minX + r.width) * z,
                   y: rectsTop ? f.maxY - (r.minY + r.height) * z : f.minY + r.minY * z, width: r.width * z, height: r.height * z).contains(p)
        }
        if panel.ignoresMouseEvents == over { panel.ignoresMouseEvents = !over }
        if dragging { return }
        if over {
            outside = 0
            if !hovering { hovering = true; web.evaluateJavaScript("window.bubble?.hover(true)") }
        } else if hovering {
            outside += 1
            if outside >= 6 { hovering = false; web.evaluateJavaScript("window.bubble?.hover(false)") }
        }
    }

    // Window level, click-through, background and the move overlay, from the current settings.
    private func apply() {
        panel.level = Pref.onDesktop ? NSWindow.Level(Int(CGWindowLevelForKey(.desktopIconWindow)) + 1) : .floating
        let bubble = Pref.bubbleMode
        panel.ignoresMouseEvents = bubble || (Pref.clickThrough && !moving)
        watchPointer(bubble)
        glass.isHidden = bubble || !Pref.glass
        root.layer?.cornerRadius = bubble ? 0 : 12
        handle.isHidden = !bubble || moving
        mover.isHidden = !moving
        mover.needsDisplay = true
    }

    private func pushHub(_ args: String) { feedPages().forEach { $0.evaluateJavaScript("window.hubFeed?.(\(args))") } }
    // The pages the stats go to: the widget's, and the settings' while that window is open.
    private func feedPages() -> [WKWebView] { [web] + (settingsWindow?.isVisible == true ? [settingsWeb!] : []) }

    // ---- Settings -----------------------------------------------------------------------------------------------
    // A window with every bubble, card and layout running live (lab/settings.html), the ones in use outlined: clicking
    // one uses it (`pick`), and the page hears back whatever changes, here or in the menu.
    private var settingsWindow: NSWindow?
    private var settingsWeb: WKWebView?
    @objc private func openSettings() {
        if settingsWindow == nil {
            let config = WKWebViewConfiguration()
            config.userContentController.add(self, name: "hub")
            config.userContentController.add(self, name: "pick")
            config.setURLSchemeHandler(pages, forURLScheme: BundlePages.scheme)
            let w = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1000, height: 760),
                             styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView], backing: .buffered, defer: false)
            w.title = "Tokiscope Settings"
            w.titleVisibility = .hidden                  // the page says it
            w.titlebarAppearsTransparent = true
            w.appearance = NSAppearance(named: .darkAqua)
            w.backgroundColor = NSColor(white: 0.08, alpha: 1)
            w.minSize = NSSize(width: 560, height: 420)
            w.isReleasedWhenClosed = false
            w.delegate = self
            w.setFrameAutosaveName("TokiscopeSettings")
            if !w.setFrameUsingName("TokiscopeSettings") { w.center() }
            let page = WKWebView(frame: w.contentView!.bounds, configuration: config)
            page.autoresizingMask = [.width, .height]
            page.setValue(false, forKey: "drawsBackground")
            w.contentView!.addSubview(page)
            settingsWindow = w; settingsWeb = page
        }
        let state = "mode=\(Pref.bubbleMode ? "bubble" : "widget")&b=\(Pref.bubble)&card=\(Pref.card)&layout=\(layout.key)&kinds=\(Pref.kinds.joined(separator: ","))"
        if let url = link("/lab/settings.html?\(state)") { settingsWeb?.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData)) }
        NSApp.activate(ignoringOtherApps: true)
        settingsWindow?.makeKeyAndOrderFront(nil)
    }
    // Closed, it stops: nothing runs in it until it is opened again.
    func windowWillClose(_ note: Notification) {
        if (note.object as? NSWindow) === settingsWindow { settingsWeb?.load(URLRequest(url: URL(string: "about:blank")!)) }
    }
    private func syncSettings() {
        guard settingsWindow?.isVisible == true else { return }
        let k = Pref.kinds.map { "'\($0)'" }.joined(separator: ",")
        settingsWeb?.evaluateJavaScript("window.settings?.set({ mode: '\(Pref.bubbleMode ? "bubble" : "widget")', b: '\(Pref.bubble)', card: '\(Pref.card)', layout: '\(layout.key)', kinds: [\(k)] })")
    }
    private func pick(_ kind: String, _ key: String) {
        switch kind {
        case "mode": useMode(bubble: key == "bubble")
        case "bubble": if let i = bubbles.firstIndex(where: { $0.0 == key }) { useBubble(i) }
        case "card": if let i = cards.firstIndex(where: { $0.0 == key }) { useCard(i) }
        case "layout": if let i = layouts.firstIndex(where: { $0?.key == key }) { useLayout(i) }
        case "kinds": useKinds(key.split(separator: ",").map(String.init))
        default: break
        }
    }

    // ---- Menu ---------------------------------------------------------------------------------------------------
    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()
        let add = { (title: String, on: Bool, action: Selector) -> NSMenuItem in
            let i = menu.addItem(withTitle: title, action: action, keyEquivalent: "")
            i.target = self
            i.state = on ? .on : .off
            return i
        }
        _ = add(panel.isVisible ? "Hide" : "Show", false, #selector(toggleShown))
        menu.addItem(.separator())
        _ = add("Move and Resize", moving, #selector(toggleMoving))
        if !Pref.bubbleMode {
            _ = add("Click Through", Pref.clickThrough, #selector(toggleClickThrough))
            _ = add("Dark Glass Background", Pref.glass, #selector(toggleGlass))
        }
        _ = add("On the Desktop (Behind Windows)", Pref.onDesktop, #selector(toggleDesktop))
        let submenu = { (title: String, fill: (NSMenu) -> Void) in
            let sub = NSMenu()
            fill(sub)
            menu.addItem(withTitle: title, action: nil, keyEquivalent: "").submenu = sub
        }
        let pick = { (sub: NSMenu, title: String, on: Bool, tag: Int, action: Selector) in
            let it = sub.addItem(withTitle: title, action: action, keyEquivalent: "")
            it.target = self
            it.tag = tag
            it.state = on ? .on : .off
        }
        menu.addItem(.separator())
        submenu("Mode") { sub in
            pick(sub, "Widget", !Pref.bubbleMode, 0, #selector(setMode(_:)))
            pick(sub, "Bubble", Pref.bubbleMode, 1, #selector(setMode(_:)))
        }
        submenu("Bubble") { sub in
            for (i, (_, name)) in bubbles.enumerated() { pick(sub, name, Pref.bubbleMode && Pref.bubble == bubbles[i].0, i, #selector(setBubble(_:))) }
        }
        if Pref.bubbleMode {
            submenu("Card on Hover") { sub in
                for (i, (key, name)) in cards.enumerated() { pick(sub, name, Pref.card == key, i, #selector(setCard(_:))) }
            }
        }
        submenu("Count Tokens") { sub in
            for (i, (key, name)) in tokenKinds.enumerated() { pick(sub, name, Pref.kinds.contains(key), i, #selector(toggleKind(_:))) }
        }
        submenu(Pref.bubbleMode ? "Opens on Click" : "Layout") { sub in
            for (i, l) in layouts.enumerated() {
                guard let l else { sub.addItem(.separator()); continue }
                if Pref.bubbleMode && !l.padded { continue }
                pick(sub, l.name, Pref.customURL == nil && l.key == Pref.layout, i, #selector(setLayout(_:)))
            }
        }
        submenu("Zoom") { sub in
            for (i, (name, z)) in zooms.enumerated() { pick(sub, "\(name) (\(z == 1 ? "1" : String(format: "%g", z))×)", Pref.zoom == z, i, #selector(setZoom(_:))) }
        }
        submenu("Load From") { sub in
            for (i, (name, url)) in sites.enumerated() { pick(sub, name, Pref.site == url, i, #selector(setSite(_:))) }
            sub.addItem(.separator())
            pick(sub, "Other Page URL…", Pref.customURL != nil, 0, #selector(editURL))
            pick(sub, "Other Stats Relay…", Pref.relay != nil, 0, #selector(editRelay))
            sub.addItem(.separator())
            sub.addItem(withTitle: (hub.route.map { "Stats From the Hub, \(URL(string: $0)?.host ?? $0)" } ?? "Stats From the Public Relay (No Hub)")
                        + ((hub.route != nil ? hub.live : relay.live) ? ", Live" : ""),
                        action: nil, keyEquivalent: "").isEnabled = false
        }
        menu.addItem(.separator())
        let settings = add("Settings…", false, #selector(openSettings))
        settings.keyEquivalent = ","
        _ = add("Reload", false, #selector(reload))
        _ = add("Open at Login", SMAppService.mainApp.status == .enabled, #selector(toggleLogin))
        menu.addItem(.separator())
        let quit = menu.addItem(withTitle: "Quit Tokiscope", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        quit.target = NSApp
    }

    @objc private func toggleShown() { panel.isVisible ? panel.orderOut(nil) : panel.orderFrontRegardless() }
    @objc private func toggleMoving() {
        moving.toggle()
        apply()
        if moving { NSApp.activate(ignoringOtherApps: true); panel.makeKey() }
    }
    @objc private func toggleClickThrough() { Pref.clickThrough.toggle(); apply() }
    @objc private func toggleGlass() { Pref.glass.toggle(); apply() }
    @objc private func toggleDesktop() { Pref.onDesktop.toggle(); apply() }
    @objc private func reload() { load() }

    @objc private func setLayout(_ sender: NSMenuItem) { useLayout(sender.tag) }
    @objc private func setMode(_ sender: NSMenuItem) { useMode(bubble: sender.tag == 1) }
    @objc private func setBubble(_ sender: NSMenuItem) { useBubble(sender.tag) }
    @objc private func setCard(_ sender: NSMenuItem) { useCard(sender.tag) }
    // Turns one kind of token on or off; the last one left stays on.
    @objc private func toggleKind(_ sender: NSMenuItem) {
        let k = tokenKinds[sender.tag].0, on = Pref.kinds.contains(k)
        useKinds(tokenKinds.map(\.0).filter { $0 == k ? !on : Pref.kinds.contains($0) })
    }
    private func useKinds(_ list: [String]) {
        let valid = tokenKinds.map(\.0).filter { list.contains($0) }
        guard !valid.isEmpty, valid != Pref.kinds else { return }
        Pref.kinds = valid
        load(); syncSettings()
    }
    private func useLayout(_ i: Int) {
        guard let l = layouts[i] else { return }
        Pref.layout = l.key; Pref.customURL = nil
        load(); fit(); syncSettings()
    }
    private func useMode(bubble: Bool) {
        guard bubble != Pref.bubbleMode else { return }
        Pref.bubbleMode = bubble; moving = false
        apply(); load(); fit(); syncSettings()
    }
    // Picking a bubble switches to bubble mode.
    private func useBubble(_ i: Int) {
        Pref.bubble = bubbles[i].0
        if Pref.bubbleMode { load() } else { Pref.bubbleMode = true; moving = false; apply(); load(); fit() }
        syncSettings()
    }
    private func useCard(_ i: Int) {
        Pref.card = cards[i].0
        if Pref.bubbleMode { load() }
        syncSettings()
    }
    @objc private func setZoom(_ sender: NSMenuItem) {
        Pref.zoom = zooms[sender.tag].1; web.pageZoom = Pref.zoom
        if Pref.bubbleMode { load() } else { fit() }      // the bubble page asks for its new size once reloaded
    }
    @objc private func setSite(_ sender: NSMenuItem) { Pref.site = sites[sender.tag].1; Pref.customURL = nil; load() }

    @objc private func editURL() {
        let alert = NSAlert()
        alert.messageText = "Page URL"
        alert.informativeText = "A page to show instead of a layout. Built-in pages (tokiscope://app/…) read the stats through the app; others need a relay that allows them, like the public one does http://localhost."
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 340, height: 24))
        field.stringValue = Pref.customURL ?? Pref.site + layout.path
        alert.accessoryView = field
        alert.addButton(withTitle: "Load")
        alert.addButton(withTitle: "Cancel")
        alert.addButton(withTitle: "Use the Layout")
        NSApp.activate(ignoringOtherApps: true)
        switch alert.runModal() {
        case .alertFirstButtonReturn: Pref.customURL = field.stringValue.trimmingCharacters(in: .whitespaces); load()
        case .alertThirdButtonReturn: Pref.customURL = nil; load()
        default: break
        }
    }

    @objc private func editRelay() {
        let alert = NSAlert()
        alert.messageText = "Stats Relay"
        alert.informativeText = "Where the layouts and bubbles read the stats: a relay, or a hub that serves /stats itself. The built-in pages read it through the app; a local copy needs one that allows http://localhost."
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 340, height: 24))
        field.stringValue = Pref.relay ?? defaultRelay
        alert.accessoryView = field
        alert.addButton(withTitle: "Use")
        alert.addButton(withTitle: "Cancel")
        alert.addButton(withTitle: "Use the Default")
        NSApp.activate(ignoringOtherApps: true)
        switch alert.runModal() {
        case .alertFirstButtonReturn:
            let v = field.stringValue.trimmingCharacters(in: .whitespaces)
            Pref.relay = v.isEmpty ? nil : v; relay.restart(); load()
        case .alertThirdButtonReturn: Pref.relay = nil; relay.restart(); load()
        default: break
        }
    }

    @objc private func toggleLogin() {
        do {
            if SMAppService.mainApp.status == .enabled { try SMAppService.mainApp.unregister() } else { try SMAppService.mainApp.register() }
        } catch {
            let alert = NSAlert(error: error)
            NSApp.activate(ignoringOtherApps: true)
            alert.runModal()
        }
    }
}
