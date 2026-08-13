import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { MousePointer2 } from "lucide-react";

import { RevealLayer } from "@/components/RevealLayer";
import { SiteNav } from "@/components/SiteNav";
import pristine from "@/assets/city-pristine.jpg";
import damaged from "@/assets/city-damaged.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Foundation — What Looks Strong Can Fail" },
      {
        name: "description",
        content:
          "An interactive architecture study on urban resilience: move across the city to reveal the structural damage hidden beneath well-built environments.",
      },
      { property: "og:title", content: "Foundation — What Looks Strong Can Fail" },
      {
        property: "og:description",
        content:
          "An interactive architecture study on urban resilience, structural integrity, and the hidden damage behind well-built environments.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const SPOTLIGHT_R = 240;

function Index() {
  const mouse = useRef({ x: -999, y: -999 });
  const smooth = useRef({ x: -999, y: -999 });
  const rafRef = useRef<number | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const movedRef = useRef(false);
  const [moved, setMoved] = useState(false);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvasRef.current = canvas;
    const sizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    sizeCanvas();
    window.addEventListener("resize", sizeCanvas);

    const onMove = (e: PointerEvent) => {
      mouse.current.x = e.clientX;
      mouse.current.y = e.clientY;
      if (smooth.current.x < -900) {
        smooth.current.x = e.clientX;
        smooth.current.y = e.clientY;
      }
      if (!movedRef.current) {
        movedRef.current = true;
        setMoved(true);
      }
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    let last = { x: -9999, y: -9999 };

    const tick = () => {
      smooth.current.x += (mouse.current.x - smooth.current.x) * 0.1;
      smooth.current.y += (mouse.current.y - smooth.current.y) * 0.1;

      const { x, y } = smooth.current;
      const layer = layerRef.current;
      const ctx = canvas.getContext("2d");

      if (layer && ctx && x > -900 && (Math.abs(x - last.x) > 0.3 || Math.abs(y - last.y) > 0.3)) {
        last = { x, y };
        const radius = window.innerWidth < 640 ? 150 : SPOTLIGHT_R;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
        g.addColorStop(0, "rgba(255,255,255,1)");
        g.addColorStop(0.35, "rgba(255,255,255,0.95)");
        g.addColorStop(0.55, "rgba(255,255,255,0.65)");
        g.addColorStop(0.72, "rgba(255,255,255,0.3)");
        g.addColorStop(0.88, "rgba(255,255,255,0.08)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const url = canvas.toDataURL();
        layer.style.opacity = "1";
        layer.style.maskImage = `url(${url})`;
        layer.style.webkitMaskImage = `url(${url})`;
        layer.style.maskSize = "100% 100%";
        layer.style.webkitMaskSize = "100% 100%";
        layer.style.maskRepeat = "no-repeat";
        layer.style.webkitMaskRepeat = "no-repeat";
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", sizeCanvas);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div
      className="min-h-screen bg-black tracking-[-0.02em]"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <SiteNav />

      <section className="relative h-[100dvh] w-full overflow-hidden bg-black">
        {/* Base pristine image */}
        <div
          className="hero-zoom absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${pristine})` }}
        />

        {/* Damage reveal */}
        <RevealLayer ref={layerRef} image={damaged} />

        {/* Cinematic overlays */}
        <div className="pointer-events-none absolute inset-0 z-30 bg-gradient-to-b from-black/70 via-black/10 to-transparent" />
        <div className="pointer-events-none absolute inset-0 z-30 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
        <div className="pointer-events-none absolute inset-0 z-30 bg-black/15" />

        {/* Heading */}
        <div className="pointer-events-none absolute left-0 right-0 top-[15%] z-50 flex flex-col items-center px-5 text-center">
          <h1 className="text-5xl leading-[0.9] text-white sm:text-7xl md:text-8xl">
            <span
              className="hero-anim hero-reveal font-playfair block font-normal italic tracking-[-0.03em]"
              style={{ animationDelay: "0.25s" }}
            >
              What looks
            </span>
            <span
              className="hero-anim hero-reveal block font-semibold tracking-[-0.045em]"
              style={{ animationDelay: "0.42s" }}
            >
              strong can fail
            </span>
          </h1>
        </div>

        {/* Interaction indicator */}
        <div
          className={`pointer-events-none absolute bottom-[46%] left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 transition-opacity duration-700 ${
            moved ? "opacity-0" : "opacity-100"
          }`}
        >
          <MousePointer2 className="h-3 w-3 animate-pulse text-white/60" strokeWidth={1.5} />
          <span className="text-[10px] uppercase tracking-[0.2em] text-white/60">
            Move to reveal
          </span>
        </div>

        {/* Supporting copy */}
        <p
          className="hero-anim hero-fade absolute bottom-14 left-10 z-50 hidden max-w-[270px] text-sm leading-relaxed text-white/75 sm:block md:left-14"
          style={{ animationDelay: "0.7s" }}
        >
          Every structure carries the story of what we build, what time changes, and what
          failure leaves behind.
        </p>

        {/* Bottom-right */}
        <div
          className="hero-anim hero-fade absolute bottom-10 left-5 right-5 z-50 max-w-full sm:bottom-24 sm:left-auto sm:right-10 sm:max-w-[280px] md:right-14"
          style={{ animationDelay: "0.85s" }}
        >
          <p className="text-sm leading-relaxed text-white/75">
            Move across the city to reveal the damage beneath the surface.
          </p>
          <button className="mt-5 rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition-all hover:scale-[1.03] active:scale-95">
            Explore the Damage
          </button>
        </div>
      </section>
    </div>
  );
}
