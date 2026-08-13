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
import pristine from "./assests/city-pristine.png";
import damaged from "./assests/city-damaged.png";
import "./styles.css";
import "./auth.css";

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

function money(amount: number | undefined): string {
  if (amount == null) return "Not reported";
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(amount);
}

function shortDate(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-PH", { year: "numeric", month: "short" });
}

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

function AuthForm({
  mode,
  onBack,
  onModeChange,
}: {
  mode: "sign-in" | "sign-up";
  onBack: () => void;
  onModeChange: (mode: "sign-in" | "sign-up") => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const isRegistration = mode === "sign-up";

  // Clear all fields whenever the mode changes so the destination form is always empty.
  useEffect(() => {
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setMessage("");
    document.title = `${mode === "sign-up" ? "Create account" : "Log in"} — CivicLens`;
  }, [mode]);

  const clearRegistrationFields = () => {
    setEmail("");
    setPassword("");
    setConfirmPassword("");
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");

    if (isRegistration && password !== confirmPassword) {
      setMessage("Passwords do not match. Please check and try again.");
      return;
    }

    setLoading(true);

    try {
      if (isRegistration) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: email.split("@")[0] },
            emailRedirectTo: window.location.origin,
          },
        });

        // Supabase signals a duplicate email in two ways:
        // 1. error.message === "User already registered" (email confirmation disabled)
        // 2. data.user exists but data.user.identities is an empty array
        //    (email confirmation enabled — Supabase avoids enumeration but signals
        //    the duplicate via an empty identities list)
        const isDuplicate =
          error?.message === "User already registered" ||
          (data.user !== null && data.user.identities?.length === 0);

        if (isDuplicate) {
          setMessage("This account already exists.");
          clearRegistrationFields();
          return;
        }

        if (error) {
          setMessage(error.message);
          return;
        }

        // Session is null when email confirmation is still required (hosted project
        // with confirmations enabled). In that case tell the user to check their
        // email. When confirmations are disabled a session arrives immediately and
        // onAuthStateChange("SIGNED_IN") will redirect to the dashboard before this
        // message would ever be seen — but we set it anyway as a safe fallback.
        if (!data.session) {
          setMessage("Check your email to activate your CivicLens account.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        setMessage(error?.message ?? "");
      }
    } catch {
      setMessage("CivicLens couldn't verify your access. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-visual" aria-label="CivicLens community infrastructure monitoring">
        <video autoPlay muted loop playsInline preload="auto" aria-hidden="true">
          <source
            src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260813_052122_e77a27e6-17f1-4794-889b-3ceaa0e9e8cb.mp4"
            type="video/mp4"
          />
        </video>
        <div className="auth-scrim" />
        <div className="auth-promise">
          <div className="auth-badge">
            <svg viewBox="0 0 582 557" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M449 0h-14l-20 10-215 239-13 27 2 23 23 27 20 6 57 2v182l12 27 23 13h22l28-20 199-225 9-23-3-24-20-24-20-7-61-3V32l-8-19zM442 38l4 212 20 17 74 3 7 15-206 235-9 2-8-8-3-200-14-14-12-3h-62l-9-6-3-9zM1 67l3 14 13 9h199l7-3 9-13-4-17-13-8H18L5 57zM0 285l4 15 13 8h88l13-9 3-8-2-13-8-8-8-3H17l-13 8zM1 495l3 16 6 6 13 3h156l12-4 9-16-4-12-14-9H18l-9 4z"
              />
            </svg>
            <span>Public projects, clearly tracked</span>
          </div>
          <p className="auth-headline">
            <span>See What Your City Builds</span>
            <span>Clearly</span>
          </p>
        </div>
      </section>

      <section className="auth-pane">
        <div className="auth-card">
          <button type="button" className="auth-back" onClick={onBack} aria-label="Back to CivicLens home">
            <span aria-hidden="true">←</span> CivicLens
          </button>

          <form className="auth-form" onSubmit={submit}>
            <div className="auth-intro">
              <p className="auth-kicker">CIVICLENS COMMUNITY ACCESS</p>
              <h1>{isRegistration ? "Join CivicLens" : "Welcome back"}</h1>
              <p>
                {isRegistration ? (
                  "Track public works, document local conditions, and help your community demand accountability."
                ) : (
                  <><strong>Log in</strong> to review scans, track projects, and manage community reports.</>
                )}
              </p>
            </div>

            <label className="auth-field">
              <span>Email address</span>
              <input
                type="email"
                autoComplete="email"
                aria-label="Email address"
                placeholder="Your email address"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label className="auth-field">
              <span>{isRegistration ? "Create Password" : "Password"}</span>
              <input
                type="password"
                autoComplete={isRegistration ? "new-password" : "current-password"}
                aria-label={isRegistration ? "Create Password" : "Password"}
                placeholder={isRegistration ? "Create a password (8+ characters)" : "Your password"}
                minLength={8}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {isRegistration && (
              <label className="auth-field">
                <span>Confirm Password</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  aria-label="Confirm Password"
                  placeholder="Re-enter your password"
                  minLength={8}
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </label>
            )}

            <button className="auth-submit" type="submit" disabled={loading}>
              <span>
                {loading
                  ? isRegistration ? "Creating your account…" : "Checking your access…"
                  : isRegistration ? "Create CivicLens account" : "Log in to CivicLens"}
              </span>
              {!loading && (
                <svg viewBox="0 0 22 22" aria-hidden="true">
                  <path d="M3 11h15.4M11 3.3l7.7 7.7-7.7 7.7" />
                </svg>
              )}
            </button>

            {message && <p className="auth-message" role="status">{message}</p>}

            <p className="auth-switch">
              {isRegistration ? "Already monitoring with CivicLens? " : "New to CivicLens? "}
              <button
                type="button"
                onClick={() => onModeChange(isRegistration ? "sign-in" : "sign-up")}
              >
                {isRegistration ? "Log in" : "Create an account"}
              </button>
            </p>
          </form>
        </div>
      </section>
    </main>
  );
}

