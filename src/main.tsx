import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Session } from "@supabase/supabase-js";
import { ShieldCheck, ArrowRight, MousePointer2 } from "lucide-react";
import {
  isAppPath,
  LANDING_PATH,
  LOGIN_PATH,
  POST_LOGIN_PATH,
  REGISTER_PATH,
} from "./app-routes";
import { supabase } from "./supabase";
import pristine from "./assets/city-pristine.png";
import damaged from "./assets/city-damaged.png";
import "./styles.css";
import "./auth.css";

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
            Get Started <ArrowRight />
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
        // onAuthStateChange("SIGNED_IN") will redirect to the community before this
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
                  <><strong>Log in</strong> to post, comment, and vote in the CivicLens community.</>
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

/**
 * Shown for any path this bundle does not own, including the removed `/scan`
 * route, so a dead link reports itself instead of rendering the landing page.
 */
function NotFound({ onHome }: { onHome: () => void }) {
  useEffect(() => {
    document.title = "Page not found — CivicLens";
  }, []);
  return (
    <main>
      <div className="hero">
        <p className="eyebrow">PAGE NOT FOUND</p>
        <h2>This page doesn’t exist.</h2>
        <p className="muted">
          The link may be out of date. CivicLens now has the resident community and the
          project map.
        </p>
        <div className="actions">
          <button className="primary" type="button" onClick={onHome}>
            Back to CivicLens
          </button>
          <button
            className="secondary"
            type="button"
            onClick={() => window.location.assign(POST_LOGIN_PATH)}
          >
            Go to Community
          </button>
        </div>
      </div>
    </main>
  );
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(getConfirmationError);
  const getAuthMode = () => {
    if (window.location.pathname === REGISTER_PATH) return "sign-up" as const;
    if (window.location.pathname === LOGIN_PATH) return "sign-in" as const;
    return null;
  };
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up" | null>(getAuthMode);
  const [path, setPath] = useState(window.location.pathname);
  const navigate = (nextPath: string, replace = false) => {
    window.history[replace ? "replaceState" : "pushState"]({}, "", nextPath);
    setPath(nextPath);
    setAuthMode(
      nextPath === REGISTER_PATH
        ? "sign-up"
        : nextPath === LOGIN_PATH
          ? "sign-in"
          : null,
    );
  };
  const openCommunity = () => {
    // `/community` is a separate bundle (see src/app-entry.ts), so this is a
    // document navigation rather than a history push within this one.
    window.location.replace(POST_LOGIN_PATH);
  };
  const navigateAuth = (mode: "sign-in" | "sign-up") => {
    navigate(mode === "sign-up" ? REGISTER_PATH : LOGIN_PATH);
  };
  const openLanding = () => {
    document.title = "CivicLens";
    navigate(LANDING_PATH);
  };

  useEffect(() => {
    const onPopState = () => {
      const nextPath = window.location.pathname;
      setPath(nextPath);
      setAuthMode(
        nextPath === REGISTER_PATH
          ? "sign-up"
          : nextPath === LOGIN_PATH
            ? "sign-in"
            : null,
      );
    };
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
        openCommunity();
      } else if (event === "SIGNED_OUT") {
        navigate(LANDING_PATH, true);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!authReady) return;
    // A signed-in resident has no reason to sit on the auth forms.
    if (session && (path === LOGIN_PATH || path === REGISTER_PATH)) {
      openCommunity();
    }
  }, [authReady, path, session]);

  if (!authReady)
    return (
      <main>
        <p className="muted">Loading CivicLens…</p>
      </main>
    );

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
            <button type="button" className="auth-back" onClick={() => { setConfirmError(null); navigate(LANDING_PATH, true); }} aria-label="Back to CivicLens home">
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
                onClick={() => { setConfirmError(null); navigate(LOGIN_PATH, true); }}
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

  if (authMode) {
    if (session) return null;
    return <AuthForm key={authMode} mode={authMode} onBack={openLanding} onModeChange={navigateAuth} />;
  }

  // Removed routes (the former /scan screen among them) resolve here rather
  // than quietly rendering the landing page at the wrong URL.
  if (!isAppPath(path)) return <NotFound onHome={openLanding} />;

  return <Landing onSignIn={() => navigateAuth("sign-in")} />;
}

createRoot(document.getElementById("root")!).render(<App />);
