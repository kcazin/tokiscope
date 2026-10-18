// Tokiscope: your agents at work (the machines carrying today's tokens) and the projects they go to, in a small window
// that floats over the desktop. It shows one of the layouts in lab/ (?only=<layout>), from the copy bundled in the app
// (BundlePages) or a local copy. A menu bar item picks the layout and its zoom, and sets the rest:
// click-through, move and resize, background, above windows or on the desktop. The stats come from the hub the app
// runs on this Mac (Stats): every Mac of the fleet runs one and keeps everyone's stats, so every repository shows by
// name (HubFeed), even while the other Macs sleep; or from a relay, when one is set and no hub can be reached
// (RelayFeed). Both are streamed, so a change shows within a second or two, and polled when there is no stream.
// It updates itself (Sparkle) from the GitHub releases, which build.sh and dist.sh make.
// In bubble mode it is a small floating bubble instead (lab/bubble.html): hover it for a card with more, click it
// for the layout, drag it anywhere. The window stays at the full size the page asks for (it never resizes on hover, which
// would make the web view flash) and lets the pointer through except over the bubble and whatever is showing.

import Cocoa
import ServiceManagement
import Sparkle
import SystemConfiguration
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

    init(_ url: URL, token: String? = nil) {
        super.init()
        var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 45)
        req.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        if let token { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
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
// The overlay is private, so it can show every repository by name, which a public relay never sees: it follows the
// hub's /api/stream (`live` within a second of a change, `repos` when they change) and hands them to the page
// (window.hubFeed). The hub on this Mac first, which trusts this Mac; then the hubs this Mac's reporter joined, from
// agent-stats' config.toml, with the read-only token each gave it (`Authorization: Bearer`; without one, a hub answers
// only machines it trusts, such as its tailnet), or the old reporter's launchd job (HUB_URL). Without the stream (an
// older hub: 404, or it keeps failing) it reads /api/state and /api/repos every 15 s, and tries the stream again every
// five minutes. When no route answers, the page goes back to the relay on its own, if there is one.
// The stream also says who asks to join the fleet (`requests`, the pending join requests), for the app to approve.
final class HubFeed {
    struct Route: Equatable { let url: String; let token: String? }
    private(set) var route: Route?                        // the one that answered last
    private(set) var latest: String?                      // the arguments for window.hubFeed, as JS
    var onUpdate: ((String) -> Void)?
    var onRequests: (([[String: Any]]) -> Void)?
    private var timer: Timer?, busy = false
    private var stream: EventStream?, state: String?, repos: String?, fails = 0, retryAt = Date.distantPast
    var live: Bool { stream?.healthy == true }
    // The stream in use has sent `requests` (an older hub never does): no need to ask agent-stats for them.
    private(set) var sawRequests = false
    var requestsLive: Bool { live && sawRequests }

    static func routes() -> [Route] {
        var found: [Route] = Stats.isHub ? [Route(url: Stats.localHub, token: nil)] : []
        let home = FileManager.default.homeDirectoryForCurrentUser
        // Each [[hub]] entry: its routes (a list, maybe over several lines) and view_token_file.
        if let toml = try? String(contentsOf: Stats.configToml, encoding: .utf8) {
            var hub = false, inRoutes = false, routes: [String] = [], token: String?
            let flush = { found += routes.map { Route(url: $0, token: token) }; routes = []; token = nil }
            for raw in toml.split(separator: "\n") {
                let line = raw.trimmingCharacters(in: .whitespaces)
                if inRoutes { routes += Stats.quoted(line); inRoutes = !line.contains("]"); continue }
                if line.hasPrefix("[") { flush(); hub = line == "[[hub]]"; continue }
                guard hub else { continue }
                if line.hasPrefix("routes") { routes += Stats.quoted(line); inRoutes = !line.contains("]") }
                if line.hasPrefix("view_token_file"), let f = Stats.quoted(line).first {
                    let file = f.hasPrefix("/") ? URL(fileURLWithPath: f) : Stats.dir.appendingPathComponent(f)
                    token = (try? String(contentsOf: file, encoding: .utf8))?.trimmingCharacters(in: .whitespacesAndNewlines)
                }
            }
            flush()
        }
        let agents = home.appendingPathComponent("Library/LaunchAgents")
        for name in (try? FileManager.default.contentsOfDirectory(atPath: agents.path)) ?? [] where name.contains("agent-stats") {
            let plist = NSDictionary(contentsOf: agents.appendingPathComponent(name))
            if let url = (plist?["EnvironmentVariables"] as? [String: Any])?["HUB_URL"] as? String { found.append(Route(url: url, token: nil)) }
        }
        var seen = Set<String>()
        return found.map { r -> Route in
            var u = r.url.trimmingCharacters(in: .whitespaces)
            if !u.contains("://") { u = "http://" + u }
            while u.hasSuffix("/") { u.removeLast() }
            return Route(url: u, token: r.token.flatMap { $0.isEmpty ? nil : $0 })
        }.filter { !$0.url.isEmpty && seen.insert($0.url).inserted }
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
    private func attempt(_ list: [Route]) {
        guard let base = list.first else { route = nil; busy = false; return }
        let next = { self.attempt(Array(list.dropFirst())) }
        get(base, "/api/state") { state in
            // Only what the page uses: the time and the sessions (the rest is the dashboard's history).
            guard let state = state as? [String: Any], let now = state["now"], let sessions = state["sessions"] else { return next() }
            self.get(base, "/api/repos") { repos in
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
    private func get(_ route: Route, _ path: String, done: @escaping (Any?) -> Void) {
        guard let u = URL(string: route.url + path) else { return done(nil) }
        var req = URLRequest(url: u, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 5)
        if let t = route.token { req.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        URLSession.shared.dataTask(with: req) { data, res, _ in
            let ok = (res as? HTTPURLResponse)?.statusCode == 200
            let json = ok ? data.flatMap { try? JSONSerialization.jsonObject(with: $0) } : nil
            DispatchQueue.main.async { done(json) }
        }.resume()
    }

    // The stream, on the route that answered. Each `live` or `repos` goes to the page with the latest of the other,
    // and `true` so it paces itself for updates a second apart (an older page takes the first two).
    private func connect() {
        guard stream == nil, Date() >= retryAt, let base = route, let url = URL(string: base.url + "/api/stream") else { return }
        let s = EventStream(url, token: base.token)
        stream = s
        s.onEvent = { [weak self] name, data in
            guard let self, let json = try? JSONSerialization.jsonObject(with: Data(data.utf8)) else { return }
            if name == "requests", let list = json as? [[String: Any]] { self.sawRequests = true; self.onRequests?(list); return }
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
            self.stream = nil; self.state = nil; self.repos = nil; self.sawRequests = false; self.fails += 1
            let wait: Double = status != nil || self.fails > 5 ? 300 : self.fails == 1 ? 0 : pow(2, Double(self.fails - 1))
            self.retryAt = Date() + wait
            if wait < 300 { DispatchQueue.main.asyncAfter(deadline: .now() + wait) { [weak self] in self?.connect() } } else { self.fetch() }
        }
    }
}

// ---- The relay ----------------------------------------------------------------------------------------------------
// A hub may publish its public totals to a relay (agent-stats relay serve), which the widget reads when the hub can't
// be reached, if one is set in the menu (Other Stats Relay…). The built-in pages can't read a relay themselves (it doesn't allow their origin, and they can't hold a
// stream through the app's scheme), so the app follows the relay's /stream: a full `stats`, then merge patches as the
// hub publishes. Each document goes to the page (window.relayFeed), and /relay/stats answers from it for older pages.
// A relay without the stream (404) is fetched by /relay/stats as before, and its stream tried again every five minutes.
final class RelayFeed {
    private(set) var latest: Data?                        // the current document, as JSON
    var onUpdate: ((String) -> Void)?
    private var stream: EventStream?, doc: [String: Any]?, fails = 0, retryAt = Date.distantPast, timer: Timer?
    var live: Bool { stream?.healthy == true && latest != nil }

    static var base: String? {
        guard var b = Pref.relay else { return nil }
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
        guard stream == nil, Date() >= retryAt, let base = Self.base, let url = URL(string: base + "/stream") else { return }
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

// ---- agent-stats --------------------------------------------------------------------------------------------------
// The app carries agent-stats (Contents/Helpers/agent-stats, see build.sh) and runs it as its background items, the
// launchd jobs in Contents/Library/LaunchAgents: the reporter, which counts the tokens this Mac's coding agents use and
// sends them to the hub here; the hub, which keeps every machine's stats and syncs them with the other Macs of the
// fleet (each is a replica: none is the main one, and any can add a machine); and the updater, which keeps a copy of
// the release for the fleet's other machines. The widget shows the hub's view (HubFeed). Machines without Tokiscope
// (Linux boxes) only report: the Add Machine… sheet installs agent-stats on them over SSH (agent-stats fleet add).
// An agent-stats installed on its own (install.sh, launchd jobs dev.agent-stats.*) keeps running as it is, and the
// app only reads it until asked to take it over. An agent-stats from before fleets (0.5) runs the old way: one Mac
// is the hub, the others join it with a line its Add Machine… shows.
enum Stats {
    struct Failure: Error { let message: String }
    static let helper = Bundle.main.bundleURL.appendingPathComponent("Contents/Helpers/agent-stats")
    static var bundled: Bool { FileManager.default.isExecutableFile(atPath: helper.path) }
    static let report = SMAppService.agent(plistName: "com.kilcazn.tokiscope.report.plist")
    static let hubJob = SMAppService.agent(plistName: "com.kilcazn.tokiscope.hub.plist")
    static let updater = SMAppService.agent(plistName: "com.kilcazn.tokiscope.updater.plist")
    private static let home = FileManager.default.homeDirectoryForCurrentUser
    static var dir: URL {
        ProcessInfo.processInfo.environment["AGENT_STATS_CONFIG_DIR"].map { URL(fileURLWithPath: $0) } ?? home.appendingPathComponent(".config/agent-stats")
    }
    static var hubToml: URL { dir.appendingPathComponent("hub.toml") }
    static var configToml: URL { dir.appendingPathComponent("config.toml") }
    // The first line of a hub.toml the app wrote: it only ever changes its own.
    static let mark = "# Written by Tokiscope."
    // The roles an agent-stats installed on its own runs here.
    static var separate: [String] {
        ["report", "hub", "relay", "updater"].filter {
            FileManager.default.fileExists(atPath: home.appendingPathComponent("Library/LaunchAgents/dev.agent-stats.\($0).plist").path)
        }
    }
    static var isHub: Bool { FileManager.default.fileExists(atPath: hubToml.path) }
    // The hub here is one of the fleet's replicas (agent-stats fleet create / fleet replica wrote its [fleet]).
    static var isReplica: Bool { ((try? String(contentsOf: hubToml, encoding: .utf8)) ?? "").contains("[fleet]") }
    static var joined: Bool { ((try? String(contentsOf: configToml, encoding: .utf8)) ?? "").contains("[[hub]]") }
    static var setUp: Bool { isHub || joined || !separate.isEmpty }
    static var label: String { (SCDynamicStoreCopyComputerName(nil, nil) as String?) ?? ProcessInfo.processInfo.hostName }
    // The port in hub.toml's `listen`.
    static var hubPort: Int {
        let text = (try? String(contentsOf: hubToml, encoding: .utf8)) ?? ""
        let listen = text.split(separator: "\n").first { $0.hasPrefix("listen") }.flatMap { quoted(String($0)).first }
        return listen.flatMap { $0.split(separator: ":").last.flatMap { Int($0) } } ?? 7777
    }
    static var localHub: String { "http://127.0.0.1:\(hubPort)" }
    // The strings in a line of TOML.
    static func quoted(_ line: String) -> [String] { line.split(separator: "\"", omittingEmptySubsequences: false).enumerated().filter { $0.offset % 2 == 1 }.map { String($0.element) } }
    private static func tomlString(_ s: String) -> String { s.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"") }

    // What runs here, for the menu: the app's jobs, else the separate install's.
    static func summary(_ version: String?) -> String {
        let jobs = [(hubJob, "hub"), (report, "reporter")]
        if jobs.contains(where: { $0.0.status == .requiresApproval }) { return "agent-stats: Allow It in Login Items" }
        let on = jobs.filter { $0.0.status == .enabled }.map(\.1)
        if !on.isEmpty { return "agent-stats\(version.map { " " + $0 } ?? ""): \(on.joined(separator: " and ")) running" }
        if !separate.isEmpty { return "agent-stats: Installed Separately (\(separate.joined(separator: ", ")))" }
        if isHub || joined { return "agent-stats: Stopped" }
        return "agent-stats: Not Set Up"
    }

    // ---- Running it: these block, so call them off the main thread.
    // agent-stats with `args` (or another program): its output, or a Failure with what it said.
    @discardableResult static func exec(_ args: [String], program: URL = helper, timeout: TimeInterval? = nil) throws -> String {
        let p = Process(), out = Pipe(), err = Pipe()
        p.executableURL = program; p.arguments = args; p.standardOutput = out; p.standardError = err
        do { try p.run() } catch { throw Failure(message: "\(program.lastPathComponent): \(error.localizedDescription)") }
        if let timeout { DispatchQueue.global().asyncAfter(deadline: .now() + timeout) { if p.isRunning { p.terminate() } } }
        let o = String(decoding: out.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
        let e = String(decoding: err.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
        p.waitUntilExit()
        guard p.terminationStatus == 0 else {
            throw Failure(message: [e, o].map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.first { !$0.isEmpty } ?? "\(program.lastPathComponent) \(args.first ?? "") failed")
        }
        return o
    }
    static func version() -> String? { (try? exec(["version"]))?.split(separator: " ").dropFirst().first.map(String.init) }
    // Whether the agent-stats the app carries has fleets (`fleet`; 0.6 on): an older one says "unknown command".
    static func hasFleet() -> Bool {
        guard bundled else { return false }
        do { try exec(["fleet", "status", "--json"], timeout: 10); return true }
        catch { return !((error as? Failure)?.message.contains("unknown command") ?? false) }
    }
    // agent-stats with `args` and `--json`: what it printed, parsed.
    static func json(_ args: [String], timeout: TimeInterval = 60) throws -> Any {
        let out = try exec(args + ["--json"], timeout: timeout)
        guard let v = try? JSONSerialization.jsonObject(with: Data(out.utf8)) else {
            throw Failure(message: "agent-stats \(args.prefix(2).joined(separator: " ")) didn't answer in JSON.")
        }
        return v
    }
    // agent-stats with `args`, read as it goes: each line that is a JSON object goes to `line`, then `done` gets the exit
    // status and what it said on stderr, both on the main thread. The process is returned, to stop it. Doesn't block.
    @discardableResult static func stream(_ args: [String], line: @escaping ([String: Any]) -> Void,
                                          done: @escaping (Int32, String) -> Void) -> Process {
        let p = Process(), out = Pipe(), err = Pipe()
        p.executableURL = helper; p.arguments = args; p.standardOutput = out; p.standardError = err
        do { try p.run() } catch {
            let why = "agent-stats: \(error.localizedDescription)"
            DispatchQueue.main.async { done(-1, why) }
            return p
        }
        var said = Data()
        let errDone = DispatchSemaphore(value: 0)
        DispatchQueue.global().async { said = err.fileHandleForReading.readDataToEndOfFile(); errDone.signal() }
        DispatchQueue.global().async {
            var buf = Data()
            while true {
                let chunk = out.fileHandleForReading.availableData
                if chunk.isEmpty { break }
                buf.append(chunk)
                while let nl = buf.firstIndex(of: 10) {
                    let l = buf[buf.startIndex..<nl]; buf = Data(buf[(nl + 1)...])
                    if let o = try? JSONSerialization.jsonObject(with: l) as? [String: Any] { DispatchQueue.main.async { line(o) } }
                }
            }
            p.waitUntilExit(); errDone.wait()
            let status = p.terminationStatus, e = String(decoding: said, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
            DispatchQueue.main.async { done(status, e) }
        }
        return p
    }
    // Starts one of the app's jobs (it then starts with every login), unless it runs already.
    static func start(_ job: SMAppService) throws {
        guard job.status != .enabled else { return }
        do { try job.register() } catch {
            if job.status == .requiresApproval {
                SMAppService.openSystemSettingsLoginItems()
                throw Failure(message: "macOS asks you to allow Tokiscope's background items: turn Tokiscope on in System Settings › General › Login Items & Extensions, then try again.")
            }
            throw Failure(message: "Couldn't start agent-stats (\(error.localizedDescription)).")
        }
    }
    static func restart(_ label: String) throws {
        try exec(["kickstart", "-k", "gui/\(getuid())/\(label)"], program: URL(fileURLWithPath: "/bin/launchctl"))
    }
    // Waits up to 20 s for the hub here to answer.
    static func waitForHub() throws {
        for _ in 0..<40 {
            let done = DispatchSemaphore(value: 0)
            var up = false
            var req = URLRequest(url: URL(string: localHub + "/.well-known/agent-stats")!, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 2)
            req.httpMethod = "GET"
            URLSession.shared.dataTask(with: req) { _, res, _ in up = (res as? HTTPURLResponse)?.statusCode == 200; done.signal() }.resume()
            done.wait()
            if up { return }
            Thread.sleep(forTimeInterval: 0.5)
        }
        throw Failure(message: "The hub didn't start (its log: ~/.local/state/agent-stats/logs/hub.log).")
    }
    // This Mac's name on dashboards, unless config.toml says one already.
    static func prepareJoin() { try? writeLabel() }
    private static func writeLabel() throws {
        guard !FileManager.default.fileExists(atPath: configToml.path) else { return }
        try write(configToml, "# agent-stats reporter config. See docs/ARCHITECTURE.md.\nlabel = \"\(tomlString(label))\"\n")
    }
    private static func write(_ url: URL, _ text: String) throws {
        do {
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try Data(text.utf8).write(to: url, options: .atomic)
        } catch { throw Failure(message: "\(url.path): \(error.localizedDescription)") }
    }
    // The `agent-stats join <url> --code <code>` line `hub pair` prints.
    private static func joinLine(_ out: String) throws -> String {
        guard let line = out.split(separator: "\n").map(String.init).first(where: { $0.hasPrefix("agent-stats join ") }) else {
            throw Failure(message: "agent-stats hub pair didn't print a code.")
        }
        return line
    }
    private static func parse(_ line: String) -> (url: String, code: String)? {
        let w = line.split(whereSeparator: \.isWhitespace).map(String.init)
        guard let url = w.first(where: { $0.contains("://") }), let i = w.firstIndex(of: "--code"), i + 1 < w.count else { return nil }
        return (url, w[i + 1])
    }

    // The main Mac: a hub only this Mac reaches (Add Machine… opens it to the network), the reporter joined to it.
    static func becomeHub() throws {
        if !isHub {
            try write(hubToml, """
                \(mark) Every key is described in https://github.com/kcazin/agent-stats/blob/main/docs/ARCHITECTURE.md (hub.toml).
                name = "\(tomlString(label))"
                # Only this Mac reaches the hub until Add Machine… opens it to the network.
                listen = "127.0.0.1:7777"

                """)
        }
        try writeLabel()
        try start(hubJob)
        try start(updater)
        try waitForHub()
        try joinLocal()
        try start(report)
    }
    // The reporter here, joined to the hub here over loopback, unless it is already.
    private static func joinLocal() throws {
        let state = ProcessInfo.processInfo.environment["XDG_STATE_HOME"].map { URL(fileURLWithPath: $0).appendingPathComponent("agent-stats") }
            ?? home.appendingPathComponent(".local/state/agent-stats")
        let id = ((try? String(contentsOf: state.appendingPathComponent("hub-id"), encoding: .utf8)) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let config = (try? String(contentsOf: configToml, encoding: .utf8)) ?? ""
        if id.isEmpty || !config.contains("\"\(id)\"") {
            guard let p = parse(try joinLine(try exec(["hub", "pair", "--label", label]))) else { throw Failure(message: "agent-stats hub pair didn't print a code.") }
            try exec(["join", localHub, "--code", p.code])
        }
    }

    // ---- Fleets (an agent-stats that has them, see hasFleet)
    // A new fleet, this Mac its first replica: agent-stats writes the hub's config (`fleet create`), then the hub, the
    // updater and the reporter run here.
    static func createFleet() throws {
        try writeLabel()
        if !isHub { try exec(["fleet", "create", "--json"], timeout: 60) }
        try startReplica()
    }
    // The jobs of a replica: the hub (waited for), the updater, the reporter joined to the hub here.
    static func startReplica() throws {
        try start(hubJob)
        try start(updater)
        try waitForHub()
        try joinLocal()
        try start(report)
    }
    // Before fleets one Mac ran the hub and the others only reported to it. Now each Mac is a replica: it runs the hub
    // too and keeps everyone's stats, so its widget works while the others sleep. agent-stats turns this Mac's setup
    // into one (`fleet replica`: the old hub becomes the fleet's first replica, a Mac that only reported gets a hub of
    // its own), then the hub starts, or restarts on its new config. Nothing changes if that fails: the jobs that ran
    // keep running as they were.
    static var wantsReplica: Bool {
        separate.filter { $0 != "relay" }.isEmpty && (isHub || joined) && !isReplica && !stopped
    }
    static func becomeReplica() throws {
        guard wantsReplica else { return }
        let running = hubJob.status == .enabled
        try exec(["fleet", "replica", "--json"], timeout: 120)
        if running { try restart("com.kilcazn.tokiscope.hub"); Thread.sleep(forTimeInterval: 1) } else { try start(hubJob) }
        try start(updater)
        try waitForHub()
        if joined { try start(report) }
    }
    // A line that some Mac's Add Machine… showed before fleets (agent-stats join <url> --code <code>): joins with it,
    // then this Mac becomes a replica too if its agent-stats can.
    static func joinWithLine(_ line: String, fleet: Bool) throws {
        try join(line)
        if fleet { try becomeReplica() }
    }
    static func approve(_ id: String) throws { try exec(["fleet", "approve", id], timeout: 30) }
    static func deny(_ id: String) throws { try exec(["fleet", "deny", id], timeout: 30) }

    // Opens Terminal with `command` (ssh-copy-id, which asks for the password there), without asking for Automation.
    static func inTerminal(_ command: String) throws {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("tokiscope-\(UUID().uuidString.prefix(8)).command")
        try write(file, "#!/bin/sh\n\(command)\necho\necho 'Done: go back to Tokiscope and choose Retry.'\n")
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: file.path)
        let terminal = URL(fileURLWithPath: "/System/Applications/Utilities/Terminal.app")
        NSWorkspace.shared.open([file], withApplicationAt: terminal, configuration: NSWorkspace.OpenConfiguration())
    }
    // `s` as one word for sh.
    static func shellQuoted(_ s: String) -> String { "'" + s.replacingOccurrences(of: "'", with: "'\\''") + "'" }

    // Another Mac's hub, from the line its Add Machine… shows.
    static func join(_ line: String) throws {
        guard let p = parse(line) else { throw Failure(message: "Paste the whole line the main Mac's Add Machine… shows: agent-stats join http://… --code …") }
        try writeLabel()
        try exec(["join", p.url, "--code", p.code])
        try start(report)
    }

    // A one-time `agent-stats join …` line for a new machine. A hub.toml the app wrote and only this Mac reaches is
    // first opened to the network: it listens on every interface and tells reporters its Tailscale address, its
    // .local name and its address on the local network, in that order.
    static func pair() throws -> String {
        try openHub()
        return try joinLine(try exec(["hub", "pair"]))
    }
    // Only this Mac reaches the hub here: its hub.toml listens on loopback (a hub.toml the app wrote, before fleets).
    static var hubOnLoopback: Bool { ((try? String(contentsOf: hubToml, encoding: .utf8)) ?? "").contains("listen = \"127.0.0.1:") }
    // Opens the hub to the network, if the app wrote its hub.toml and only this Mac reaches it (see pair).
    static func openHub() throws {
        let text = (try? String(contentsOf: hubToml, encoding: .utf8)) ?? ""
        if text.hasPrefix(mark), let listen = text.split(separator: "\n").first(where: { $0.hasPrefix("listen = \"127.0.0.1:") }) {
            let port = hubPort
            let all = addresses(), lan = all.filter { !$0.hasPrefix("100.") }
            var hosts = tailscale() ?? all.filter { $0.hasPrefix("100.") }
            if let name = SCDynamicStoreCopyLocalHostName(nil) as String? { hosts.append(name + ".local") }
            hosts += lan
            let open = """
                # Add Machine… opened the hub to the network: other machines reach it at these addresses, in this order.
                listen = "0.0.0.0:\(port)"
                advertise = [\(hosts.map { "\"http://\($0):\(port)\"" }.joined(separator: ", "))]
                """
            try write(hubToml, text.replacingOccurrences(of: "# Only this Mac reaches the hub until Add Machine… opens it to the network.\n", with: "")
                .replacingOccurrences(of: String(listen), with: open))
            try restart("com.kilcazn.tokiscope.hub")
            Thread.sleep(forTimeInterval: 1)
            try waitForHub()
        }
    }

    // This Mac's Tailscale IPv4, when Tailscale's command line answers. (Other VPNs use its range too.)
    static func tailscale() -> [String]? {
        for path in ["/Applications/Tailscale.app/Contents/MacOS/Tailscale", "/opt/homebrew/bin/tailscale", "/usr/local/bin/tailscale"]
        where FileManager.default.isExecutableFile(atPath: path) {
            let ips = ((try? exec(["ip", "-4"], program: URL(fileURLWithPath: path), timeout: 5)) ?? "")
                .split(separator: "\n").map { $0.trimmingCharacters(in: .whitespaces) }.filter { $0.hasPrefix("100.") }
            if !ips.isEmpty { return ips }
        }
        return nil
    }
    // This Mac's IPv4 addresses others may reach: in Tailscale's range (100.64.0.0/10) and the local network's.
    static func addresses() -> [String] {
        var list: [String] = [], ifs: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&ifs) == 0 else { return [] }
        defer { freeifaddrs(ifs) }
        var p = ifs
        while let i = p?.pointee {
            defer { p = i.ifa_next }
            guard let sa = i.ifa_addr, sa.pointee.sa_family == UInt8(AF_INET), i.ifa_flags & UInt32(IFF_UP) != 0, i.ifa_flags & UInt32(IFF_LOOPBACK) == 0 else { continue }
            let a = sa.withMemoryRebound(to: sockaddr_in.self, capacity: 1) { UInt32(bigEndian: $0.pointee.sin_addr.s_addr) }
            let tailnet = a >> 22 == (100 << 2 | 1), lan = a >> 24 == 10 || a >> 20 == (172 << 4 | 1) || a >> 16 == (192 << 8 | 168)
            guard tailnet || lan else { continue }
            let s = "\(a >> 24).\(a >> 16 & 255).\(a >> 8 & 255).\(a & 255)"
            if !list.contains(s) { list.append(s) }
        }
        return list
    }

    // After an update the jobs still run the agent-stats of the old app, until they restart on the new one.
    static func restartIfUpdated() {
        let v = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? ""
        let last = UserDefaults.standard.string(forKey: "jobsStartedBy")
        UserDefaults.standard.set(v, forKey: "jobsStartedBy")
        guard let last, last != v else { return }
        for (job, label) in [(hubJob, "hub"), (report, "report"), (updater, "updater")] where job.status == .enabled {
            try? restart("com.kilcazn.tokiscope.\(label)")
        }
    }

    // What that install set in its jobs' environment, which the app's jobs don't have: the reporter's label, machine
    // name and timezone move into config.toml, and its HUB_URL must be a joined hub's route. Anything else stops the
    // take-over, named, before anything changes.
    private static func carryOver(_ roles: [String]) throws {
        let before = (try? String(contentsOf: configToml, encoding: .utf8)) ?? ""
        var config = before, left: [String] = []
        for r in roles {
            let plist = NSDictionary(contentsOf: home.appendingPathComponent("Library/LaunchAgents/dev.agent-stats.\(r).plist"))
            let env = plist?["EnvironmentVariables"] as? [String: String] ?? [:]
            for (k, v) in env.sorted(by: { $0.key < $1.key }) where k != "PATH" && k != "HOME" {
                switch (r, k) {
                case ("report", "STATS_LABEL"): config = setting(config, "label", v)
                case ("report", "STATS_MACHINE"): config = setting(config, "machine", v)
                case ("report", "STATS_TZ"): config = setting(config, "timezone", v)
                case ("report", "HUB_URL") where before.contains("\"\(v.hasSuffix("/") ? String(v.dropLast()) : v)\""): break
                default: left.append("\(k) for \(r == "report" ? "the reporter" : "the \(r)")")
                }
            }
        }
        guard left.isEmpty else {
            throw Failure(message: "agent-stats here gets settings from its services' environment that Tokiscope's don't carry (\(left.joined(separator: ", "))). Move them into config.toml or hub.toml (see agent-stats' docs/ARCHITECTURE.md), then try again. Nothing was changed.")
        }
        if config != before { try write(configToml, config) }
    }
    // config.toml with a top-level `key = "value"`, replacing the key's line or going before the first table.
    private static func setting(_ toml: String, _ key: String, _ value: String) -> String {
        let line = "\(key) = \"\(tomlString(value))\""
        var lines = toml.components(separatedBy: "\n"), firstTable = lines.firstIndex { $0.hasPrefix("[") } ?? lines.count
        if let i = lines[..<firstTable].firstIndex(where: { $0.split(separator: "=").first?.trimmingCharacters(in: .whitespaces) == key }) {
            lines[i] = line
        } else {
            if firstTable == lines.count, lines.last == "" { firstTable -= 1 }
            lines.insert(line, at: firstTable)
        }
        return lines.joined(separator: "\n")
    }

    // The jobs this Mac's setup needs, started afresh: whatever macOS had registered for them is dropped first.
    static func startAfresh() throws {
        guard separate.filter({ $0 != "relay" }).isEmpty else {
            throw Failure(message: "agent-stats runs on its own here: Let Tokiscope Run agent-stats… takes it over.")
        }
        guard isHub || joined else { throw Failure(message: "This Mac isn't set up yet: Set Up This Mac… in the menu.") }
        try stop()
        if isHub { try start(hubJob); try start(updater); try waitForHub() }
        if joined { try start(report) }
    }
    static var stopped: Bool {
        separate.filter { $0 != "relay" }.isEmpty && (isHub || joined) && ![hubJob, report].contains { $0.status == .enabled }
    }

    // Stops the app's jobs (config and stats stay).
    static func stop() throws {
        for job in [report, hubJob, updater] where [.enabled, .requiresApproval].contains(job.status) {
            do { try job.unregister() } catch { throw Failure(message: "Couldn't stop agent-stats (\(error.localizedDescription)).") }
        }
    }

    // The app takes over the jobs of an agent-stats installed on its own (the relay stays as it is): same config, same
    // state, so nothing is lost. If one of the app's jobs doesn't start, that install's are put back.
    static func takeOver() throws {
        let bin = home.appendingPathComponent(".local/bin/agent-stats"), roles = separate.filter { $0 != "relay" }
        try carryOver(roles)
        for r in roles { try exec(["service", "uninstall", r], program: bin) }
        do {
            if roles.contains("hub") { try start(hubJob); try start(updater); try waitForHub() }
            if roles.contains("report") { try start(report) }
        } catch {
            for job in [report, hubJob, updater] where job.status == .enabled { try? job.unregister() }
            for r in roles { _ = try? exec(["service", "install", r], program: bin) }
            throw error
        }
    }
}

// ---- The pages ----------------------------------------------------------------------------------------------------
// The app carries its pages (lab/ in its Resources) and serves them itself as tokiscope://app/…, so it needs no site.
// A relay answers only the sites it allows, so these read it through the app: /relay/stats answers from the relay's
// stream (RelayFeed), or is fetched here, from the relay the menu picks.
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
        guard let base = RelayFeed.base, let u = URL(string: base + "/stats") else { return respond(task, url, 404, "text/plain", Data()) }
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

// ---- Add Machine --------------------------------------------------------------------------------------------------
// A button that runs a closure.
final class ActionButton: NSButton {
    private var run: (() -> Void)?
    convenience init(_ title: String, primary: Bool = false, _ run: @escaping () -> Void) {
        self.init(frame: .zero)
        self.title = title; bezelStyle = .rounded; self.run = run; target = self; action = #selector(fire)
        if primary { keyEquivalent = "\r" }
    }
    @objc private func fire() { run?() }
}

// The window that adds a machine to the fleet. It lists what agent-stats finds on the tailnet and the local network
// (fleet discover), each with the shortest way in: Install for a Linux box or a Mac without Tokiscope, over SSH
// (fleet add, whose steps show as they happen), "open Tokiscope on it" for a Mac that has it; a field for any
// other SSH target; and, for a machine this Mac can't reach by SSH, a line to paste there (fleet invite). SSH
// runs with your keys and ~/.ssh/config, and never asks for a password: when it would, the window says how to fix it.
final class AddMachineWindow: NSObject, NSWindowDelegate {
    private static let width: CGFloat = 480, inner: CGFloat = 440
    private static let steps = [("connect", "Connecting"), ("route", "Finding a way back to this Mac"), ("install", "Installing agent-stats"),
                                ("join", "Joining and starting the reporter"), ("report", "Waiting for its first report")]
    private struct Step { let spin: NSProgressIndicator; let mark: NSImageView; let title: NSTextField; let detail: NSTextField }

    let window: NSWindow
    var onAdded: (() -> Void)?                            // a machine reports now
    var onClose: (() -> Void)?
    var openHub: ((@escaping () -> Void) -> Void)?        // opens the hub to the network, then calls back
    private let stack = NSStackView(), found = NSStackView(), progress = NSStackView(), inviteBox = NSStackView()
    private let target = NSTextField()
    private var adding: Process?, stopping = false, rows: [String: Step] = [:], ourFleet: String?
    private var stop: NSButton?

    override init() {
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: Self.width, height: 300), styleMask: [.titled, .closable], backing: .buffered, defer: false)
        super.init()
        window.title = "Add a Machine"
        window.isReleasedWhenClosed = false
        window.delegate = self
        for s in [stack, found, progress, inviteBox] { s.orientation = .vertical; s.alignment = .leading; s.spacing = 8 }
        stack.spacing = 12
        stack.edgeInsets = NSEdgeInsets(top: 18, left: 20, bottom: 20, right: 20)
        stack.translatesAutoresizingMaskIntoConstraints = false
        let content = NSView()
        content.addSubview(stack)
        window.contentView = content
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: content.leadingAnchor), stack.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            stack.topAnchor.constraint(equalTo: content.topAnchor), stack.bottomAnchor.constraint(equalTo: content.bottomAnchor),
            stack.widthAnchor.constraint(equalToConstant: Self.width),
        ])

        let refresh = ActionButton("Look Again") { [weak self] in self?.discover() }
        refresh.controlSize = .small
        stack.addArrangedSubview(row([Self.heading("Found on your tailnet and local network"), NSView(), refresh]))
        stack.addArrangedSubview(found)
        stack.addArrangedSubview(Self.heading("Somewhere else"))
        target.placeholderString = "user@host, IP, or a name from ~/.ssh/config"
        target.font = .monospacedSystemFont(ofSize: 12, weight: .regular)
        target.widthAnchor.constraint(equalToConstant: Self.inner - 90).isActive = true
        let connect = ActionButton("Connect") { [weak self] in
            guard let self else { return }
            let t = self.target.stringValue.trimmingCharacters(in: .whitespaces)
            if !t.isEmpty { self.add(t) }
        }
        stack.addArrangedSubview(row([target, connect]))
        stack.addArrangedSubview(progress)
        progress.isHidden = true
        stack.setCustomSpacing(20, after: progress)
        stack.addArrangedSubview(Self.heading("No SSH? Run this on the machine"))
        stack.addArrangedSubview(inviteBox)
        resetInvite()
    }

    func show() {
        discover()
        DispatchQueue.global().async {
            let st = (try? Stats.json(["fleet", "status"], timeout: 15)) as? [String: Any]
            DispatchQueue.main.async {
                self.ourFleet = st?["fleetId"] as? String
                if let name = st?["name"] as? String, !name.isEmpty { self.window.title = "Add a Machine to “\(name)”" }
            }
        }
        fit()
        window.center()
        NSApp.activate(ignoringOtherApps: true)
        window.makeKeyAndOrderFront(nil)
    }
    func windowWillClose(_ note: Notification) { stopping = true; adding?.terminate(); onClose?() }
    // Installs on `target` over SSH, as Install or Connect do.
    func install(_ target: String) { add(target) }

    // ---- Views
    private static func heading(_ s: String) -> NSTextField {
        let l = NSTextField(labelWithString: s)
        l.font = .systemFont(ofSize: NSFont.smallSystemFontSize, weight: .semibold); l.textColor = .secondaryLabelColor
        return l
    }
    private static func text(_ s: String, small: Bool = false, bold: Bool = false, color: NSColor? = nil, width: CGFloat = inner) -> NSTextField {
        let l = NSTextField(wrappingLabelWithString: s)
        l.font = small ? .systemFont(ofSize: NSFont.smallSystemFontSize) : bold ? .boldSystemFont(ofSize: NSFont.systemFontSize) : .systemFont(ofSize: NSFont.systemFontSize)
        l.textColor = color ?? (small ? .secondaryLabelColor : .labelColor)
        l.preferredMaxLayoutWidth = width
        l.isSelectable = true
        return l
    }
    private func row(_ views: [NSView], width: CGFloat = inner) -> NSStackView {
        let r = NSStackView(views: views)
        r.orientation = .horizontal; r.alignment = .centerY; r.spacing = 8
        r.widthAnchor.constraint(equalToConstant: width).isActive = true
        return r
    }
    private static func symbol(_ name: String, _ color: NSColor? = nil) -> NSImageView {
        let v = NSImageView(image: NSImage(systemSymbolName: name, accessibilityDescription: nil) ?? NSImage())
        if let color { v.contentTintColor = color }
        v.widthAnchor.constraint(equalToConstant: 18).isActive = true
        return v
    }
    private func set(_ s: NSStackView, _ views: [NSView]) {
        s.arrangedSubviews.forEach { $0.removeFromSuperview() }
        views.forEach { s.addArrangedSubview($0) }
        s.isHidden = views.isEmpty                        // and takes no room
        fit()
    }
    // The window keeps its top edge and takes the height its content needs.
    private func fit() {
        stack.layoutSubtreeIfNeeded()
        let content = NSRect(origin: .zero, size: NSSize(width: Self.width, height: stack.fittingSize.height))
        var f = window.frame
        let size = window.frameRect(forContentRect: content).size, top = f.maxY
        f.size = size; f.origin.y = top - size.height
        window.setFrame(f, display: true)
    }

    // ---- What agent-stats finds
    private func discover() {
        set(found, [Self.text("Looking…", small: true)])
        DispatchQueue.global().async {
            let r = Result { try Stats.json(["fleet", "discover", "--timeout", "3s"], timeout: 30) }
            DispatchQueue.main.async {
                switch r {
                case .success(let v): self.list(v as? [[String: Any]] ?? [])
                case .failure(let e): self.set(self.found, [Self.text((e as? Stats.Failure)?.message ?? e.localizedDescription, small: true)])
                }
            }
        }
    }
    private func list(_ machines: [[String: Any]]) {
        // This Mac and the members first, then the rest, each by name.
        let sorted = machines.sorted {
            let a = ($0["self"] as? Bool == true ? 0 : $0["member"] as? Bool == true ? 1 : 2, ($0["name"] as? String ?? "").lowercased())
            let b = ($1["self"] as? Bool == true ? 0 : $1["member"] as? Bool == true ? 1 : 2, ($1["name"] as? String ?? "").lowercased())
            return a < b
        }
        let views = sorted.map(machineRow)
        set(found, views.isEmpty ? [Self.text("Nothing found. Is the machine on, and on your tailnet or this network? You can still connect to it below.", small: true)] : views)
    }
    private func machineRow(_ m: [String: Any]) -> NSView {
        let host = m["host"] as? String ?? m["name"] as? String ?? "?", name = m["name"] as? String ?? host
        let os = m["os"] as? String, online = m["online"] as? Bool ?? true, me = m["self"] as? Bool == true
        let member = m["member"] as? Bool == true, stats = m["agentStats"] as? [String: Any]
        let sources = (m["sources"] as? [String] ?? []).map { ["tailscale": "Tailscale", "bonjour": "Bonjour"][$0] ?? $0 }
        var detail = [["linux": "Linux", "macos": "macOS", "windows": "Windows"][os ?? ""]].compactMap { $0 } + sources
        var trailing: NSView? = nil, dim = false, note: String?
        if me { detail.append("this Mac"); trailing = Self.symbol("checkmark", .systemGreen); dim = true }
        else if member { detail.append("in the fleet"); trailing = Self.symbol("checkmark", .systemGreen); dim = true }
        else if !online { detail.append("offline"); dim = true }
        else if os == "windows" { detail.append("not supported"); dim = true }
        else {
            if let s = stats, let fleet = s["fleetId"] as? String, fleet != ourFleet, ["hub", "replica"].contains(s["role"] as? String ?? "") {
                note = "Runs another fleet\((s["name"] as? String).map { " (“\($0)”)" } ?? ""): installing moves it to this one."
            } else if os == "macos" {
                note = "Has Tokiscope? Open it there and choose Join instead."
            }
            trailing = ActionButton("Install") { [weak self] in self?.add(host) }
        }
        let icon = Self.symbol(os == "macos" ? "laptopcomputer" : os == "linux" ? "server.rack" : os == "windows" ? "pc" : "desktopcomputer")
        let words = NSStackView(views: [Self.text(name, bold: true, width: Self.inner - 120), Self.text(detail.joined(separator: " · "), small: true, width: Self.inner - 120)]
                                + (note.map { [Self.text($0, small: true, width: Self.inner - 120)] } ?? []))
        words.orientation = .vertical; words.alignment = .leading; words.spacing = 1
        let r = row([icon, words, NSView()] + (trailing.map { [$0] } ?? []))
        r.alphaValue = dim ? 0.5 : 1
        return r
    }

    // ---- Adding one over SSH
    private func add(_ target: String, replace: Bool = false) {
        stopping = true; adding?.terminate(); stopping = false
        rows = [:]
        let stop = ActionButton("Stop") { [weak self] in self?.stopping = true; self?.adding?.terminate() }
        self.stop = stop
        var views: [NSView] = [row([Self.text("Installing on \(target)", bold: true, width: Self.inner - 80), NSView(), stop])]
        for (key, title) in Self.steps {
            let spin = NSProgressIndicator(), mark = Self.symbol("circle", .tertiaryLabelColor)
            spin.style = .spinning; spin.controlSize = .small; spin.isHidden = true
            spin.widthAnchor.constraint(equalToConstant: 18).isActive = true
            let t = Self.text(title, width: Self.inner - 40), d = Self.text("", small: true, width: Self.inner - 40)
            d.isHidden = true
            let words = NSStackView(views: [t, d]); words.orientation = .vertical; words.alignment = .leading; words.spacing = 1
            let r = NSStackView(views: [spin, mark, words]); r.orientation = .horizontal; r.alignment = .firstBaseline; r.spacing = 6
            rows[key] = Step(spin: spin, mark: mark, title: t, detail: d)
            views.append(r)
        }
        set(progress, views)
        var args = ["fleet", "add", "--ssh", target, "--json"]
        if replace { args.append("--replace") }
        var ended = false
        adding = Stats.stream(args, line: { [weak self] e in
            guard let self else { return }
            if e["step"] as? String == "done" || e["state"] as? String == "error" { ended = true }
            self.event(e, target: target)
        }, done: { [weak self] status, said in
            guard let self, !ended else { return }
            self.adding = nil
            self.failed(self.stopping ? "stopped" : "other", self.stopping ? "Stopped." : said.isEmpty ? "agent-stats stopped (status \(status))." : said, nil, target)
        })
    }
    private func show(_ s: Step, _ state: String, _ detail: String?) {
        s.spin.isHidden = state != "running"
        if state == "running" { s.spin.startAnimation(nil) } else { s.spin.stopAnimation(nil) }
        s.mark.isHidden = state == "running"
        switch state {
        case "ok": s.mark.image = NSImage(systemSymbolName: "checkmark.circle.fill", accessibilityDescription: nil); s.mark.contentTintColor = .systemGreen
        case "error": s.mark.image = NSImage(systemSymbolName: "xmark.circle.fill", accessibilityDescription: nil); s.mark.contentTintColor = .systemRed
        default: break
        }
        if let detail, !detail.isEmpty { s.detail.stringValue = detail; s.detail.isHidden = false }
    }
    private func event(_ e: [String: Any], target: String) {
        let step = e["step"] as? String ?? "", state = e["state"] as? String ?? ""
        if step == "done" {
            adding = nil; stop?.isHidden = true
            for (k, _) in Self.steps { if let s = rows[k], !s.spin.isHidden || s.mark.contentTintColor != .systemGreen { show(s, "ok", nil) } }
            let who = e["label"] as? String ?? e["machine"] as? String ?? target
            progress.addArrangedSubview(row([Self.symbol("checkmark.seal.fill", .systemGreen), Self.text("\(who) is part of the fleet and reports now.", bold: true, width: Self.inner - 30)]))
            fit()
            onAdded?()
            discover()
            return
        }
        // A step that starts or ends settles the ones before it that said nothing (say, nothing to install).
        if let i = Self.steps.firstIndex(where: { $0.0 == step }) {
            for (k, _) in Self.steps[..<i] { if let s = rows[k], s.mark.contentTintColor != .systemGreen, s.mark.contentTintColor != .systemRed { show(s, "ok", nil) } }
        }
        if let s = rows[step] { show(s, state, e["detail"] as? String) }
        if state == "error" {
            adding = nil
            failed(e["error"] as? String ?? "other", e["message"] as? String ?? "That didn't work.", e["hint"] as? String, target)
        }
        fit()
    }
    // What went wrong, and what to do about it.
    private func failed(_ kind: String, _ message: String, _ hint: String?, _ target: String) {
        stop?.isHidden = true
        for (_, s) in rows where !s.spin.isHidden { show(s, "error", nil) }
        var views: [NSView] = [Self.text(message, color: kind == "host-key-changed" ? .systemRed : nil)]
        if let hint, !hint.isEmpty {
            let h = Self.text(hint, small: true); h.font = .monospacedSystemFont(ofSize: NSFont.smallSystemFontSize, weight: .regular)
            views.append(h)
        }
        let retry = ActionButton("Retry") { [weak self] in self?.add(target) }
        var buttons: [NSView] = []
        switch kind {
        case "needs-key":
            views.insert(Self.text("This Mac's SSH key isn't on \(target) yet. ssh-copy-id puts it there: it asks for the password once, in Terminal. (Or turn on Tailscale SSH on that machine.)", small: true), at: 1)
            buttons = [ActionButton("Open Terminal (ssh-copy-id)", primary: true) { try? Stats.inTerminal("ssh-copy-id " + Stats.shellQuoted(target)) }, retry]
        case "taken":
            let name = target.split(separator: "@").last.map { String($0.split(separator: ".").first ?? $0) } ?? target
            buttons = [ActionButton("Replace the Old “\(name)”", primary: true) { [weak self] in self?.add(target, replace: true) },
                       ActionButton("Cancel") { [weak self] in self.map { $0.set($0.progress, []) } }]
        case "no-route-back":
            if Stats.hubOnLoopback {
                views.append(Self.text("Only this Mac reaches its hub so far. Open it to your network (port \(Stats.hubPort), over Tailscale or your local network), then try again.", small: true))
                buttons = [ActionButton("Open the Hub to the Network", primary: true) { [weak self] in self?.openHub? { self?.add(target) } }, retry]
            } else { buttons = [retry] }
        case "unsupported", "stopped": buttons = []
        default: buttons = [retry]
        }
        if !buttons.isEmpty { views.append(row(buttons + [NSView()])) }
        views.forEach { progress.addArrangedSubview($0) }
        fit()
    }

    // ---- The line to paste
    private func resetInvite() {
        set(inviteBox, [Self.text("A one-time line that installs agent-stats and joins this fleet, for a machine this Mac can't reach by SSH (it must reach this Mac).", small: true),
                        ActionButton("Make a Line") { [weak self] in self?.invite() }])
    }
    private func invite() {
        set(inviteBox, [Self.text("Making a line…", small: true)])
        let go = {
            DispatchQueue.global().async {
                let r = Result { try Stats.json(["fleet", "invite"], timeout: 30) }
                DispatchQueue.main.async {
                    guard case .success(let v) = r, let line = (v as? [String: Any])?["line"] as? String else {
                        if case .failure(let e) = r { self.set(self.inviteBox, [Self.text((e as? Stats.Failure)?.message ?? e.localizedDescription, small: true)]) }
                        return
                    }
                    let code = Self.text(line); code.font = .monospacedSystemFont(ofSize: 11, weight: .regular)
                    self.set(self.inviteBox, [code, self.row([ActionButton("Copy") {
                        NSPasteboard.general.clearContents(); NSPasteboard.general.setString(line, forType: .string)
                    }, Self.text("Works once, for 10 minutes.", small: true, width: 300), NSView()])])
                }
            }
        }
        if Stats.hubOnLoopback, let openHub { openHub(go) } else { go() }
    }
}

@main
final class App: NSObject, NSApplicationDelegate, NSMenuDelegate, NSWindowDelegate, WKScriptMessageHandler, SPUUpdaterDelegate,
                 SPUStandardUserDriverDelegate {
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
    private var busy: String?                             // what agent-stats is being set up to do, for the menu
    private var statsVersion: String?
    private var fleet: Bool?                              // the agent-stats here has fleets (nil: not known yet)
    private var replicaError: String?                     // why this Mac couldn't become a replica, for the menu
    private var node: String?                             // this Mac's name in the fleet
    private var members: [[String: Any]] = []             // the fleet's machines (fleet list), for the menu
    private var requests: [[String: Any]] = []            // pending join requests
    private var asked = Set<String>(), asking: String?, askAlert: NSAlert?, polling = false
    private var addWindow: AddMachineWindow?
    // Updates: only a release build has a feed (build.sh), so a local build never replaces itself.
    private var updates: SPUStandardUpdaterController?

    static func main() {
        let app = NSApplication.shared
        let delegate = App()
        app.delegate = delegate
        app.setActivationPolicy(.accessory)
        app.run()
    }

    func applicationDidFinishLaunching(_ note: Notification) {
        // For scripts and tests: `Tokiscope --stats create | replica | hub | join "<line>" | pair | take-over | start |
        // stop | status` does what the menu would (create: a new fleet, this Mac its first replica; replica: this Mac
        // becomes one; start: the jobs this Mac's setup needs, afresh; stop: all of them), prints how it went and quits.
        // `--stats add-machine [<ssh target>]` opens only the Add Machine window (installing on the target right away, if
        // one is given) and quits when it closes; `--stats request <url>` asks that Mac's fleet to let this Mac in.
        if let i = CommandLine.arguments.firstIndex(of: "--stats") {
            let a = Array(CommandLine.arguments.dropFirst(i + 1))
            if a.first == "add-machine" {
                fleet = true
                showAddWindow()
                addWindow?.onClose = { exit(0) }
                if a.count > 1 { addWindow?.install(a[1]) }
                print(addWindow?.window.windowNumber ?? 0); fflush(stdout)   // for screencapture -l
                return
            }
            if a.first == "request", a.count > 1 {
                fleet = true
                requestJoin(a[1], URL(string: a[1])?.host ?? a[1])
                Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in if self?.busy == nil { exit(0) } }
                return
            }
            do {
                switch a.first {
                case "create": try Stats.createFleet(); print("fleet created: hub and reporter running")
                case "replica": try Stats.becomeReplica(); print(Stats.isReplica ? "this Mac is a replica" : "nothing to do")
                case "hub": try Stats.becomeHub(); print("hub and reporter running")
                case "join" where a.count > 1: try Stats.join(a[1]); print("reporter running")
                case "pair": print(try Stats.pair())
                case "take-over": try Stats.takeOver(); print("taken over")
                case "stop": try Stats.stop(); print("stopped")
                case "start": try Stats.startAfresh(); print("started")
                case "status": print(Stats.summary(Stats.version())); print(HubFeed.routes().map { $0.url + ($0.token == nil ? "" : " (view token)") }.joined(separator: "\n"))
                default: print("usage: Tokiscope --stats create | replica | hub | join \"<line>\" | pair | take-over | start | stop | status | add-machine"); exit(2)
                }
                exit(0)
            } catch {
                FileHandle.standardError.write(Data("\((error as? Stats.Failure)?.message ?? "\(error)")\n".utf8))
                exit(1)
            }
        }
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
        hub.onRequests = { [weak self] in self?.gotRequests($0) }
        hub.start()
        pages.feed = relay
        relay.onUpdate = { [weak self] js in self?.feedPages().forEach { $0.evaluateJavaScript("window.relayFeed?.(\(js))") } }
        relay.start()
        if CommandLine.arguments.contains("--settings") { openSettings() }
        if Bundle.main.object(forInfoDictionaryKey: "SUFeedURL") != nil {
            updates = SPUStandardUpdaterController(startingUpdater: true, updaterDelegate: self, userDriverDelegate: self)
        }
        if Stats.bundled {
            DispatchQueue.global().async {
                Stats.restartIfUpdated()
                let v = Stats.version(), fleet = Stats.hasFleet()
                DispatchQueue.main.async {
                    self.statsVersion = v; self.fleet = fleet
                    if fleet { self.becomeReplica(quietly: true); self.refreshMembers() }
                }
            }
            // Join requests, from agent-stats when the hub's stream doesn't say them.
            Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] _ in self?.pollRequests() }
            // First launch: which part this Mac plays. Asked once; the menu has it after.
            if !Stats.setUp, !UserDefaults.standard.bool(forKey: "setupOffered") {
                UserDefaults.standard.set(true, forKey: "setupOffered")
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { self.setUp() }
            }
        }
    }

    private var layout: Layout { layouts.compactMap { $0 }.first { $0.key == Pref.layout } ?? layouts[0]! }
    private func windowSize() -> NSSize {
        if Pref.bubbleMode { return NSSize(width: 84 * Pref.zoom, height: 84 * Pref.zoom) }
        let s = pageSizes[layout.key] ?? layout.size, p = layout.padded ? pad * 2 : 0
        return NSSize(width: (s.width + p) * Pref.zoom, height: (s.height + p) * Pref.zoom)
    }

    // A lab page from where the pages load, reading the stats from the relay the menu picks, if any.
    private func link(_ page: String, custom: String? = nil) -> URL? {
        var page = page
        // A local copy reads the stats from another relay when given one; the built-in pages always through the app.
        if let relay = Pref.relay, Pref.site != BundlePages.origin,
           let q = relay.addingPercentEncoding(withAllowedCharacters: .alphanumerics.union(CharacterSet(charactersIn: "-._~:/"))) { page += "&relay=\(q)" }
        var link = custom ?? Pref.site + page
        if Pref.relay != nil, link.hasPrefix(BundlePages.origin + "/"), !link.contains("relay=") {
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
            sub.addItem(withTitle: (hub.route.map { "Stats From the Hub, \(URL(string: $0.url)?.host ?? $0.url)" }
                                    ?? (Pref.relay != nil ? "Stats From the Relay (No Hub)" : "No Stats: No Hub Answers"))
                        + ((hub.route != nil ? hub.live : relay.live) ? ", Live" : ""),
                        action: nil, keyEquivalent: "").isEnabled = false
        }
        menu.addItem(.separator())
        if let busy { menu.addItem(withTitle: busy, action: nil, keyEquivalent: "").isEnabled = false }
        else if Stats.bundled || Stats.setUp {
            if !Stats.setUp { _ = add("Set Up This Mac…", false, #selector(setUp)) }
            else {
                for (i, r) in requests.enumerated() {
                    let who = r["label"] as? String ?? r["machine"] as? String ?? "A machine"
                    add("\(who) Asks to Join (\(App.spaced(r["digits"] as? String ?? "")))…", false, #selector(askRequest(_:))).tag = i
                }
                _ = add("Add Machine…", false, #selector(addMachine))
                if fleet == true, Stats.isReplica { submenu("Machines") { sub in fillMachines(sub) } }
                if let replicaError {
                    sub(menu, "This Mac Isn't a Replica Yet: \(replicaError.prefix(80))")
                    _ = add("Try Again to Make This Mac a Replica", false, #selector(retryReplica))
                }
                if Stats.isHub { _ = add(fleet == true ? "Open the Dashboard" : "Open the Hub's Dashboard", false, #selector(openDashboard)) }
                if Stats.bundled, !Stats.separate.filter({ $0 != "relay" }).isEmpty { _ = add("Let Tokiscope Run agent-stats…", false, #selector(takeOver)) }
                if Stats.bundled, Stats.stopped { _ = add("Start agent-stats", false, #selector(startStats)) }
            }
            menu.addItem(withTitle: Stats.summary(statsVersion), action: nil, keyEquivalent: "").isEnabled = false
        }
        menu.addItem(.separator())
        let settings = add("Settings…", false, #selector(openSettings))
        settings.keyEquivalent = ","
        _ = add("Reload", false, #selector(reload))
        _ = add("Open at Login", SMAppService.mainApp.status == .enabled, #selector(toggleLogin))
        if let updates {
            let check = menu.addItem(withTitle: "Check for Updates…", action: #selector(SPUStandardUpdaterController.checkForUpdates(_:)), keyEquivalent: "")
            check.target = updates
        }
        menu.addItem(.separator())
        let quit = menu.addItem(withTitle: "Quit Tokiscope", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        quit.target = NSApp
        refreshMembers()                                  // for the next time the menu opens
    }
    // A line that only says something.
    private func sub(_ menu: NSMenu, _ title: String) { menu.addItem(withTitle: title, action: nil, keyEquivalent: "").isEnabled = false }
    // The fleet's machines: a dot (green: reported in the last minute or so), the name, what it is; Remove… in each.
    private func fillMachines(_ menu: NSMenu) {
        if members.isEmpty { sub(menu, "Looking…"); return }
        for (i, m) in members.enumerated() {
            let name = m["label"] as? String ?? m["machine"] as? String ?? "?", machine = m["machine"] as? String ?? name
            let role = m["role"] as? String == "replica" ? "keeps the stats" : "reports"
            let revoked = m["revoked"] as? Bool == true, online = m["online"] as? Bool == true
            let item = menu.addItem(withTitle: name + (machine == node ? " (This Mac)" : ""), action: nil, keyEquivalent: "")
            let color: NSColor = revoked ? .systemRed : online ? .systemGreen : .tertiaryLabelColor
            item.image = NSImage(size: NSSize(width: 8, height: 8), flipped: false) { r in color.setFill(); NSBezierPath(ovalIn: r).fill(); return true }
            let detail = NSMenu()
            sub(detail, revoked ? "Removed" : "\(online ? "Online" : "Offline") · \(role)" + ((m["version"] as? String).map { " · agent-stats \($0)" } ?? ""))
            if !revoked && machine != node {
                let rm = detail.addItem(withTitle: "Remove…", action: #selector(removeMachine(_:)), keyEquivalent: "")
                rm.target = self; rm.tag = i
            }
            item.submenu = detail
        }
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
        alert.informativeText = "A page to show instead of a layout. Built-in pages (tokiscope://app/…) read the stats through the app; others need a relay that allows them."
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
        alert.informativeText = "Where the layouts and bubbles read the stats when no hub answers: a relay your hub publishes to (agent-stats relay serve), or a hub that serves /stats itself. The built-in pages read it through the app; a local copy needs one that allows http://localhost."
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 340, height: 24))
        field.stringValue = Pref.relay ?? ""
        alert.accessoryView = field
        alert.addButton(withTitle: "Use")
        alert.addButton(withTitle: "Cancel")
        alert.addButton(withTitle: "Use None")
        NSApp.activate(ignoringOtherApps: true)
        switch alert.runModal() {
        case .alertFirstButtonReturn:
            let v = field.stringValue.trimmingCharacters(in: .whitespaces)
            Pref.relay = v.isEmpty ? nil : v; relay.restart(); load()
        case .alertThirdButtonReturn: Pref.relay = nil; relay.restart(); load()
        default: break
        }
    }

    // ---- Updates ------------------------------------------------------------------------------------------------
    // A widget is rarely quit, so an update that has downloaded installs and relaunches at once rather than on quit,
    // unless agent-stats is being set up.
    func updater(_ updater: SPUUpdater, willInstallUpdateOnQuit item: SUAppcastItem, immediateInstallationBlock: @escaping () -> Void) -> Bool {
        guard busy == nil else { return false }
        immediateInstallationBlock()
        return true
    }
    // An app with no Dock icon gets Sparkle's quieter reminders when it checks on its own.
    var supportsGentleScheduledUpdateReminders: Bool { true }

    // ---- agent-stats ----------------------------------------------------------------------------------------------
    // Runs `work` off the main thread with `doing` in the menu, then says how it went.
    private func background(_ doing: String, _ work: @escaping () throws -> String?, done: ((String) -> Void)? = nil) {
        busy = doing
        DispatchQueue.global().async {
            let r = Result { try work() }
            DispatchQueue.main.async {
                self.busy = nil
                self.hub.fetch()
                self.soon {
                    switch r {
                    case .success(let note?): done?(note) ?? self.say("Done", note)
                    case .success(nil): break
                    case .failure(let e): self.say("That Didn't Work", (e as? Stats.Failure)?.message ?? e.localizedDescription, style: .warning)
                    }
                }
            }
        }
    }
    // Runs `f` from the run loop, not inside a block on the main queue: an alert it opens then lets the main queue go
    // on (agent-stats' output as it comes, the hub's stream), which an alert opened inside such a block would hold up
    // until it closes. Alerts that follow work done in the background go through here.
    private func soon(_ f: @escaping () -> Void) {
        RunLoop.main.perform(inModes: [.default]) { f() }
        CFRunLoopWakeUp(CFRunLoopGetMain())
    }
    private func say(_ title: String, _ text: String, style: NSAlert.Style = .informational) {
        let alert = NSAlert()
        alert.alertStyle = style
        alert.messageText = title
        alert.informativeText = text
        NSApp.activate(ignoringOtherApps: true)
        alert.runModal()
    }

    // First launch (and Set Up This Mac… after): looks for a fleet on the tailnet and the local network, and offers to
    // join it or to start one. Each Mac of a fleet keeps everyone's stats, so there is no main Mac to pick. With an
    // agent-stats from before fleets it asks the old question: which Mac runs the hub.
    @objc private func setUp() {
        background("Looking for Your Machines…") { [weak self] in
            let fleet = Stats.hasFleet()
            let found = fleet ? (try? Stats.json(["fleet", "discover", "--timeout", "3s"], timeout: 30)) as? [[String: Any]] ?? [] : []
            DispatchQueue.main.async { self?.fleet = fleet; self?.soon { fleet ? self?.offerFleets(found) : self?.offerHub() } }
            return nil
        }
    }

    // The fleets agent-stats found, one entry each (the first machine of it that answered): a Mac's hub to ask.
    private struct Found { let fleetId, name, node, url: String }
    private func offerFleets(_ machines: [[String: Any]]) {
        var fleets: [Found] = []
        for m in machines where m["self"] as? Bool != true {
            guard let s = m["agentStats"] as? [String: Any], ["hub", "replica"].contains(s["role"] as? String ?? ""),
                  let id = s["fleetId"] as? String, let url = s["url"] as? String, !fleets.contains(where: { $0.fleetId == id }) else { continue }
            fleets.append(Found(fleetId: id, name: s["name"] as? String ?? "your fleet", node: s["node"] as? String ?? m["name"] as? String ?? url, url: url))
        }
        let alert = NSAlert()
        alert.messageText = "Set Up Tokiscope"
        alert.informativeText = """
            Tokiscope shows the tokens your coding agents (Claude Code, Codex and others) use, on every machine you use them on. \
            Each Mac of your fleet keeps everyone's stats, so none of them has to stay on.
            """ + (fleets.isEmpty
                ? "\n\nNo fleet answered on your tailnet or local network. Start one here, then add your other machines from the menu (Add Machine…)."
                : fleets.count == 1 ? "\n\nFound “\(fleets[0].name)” on \(fleets[0].node)." : "\n\nFound these fleets:")
        let pick = NSPopUpButton(frame: NSRect(x: 0, y: 0, width: 320, height: 26))
        if fleets.count > 1 {
            pick.addItems(withTitles: fleets.map { "\($0.name) (on \($0.node))" })
            alert.accessoryView = pick
        }
        if !fleets.isEmpty { alert.addButton(withTitle: fleets.count == 1 ? "Join “\(fleets[0].name)”" : "Join") }
        alert.addButton(withTitle: "Start a New Fleet")
        alert.addButton(withTitle: "Join by Address…")
        alert.addButton(withTitle: "Later")
        NSApp.activate(ignoringOtherApps: true)
        var r = alert.runModal().rawValue - NSApplication.ModalResponse.alertFirstButtonReturn.rawValue
        if fleets.isEmpty { r += 1 }
        switch r {
        case 0: let f = fleets[max(0, pick.indexOfSelectedItem)]; requestJoin(f.url, f.name)
        case 1:
            background("Starting a Fleet…") {
                try Stats.createFleet()
                return "This Mac keeps your fleet's stats and counts its agents. To add another machine, choose Add Machine… in the menu."
            }
        case 2: joinByAddress()
        default: break
        }
    }

    // Asks a Mac of the fleet to let this one in (agent-stats fleet request), shows the digits both sides show while
    // it waits, and once approved on any Mac of the fleet starts the hub and the reporter here: this Mac is a replica.
    private func requestJoin(_ url: String, _ name: String) {
        let digits = NSTextField(labelWithString: "· · · ·")
        digits.font = .monospacedDigitSystemFont(ofSize: 34, weight: .semibold); digits.alignment = .center
        let note = NSTextField(wrappingLabelWithString: "Asking \(url)…")
        note.textColor = .secondaryLabelColor; note.font = .systemFont(ofSize: NSFont.smallSystemFontSize); note.alignment = .center
        let box = NSStackView(views: [digits, note])
        box.orientation = .vertical; box.spacing = 6; box.frame = NSRect(x: 0, y: 0, width: 320, height: 76)
        digits.widthAnchor.constraint(equalToConstant: 320).isActive = true; note.preferredMaxLayoutWidth = 320
        let alert = NSAlert()
        alert.messageText = "Approve This Mac on Another Mac"
        alert.informativeText = "On any Mac of “\(name)”, Tokiscope asks whether \(Stats.label) may join. Check that it shows the same digits, then approve it there."
        alert.accessoryView = box
        alert.addButton(withTitle: "Cancel")
        Stats.prepareJoin()
        var outcome: String?, said = ""
        busy = "Asking to Join “\(name)”…"
        let p = Stats.stream(["fleet", "request", url, "--label", Stats.label, "--json"], line: { e in
            switch e["state"] as? String {
            case "pending":
                digits.stringValue = App.spaced(e["digits"] as? String ?? "")
                note.stringValue = "Waiting for approval. The request lasts 10 minutes."
            case let s? where ["approved", "denied", "expired"].contains(s): outcome = s; NSApp.stopModal()
            default: break
            }
        }, done: { status, err in
            guard outcome == nil else { return }
            outcome = "failed"; said = err.isEmpty ? "agent-stats fleet request stopped (status \(status))." : err
            NSApp.stopModal()
        })
        NSApp.activate(ignoringOtherApps: true)
        alert.runModal()
        busy = nil
        switch outcome {
        case nil: p.terminate()                           // cancelled
        case "approved":
            background("Starting agent-stats…") {
                try Stats.startReplica()
                return "This Mac is part of “\(name)”: it keeps the fleet's stats and counts its agents."
            }
        case "denied": say("Not Approved", "A Mac of “\(name)” turned the request down.")
        case "expired": say("The Request Expired", "Nobody approved it within 10 minutes. Ask again, and approve it on a Mac of the fleet while it waits.")
        default: say("That Didn't Work", said, style: .warning)
        }
    }

    // A Mac of the fleet that discovery didn't find (another network, say): its address, or a line its Add Machine…
    // showed. Before fleets, only the line.
    private func joinByAddress() {
        let alert = NSAlert()
        alert.messageText = fleet == true ? "Join a Fleet" : "Join Another Mac"
        alert.informativeText = fleet == true
            ? "The address of a Mac in the fleet, such as http://mac-mini:7777 (its Tailscale or local name, port 7777), or a line its Add Machine… showed."
            : "On the main Mac, choose Add Machine… in Tokiscope's menu, then paste the line it shows here."
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 400, height: 24))
        field.placeholderString = fleet == true ? "http://mac-mini:7777" : "agent-stats join http://… --code …"
        alert.accessoryView = field
        alert.addButton(withTitle: "Join")
        alert.addButton(withTitle: "Cancel")
        NSApp.activate(ignoringOtherApps: true)
        alert.window.initialFirstResponder = field
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        let text = field.stringValue.trimmingCharacters(in: .whitespacesAndNewlines), fleet = self.fleet == true
        if text.contains("--code") || !fleet {
            return background("Joining…") {
                try Stats.joinWithLine(text, fleet: fleet)
                return fleet && Stats.isReplica ? "This Mac is part of the fleet: it keeps the fleet's stats and counts its agents."
                    : "This Mac counts its agents and reports them to the hub."
            }
        }
        var url = text.contains("://") ? text : "http://" + text
        if var c = URLComponents(string: url), c.port == nil { c.port = 7777; url = c.string ?? url }
        requestJoin(url, URL(string: url)?.host ?? url)
    }

    // Before fleets: one Mac runs the hub, the others join it.
    private func offerHub() {
        let alert = NSAlert()
        alert.messageText = "Set Up Tokiscope"
        alert.informativeText = """
            Tokiscope shows the tokens your coding agents (Claude Code, Codex and others) use. One Mac keeps the stats: \
            it runs the hub. Every machine, that one included, counts its own agents and reports them to the hub.

            Use another machine too? Set up the main one first, then add the others from its menu (Add Machine…).
            """
        alert.addButton(withTitle: "This Is the Main Mac")
        alert.addButton(withTitle: "Join Another Mac…")
        alert.addButton(withTitle: "Later")
        NSApp.activate(ignoringOtherApps: true)
        switch alert.runModal() {
        case .alertFirstButtonReturn:
            background("Setting Up the Hub…") {
                try Stats.becomeHub()
                return "This Mac runs the hub and counts its agents. To add another machine, choose Add Machine… in the menu."
            }
        case .alertSecondButtonReturn: joinByAddress()
        default: break
        }
    }

    // An update brought fleets: this Mac becomes a replica (Stats.becomeReplica). Quietly at launch; what went wrong
    // shows in the menu, with Try Again.
    private func becomeReplica(quietly: Bool) {
        guard Stats.wantsReplica else { replicaError = nil; return }
        busy = "Making This Mac a Replica…"
        DispatchQueue.global().async {
            let r = Result { try Stats.becomeReplica() }
            DispatchQueue.main.async {
                self.busy = nil
                self.hub.fetch()
                switch r {
                case .success: self.replicaError = nil; self.refreshMembers()
                case .failure(let e):
                    let msg = (e as? Stats.Failure)?.message ?? e.localizedDescription
                    self.replicaError = msg
                    if !quietly { self.soon { self.say("That Didn't Work", msg, style: .warning) } }
                }
            }
        }
    }
    @objc private func retryReplica() { becomeReplica(quietly: false) }

    @objc private func addMachine() {
        // Before fleets machines are added on the main Mac only, with a line to paste.
        guard fleet == true, Stats.isHub else { return addMachineByLine() }
        if Stats.hubOnLoopback, !confirmOpenHub() { return }
        showAddWindow()
    }
    private func showAddWindow() {
        if addWindow == nil {
            let w = AddMachineWindow()
            w.onAdded = { [weak self] in self?.refreshMembers(); self?.hub.fetch() }
            w.openHub = { [weak self] then in
                guard let self, self.confirmOpenHub() else { return }
                self.background("Opening the Hub to Your Network…", { try Stats.openHub(); return "" }) { _ in then() }
            }
            addWindow = w
        }
        addWindow?.show()
    }
    // Only this Mac reaches its hub so far: ask before other machines can (each still needs a code to join).
    private func confirmOpenHub() -> Bool {
        let alert = NSAlert()
        alert.messageText = "Open the Hub to Your Network?"
        alert.informativeText = """
            Until now only this Mac reaches the hub. Other machines will reach it on port \(Stats.hubPort), over \
            Tailscale or your local network. Each needs a one-time code to join; without one, nobody can report \
            or read anything. macOS may ask whether agent-stats may accept incoming connections: allow it.
            """
        alert.addButton(withTitle: "Open It")
        alert.addButton(withTitle: "Cancel")
        NSApp.activate(ignoringOtherApps: true)
        return alert.runModal() == .alertFirstButtonReturn
    }
    private func addMachineByLine() {
        guard Stats.isHub else {
            let host = hub.route.flatMap { URL(string: $0.url)?.host }
            return say("Add Machine", "Machines are added on the main Mac, the one that runs the hub\(host.map { " (\($0))" } ?? ""): choose Add Machine… in Tokiscope's menu there.")
        }
        if Stats.hubOnLoopback, !confirmOpenHub() { return }
        background("Making a Code…", { try Stats.pair() }) { [weak self] line in self?.showCode(line) }
    }

    // ---- The fleet ------------------------------------------------------------------------------------------------
    // "4821" as "48 21", the way the digits are read out.
    static func spaced(_ d: String) -> String { d.count == 4 ? "\(d.prefix(2)) \(d.suffix(2))" : d }

    // The machines and this Mac's name, for the menu (in the background; the menu shows what came last).
    private var refreshing = false
    private func refreshMembers() {
        guard fleet == true, Stats.isReplica, !refreshing else { return }
        refreshing = true
        DispatchQueue.global().async {
            let list = (try? Stats.json(["fleet", "list"], timeout: 15)) as? [[String: Any]]
            let st = self.node == nil ? (try? Stats.json(["fleet", "status"], timeout: 15)) as? [String: Any] : nil
            DispatchQueue.main.async {
                self.refreshing = false
                if let list { self.members = list }
                if let n = st?["node"] as? String { self.node = n }
            }
        }
    }
    @objc private func removeMachine(_ sender: NSMenuItem) {
        guard sender.tag < members.count, let machine = members[sender.tag]["machine"] as? String else { return }
        let name = members[sender.tag]["label"] as? String ?? machine
        let alert = NSAlert()
        alert.messageText = "Remove \(name) From the Fleet?"
        alert.informativeText = "Its token stops working on every Mac of the fleet, so it can't report or read anything any more. Its stats so far stay. To add it again later, use Add Machine… in the menu."
        alert.addButton(withTitle: "Remove")
        alert.addButton(withTitle: "Cancel")
        alert.buttons[0].hasDestructiveAction = true
        NSApp.activate(ignoringOtherApps: true)
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        background("Removing \(name)…") { [weak self] in
            try Stats.exec(["fleet", "remove", machine], timeout: 30)
            DispatchQueue.main.async { self?.refreshMembers() }
            return nil
        }
    }

    // Join requests: from the hub's stream, or from agent-stats (pollRequests). Each new one is asked about once; all of
    // them stay in the menu until approved or turned down somewhere in the fleet.
    private func gotRequests(_ list: [[String: Any]]) {
        guard Stats.isReplica else { return }
        requests = list
        let ids = Set(list.compactMap { $0["id"] as? String })
        // Settled elsewhere (approved on another Mac, expired): the question goes away.
        if let a = asking, !ids.contains(a), let w = askAlert?.window, NSApp.modalWindow === w { NSApp.stopModal(withCode: .cancel) }
        guard asking == nil, let r = list.first(where: { ($0["id"] as? String).map { !asked.contains($0) } ?? false }),
              let id = r["id"] as? String else { return }
        asking = id                                       // until it is asked (soon) and answered
        soon { self.ask(r) }
    }
    private func pollRequests() {
        guard fleet == true, Stats.isReplica, !hub.requestsLive, !polling else { return }
        polling = true
        DispatchQueue.global().async {
            let list = (try? Stats.json(["fleet", "requests"], timeout: 15)) as? [[String: Any]]
            DispatchQueue.main.async { self.polling = false; if let list { self.gotRequests(list) } }
        }
    }
    @objc private func askRequest(_ sender: NSMenuItem) {
        guard sender.tag < requests.count, asking == nil, let id = requests[sender.tag]["id"] as? String else { return }
        asking = id; ask(requests[sender.tag])
    }
    private func ask(_ r: [String: Any]) {
        guard let id = r["id"] as? String, requests.contains(where: { $0["id"] as? String == id }) else { asking = nil; return }
        let who = r["label"] as? String ?? r["machine"] as? String ?? "A machine"
        asked.insert(id); asking = id
        let alert = NSAlert()
        alert.messageText = "\(who) Asks to Join Your Fleet"
        alert.informativeText = """
            Check that \(who) shows these digits: \(App.spaced(r["digits"] as? String ?? "")).

            Approve only a machine you set up yourself: it will report its agents and read every machine's stats.
            """
        alert.addButton(withTitle: "Approve")
        alert.addButton(withTitle: "Turn Down")
        alert.addButton(withTitle: "Later")
        askAlert = alert
        NSApp.activate(ignoringOtherApps: true)
        let res = alert.runModal()
        asking = nil; askAlert = nil
        let next = { [weak self] in guard let self else { return }; self.gotRequests(self.requests) }
        guard res != .cancel else { return next() }       // settled elsewhere meanwhile
        switch res {
        case .alertFirstButtonReturn:
            background("Approving \(who)…", { try Stats.approve(id); return "" }) { _ in
                self.requests.removeAll { $0["id"] as? String == id }; self.refreshMembers(); next()
            }
        case .alertSecondButtonReturn:
            background("Turning Down \(who)…", { try Stats.deny(id); return "" }) { _ in self.requests.removeAll { $0["id"] as? String == id }; next() }
        default: next()
        }
    }

    private func showCode(_ line: String) {
        let install = "curl -fsSL https://raw.githubusercontent.com/kcazin/agent-stats/main/install.sh | sh && ~/.local/bin/"
        let alert = NSAlert()
        alert.messageText = "Add a Machine"
        alert.informativeText = """
            On a Mac: open Tokiscope there, choose Join Another Mac…, and paste:

            \(line)

            On Linux, or a Mac without Tokiscope, run this in a terminal (it installs agent-stats, then joins):

            \(install)\(line)

            The code works once, for 10 minutes.
            """
        alert.addButton(withTitle: "Copy for Tokiscope")
        alert.addButton(withTitle: "Copy for a Terminal")
        alert.addButton(withTitle: "Done")
        NSApp.activate(ignoringOtherApps: true)
        let r = alert.runModal()
        guard r != .alertThirdButtonReturn else { return }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(r == .alertFirstButtonReturn ? line : install + line, forType: .string)
    }

    @objc private func startStats() {
        background("Starting agent-stats…") { try Stats.startAfresh(); return nil }
    }

    @objc private func openDashboard() { if let u = URL(string: Stats.localHub + "/") { NSWorkspace.shared.open(u) } }

    @objc private func takeOver() {
        let roles = Stats.separate.filter { $0 != "relay" }
        let alert = NSAlert()
        alert.messageText = "Let Tokiscope Run agent-stats?"
        alert.informativeText = """
            agent-stats was installed on its own here (\(roles.joined(separator: ", "))). Tokiscope can run it instead,             as its background items, and keep it up to date with the app. The config and the stats stay where they are.
            """
        alert.addButton(withTitle: "Let Tokiscope Run It")
        alert.addButton(withTitle: "Cancel")
        NSApp.activate(ignoringOtherApps: true)
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        background("Taking Over agent-stats…") {
            try Stats.takeOver()
            return "Tokiscope runs agent-stats here now. ~/.local/bin/agent-stats stays for the terminal; Tokiscope's own copy is the one that runs."
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
