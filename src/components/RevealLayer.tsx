import { forwardRef } from "react";

type RevealLayerProps = { image: string };

/**
 * The damaged version of the scene, layered exactly over the pristine base.
 * The parent applies a canvas-generated radial mask imperatively on each
 * animation frame so the spotlight stays perfectly smooth.
 */
export const RevealLayer = forwardRef<HTMLDivElement, RevealLayerProps>(
  function RevealLayer({ image }, ref) {
    return (
      <div ref={ref} className="pointer-events-none absolute inset-0 z-20 opacity-0">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `url(${image})`,
            filter: "saturate(0.7) contrast(1.08) brightness(0.92)",
          }}
        />
        {/* understated grain so the revealed reality feels rawer */}
        <div
          className="absolute inset-0 opacity-[0.25] mix-blend-overlay"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='120' height='120' filter='url(%23n)' opacity='0.55'/></svg>\")",
          }}
        />
      </div>
    );
  },
);