function getConfirmationError(): string | null {
  const hash = window.location.hash.slice(1);
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const error = params.get("error");
  if (!error) return null;
  const description = params.get("error_description") ?? "The confirmation link is invalid or has expired.";
  // Supabase uses underscores in the description; replace them for readability.
  return description.replace(/_/g, " ");
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(getConfirmationError);
  const getAuthMode = () => {
    if (window.location.pathname === "/register") return "sign-up" as const;
    if (window.location.pathname === "/login") return "sign-in" as const;
    return null;
  };
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up" | null>(getAuthMode);
  const navigateAuth = (mode: "sign-in" | "sign-up") => {
    window.history.pushState({}, "", mode === "sign-up" ? "/register" : "/login");
    setAuthMode(mode);
  };
  const openLanding = () => {
    window.history.pushState({}, "", "/");
    document.title = "CivicLens";
    setAuthMode(null);
  };
  useEffect(() => {
    const onPopState = () => setAuthMode(getAuthMode());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === "SIGNED_IN") {
        setConfirmError(null);
        window.history.replaceState({}, "", "/");
        setAuthMode(null);
      } else if (event === "SIGNED_OUT") {
        window.history.replaceState({}, "", "/");
        setAuthMode(null);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);
  if (!authReady)
    return (
      <main>
        <p className="muted">Loading CivicLens…</p>
      </main>
    );
  if (!session) {
    if (confirmError)
      return (
        <main className="auth-shell">
          <section className="auth-visual" aria-label="CivicLens community infrastructure monitoring">
            <video autoPlay muted loop playsInline preload="auto" aria-hidden="true">
              <source
                src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260813_052122_e77a27e6-17f1-4794-889b-3ceaa0e9e8cb.mp4"
                type="video/mp4"
              />
            </video>
            <div className="auth-scrim" />
          </section>
          <section className="auth-pane">
            <div className="auth-card">
              <button type="button" className="auth-back" onClick={() => { window.history.replaceState({}, "", "/"); setConfirmError(null); }} aria-label="Back to CivicLens home">
                <span aria-hidden="true">←</span> CivicLens
              </button>
              <div className="auth-form" style={{ textAlign: "center" }}>
                <div className="auth-intro">
                  <p className="auth-kicker">EMAIL CONFIRMATION</p>
                  <h1>Link expired</h1>
                  <p>This confirmation link is no longer valid.</p>
                </div>
                <p className="auth-message" role="alert" style={{ margin: "0 0 24px" }}>{confirmError}</p>
                <button
                  className="auth-submit"
                  type="button"
                  onClick={() => { window.history.replaceState({}, "", "/login"); setConfirmError(null); setAuthMode("sign-in"); }}
                >
                  <span>Log in to CivicLens</span>
                  <svg viewBox="0 0 22 22" aria-hidden="true">
                    <path d="M3 11h15.4M11 3.3l7.7 7.7-7.7 7.7" />
                  </svg>
                </button>
              </div>
            </div>
          </section>
        </main>
      );
    return authMode ? (
      <AuthForm key={authMode} mode={authMode} onBack={openLanding} onModeChange={navigateAuth} />
    ) : (
      <Landing onSignIn={() => navigateAuth("sign-in")} />
    );
  }
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
