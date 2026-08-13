import { Menu, Triangle } from "lucide-react";

const items = ["Structures", "Infrastructure", "Materials", "Research", "About"];

export function SiteNav() {
  return (
    <nav
      className="hero-anim hero-fade fixed inset-x-0 top-0 z-[60] flex items-center justify-between px-5 py-6 md:px-14"
      style={{ animationDelay: "0.15s" }}
    >
      <div className="flex items-center gap-3">
        <Triangle className="h-4 w-4 text-white/90" strokeWidth={1.25} />
        <span className="font-playfair text-lg italic tracking-[-0.03em] text-white">
          FOUNDATION
        </span>
      </div>

      <div className="absolute left-1/2 hidden -translate-x-1/2 rounded-full border border-white/20 bg-white/10 px-2 py-2 backdrop-blur-md md:flex">
        {items.map((item, i) => (
          <a
            key={item}
            href="#"
            className={`rounded-full px-4 py-1.5 text-[13px] transition-colors ${
              i === 0 ? "text-white" : "text-white/55 hover:text-white/85"
            }`}
          >
            {item}
          </a>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button className="hidden rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black transition-all hover:scale-[1.03] active:scale-95 sm:block">
          Explore
        </button>
        <button
          aria-label="Open menu"
          className="rounded-full border border-white/20 bg-white/10 p-2.5 backdrop-blur-md md:hidden"
        >
          <Menu className="h-4 w-4 text-white" strokeWidth={1.5} />
        </button>
      </div>
    </nav>
  );
}
