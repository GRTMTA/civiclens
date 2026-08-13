import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Session } from "@supabase/supabase-js";
import {
  Camera,
  MapPin,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  LogOut,
  ArrowRight,
  MousePointer2,
} from "lucide-react";
import {
  createReport,
  listReports,
  supabase,
  type ReportItem,
} from "./supabase";
import pristine from "./assests/city-pristine.jpg";
import damaged from "./assests/city-damaged.jpg";
import "./styles.css";

type Project = {
  id: string;
  contractId?: string;
  name: string;
  category: string;
  description: string;
  agency: string;
  contractor?: string;
  budget?: number;
  amountPaid?: number;
  status: string;
  progress?: number;
  location: string;
  region?: string;
  districtOffice?: string;
  programName?: string;
  infrastructureYear?: string;
  startDate?: string;
  completionDate?: string;
  sourceOfFunds?: string;
  livestreamUrl?: string;
  sourceRevision?: string;
  sourceImportedAt?: string;
  sourceUrl: string;
  lastChecked: string;
};
type Match = { project: Project; confidence: number; evidence: string[] };
type ScanResult = {
  status: string;
  analysis?: unknown;
  matches?: Match[];
  error?: string;
};

const SPOTLIGHT_RADIUS = 240;

function Landing({ onSignIn }: { onSignIn: () => void }) {
  const mouse = useRef({ x: -999, y: -999 });
  const smooth = useRef({ x: -999, y: -999 });
  const layer = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const frame = useRef<number | null>(null);
  const movedOnce = useRef(false);
  const [moved, setMoved] = useState(false);

  useEffect(() => {
    const mask = document.createElement("canvas");
    canvas.current = mask;
    const resize = () => {
      mask.width = window.innerWidth;
      mask.height = window.innerHeight;
    };
    const move = (event: PointerEvent) => {
      mouse.current = { x: event.clientX, y: event.clientY };
      if (smooth.current.x < -900)
        smooth.current = { x: event.clientX, y: event.clientY };
      if (!movedOnce.current) {
        movedOnce.current = true;
        setMoved(true);
      }
    };
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", move, { passive: true });
    const paint = () => {
      smooth.current.x += (mouse.current.x - smooth.current.x) * 0.1;
      smooth.current.y += (mouse.current.y - smooth.current.y) * 0.1;
      const context = mask.getContext("2d");
      if (layer.current && context && smooth.current.x > -900) {
        const radius = window.innerWidth < 640 ? 150 : SPOTLIGHT_RADIUS;
        context.clearRect(0, 0, mask.width, mask.height);
        const gradient = context.createRadialGradient(
          smooth.current.x,
          smooth.current.y,
          0,
          smooth.current.x,
          smooth.current.y,
          radius,
        );
        gradient.addColorStop(0, "rgba(255,255,255,1)");
        gradient.addColorStop(0.55, "rgba(255,255,255,.65)");
        gradient.addColorStop(0.88, "rgba(255,255,255,.08)");
        gradient.addColorStop(1, "rgba(255,255,255,0)");
        context.fillStyle = gradient;
        context.fillRect(0, 0, mask.width, mask.height);
        const image = mask.toDataURL();
        layer.current.style.opacity = "1";
        layer.current.style.maskImage = `url(${image})`;
        layer.current.style.webkitMaskImage = `url(${image})`;
      }
      frame.current = requestAnimationFrame(paint);
    };
    frame.current = requestAnimationFrame(paint);
    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", move);
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, []);

  return (
    <main className="civic-landing">
      <section className="civic-hero">
        <div
          className="civic-image"
          style={{ backgroundImage: `url(${pristine})` }}
        />
        <div
          ref={layer}
          className="civic-image civic-damage"
          style={{ backgroundImage: `url(${damaged})` }}
        />
        <div className="civic-overlay civic-overlay-top" />
        <div className="civic-overlay civic-overlay-bottom" />
        <div className="civic-brand">
          <ShieldCheck /> CivicLens
        </div>
        <button className="civic-sign-in" onClick={onSignIn}>
          Sign in
        </button>
        <div className="civic-heading">
          <h1>
            <em>What looks</em>
            <span>strong can fail</span>
          </h1>
        </div>
        <div className={`civic-reveal-hint ${moved ? "is-hidden" : ""}`}>
          <MousePointer2 /> <span>Move to reveal</span>
        </div>
        <p className="civic-support">
          Every structure carries the story of what we build, what time changes,
          and what failure leaves behind.
        </p>
        <div className="civic-cta">
          <p>Move across the city to reveal the damage beneath the surface.</p>
          <button onClick={onSignIn}>
            Start Scanning <ArrowRight />
          </button>
        </div>
      </section>
    </main>
  );
}

function AuthForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const submit = async (mode: "sign-in" | "sign-up") => {
    setMessage("");
    const result =
      mode === "sign-in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { data: { display_name: email.split("@")[0] } },
          });
    setMessage(
      result.error?.message ??
        (mode === "sign-up" ? "Check your email to confirm your account." : ""),
    );
  };
  return (
    <main>
      <header>
        <div className="brand">
          <ShieldCheck /> CivicLens
        </div>
        <button className="secondary compact" onClick={onBack}>
          Back
        </button>
      </header>
      <section className="auth card">
        <div>
          <p className="eyebrow">COMMUNITY ACCESS</p>
          <h1>Sign in to CivicLens.</h1>
          <p className="muted">
            An account keeps scans and community reports attributable and
            protected.
          </p>
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <div className="actions">
            <button className="primary" onClick={() => submit("sign-in")}>
              Sign in
            </button>
            <button className="secondary" onClick={() => submit("sign-up")}>
              Create account
            </button>
          </div>
          {message && (
            <p className="muted" role="status">
              {message}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [showAuth, setShowAuth] = useState(
    () => window.location.pathname === "/login",
  );
  const openLogin = () => {
    window.history.pushState({}, "", "/login");
    setShowAuth(true);
  };
  const openLanding = () => {
    window.history.pushState({}, "", "/");
    setShowAuth(false);
  };
  useEffect(() => {
    const onPopState = () => setShowAuth(window.location.pathname === "/login");
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) =>
      setSession(next),
    );
    return () => data.subscription.unsubscribe();
  }, []);
  if (!authReady)
    return (
      <main>
        <p className="muted">Loading CivicLens…</p>
      </main>
    );
  if (!session)
    return showAuth ? (
      <AuthForm onBack={openLanding} />
    ) : (
      <Landing onSignIn={openLogin} />
    );
  return <Dashboard />;
}

