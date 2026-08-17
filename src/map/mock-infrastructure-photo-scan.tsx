import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  CheckCircle2,
  ImageUp,
  MapPin,
  ScanLine,
  ShieldCheck,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { MapDialog } from "./map-dialog";
import type { ViewportFeature } from "./map-contract";
import {
  createMockPhotoScan,
  type MockPhotoScanResult,
  validateMockScanImage,
} from "./mock-photo-scan";

type ScanPhase = "idle" | "error" | "scanning" | "matched" | "no_match";

const SCAN_STAGES = [
  "Preparing photo in your browser…",
  "Simulating photo location metadata…",
  "Finding an available official project…",
] as const;

export function MockInfrastructurePhotoScan({
  projects,
  loadAvailableProjects,
  onMatch,
}: {
  projects: readonly ViewportFeature[];
  loadAvailableProjects: () => Promise<readonly ViewportFeature[]>;
  onMatch: (project: ViewportFeature) => void;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<ScanPhase>("idle");
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MockPhotoScanResult | null>(null);
  const timersRef = useRef<number[]>([]);
  const generationRef = useRef(0);
  const projectsRef = useRef(projects);
  const loadAvailableProjectsRef = useRef(loadAvailableProjects);
  const onMatchRef = useRef(onMatch);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  projectsRef.current = projects;
  loadAvailableProjectsRef.current = loadAvailableProjects;
  onMatchRef.current = onMatch;

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  }, []);

  const resetScan = useCallback(() => {
    generationRef.current += 1;
    clearTimers();
    setFile(null);
    setPhase("idle");
    setStage(0);
    setError(null);
    setResult(null);
  }, [clearTimers]);

  useEffect(
    () => () => {
      generationRef.current += 1;
      clearTimers();
    },
    [clearTimers],
  );

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const nextUrl = URL.createObjectURL(file);
    setPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  const beginMockScan = useCallback(
    (nextFile: File) => {
      clearTimers();
      const generation = ++generationRef.current;
      setPhase("scanning");
      setStage(0);
      setError(null);
      setResult(null);

      const schedule = (delay: number, callback: () => void) => {
        const timer = window.setTimeout(() => {
          if (generation === generationRef.current) callback();
        }, delay);
        timersRef.current.push(timer);
      };

      schedule(650, () => setStage(1));
      schedule(1_300, () => setStage(2));
      schedule(2_000, () => {
        void (async () => {
          let candidates = projectsRef.current;
          if (candidates.length === 0) {
            try {
              const loadedProjects = await loadAvailableProjectsRef.current();
              candidates = projectsRef.current.length > 0
                ? projectsRef.current
                : loadedProjects;
            } catch {
              candidates = projectsRef.current;
            }
          }
          if (generation !== generationRef.current) return;

          const nextResult = createMockPhotoScan(nextFile, candidates);
          const matchedProject = nextResult.matchedProject;
          setResult(nextResult);
          if (!matchedProject) {
            setPhase("no_match");
            return;
          }

          setPhase("matched");
          schedule(900, () => {
            setOpen(false);
            resetScan();
            onMatchRef.current(matchedProject);
          });
        })();
      });
    },
    [clearTimers, resetScan],
  );

  const choosePhoto = useCallback(
    (nextFile: File | undefined) => {
      if (!nextFile) return;
      const validationError = validateMockScanImage(nextFile);
      if (validationError) {
        resetScan();
        setPhase("error");
        setError(validationError);
        return;
      }

      setFile(nextFile);
      beginMockScan(nextFile);
    },
    [beginMockScan, resetScan],
  );

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (!nextOpen) resetScan();
    },
    [resetScan],
  );

  const scanning = phase === "scanning";
  const location = result?.location;
  const progress =
    phase === "matched" ? 100 : scanning ? [25, 60, 85][stage] : 0;

  return (
    <>
      <Button
        type="button"
        size="sm"
        className="shadow-lg"
        onClick={() => setOpen(true)}
      >
        <ScanLine aria-hidden="true" /> Scan infrastructure photo
      </Button>

      <MapDialog
        open={open}
        onOpenChange={handleOpenChange}
        size="chooser"
        title="Scan infrastructure photo"
        description="Take a photo or choose one from your gallery to demonstrate location-based project matching."
      >
        <div className="min-h-0 space-y-4 overflow-y-auto p-4 sm:p-5">
          <Alert className="bg-muted/30">
            <ShieldCheck aria-hidden="true" />
            <AlertTitle>Browser-only demonstration</AlertTitle>
            <AlertDescription>
              Location scanning and matching are simulated. This demonstration
              <span className="block">does not read real EXIF metadata.</span>
              Your photo stays in this browser tab, is not uploaded or stored,
              and is discarded when this dialog closes.
            </AlertDescription>
          </Alert>

          {previewUrl && (
            <div className="overflow-hidden rounded-xl border border-border bg-muted/40">
              <img
                src={previewUrl}
                alt="Selected infrastructure preview"
                className="max-h-64 w-full object-contain"
              />
            </div>
          )}

          {phase === "error" && error && (
            <Alert variant="destructive" role="alert">
              <AlertTitle>Photo unavailable</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {(phase === "idle" || phase === "error") && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                type="button"
                className="h-11"
                onClick={() => cameraInputRef.current?.click()}
              >
                <Camera aria-hidden="true" /> Take a photo
              </Button>
              <input
                ref={cameraInputRef}
                className="sr-only"
                type="file"
                tabIndex={-1}
                accept="image/*"
                capture="environment"
                aria-label="Take an infrastructure photo"
                onChange={(event) => {
                  choosePhoto(event.currentTarget.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                className="h-11 bg-background"
                onClick={() => galleryInputRef.current?.click()}
              >
                <ImageUp aria-hidden="true" /> Choose from gallery
              </Button>
              <input
                ref={galleryInputRef}
                className="sr-only"
                type="file"
                tabIndex={-1}
                accept="image/*"
                aria-label="Choose an infrastructure photo from gallery"
                onChange={(event) => {
                  choosePhoto(event.currentTarget.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
            </div>
          )}

          {scanning && (
            <div
              className="space-y-3 rounded-xl border border-border bg-muted/30 p-4"
              role="status"
              aria-live="polite"
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                <Spinner aria-hidden="true" /> Scan in progress
              </div>
              <Progress
                value={progress}
                aria-label="Mock photo scan progress"
              />
              <p className="text-sm text-muted-foreground">
                {SCAN_STAGES[stage]}
              </p>
            </div>
          )}

          {phase === "matched" && result?.matchedProject && location && (
            <div
              className="space-y-3 rounded-xl border border-primary/30 bg-primary/10 p-4"
              role="status"
              aria-live="polite"
            >
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="text-primary" aria-hidden="true" />{" "}
                Match found
              </div>
              <div className="flex items-start gap-2 text-sm">
                <MapPin
                  className="mt-0.5 size-4 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <div>
                  <p className="font-medium">Simulated photo location</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {location.latitude.toFixed(6)},{" "}
                    {location.longitude.toFixed(6)}
                  </p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Opening {result.matchedProject.name}…
              </p>
            </div>
          )}

          {phase === "no_match" && (
            <div
              className="space-y-3 rounded-xl border border-border bg-muted/30 p-4"
              role="status"
            >
              <div>
                <p className="font-medium">No project available to match</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  No project records are currently available from the demo feed.
                  Please try again in a moment.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={resetScan}
              >
                Choose another photo
              </Button>
            </div>
          )}
        </div>
      </MapDialog>
    </>
  );
}