function Dashboard() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File>();
  const [coords, setCoords] = useState<{
    latitude: number;
    longitude: number;
  }>();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult>();
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [reporting, setReporting] = useState<Match>();
  const [note, setNote] = useState("");
  const [reportMessage, setReportMessage] = useState("");
  const preview = useMemo(
    () => (file ? URL.createObjectURL(file) : undefined),
    [file],
  );
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const locate = () =>
    navigator.geolocation.getCurrentPosition(
      (p) =>
        setCoords({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
        }),
      () => alert("Location is needed to match nearby projects."),
    );
  const scan = async () => {
    if (!file || !coords) return;
    setLoading(true);
    setResult(undefined);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("latitude", String(coords.latitude));
    fd.append("longitude", String(coords.longitude));
    const { data, error } = await supabase.functions.invoke<ScanResult>(
      "scan-project",
      { body: fd },
    );
    setResult(
      error
        ? { status: "error", error: error.message }
        : (data ?? { status: "error", error: "Empty scan response" }),
    );
    setLoading(false);
  };
  const loadReports = async () => {
    try {
      setReports(await listReports());
    } catch (error) {
      alert(error instanceof Error ? error.message : "Unable to load reports");
    }
  };
  useEffect(() => {
    void loadReports();
  }, []);
  const publishReport = async () => {
    if (!reporting || !coords) return;
    setReportMessage("");
    try {
      await createReport({
        projectId: reporting.project.id,
        category: reporting.project.category,
        note,
        latitude: coords.latitude,
        longitude: coords.longitude,
        photo: file,
      });
      setNote("");
      setReporting(undefined);
      setReportMessage("Report published for community review.");
      await loadReports();
    } catch (error) {
      setReportMessage(
        error instanceof Error ? error.message : "Unable to publish report",
      );
    }
  };
  return (
    <main>
      <header>
        <div className="brand">
          <ShieldCheck /> CivicLens
        </div>
        <button
          className="secondary compact"
          onClick={() => supabase.auth.signOut()}
        >
          <LogOut /> Sign out
        </button>
      </header>
      <section className="hero">
        <p className="eyebrow">TRANSPARENCY, IN YOUR HANDS</p>
        <h1>See what your city is building.</h1>
        <p>
          Photograph public infrastructure in Cebu City and connect it to
          verified project records.
        </p>
        <div className="actions">
          <button className="primary" onClick={() => input.current?.click()}>
            <Camera /> Take a project photo
          </button>
          <button className="secondary" onClick={locate}>
            <MapPin /> {coords ? "Location ready" : "Allow location"}
          </button>
        </div>
        <input
          ref={input}
          hidden
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          onChange={(e) => {
            setFile(e.target.files?.[0]);
            setResult(undefined);
          }}
        />
      </section>
      {file && (
        <section className="card">
          <img className="preview" src={preview} alt="Selected project" />
          <div>
            <h2>{file.name}</h2>
            <p className="muted">
              {coords
                ? "Ready to analyze with location evidence."
                : "Allow location to continue."}
            </p>
            <button
              className="primary"
              disabled={!coords || loading}
              onClick={scan}
            >
              {loading ? (
                <>
                  <RefreshCw className="spin" /> Analyzing…
                </>
              ) : (
                <>Identify this project</>
              )}
            </button>
          </div>
        </section>
      )}
      {result && (
        <section className="results">
          <h2>
            {result.status === "error"
              ? "Scan unavailable"
              : result.status === "needs_retake"
                ? "We need a clearer photo"
                : "Possible official projects"}
          </h2>
          {result.error ? (
            <div className="notice">
              <AlertTriangle />
              <p>{result.error}</p>
            </div>
          ) : result.status === "needs_retake" ? (
            <div className="notice">
              <AlertTriangle />
              <p>
                We couldn’t confidently connect this image to an official
                record. Capture the project signboard or a wider, clearer angle
                and try again.
              </p>
            </div>
          ) : (
            result.matches?.map((m) => (
              <article className="project" key={m.project.id}>
                <div>
                  <span className="tag">
                    {Math.round(m.confidence * 100)}% match
                  </span>
                  <h3>{m.project.name}</h3>
                  <p>{m.project.description}</p>
                  <p className="muted">
                    {m.project.location} · {m.project.status} ·{" "}
                    {m.project.agency}
                  </p>
                  {m.project.contractId && (
                    <p>
                      <strong>Contract:</strong> {m.project.contractId}
                    </p>
                  )}
                  <dl className="project-meta">
                    <div>
                      <dt>Contractor</dt>
                      <dd>{m.project.contractor || "Not reported"}</dd>
                    </div>
                    <div>
                      <dt>Budget</dt>
                      <dd>{money(m.project.budget)}</dd>
                    </div>
                    <div>
                      <dt>Amount paid</dt>
                      <dd>{money(m.project.amountPaid)}</dd>
                    </div>
                    <div>
                      <dt>Timeline</dt>
                      <dd>
                        {[
                          shortDate(m.project.startDate),
                          shortDate(m.project.completionDate),
                        ]
                          .filter(Boolean)
                          .join(" – ") || "Not reported"}
                      </dd>
                    </div>
                    <div>
                      <dt>Program</dt>
                      <dd>{m.project.programName || "Not reported"}</dd>
                    </div>
                    <div>
                      <dt>Funding</dt>
                      <dd>{m.project.sourceOfFunds || "Not reported"}</dd>
                    </div>
                  </dl>
                  <p className="evidence">{m.evidence.join(" · ")}</p>
                  <a
                    href={m.project.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View official DPWH record ↗
                  </a>
                  {m.project.livestreamUrl && (
                    <a
                      href={m.project.livestreamUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View livestream ↗
                    </a>
                  )}
                  <small className="source-note">
                    BetterGov.PH snapshot{" "}
                    {m.project.sourceRevision?.slice(0, 8) || "unknown"} ·
                    imported{" "}
                    {shortDate(m.project.sourceImportedAt) ||
                      "date unavailable"}
                    . AI suggests candidates; source records remain
                    authoritative.
                  </small>
                  <button
                    className="secondary compact"
                    onClick={() => setReporting(m)}
                  >
                    Report anomaly
                  </button>
                </div>
                <div className="progress">
                  <strong>
                    {m.project.progress ?? "—"}
                    {m.project.progress ? "%" : ""}
                  </strong>
                  <small>reported progress</small>
                </div>
              </article>
            ))
          )}
        </section>
      )}
      {reporting && (
        <section className="report-form card">
          <div>
            <h2>Report an anomaly</h2>
            <p className="muted">{reporting.project.name}</p>
            <label>
              What did you observe?
              <textarea
                minLength={5}
                maxLength={2000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Describe the issue without including personal information."
              />
            </label>
            <div className="actions">
              <button
                className="primary"
                disabled={note.trim().length < 5}
                onClick={publishReport}
              >
                Publish report
              </button>
              <button
                className="secondary"
                onClick={() => setReporting(undefined)}
              >
                Cancel
              </button>
            </div>
          </div>
        </section>
      )}
      {reportMessage && (
        <p role="status" className="muted">
          {reportMessage}
        </p>
      )}
      <section className="feed">
        <div className="feed-title">
          <div>
            <p className="eyebrow">COMMUNITY WATCH</p>
            <h2>Anomaly reports</h2>
          </div>
          <button className="secondary" onClick={loadReports}>
            Refresh feed
          </button>
        </div>
        {reports.length === 0 ? (
          <p className="muted">Reports from residents will appear here.</p>
        ) : (
          reports.map((r) => (
            <article className="report" key={r.id}>
              <AlertTriangle />
              <div>
                <strong>{r.category}</strong>
                <p>{r.note}</p>
                <small>
                  Reported by {r.authorName} ·{" "}
                  {new Date(r.createdAt).toLocaleDateString()} · {r.status}
                </small>
              </div>
            </article>
          ))
        )}
      </section>
      <footer>
        Official records are shown with source attribution. AI helps find
        candidates; it does not verify government facts.
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
