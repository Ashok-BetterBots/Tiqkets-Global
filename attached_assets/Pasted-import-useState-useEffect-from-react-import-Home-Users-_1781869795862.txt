import { useState, useEffect } from "react";
import {
  Home,
  Users,
  Building2,
  Calendar,
  Settings,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Bell,
  Bluetooth,
  Monitor,
  Volume2,
  Plus,
  Minus,
  SkipForward,
  RefreshCw,
  Edit,
  Trash2,
  Link,
  Coffee,
  PhoneCall,
  CheckCircle,
  MapPin,
  Clock,
  ArrowRight,
  Wifi,
} from "lucide-react";
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";

// ─── Asset imports ────────────────────────────────────────────────────────────
// SVGs are imported as raw strings (?raw) so they can be inlined in the DOM.
// This bypasses the xlink:href deprecation issue that causes <img> to fail.
import tiqketsLogoWhiteRaw from "@/imports/Tiqkets_Full_Logo_White-2.svg?raw";
import tiqketsIconWhiteRaw from "@/imports/1-1.svg?raw";
import tiqketsLogoRaspberryRaw from "@/imports/Tiqkets_Logo_Dark_Raspberry.svg?raw";
import onboardPhoto1 from "@/imports/hf_20260616_173707_c165bbd6-b5ae-4029-9ace-4203ec48d0b1.png";
import onboardPhoto2 from "@/imports/hf_20260616_174436_4acd7d32-9c84-48aa-bd31-b2785552b104.png";
import onboardPhoto3 from "@/imports/hf_20260616_174103_abc5f900-7887-4438-8b2f-89c8af0259d4.png";

// ─── Types ────────────────────────────────────────────────────────────────────
type Screen =
  | "splash"
  | "onboard1"
  | "onboard2"
  | "onboard3"
  | "home"
  | "queue"
  | "branches"
  | "availability"
  | "settings";
type NavTab =
  | "home"
  | "queue"
  | "branches"
  | "availability"
  | "settings";
type AvailTab = "hours" | "breaks" | "holidays" | "slots";

// ─── Brand tokens ─────────────────────────────────────────────────────────────
const P = "#8B1662";
const PD = "#5C0F46";
const PL = "#FDF0F8";
const PM = "#F0D0E8";
const BG = "#F8F5FF";
const GR = "#16A34A";
const AM = "#D97706";
const TX = "#1A1028";
const MT = "#9B8AAA";

// ─── Font helpers ─────────────────────────────────────────────────────────────
// Sofia Pro Bold for headings/titles, Proxima Nova Regular for body/content
const HF = "'Sofia Pro', 'Nunito', sans-serif"; // heading font
const BF = "'Proxima Nova', 'Nunito Sans', sans-serif"; // body font

// ─── Inline SVG renderer ─────────────────────────────────────────────────────
// Renders raw SVG content directly in the DOM so all SVG features work.
// We patch width/height on the root <svg> element to honour the requested size.
function InlineSvg({
  raw, width, height, style, className,
}: {
  raw: string;
  width?: number | string;
  height?: number | string;
  style?: React.CSSProperties;
  className?: string;
}) {
  const w = width  ?? "100%";
  const h = height ?? "100%";
  const html = raw
    .replace(/(<svg[^>]*)\swidth="[^"]*"/, `$1 width="${w}"`)
    .replace(/(<svg[^>]*)\sheight="[^"]*"/, `$1 height="${h}"`);
  return (
    <div
      className={className}
      style={{ display: "inline-flex", flexShrink: 0, ...style }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ─── Status Bar ──────────────────────────────────────────────────────────────
function StatusBar({ light = false }: { light?: boolean }) {
  const c = light ? "rgba(255,255,255,0.9)" : TX;
  return (
    <div
      className="flex items-center justify-between px-7 pb-2"
      style={{ color: c, paddingTop: 42, fontFamily: HF }}
    >
      <span
        style={{
          fontSize: 14,
          fontWeight: 700,
          letterSpacing: "-0.3px",
        }}
      >
        9:41
      </span>
      <div className="flex items-center gap-2">
        <span style={{ fontSize: 12, fontWeight: 600 }}>
          5G
        </span>
        <Wifi size={13} />
        <div
          style={{
            width: 22,
            height: 11,
            borderRadius: 3,
            border: `1.5px solid ${c}`,
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 2,
              right: 3,
              borderRadius: 1,
              backgroundColor: c,
            }}
          />
          <div
            style={{
              position: "absolute",
              right: -4,
              top: "50%",
              transform: "translateY(-50%)",
              width: 2.5,
              height: 6,
              borderRadius: "0 1px 1px 0",
              backgroundColor: c,
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Bottom Nav ──────────────────────────────────────────────────────────────
function BottomNav({
  active,
  onChange,
}: {
  active: NavTab;
  onChange: (t: NavTab) => void;
}) {
  const tabs: {
    id: NavTab;
    icon: (a: boolean) => JSX.Element;
    label: string;
  }[] = [
    {
      id: "home",
      icon: (a) => (
        <Home size={22} strokeWidth={a ? 2.2 : 1.8} />
      ),
      label: "Home",
    },
    {
      id: "queue",
      icon: (a) => (
        <Users size={22} strokeWidth={a ? 2.2 : 1.8} />
      ),
      label: "Queue",
    },
    {
      id: "branches",
      icon: (a) => (
        <Building2 size={22} strokeWidth={a ? 2.2 : 1.8} />
      ),
      label: "Branches",
    },
    {
      id: "availability",
      icon: (a) => (
        <Calendar size={22} strokeWidth={a ? 2.2 : 1.8} />
      ),
      label: "Availability",
    },
    {
      id: "settings",
      icon: (a) => (
        <Settings size={22} strokeWidth={a ? 2.2 : 1.8} />
      ),
      label: "Settings",
    },
  ];
  return (
    <div
      className="absolute bottom-0 left-0 right-0 flex items-end"
      style={{
        background: "white",
        borderTop: "1px solid rgba(139,22,98,0.08)",
        paddingBottom: 24,
        height: 84,
        boxShadow: "0 -4px 20px rgba(139,22,98,0.07)",
      }}
    >
      {tabs.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className="flex-1 flex flex-col items-center pt-2 gap-1 transition-all"
            style={{ color: isActive ? P : MT, fontFamily: BF }}
          >
            {t.icon(isActive)}
            <span
              style={{
                fontSize: 10,
                fontWeight: isActive ? 700 : 500,
              }}
            >
              {t.label}
            </span>
            {isActive && (
              <div
                style={{
                  width: 20,
                  height: 3,
                  borderRadius: 99,
                  backgroundColor: P,
                  marginTop: -2,
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Toggle ──────────────────────────────────────────────────────────────────
function Toggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: () => void;
}) {
  return (
    <button
      onClick={onChange}
      style={{
        width: 46,
        height: 26,
        borderRadius: 13,
        backgroundColor: value ? P : "#D1D5DB",
        position: "relative",
        transition: "background 0.2s",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 3,
          left: value ? "calc(100% - 23px)" : 3,
          width: 20,
          height: 20,
          borderRadius: "50%",
          backgroundColor: "white",
          boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
          transition: "left 0.2s",
        }}
      />
    </button>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────
function Card({
  children,
  className = "",
  style = {},
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={className}
      style={{
        backgroundColor: "white",
        borderRadius: 20,
        boxShadow: "0 2px 16px rgba(139,22,98,0.07)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── Gradient Button ─────────────────────────────────────────────────────────
function GradBtn({
  children,
  onClick,
  color = `linear-gradient(135deg, ${P}, ${PD})`,
  fullWidth = true,
  style = {},
}: {
  children: React.ReactNode;
  onClick?: () => void;
  color?: string;
  fullWidth?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: fullWidth ? "100%" : undefined,
        padding: "14px 20px",
        borderRadius: 16,
        background: color,
        color: "white",
        fontWeight: 700,
        fontSize: 15,
        fontFamily: HF,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        boxShadow: "0 4px 16px rgba(139,22,98,0.3)",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// ─── Section Label ───────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: string }) {
  return (
    <p
      style={{
        fontSize: 11,
        fontWeight: 700,
        fontFamily: HF,
        letterSpacing: "0.08em",
        color: MT,
        textTransform: "uppercase",
        marginBottom: 8,
        paddingLeft: 4,
      }}
    >
      {children}
    </p>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SPLASH SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
function SplashScreen({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2800);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{
        // Flat magenta base with a subtle radial glow in the centre — matches reference
        background: `radial-gradient(ellipse 70% 55% at 50% 48%, #A4206E 0%, ${P} 55%, #6E1050 100%)`,
      }}
    >
      {/* Centred logo + tagline stacked together */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
        }}
      >
        <InlineSvg raw={tiqketsLogoWhiteRaw} width={200} height={200} />
        <p
          style={{
            fontSize: 12,
            fontFamily: BF,
            fontWeight: 400,
            color: "rgba(255,255,255,0.5)",
            letterSpacing: "0.28em",
            textTransform: "uppercase",
            textAlign: "center",
          }}
        >
          Your Time, Managed.
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ONBOARDING SCREENS — full-bleed photo top, text card bottom
// ═══════════════════════════════════════════════════════════════════════════════
const ONBOARD = [
  {
    photo: onboardPhoto1,
    alt: "People standing in a queue outside a modern building",
    title: "Skip the Wait,\nJoin from Anywhere",
    body: "Join hospital, clinic, and government queues remotely. No more standing in line for hours.",
  },
  {
    photo: onboardPhoto2,
    alt: "People queuing outside a luxury retail store",
    title: "Real-Time Updates,\nAlways",
    body: "Know your exact position and get notified the moment it's your turn — at any venue.",
  },
  {
    photo: onboardPhoto3,
    alt: "Customers at a busy evening café",
    title: "Works Everywhere\nYou Need It",
    body: "Hospitals, restaurants, government offices and more — TIQKETS manages every queue.",
  },
];

function OnboardScreen({
  step,
  onNext,
  onSkip,
}: {
  step: 1 | 2 | 3;
  onNext: () => void;
  onSkip: () => void;
}) {
  const d = ONBOARD[step - 1];

  return (
    // Full-screen container — photo bleeds edge-to-edge
    <div className="absolute inset-0 overflow-hidden">
      {/* Photo — fills the entire screen */}
      <ImageWithFallback
        src={d.photo}
        alt={d.alt}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center top",
        }}
      />

      {/* White gradient — rises from the very bottom, ~62% height */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "35%",
          background:
            "linear-gradient(to top, #ffffff 65%, rgba(255,255,255,0.92) 80%, rgba(255,255,255,0.55) 92%, transparent 100%)",
          pointerEvents: "none",
        }}
      />

      {/* Skip button — top right, over photo */}
      <button
        onClick={onSkip}
        style={{
          position: "absolute",
          top: 52,
          right: 16,
          fontSize: 13,
          fontWeight: 600,
          fontFamily: HF,
          color: "rgba(255,255,255,0.95)",
          padding: "6px 16px",
          borderRadius: 99,
          backgroundColor: "rgba(0,0,0,0.28)",
          backdropFilter: "blur(6px)",
          border: "1px solid rgba(255,255,255,0.3)",
          zIndex: 10,
        }}
      >
        Skip
      </button>

      {/* Content pinned to bottom — sits on top of the white gradient */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "0 28px 36px",
          zIndex: 10,
        }}
      >
        {/* Progress dots */}
        <div className="flex gap-2 mb-5">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                width: i === step ? 32 : 8,
                height: 8,
                borderRadius: 99,
                backgroundColor: i === step ? P : PM,
                transition: "width 0.3s ease",
              }}
            />
          ))}
        </div>

        {/* Title */}
        <h2
          style={{
            fontSize: 26,
            fontWeight: 800,
            fontFamily: HF,
            color: TX,
            marginBottom: 10,
            lineHeight: 1.2,
            whiteSpace: "pre-line",
          }}
        >
          {d.title}
        </h2>

        {/* Body */}
        <p
          style={{
            fontSize: 15,
            fontFamily: BF,
            fontWeight: 400,
            color: "#5C4D6E",
            lineHeight: 1.6,
            marginBottom: 24,
          }}
        >
          {d.body}
        </p>

        {/* CTA button */}
        <GradBtn onClick={onNext}>
          {step === 3 ? "Get Started" : "Continue"}
          {step < 3 && <ArrowRight size={18} />}
        </GradBtn>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOME SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
function HomeScreen() {
  const [period, setPeriod] = useState<"7D" | "14D" | "30D">(
    "7D",
  );
  const [bookingOpen, setBookingOpen] = useState(false);
  const bars = [4, 7, 2, 9, 11, 5, 4];
  const maxBar = Math.max(...bars);
  const days = ["M", "T", "W", "T", "F", "S", "S"];

  return (
    <div
      className="absolute inset-0 overflow-y-auto"
      style={{ backgroundColor: BG, paddingBottom: 90 }}
    >
      {/* Gradient header */}
      <div
        style={{
          background: `linear-gradient(160deg, #A01B76 0%, ${P} 40%, ${PD} 100%)`,
          padding: "0 20px 24px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -40,
            right: -30,
            width: 180,
            height: 180,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.06)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -60,
            left: -40,
            width: 160,
            height: 160,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.05)",
          }}
        />
        <StatusBar light />
        <div className="flex items-center justify-between mt-1 relative z-10">
          <div className="flex items-center gap-3">
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                background: "rgba(255,255,255,0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                fontWeight: 800,
                fontFamily: HF,
                color: "white",
                border: "1.5px solid rgba(255,255,255,0.3)",
              }}
            >
              SH
            </div>
            <div>
              <p
                style={{
                  fontSize: 12,
                  fontFamily: BF,
                  color: "rgba(255,255,255,0.65)",
                  fontWeight: 400,
                }}
              >
                Welcome back
              </p>
              <p
                style={{
                  fontSize: 17,
                  fontFamily: HF,
                  color: "white",
                  fontWeight: 800,
                  lineHeight: 1.2,
                }}
              >
                Sangeetha Hospital
              </p>
            </div>
          </div>
          <button
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              background: "rgba(255,255,255,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1.5px solid rgba(255,255,255,0.25)",
            }}
          >
            <RefreshCw size={16} color="white" />
          </button>
        </div>
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mt-5 relative z-10">
          {[
            { label: "In Queue", value: "0" },
            { label: "Being Served", value: "2" },
            { label: "Avg Wait", value: "8m" },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                background: "rgba(255,255,255,0.16)",
                borderRadius: 16,
                padding: "12px 8px",
                textAlign: "center",
                border: "1px solid rgba(255,255,255,0.2)",
              }}
            >
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  fontFamily: HF,
                  color: "white",
                  lineHeight: 1,
                }}
              >
                {s.value}
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontFamily: BF,
                  color: "rgba(255,255,255,0.65)",
                  fontWeight: 400,
                  marginTop: 4,
                }}
              >
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          padding: "16px 16px 0",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* Queue Control */}
        <Card style={{ padding: 16 }}>
          <p
            style={{
              fontSize: 15,
              fontWeight: 800,
              fontFamily: HF,
              color: TX,
              marginBottom: 12,
            }}
          >
            Queue Control
          </p>
          <div
            className="flex gap-2 mb-3"
            style={{ position: "relative" }}
            ref={(container) => {
              if (!container || (container as any)._ddReady) return;
              (container as any)._ddReady = true;

              const SERVICES = ["Main Service", "Consultation", "Lab Tests", "Pharmacy", "Emergency"];
              const DESKS    = ["All Desks", "Counter 1", "Counter 2", "Counter 3"];

              let activeMenu: HTMLElement | null = null;

              const closeAll = () => {
                activeMenu?.remove();
                activeMenu = null;
              };

              const buildMenu = (
                items: string[],
                current: string,
                alignRight: boolean,
                onPick: (v: string) => void
              ) => {
                closeAll();
                const menu = document.createElement("div");
                Object.assign(menu.style, {
                  position:        "absolute",
                  top:             "calc(100% + 6px)",
                  ...(alignRight ? { right: "0" } : { left: "0" }),
                  minWidth:        "180px",
                  backgroundColor: "white",
                  borderRadius:    "16px",
                  boxShadow:       "0 12px 36px rgba(139,22,98,0.18), 0 2px 8px rgba(0,0,0,0.08)",
                  border:          "1px solid rgba(139,22,98,0.1)",
                  overflow:        "hidden",
                  zIndex:          "300",
                });

                items.forEach((item, i) => {
                  const isSel = item === current;
                  const row = document.createElement("div");
                  row.textContent = item;
                  Object.assign(row.style, {
                    padding:         "13px 18px",
                    fontSize:        "14px",
                    fontWeight:      isSel ? "700" : "500",
                    fontFamily:      HF,
                    color:           isSel ? P : TX,
                    backgroundColor: isSel ? PL : "white",
                    cursor:          "pointer",
                    borderBottom:    i < items.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none",
                    display:         "flex",
                    alignItems:      "center",
                    gap:             "10px",
                  });
                  if (isSel) {
                    const dot = document.createElement("span");
                    Object.assign(dot.style, { width: "7px", height: "7px", borderRadius: "50%", backgroundColor: P, flexShrink: "0", display: "inline-block" });
                    row.prepend(dot);
                  }
                  row.onmouseenter = () => { if (!isSel) row.style.backgroundColor = PL; };
                  row.onmouseleave = () => { if (!isSel) row.style.backgroundColor = "white"; };
                  row.onclick = (e) => { e.stopPropagation(); onPick(item); closeAll(); };
                  menu.appendChild(row);
                });

                container.appendChild(menu);
                activeMenu = menu;
                setTimeout(() => document.addEventListener("click", closeAll, { once: true }), 0);
              };

              // ── Service trigger ──
              const svcEl    = container.querySelector("[data-dd='svc']") as HTMLElement;
              const svcLabel = container.querySelector("[data-dd-lbl='svc']") as HTMLElement;
              let svcVal = "Main Service";
              svcEl?.addEventListener("click", (e) => {
                e.stopPropagation();
                buildMenu(SERVICES, svcVal, false, (v) => { svcVal = v; if (svcLabel) svcLabel.textContent = v; });
              });

              // ── Desks trigger ──
              const dskEl    = container.querySelector("[data-dd='dsk']") as HTMLElement;
              const dskLabel = container.querySelector("[data-dd-lbl='dsk']") as HTMLElement;
              let dskVal = "All Desks";
              dskEl?.addEventListener("click", (e) => {
                e.stopPropagation();
                buildMenu(DESKS, dskVal, true, (v) => { dskVal = v; if (dskLabel) dskLabel.textContent = v; });
              });
            }}
          >
            {/* Service dropdown trigger */}
            <div
              data-dd="svc"
              className="flex-1 flex items-center justify-between"
              style={{ padding: "10px 12px", borderRadius: 12, background: BG, border: "1.5px solid rgba(139,22,98,0.12)", cursor: "pointer", userSelect: "none" }}
            >
              <div className="flex items-center gap-2">
                <div style={{ width: 20, height: 20, borderRadius: 6, backgroundColor: PL, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: P }} />
                </div>
                <span data-dd-lbl="svc" style={{ fontSize: 13, fontWeight: 600, fontFamily: HF, color: TX }}>
                  Main Service
                </span>
              </div>
              <ChevronDown size={14} color={MT} />
            </div>

            {/* Desks dropdown trigger */}
            <div
              data-dd="dsk"
              className="flex items-center gap-1.5"
              style={{ padding: "10px 12px", borderRadius: 12, background: BG, border: "1.5px solid rgba(139,22,98,0.12)", cursor: "pointer", userSelect: "none" }}
            >
              <Monitor size={13} color={MT} />
              <span data-dd-lbl="dsk" style={{ fontSize: 13, fontWeight: 600, fontFamily: HF, color: TX }}>
                All Desks
              </span>
              <ChevronDown size={12} color={MT} />
            </div>
          </div>
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 14,
              backgroundColor: bookingOpen ? "#F0FDF4" : "#F9FAFB",
              border: `1.5px solid ${bookingOpen ? "#BBF7D0" : "rgba(0,0,0,0.08)"}`,
              transition: "background 0.2s, border-color 0.2s",
            }}
          >
            {/* Label + toggle row */}
            <div className="flex items-center justify-between">
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  fontFamily: HF,
                  color: TX,
                }}
              >
                Booking
              </span>
              <Toggle
                value={bookingOpen}
                onChange={() => setBookingOpen((v) => !v)}
              />
            </div>
            {/* Status text */}
            <p
              style={{
                marginTop: 6,
                fontSize: 12,
                fontFamily: BF,
                fontWeight: 400,
                color: bookingOpen ? "#15803D" : "#6B7280",
                transition: "color 0.2s",
              }}
            >
              {bookingOpen
                ? "Open · Accepting new customers"
                : "Closed · No booking accepted"}
            </p>
          </div>
        </Card>

        {/* Today's Performance */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p
              style={{
                fontSize: 15,
                fontWeight: 800,
                fontFamily: HF,
                color: TX,
              }}
            >
              {"Today's Performance"}
            </p>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                fontFamily: HF,
                backgroundColor: "#DCFCE7",
                color: GR,
                padding: "3px 10px",
                borderRadius: 99,
              }}
            >
              Live
            </span>
          </div>
          <div
            style={{
              display: "flex",
              gap: 12,
              overflowX: "auto",
              paddingBottom: 2,
              /* hide scrollbar on all browsers */
              scrollbarWidth: "none",
              msOverflowStyle: "none",
            }}
            /* hide WebKit scrollbar */
            ref={(el) => {
              if (el) el.style.cssText += ";overflow-x:auto;scrollbar-width:none;";
            }}
          >
            {[
              {
                icon: <Calendar size={18} />,
                label: "Bookings",
                value: "8",
                col: "#6366F1",
                bg: "#EEF2FF",
              },
              {
                icon: <CheckCircle size={18} />,
                label: "Served",
                value: "14",
                col: GR,
                bg: "#DCFCE7",
              },
              {
                icon: (
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    {/* Circle with X — universal cancel/cancelled icon */}
                    <circle cx="9" cy="9" r="7.2" stroke="currentColor" strokeWidth="1.6" />
                    <line x1="5.8" y1="5.8" x2="12.2" y2="12.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    <line x1="12.2" y1="5.8" x2="5.8" y2="12.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                ),
                label: "No Shows",
                value: "2",
                col: AM,
                bg: "#FEF3C7",
              },
              {
                icon: <Clock size={18} />,
                label: "Avg Wait",
                value: "8m",
                col: "#0891B2",
                bg: "#ECFEFF",
              },
              {
                icon: (
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path
                      d="M2 14L6.5 8L10 11L14 5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M11 5H14V8"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ),
                label: "Peak Wait",
                value: "15m",
                col: "#E11D48",
                bg: "#FFF1F2",
              },
            ].map((s) => (
              <Card key={s.label} style={{ padding: 14, flexShrink: 0, width: 112 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    backgroundColor: s.bg,
                    color: s.col,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 10,
                  }}
                >
                  {s.icon}
                </div>
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 800,
                    fontFamily: HF,
                    color: TX,
                  }}
                >
                  {s.value}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    fontFamily: BF,
                    fontWeight: 400,
                    color: MT,
                    marginTop: 2,
                  }}
                >
                  {s.label}
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Served Report */}
        <>
          {/* ── Served Report (unchanged) ── */}
          <Card style={{ padding: 16 }}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <p style={{ fontSize: 15, fontWeight: 800, fontFamily: HF, color: TX }}>
                Served Report
              </p>
              <div className="flex gap-1">
                {(["7D", "14D", "30D"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    style={{
                      fontSize: 11, fontWeight: 700, fontFamily: HF,
                      padding: "4px 10px", borderRadius: 8,
                      backgroundColor: period === p ? P : "transparent",
                      color: period === p ? "white" : MT,
                      transition: "all 0.2s",
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: "Total Served", value: "47",  color: P  },
                { label: "Avg / Day",    value: "6.7", color: GR },
                { label: "Peak Day",     value: "11",  color: AM },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <div style={{ fontSize: 22, fontWeight: 800, fontFamily: HF, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 11, fontFamily: BF, color: MT }}>{s.label}</div>
                </div>
              ))}
            </div>
            {/* Chart */}
            <div
              style={{ height: 72, display: "flex", alignItems: "flex-end", gap: 6, position: "relative" }}
              ref={(el) => {
                if (!el) return;
                el.onclick = (e: MouseEvent) => {
                  el.querySelectorAll(".srv-tip").forEach((t) => t.remove());
                  const col = (e.target as HTMLElement).closest("[data-barval]") as HTMLElement | null;
                  if (!col) return;
                  const val = Number(col.dataset.barval);
                  const tip = document.createElement("div");
                  tip.className = "srv-tip";
                  tip.textContent = String(val);
                  Object.assign(tip.style, { position: "absolute", bottom: Math.round((val / maxBar) * 72 + 8) + "px", left: Math.round(col.offsetLeft + col.offsetWidth / 2) + "px", transform: "translateX(-50%)", fontSize: "10px", fontWeight: "700", fontFamily: HF, color: "white", background: P, padding: "2px 7px", borderRadius: "6px", pointerEvents: "none", zIndex: "20", whiteSpace: "nowrap" });
                  el.appendChild(tip);
                  setTimeout(() => tip.remove(), 1800);
                };
              }}
            >
              {bars.map((v, i) => (
                <div key={i} data-barval={String(v)} style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", cursor: "pointer" }}>
                  <div style={{ height: `${(v / maxBar) * 100}%`, borderRadius: "5px 5px 0 0", background: i === bars.length - 1 ? `linear-gradient(180deg, ${P}, ${PD})` : "#D1D5DB", transition: "height 0.3s ease", pointerEvents: "none" }} />
                </div>
              ))}
            </div>
            <p style={{ marginTop: 8, fontSize: 11, fontFamily: BF, fontWeight: 400, color: MT, textAlign: "center" }}>
              Last 7 days trend
            </p>
          </Card>

          {/* ── Weekly Trend ── */}
          <Card style={{ padding: 16 }}>
            <div className="flex items-center justify-between mb-4">
              <p style={{ fontSize: 15, fontWeight: 800, fontFamily: HF, color: TX }}>Weekly Trend</p>
              {/* Filter buttons — interactive via DOM ref, no outside state needed */}
              <div
                className="flex gap-1"
                ref={(el) => {
                  if (!el) return;
                  el.onclick = (e: MouseEvent) => {
                    const btn = (e.target as HTMLElement).closest("button") as HTMLButtonElement | null;
                    if (!btn) return;
                    el.querySelectorAll("button").forEach((b) => {
                      (b as HTMLButtonElement).style.backgroundColor = "transparent";
                      (b as HTMLButtonElement).style.color = MT;
                    });
                    btn.style.backgroundColor = P;
                    btn.style.color = "white";
                  };
                }}
              >
                {["1M", "2M", "3M", "6M", "1Y"].map((f) => (
                  <button
                    key={f}
                    style={{
                      fontSize: 11, fontWeight: 700, fontFamily: HF,
                      padding: "4px 8px", borderRadius: 8,
                      backgroundColor: f === "1M" ? P : "transparent",
                      color: f === "1M" ? "white" : MT,
                    }}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: "Total Served", value: "187",  color: P  },
                { label: "Avg / Week",   value: "46.8", color: GR },
                { label: "Peak Week",    value: "63",   color: AM },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <div style={{ fontSize: 22, fontWeight: 800, fontFamily: HF, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 11, fontFamily: BF, color: MT }}>{s.label}</div>
                </div>
              ))}
            </div>
            {/* Chart — S M T W T F S, last bar (Sat) coloured */}
            {(() => {
              const wb = [6, 9, 7, 14, 10, 12, 8];
              const wMax = Math.max(...wb);
              const wDays = ["S", "M", "T", "W", "T", "F", "S"];
              return (
                <>
                  <div
                    style={{ height: 72, display: "flex", alignItems: "flex-end", gap: 6, position: "relative" }}
                    ref={(el) => {
                      if (!el) return;
                      el.onclick = (e: MouseEvent) => {
                        el.querySelectorAll(".wk-tip").forEach((t) => t.remove());
                        const col = (e.target as HTMLElement).closest("[data-barval]") as HTMLElement | null;
                        if (!col) return;
                        const val = Number(col.dataset.barval);
                        const tip = document.createElement("div");
                        tip.className = "wk-tip";
                        tip.textContent = String(val);
                        Object.assign(tip.style, { position: "absolute", bottom: Math.round((val / wMax) * 72 + 8) + "px", left: Math.round(col.offsetLeft + col.offsetWidth / 2) + "px", transform: "translateX(-50%)", fontSize: "10px", fontWeight: "700", fontFamily: HF, color: "white", background: P, padding: "2px 7px", borderRadius: "6px", pointerEvents: "none", zIndex: "20", whiteSpace: "nowrap" });
                        el.appendChild(tip);
                        setTimeout(() => tip.remove(), 1800);
                      };
                    }}
                  >
                    {wb.map((v, i) => (
                      <div key={i} data-barval={String(v)} style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", cursor: "pointer" }}>
                        <div style={{ height: `${(v / wMax) * 100}%`, borderRadius: "5px 5px 0 0", background: i === wb.length - 1 ? `linear-gradient(180deg, ${P}, ${PD})` : "#D1D5DB", transition: "height 0.3s ease", pointerEvents: "none" }} />
                      </div>
                    ))}
                  </div>
                  <div className="flex mt-2">
                    {wDays.map((d, i) => (
                      <div key={i} className="flex-1 text-center" style={{ fontSize: 10, fontFamily: BF, color: MT, fontWeight: 600 }}>{d}</div>
                    ))}
                  </div>
                </>
              );
            })()}
          </Card>

          {/* ── Hourly Trend ── */}
          <Card style={{ padding: 16 }}>
            <div className="flex items-center justify-between mb-4">
              <p style={{ fontSize: 15, fontWeight: 800, fontFamily: HF, color: TX }}>Hourly Trend</p>
              <span style={{ fontSize: 11, fontWeight: 500, fontFamily: BF, color: MT }}>Today</span>
            </div>
            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: "Total Served", value: "47",  color: P  },
                { label: "Avg / Hour",   value: "3.1", color: GR },
                { label: "Peak Hour",    value: "2PM", color: AM },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <div style={{ fontSize: 22, fontWeight: 800, fontFamily: HF, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 11, fontFamily: BF, color: MT }}>{s.label}</div>
                </div>
              ))}
            </div>
            {/* Chart — 9 AM to 11 PM = 15 hours, last bar (11 PM) coloured */}
            {(() => {
              const hb = [3, 6, 10, 16, 20, 24, 22, 18, 14, 11, 9, 7, 10, 6, 3];
              const hMax = Math.max(...hb);
              // Labels every 2 hrs to avoid crowding
              const hLabels = ["9A","","11A","","1P","","3P","","5P","","7P","","9P","","11P"];
              return (
                <>
                  <div
                    style={{ height: 72, display: "flex", alignItems: "flex-end", gap: 4, position: "relative" }}
                    ref={(el) => {
                      if (!el) return;
                      el.onclick = (e: MouseEvent) => {
                        el.querySelectorAll(".hr-tip").forEach((t) => t.remove());
                        const col = (e.target as HTMLElement).closest("[data-barval]") as HTMLElement | null;
                        if (!col) return;
                        const val = Number(col.dataset.barval);
                        const tip = document.createElement("div");
                        tip.className = "hr-tip";
                        tip.textContent = String(val);
                        Object.assign(tip.style, { position: "absolute", bottom: Math.round((val / hMax) * 72 + 8) + "px", left: Math.round(col.offsetLeft + col.offsetWidth / 2) + "px", transform: "translateX(-50%)", fontSize: "10px", fontWeight: "700", fontFamily: HF, color: "white", background: P, padding: "2px 7px", borderRadius: "6px", pointerEvents: "none", zIndex: "20", whiteSpace: "nowrap" });
                        el.appendChild(tip);
                        setTimeout(() => tip.remove(), 1800);
                      };
                    }}
                  >
                    {hb.map((v, i) => (
                      <div key={i} data-barval={String(v)} style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", cursor: "pointer" }}>
                        <div style={{ height: `${(v / hMax) * 100}%`, borderRadius: "4px 4px 0 0", background: i === hb.length - 1 ? `linear-gradient(180deg, ${P}, ${PD})` : "#D1D5DB", transition: "height 0.3s ease", pointerEvents: "none" }} />
                      </div>
                    ))}
                  </div>
                  <div className="flex mt-2">
                    {hLabels.map((l, i) => (
                      <div key={i} className="flex-1 text-center" style={{ fontSize: 9, fontFamily: BF, color: MT, fontWeight: 600 }}>{l}</div>
                    ))}
                  </div>
                </>
              );
            })()}
          </Card>
        </>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUEUE SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
function QueueScreen() {
  // ── Types ──────────────────────────────────────────────────────────────────
  type Mode = "fifo" | "dinein" | "takeaway";

  // ── State ──────────────────────────────────────────────────────────────────
  const [mode, setMode]               = useState<Mode>("fifo");
  const [modeOpen, setModeOpen]       = useState(false);
  const [activeTab, setActiveTab]     = useState("waiting");
  const [toast, setToast]             = useState<{msg:string;k:number}|null>(null);
  const [hintShown, setHintShown]     = useState(false);
  const [moreOpenId, setMoreOpenId]   = useState<string|null>(null);

  // ── FIFO data ──────────────────────────────────────────────────────────────
  const [fifoWaiting, setFifoWaiting] = useState([
    { id:"T001", name:"Priya Sharma",  phone:"+91 98765 43210", wait:"12 min", pos:1 },
    { id:"T002", name:"Rahul Kumar",   phone:"+91 87654 32109", wait:"8 min",  pos:2 },
    { id:"T003", name:"Anita Patel",   phone:"+91 76543 21098", wait:"5 min",  pos:3 },
    { id:"T004", name:"Sundar Rajan",  phone:"+91 65432 10987", wait:"2 min",  pos:4 },
  ]);
  const [fifoHold, setFifoHold]         = useState([{ id:"T000", name:"Meera Joshi",  heldAt:"2:30 PM" }]);
  const [fifoCompleted, setFifoCompleted] = useState([
    { id:"T00A", name:"Suresh Nair",  registered:"1:45 PM", completed:"2:15 PM", duration:"30 min" },
    { id:"T00B", name:"Kavitha Rao", registered:"2:00 PM", completed:"2:25 PM", duration:"25 min" },
  ]);

  // ── Dine-in data ───────────────────────────────────────────────────────────
  const [dineWaiting, setDineWaiting] = useState([
    { id:"D001", name:"Kavya Reddy",  partySize:4, shareTable:true,  splitGroup:false, gender:"F", wait:"5 min",  pos:1 },
    { id:"D002", name:"Arjun Singh",  partySize:2, shareTable:false, splitGroup:false, gender:"M", wait:"8 min",  pos:2 },
    { id:"D003", name:"Nidhi Shah",   partySize:6, shareTable:true,  splitGroup:true,  gender:"F", wait:"15 min", pos:3 },
  ]);
  const [dineAssigned, setDineAssigned] = useState<any[]>([{ id:"D00A", name:"Vijay Menon",  partySize:3, table:"T-07" }]);
  const [dineHold, setDineHold]         = useState<any[]>([{ id:"D00H", name:"Sunita Rao",   partySize:2, heldAt:"3:10 PM" }]);
  const [dineCompleted, setDineCompleted] = useState<any[]>([
    { id:"D00X", name:"Arun Kumar",   status:"Seated",    registered:"1:20 PM", completed:"1:35 PM" },
    { id:"D00Y", name:"Preethi Nair", status:"Walk In",   registered:"2:00 PM", completed:"2:05 PM" },
    { id:"D00Z", name:"Ravi Iyer",    status:"Cancelled", registered:"2:30 PM", completed:"2:32 PM" },
  ]);

  // ── Take-away data ─────────────────────────────────────────────────────────
  const [taActive, setTaActive] = useState([
    { id:"ORD-001", name:"Deepa Krishnan", orderedAt:"9:40 AM", items:"Masala Dosa, Filter Coffee, Idli Sambar", eta:"~8 min" },
    { id:"ORD-002", name:"Sanjay Mehta",   orderedAt:"9:42 AM", items:"Veg Thali, Lassi, Papad",                 eta:"~12 min" },
  ]);
  const [taReady, setTaReady]         = useState<any[]>([{ id:"ORD-003", name:"Pooja Gupta", orderedAt:"9:30 AM", readyAt:"9:52 AM", items:"Paneer Tikka, Naan, Raita" }]);
  const [taDelivered, setTaDelivered] = useState<any[]>([{ id:"ORD-004", name:"Anil Verma",  orderedAt:"9:15 AM", deliveredAt:"9:38 AM", items:"Dal Makhani, Jeera Rice, Papad" }]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const showToast = (msg: string) => {
    setToast({ msg, k: Date.now() });
    setTimeout(() => setToast(null), 2200);
  };
  const initials = (name: string) => name.split(" ").map((w:string)=>w[0]).join("").toUpperCase().slice(0,2);
  const switchMode = (m: Mode) => {
    setMode(m); setModeOpen(false); setMoreOpenId(null);
    setActiveTab({ fifo:"waiting", dinein:"waiting", takeaway:"active" }[m]);
  };
  const makeSwipe = (onSwipe: ()=>void) => {
    let sx = 0;
    return {
      onTouchStart: (e:React.TouchEvent) => { sx = e.touches[0].clientX; },
      onTouchEnd:   (e:React.TouchEvent) => { if (e.changedTouches[0].clientX - sx > 60) { setHintShown(true); onSwipe(); } },
    };
  };

  // ── Tab definitions ────────────────────────────────────────────────────────
  const TABS: Record<Mode, {id:string;label:string;count:number}[]> = {
    fifo:     [ {id:"waiting",label:"Waiting",count:fifoWaiting.length}, {id:"hold",label:"On Hold",count:fifoHold.length}, {id:"completed",label:"Completed",count:fifoCompleted.length} ],
    dinein:   [ {id:"waiting",label:"Waiting",count:dineWaiting.length}, {id:"assigned",label:"Assigned",count:dineAssigned.length}, {id:"hold",label:"On Hold",count:dineHold.length}, {id:"completed",label:"Done",count:dineCompleted.length} ],
    takeaway: [ {id:"active",label:"Active",count:taActive.length}, {id:"ready",label:"Ready",count:taReady.length}, {id:"delivered",label:"Delivered",count:taDelivered.length} ],
  };

  // ── Micro-UI helpers (plain functions → no remount issues) ─────────────────
  const avatar = (name:string, tint=PL, col=P, sz=36) => (
    <div style={{width:sz,height:sz,borderRadius:"50%",backgroundColor:tint,color:col,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,fontFamily:HF,flexShrink:0}}>
      {initials(name)}
    </div>
  );
  const chip = (children:React.ReactNode, bg=PL, col=P, sx:React.CSSProperties={}) => (
    <span style={{fontSize:13,fontWeight:600,fontFamily:HF,backgroundColor:bg,color:col,padding:"4px 12px",borderRadius:99,display:"inline-flex",alignItems:"center",gap:4,...sx}}>
      {children}
    </span>
  );
  const btn = ({label,onClick,filled=false,color=P,ghost=false,danger=false,icon,sm=false}:{label:string;onClick?:()=>void;filled?:boolean;color?:string;ghost?:boolean;danger?:boolean;icon?:React.ReactNode;sm?:boolean}) => (
    <button onClick={onClick} style={{flex:1,padding:sm?"8px 10px":"10px 12px",borderRadius:12,fontSize:13,fontWeight:700,fontFamily:HF,display:"flex",alignItems:"center",justifyContent:"center",gap:5,cursor:"pointer",backgroundColor:danger?"#FEE2E2":filled?color:ghost?"transparent":PL,color:danger?"#DC2626":filled?"white":ghost?MT:color,border:ghost?"1px solid #EDE9F8":"none",boxShadow:filled?`0 3px 10px ${color}44`:"none"}}>
      {icon}{label}
    </button>
  );
  const emptyState = (label:string) => (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"48px 24px",backgroundColor:"white",borderRadius:14,border:"0.5px solid #EDE9F8"}}>
      <div style={{width:48,height:48,borderRadius:16,backgroundColor:PL,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:12,color:P}}>
        <Clock size={22} />
      </div>
      <p style={{fontSize:14,fontWeight:600,fontFamily:HF,color:TX,marginBottom:4}}>{label}</p>
      <p style={{fontSize:12,fontFamily:BF,color:MT}}>Nothing to show here</p>
    </div>
  );
  const cardWrap = (children:React.ReactNode, {faded=false,highlight=false,amberLeft=false,swipe={}}:{faded?:boolean;highlight?:boolean;amberLeft?:boolean;swipe?:object}={}) => (
    <div className="q-card" {...swipe} style={{backgroundColor:"white",borderRadius:14,border:highlight?`1.5px solid ${P}`:"0.5px solid #EDE9F8",borderLeft:amberLeft?`3px solid ${AM}`:highlight?`1.5px solid ${P}`:"0.5px solid #EDE9F8",padding:12,opacity:faded?0.72:1,boxShadow:highlight?`0 0 0 3px ${PL}, 0 2px 8px rgba(139,22,98,0.1)`:"0 1px 4px rgba(139,22,98,0.06)",position:"relative",overflow:"hidden"}}>
      {highlight && <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,${P},${PD})`,borderRadius:"14px 14px 0 0"}}/>}
      {children}
    </div>
  );
  const divider = () => <div style={{height:1,backgroundColor:"#EDE9F8",margin:"8px 0"}}/>;

  const statusColors: Record<string,[string,string]> = {
    "Seated":   ["#DCFCE7","#15803D"],
    "Walk In":  ["#DBEAFE","#1D4ED8"],
    "Cancelled":["#FEE2E2","#DC2626"],
    "No Show":  ["#F3F4F6","#6B7280"],
  };

  // ── FIFO render ────────────────────────────────────────────────────────────
  const renderFifo = () => {
    if (activeTab === "waiting") return (<>
      {/* Info banner */}
      <div style={{backgroundColor:PL,borderRadius:12,padding:"10px 14px",display:"flex",alignItems:"center",gap:8}}>
        <svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="7" fill={P} opacity=".18"/><text x="7" y="11" textAnchor="middle" fontSize="9" fill={P} fontFamily={HF} fontWeight="700">i</text></svg>
        <span style={{fontSize:11,fontFamily:BF,color:P,fontWeight:500}}>Customers are called in registered order</span>
      </div>
      {fifoWaiting.map((card, i) => {
        const first = i === 0;
        return <div key={card.id}>
          {cardWrap(<>
            <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:8}}>
              {avatar(card.name)}
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3,flexWrap:"wrap"}}>
                  <span style={{fontSize:14,fontWeight:500,fontFamily:HF,color:TX}}>{card.name}</span>
                  {chip(card.id)}
                </div>
                <span style={{fontSize:11,fontFamily:BF,color:MT}}>{card.phone}</span>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:5}}>
                {chip(`Pos ${card.pos}`,"#EDE9F8","#5B21B6")}
                {chip(<><svg width="9" height="9" viewBox="0 0 9 9" fill="none"><circle cx="4.5" cy="4.5" r="4" stroke={AM} strokeWidth="1.2"/><path d="M4.5 2.5v2l1.2 1.2" stroke={AM} strokeWidth="1.2" strokeLinecap="round"/></svg>{card.wait}</>,"#FEF3C7",AM)}
                {first && <button onClick={()=>showToast("📣 Calling "+card.name)} style={{width:30,height:30,borderRadius:"50%",background:`linear-gradient(135deg,${P},${PD})`,border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",boxShadow:`0 3px 10px ${P}55`}}>
                  <PhoneCall size={12} color="white"/>
                </button>}
              </div>
            </div>
            {first && <>
              {divider()}
              <div style={{display:"flex",gap:8,marginBottom:8}}>
                {btn({label:"Hold",onClick:()=>{const[f,...r]=fifoWaiting;setFifoWaiting(r.map((c:any,j:number)=>({...c,pos:j+1})));setFifoHold(p=>[{...f,heldAt:"Now"},...p]);showToast("Customer placed on hold");}})}
                {btn({label:"Call Now",filled:true,icon:<PhoneCall size={13}/>,onClick:()=>showToast("📣 Now calling "+card.name)})}
                {btn({label:"Done ✓",filled:true,color:GR,onClick:()=>{const[f,...r]=fifoWaiting;setFifoWaiting(r.map((c:any,j:number)=>({...c,pos:j+1})));setFifoCompleted(p=>[{...f,registered:"—",completed:"Now",duration:card.wait},...p]);showToast("✓ "+f.name+" marked done");}})}
              </div>
              <div style={{display:"flex",gap:6}}>
                {btn({label:"Skip",ghost:true,sm:true,onClick:()=>{setFifoWaiting(p=>{const[fst,...rst]=[...p];return[...rst,fst].map((c:any,j:number)=>({...c,pos:j+1}));});showToast("Customer moved to end");}})}
                {btn({label:"Transfer",ghost:true,sm:true,onClick:()=>showToast("Transfer — coming soon")})}
                {btn({label:"Cancel",ghost:true,sm:true,danger:true,onClick:()=>{setFifoWaiting(p=>p.filter((c:any)=>c.id!==card.id).map((c:any,j:number)=>({...c,pos:j+1})));showToast("Customer cancelled");}})}
              </div>
              {!hintShown&&<p style={{marginTop:8,fontSize:11,fontFamily:BF,color:MT,textAlign:"center",opacity:.65}}>Swipe right → Call now</p>}
            </>}
          </>, {highlight:first, swipe:first?makeSwipe(()=>showToast("📣 Calling "+card.name)):{}})}</div>;
      })}
      {fifoWaiting.length===0&&emptyState("Queue is empty")}
    </>);

    if (activeTab === "hold") return (<>
      {fifoHold.map((card:any)=><div key={card.id}>
        {cardWrap(<>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
            {avatar(card.name,"#FEF3C7",AM)}
            <div style={{flex:1}}>
              <span style={{fontSize:14,fontWeight:500,fontFamily:HF,color:TX,display:"block"}}>{card.name}</span>
              <div style={{marginTop:4}}>{chip(`Held at ${card.heldAt}`,"#FEF3C7",AM)}</div>
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            {btn({label:"Walk In",onClick:()=>{setFifoHold(p=>p.filter((c:any)=>c.id!==card.id));setFifoWaiting(p=>[...p,{...card,phone:"—",wait:"0 min",pos:p.length+1}]);showToast("Customer resumed as walk-in");}})}
            {btn({label:"Resume →",filled:true,color:GR,onClick:()=>{setFifoHold(p=>p.filter((c:any)=>c.id!==card.id));setFifoWaiting(p=>[{...card,phone:"—",wait:"0 min",pos:1},...p.map((c:any,j:number)=>({...c,pos:j+2}))]);showToast("Customer moved to front");}})}
          </div>
        </>, {amberLeft:true})}
      </div>)}
      {fifoHold.length===0&&emptyState("No one on hold")}
    </>);

    if (activeTab === "completed") return (<>
      {fifoCompleted.map((card:any)=><div key={card.id}>
        {cardWrap(<>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
            {avatar(card.name,"#DCFCE7",GR)}
            <span style={{fontSize:14,fontWeight:500,fontFamily:HF,color:TX,flex:1}}>{card.name}</span>
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {chip(`Reg: ${card.registered}`,"#F3F4F6",MT)}
            {chip(`Done: ${card.completed}`,"#DCFCE7",GR)}
            {chip(`Total: ${card.duration}`,"#EFF6FF","#1D4ED8")}
          </div>
        </>, {faded:true})}
      </div>)}
      {fifoCompleted.length===0&&emptyState("No completed entries")}
    </>);
    return null;
  };

  // ── Dine-in render ─────────────────────────────────────────────────────────
  const renderDineIn = () => {
    if (activeTab === "waiting") return (<>
      {dineWaiting.map((card:any)=>{
        const isMore = moreOpenId===card.id;
        return <div key={card.id}>
          {cardWrap(<>
            <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:8}}>
              {avatar(card.name,"#EDE9F8","#5B21B6")}
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:4,flexWrap:"wrap"}}>
                  <span style={{fontSize:14,fontWeight:500,fontFamily:HF,color:TX}}>{card.name}</span>
                  <span style={{fontSize:12,color:card.gender==="F"?"#DB2777":"#2563EB"}}>{card.gender==="F"?"♀":"♂"}</span>
                  {chip(card.id,"#EDE9F8","#5B21B6")}
                </div>
                <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                  {chip(<><svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="3.5" cy="3" r="1.5" stroke="#15803D" strokeWidth="1.2"/><circle cx="6.5" cy="3" r="1.5" stroke="#15803D" strokeWidth="1.2"/><path d="M1 8.5c0-1.5 1.1-2.5 2.5-2.5h3c1.4 0 2.5 1 2.5 2.5" stroke="#15803D" strokeWidth="1.2" strokeLinecap="round"/></svg>{card.partySize}</>,"#DCFCE7","#15803D")}
                  {chip(`🪑 ${card.shareTable?"Share OK":"No Share"}`,card.shareTable?"#DCFCE7":"#FEE2E2",card.shareTable?"#15803D":"#DC2626")}
                  {card.splitGroup&&chip("Split ✓","#EFF6FF","#1D4ED8")}
                  {chip(<><svg width="9" height="9" viewBox="0 0 9 9" fill="none"><circle cx="4.5" cy="4.5" r="4" stroke={AM} strokeWidth="1.2"/><path d="M4.5 2.5v2l1.2 1.2" stroke={AM} strokeWidth="1.2" strokeLinecap="round"/></svg>{card.wait}</>,"#FEF3C7",AM)}
                </div>
              </div>
              <div>{chip(`Pos ${card.pos}`,"#EDE9F8","#5B21B6")}</div>
            </div>
            {divider()}
            <div style={{display:"flex",gap:8}}>
              {btn({label:"Assign Table",filled:true,onClick:()=>{setDineWaiting(p=>p.filter((c:any)=>c.id!==card.id).map((c:any,j:number)=>({...c,pos:j+1})));setDineAssigned(p=>[{...card,table:"T-0"+(p.length+8)},...p]);showToast("Table assigned to "+card.name);}})}
              <button onClick={(e)=>{e.stopPropagation();setMoreOpenId(isMore?null:card.id);}} style={{padding:"10px 14px",borderRadius:12,fontSize:13,fontWeight:700,fontFamily:HF,backgroundColor:PL,color:P,border:"none",cursor:"pointer",flexShrink:0}}>
                {isMore?"▲ Less":"⋯ More"}
              </button>
            </div>
            {isMore&&<div style={{display:"flex",gap:8,marginTop:8,animation:"expandDown 200ms ease-out",overflow:"hidden"}}>
              {btn({label:"Edit",ghost:true,sm:true,onClick:()=>showToast("Edit — coming soon")})}
              {btn({label:"Walk In",ghost:true,sm:true,onClick:()=>{setDineWaiting(p=>p.filter((c:any)=>c.id!==card.id));setDineCompleted(p=>[{id:card.id,name:card.name,status:"Walk In",registered:"—",completed:"Now"},...p]);setMoreOpenId(null);showToast(card.name+" walked in");}})}
            </div>}
            {!hintShown&&<p style={{marginTop:6,fontSize:11,fontFamily:BF,color:MT,textAlign:"center",opacity:.65}}>Swipe right → Quick assign</p>}
          </>, {swipe:makeSwipe(()=>showToast("Table picker — coming soon"))})}
        </div>;
      })}
      {dineWaiting.length===0&&emptyState("No one waiting")}
    </>);

    if (activeTab === "assigned") return (<>
      {dineAssigned.map((card:any)=><div key={card.id}>
        {cardWrap(<>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
            {avatar(card.name,"#EFF6FF","#1D4ED8")}
            <div style={{flex:1}}>
              <span style={{fontSize:14,fontWeight:500,fontFamily:HF,color:TX,display:"block"}}>{card.name}</span>
              <div style={{marginTop:4,display:"flex",gap:5}}>
                {chip(`🪑 ${card.table}`,"#DBEAFE","#1D4ED8")}
                {chip(`Party: ${card.partySize}`,"#EDE9F8","#5B21B6")}
              </div>
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            {btn({label:"Hold",onClick:()=>{setDineAssigned(p=>p.filter((c:any)=>c.id!==card.id));setDineHold(p=>[{id:card.id,name:card.name,partySize:card.partySize,heldAt:"Now"},...p]);showToast("Customer on hold");}})}
            {btn({label:"Call again",onClick:()=>showToast("📣 Calling "+card.name)})}
            {btn({label:"Seated ✓",filled:true,color:GR,onClick:()=>{setDineAssigned(p=>p.filter((c:any)=>c.id!==card.id));setDineCompleted(p=>[{id:card.id,name:card.name,status:"Seated",registered:"—",completed:"Now"},...p]);showToast("✓ "+card.name+" seated!");}})}
          </div>
        </>)}
      </div>)}
      {dineAssigned.length===0&&emptyState("No assigned tables")}
    </>);

    if (activeTab === "hold") return (<>
      {dineHold.map((card:any)=><div key={card.id}>
        {cardWrap(<>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
            {avatar(card.name,"#FEF3C7",AM)}
            <div style={{flex:1}}>
              <span style={{fontSize:14,fontWeight:500,fontFamily:HF,color:TX,display:"block"}}>{card.name}</span>
              <div style={{marginTop:4,display:"flex",gap:5}}>
                {chip(`Held at ${card.heldAt}`,"#FEF3C7",AM)}
                {chip(`Party: ${card.partySize}`,"#EDE9F8","#5B21B6")}
              </div>
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            {btn({label:"Walk In",onClick:()=>{setDineHold(p=>p.filter((c:any)=>c.id!==card.id));setDineCompleted(p=>[{id:card.id,name:card.name,status:"Walk In",registered:"—",completed:"Now"},...p]);showToast(card.name+" walked in");}})}
            {btn({label:"Resume →",filled:true,color:GR,onClick:()=>{setDineHold(p=>p.filter((c:any)=>c.id!==card.id));setDineWaiting(p=>[{...card,wait:"0 min",pos:1,shareTable:true,splitGroup:false,gender:"M"},...p.map((c:any,j:number)=>({...c,pos:j+2}))]);showToast("Customer resumed");}})}
          </div>
        </>, {amberLeft:true})}
      </div>)}
      {dineHold.length===0&&emptyState("No one on hold")}
    </>);

    if (activeTab === "completed") return (<>
      {dineCompleted.map((card:any)=>{
        const[sbg,scol]=statusColors[card.status]||["#F3F4F6","#6B7280"];
        return <div key={card.id}>
          {cardWrap(<>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              {avatar(card.name,"#DCFCE7",GR)}
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:14,fontWeight:500,fontFamily:HF,color:TX}}>{card.name}</span>
                  {chip(card.status,sbg,scol)}
                </div>
                <div style={{marginTop:4,display:"flex",gap:8}}>
                  <span style={{fontSize:10,fontFamily:BF,color:MT}}>Reg: {card.registered}</span>
                  <span style={{fontSize:10,fontFamily:BF,color:MT}}>Done: {card.completed}</span>
                </div>
              </div>
            </div>
          </>, {faded:true})}
        </div>;
      })}
      {dineCompleted.length===0&&emptyState("No completed entries")}
    </>);
    return null;
  };

  // ── Take-away render ───────────────────────────────────────────────────────
  const renderTakeaway = () => {
    if (activeTab === "active") return (<>
      {taActive.map((card:any)=><div key={card.id}>
        {cardWrap(<>
          <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:8}}>
            {avatar(card.name,"#EFF6FF","#1D4ED8")}
            <div style={{flex:1}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,flexWrap:"wrap"}}>
                <span style={{fontSize:14,fontWeight:500,fontFamily:HF,color:TX}}>{card.name}</span>
                {chip(card.id,"#EFF6FF","#1D4ED8")}
              </div>
              <div style={{display:"flex",gap:5}}>
                {chip(<><Clock size={8}/>{card.orderedAt}</>,"#F3F4F6",MT)}
              </div>
            </div>
            {chip(card.eta,"#FEF3C7",AM)}
          </div>
          <p style={{fontSize:12,fontFamily:BF,color:MT,marginBottom:10}}>{card.items.length>44?card.items.slice(0,44)+"…":card.items}</p>
          <div style={{display:"flex",gap:8}}>
            {btn({label:"Call",onClick:()=>showToast("📣 Calling "+card.name)})}
            {btn({label:"Mark Ready 🔔",filled:true,color:GR,onClick:()=>{setTaActive(p=>p.filter((c:any)=>c.id!==card.id));setTaReady(p=>[{...card,readyAt:"Now"},...p]);showToast("🔔 Customer notified — order ready!");}})}
          </div>
          {!hintShown&&<p style={{marginTop:6,fontSize:11,fontFamily:BF,color:MT,textAlign:"center",opacity:.65}}>Swipe right → Mark ready</p>}
        </>, {swipe:makeSwipe(()=>{setTaActive(p=>p.filter((c:any)=>c.id!==card.id));setTaReady(p=>[{...card,readyAt:"Now"},...p]);showToast("🔔 Customer notified — order ready!");})})}
      </div>)}
      {taActive.length===0&&emptyState("No active orders")}
    </>);

    if (activeTab === "ready") return (<>
      {taReady.map((card:any)=><div key={card.id}>
        {cardWrap(<>
          <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:8}}>
            {avatar(card.name,"#DCFCE7",GR)}
            <div style={{flex:1}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,flexWrap:"wrap"}}>
                <span style={{fontSize:14,fontWeight:500,fontFamily:HF,color:TX}}>{card.name}</span>
                {chip(card.id,"#EFF6FF","#1D4ED8")}
              </div>
              {chip(<><svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M2 4.5l2 2 3-3" stroke={GR} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>Ready {card.readyAt}</>,"#DCFCE7",GR)}
            </div>
            <button onClick={()=>showToast("📣 Calling "+card.name)} style={{width:30,height:30,borderRadius:"50%",backgroundColor:PL,border:`1px solid ${PM}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
              <PhoneCall size={12} color={P}/>
            </button>
          </div>
          <p style={{fontSize:12,fontFamily:BF,color:MT,marginBottom:10}}>{card.items.length>44?card.items.slice(0,44)+"…":card.items}</p>
          <div style={{display:"flex",gap:8}}>
            {btn({label:"Call again",onClick:()=>showToast("📣 Calling "+card.name)})}
            {btn({label:"Delivered ✓",filled:true,onClick:()=>{setTaReady(p=>p.filter((c:any)=>c.id!==card.id));setTaDelivered(p=>[{...card,deliveredAt:"Now"},...p]);showToast("Order closed");}})}
          </div>
        </>, {swipe:makeSwipe(()=>{setTaReady(p=>p.filter((c:any)=>c.id!==card.id));setTaDelivered(p=>[{...card,deliveredAt:"Now"},...p]);showToast("Order closed");})})}
      </div>)}
      {taReady.length===0&&emptyState("No ready orders")}
    </>);

    if (activeTab === "delivered") return (<>
      {taDelivered.map((card:any)=><div key={card.id}>
        {cardWrap(<>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
            {avatar(card.name,"#DCFCE7",GR)}
            <div style={{flex:1}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:14,fontWeight:500,fontFamily:HF,color:TX}}>{card.name}</span>
                {chip(card.id,"#EFF6FF","#1D4ED8")}
              </div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:10,fontFamily:BF,color:MT}}>Ordered {card.orderedAt}</div>
              <div style={{fontSize:10,fontFamily:BF,color:GR,marginTop:2}}>Delivered {card.deliveredAt}</div>
            </div>
          </div>
          {divider()}
          <p style={{fontSize:12,fontFamily:BF,color:MT}}>{card.items.length>50?card.items.slice(0,50)+"…":card.items}</p>
        </>, {faded:true})}
      </div>)}
      {taDelivered.length===0&&emptyState("No delivered orders")}
    </>);
    return null;
  };

  // ── Mode labels ────────────────────────────────────────────────────────────
  const modeLabel: Record<Mode,string> = { fifo:"FIFO", dinein:"Dine-In", takeaway:"Take-Away" };

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ position:"absolute", inset:0, backgroundColor:"#F7F5FF", display:"flex", flexDirection:"column" }}>
      {/* Keyframes */}
      <style>{`
        @keyframes qCardIn { from { transform:translateY(-12px); opacity:0 } to { transform:translateY(0); opacity:1 } }
        @keyframes expandDown { from { max-height:0; opacity:0 } to { max-height:120px; opacity:1 } }
        @keyframes qToast { 0%{transform:translateX(-50%) translateY(20px);opacity:0} 15%{transform:translateX(-50%) translateY(0);opacity:1} 80%{opacity:1} 100%{opacity:0} }
        .q-card { animation: qCardIn 350ms ease-out; }
      `}</style>

      <StatusBar />

      {/* ── Header ── */}
      <div style={{ backgroundColor:"white", borderBottom:"1px solid #EDE9F8", flexShrink:0 }}
        onClick={()=>{ if(modeOpen) setModeOpen(false); if(moreOpenId) setMoreOpenId(null); }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 16px 10px" }}>
          <p style={{ fontSize:15, fontWeight:500, fontFamily:HF, color:TX }}>Process Queue</p>

          {/* Mode dropdown */}
          <div style={{ position:"relative" }}>
            <button onClick={(e)=>{e.stopPropagation();setModeOpen(v=>!v);}}
              style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 12px 6px 14px", borderRadius:20, backgroundColor:PL, border:`1px solid ${PM}`, fontSize:12, fontWeight:700, fontFamily:HF, color:P, cursor:"pointer" }}>
              {modeLabel[mode]}
              <ChevronDown size={12} color={P} style={{ transition:"transform 0.2s", transform:modeOpen?"rotate(180deg)":"rotate(0)" }} />
            </button>
            {modeOpen && (
              <div onClick={e=>e.stopPropagation()} style={{ position:"absolute", top:"calc(100% + 8px)", right:0, backgroundColor:"white", borderRadius:16, boxShadow:"0 12px 36px rgba(139,22,98,0.18)", border:"1px solid #EDE9F8", overflow:"hidden", zIndex:300, minWidth:160 }}>
                {([ ["fifo","FIFO"], ["dinein","Dine-In"], ["takeaway","Take-Away"] ] as [Mode,string][]).map(([id,label],i,arr)=>(
                  <div key={id} onClick={()=>switchMode(id)}
                    style={{ padding:"14px 18px", fontSize:14, fontWeight:id===mode?700:500, fontFamily:HF, color:id===mode?P:TX, backgroundColor:id===mode?PL:"white", cursor:"pointer", borderBottom:i<arr.length-1?"1px solid #EDE9F8":"none", display:"flex", alignItems:"center", gap:10 }}>
                    {id===mode&&<span style={{ width:7,height:7,borderRadius:"50%",backgroundColor:P,display:"inline-block",flexShrink:0 }}/>}
                    {label}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display:"flex", overflowX:"auto", scrollbarWidth:"none", paddingLeft:12, paddingRight:12 }}>
          {TABS[mode].map(tab=>{
            const isActive = tab.id===activeTab;
            return (
              <button key={tab.id} onClick={()=>setActiveTab(tab.id)}
                style={{ flexShrink:0, padding:"8px 14px 12px", fontSize:13, fontWeight:isActive?700:500, fontFamily:HF, color:isActive?P:MT, backgroundColor:"transparent", border:"none", cursor:"pointer", position:"relative", display:"flex", alignItems:"center", gap:6 }}>
                {tab.label}
                <span style={{ fontSize:10, fontWeight:700, fontFamily:HF, padding:"1px 7px", borderRadius:99, backgroundColor:isActive?P:"#E5E7EB", color:isActive?"white":MT }}>
                  {tab.count}
                </span>
                {isActive&&<span style={{ position:"absolute", bottom:0, left:8, right:8, height:2.5, borderRadius:"2px 2px 0 0", backgroundColor:P }}/>}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Card list ── */}
      <div style={{ flex:1, overflowY:"auto", padding:"10px 14px", display:"flex", flexDirection:"column", gap:8 }}
        onClick={()=>{ if(modeOpen) setModeOpen(false); if(moreOpenId) setMoreOpenId(null); }}>
        {mode==="fifo"     && renderFifo()}
        {mode==="dinein"   && renderDineIn()}
        {mode==="takeaway" && renderTakeaway()}
      </div>

      {/* ── Toast ── */}
      {toast&&(
        <div key={toast.k} style={{ position:"absolute", bottom:100, left:"50%", backgroundColor:"#1a1a1a", color:"white", fontSize:12, fontFamily:BF, fontWeight:500, padding:"10px 18px", borderRadius:10, zIndex:500, whiteSpace:"nowrap", animation:"qToast 2.2s ease forwards", pointerEvents:"none" }}>
          {toast.msg}
        </div>
      )}

      {/* ── FAB ── */}
      <button onClick={()=>showToast("Add customer — coming soon")}
        style={{ position:"absolute", bottom:96, right:14, width:48, height:48, borderRadius:"50%", background:`linear-gradient(135deg,${P},${PD})`, boxShadow:"0 6px 20px rgba(139,22,98,0.4)", display:"flex", alignItems:"center", justifyContent:"center", border:"none", cursor:"pointer", zIndex:50 }}>
        <Plus size={22} color="white"/>
      </button>
    </div>
  );

}

// ═══════════════════════════════════════════════════════════════════════════════
// BRANCHES SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
function BranchesScreen() {
  const [expanded, setExpanded] = useState(true);

  return (
    <div
      className="absolute inset-0 overflow-y-auto"
      style={{ backgroundColor: BG, paddingBottom: 90 }}
    >
      <StatusBar />
      <div style={{ padding: "0 16px 16px" }}>
        <p
          style={{
            fontSize: 20,
            fontWeight: 800,
            fontFamily: HF,
            color: TX,
            textAlign: "center",
            marginBottom: 20,
          }}
        >
          Branch & Services
        </p>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p
              style={{
                fontSize: 16,
                fontWeight: 800,
                fontFamily: HF,
                color: TX,
              }}
            >
              Branches
            </p>
            <p
              style={{
                fontSize: 12,
                fontFamily: BF,
                color: MT,
                fontWeight: 400,
              }}
            >
              1 branch configured
            </p>
          </div>
          <button
            className="flex items-center gap-1.5"
            style={{
              fontSize: 13,
              fontWeight: 700,
              fontFamily: HF,
              color: P,
              padding: "8px 14px",
              borderRadius: 12,
              backgroundColor: PL,
            }}
          >
            <Plus size={14} />
            Add Branch
          </button>
        </div>

        <Card style={{ overflow: "hidden" }}>
          <div style={{ padding: 16 }}>
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    backgroundColor: PL,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <MapPin size={20} color={P} />
                </div>
                <div>
                  <p
                    style={{
                      fontSize: 15,
                      fontWeight: 800,
                      fontFamily: HF,
                      color: TX,
                    }}
                  >
                    Main Branch
                  </p>
                  <p
                    style={{
                      fontSize: 12,
                      fontFamily: BF,
                      color: MT,
                      marginTop: 2,
                    }}
                  >
                    Kuniyamuthur
                  </p>
                  <span
                    style={{
                      display: "inline-block",
                      marginTop: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      fontFamily: HF,
                      padding: "3px 10px",
                      borderRadius: 99,
                      backgroundColor: PL,
                      color: P,
                    }}
                  >
                    1 service
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setExpanded((v) => !v)}>
                  <ChevronDown
                    size={20}
                    color={MT}
                    style={{
                      transform: expanded
                        ? "rotate(180deg)"
                        : "rotate(0deg)",
                      transition: "transform 0.22s",
                    }}
                  />
                </button>
                <Link size={15} color={MT} />
              </div>
            </div>
          </div>

          {expanded && (
            <div
              style={{
                borderTop: "1px solid rgba(0,0,0,0.06)",
                padding: "12px 16px 16px",
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <SectionLabel>Services</SectionLabel>
                <button
                  className="flex items-center gap-1"
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    fontFamily: HF,
                    padding: "6px 12px",
                    borderRadius: 10,
                    backgroundColor: PL,
                    color: P,
                  }}
                >
                  <Plus size={12} />
                  Add Service
                </button>
              </div>
              <div
                style={{
                  borderRadius: 14,
                  backgroundColor: BG,
                  border: "1px solid rgba(139,22,98,0.08)",
                  padding: 12,
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        backgroundColor: GR,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        fontFamily: HF,
                        color: TX,
                      }}
                    >
                      Main Service
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        fontFamily: HF,
                        padding: "2px 8px",
                        borderRadius: 99,
                        backgroundColor: "#DCFCE7",
                        color: GR,
                      }}
                    >
                      Active
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {[
                      {
                        bg: PL,
                        col: P,
                        icon: <Monitor size={12} />,
                      },
                      {
                        bg: "#FEF3C7",
                        col: AM,
                        icon: <Edit size={12} />,
                      },
                      {
                        bg: "#FEE2E2",
                        col: "#DC2626",
                        icon: <Trash2 size={12} />,
                      },
                    ].map((b, i) => (
                      <button
                        key={i}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 8,
                          backgroundColor: b.bg,
                          color: b.col,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {b.icon}
                      </button>
                    ))}
                  </div>
                </div>
                <p
                  style={{
                    fontSize: 12,
                    fontFamily: BF,
                    color: MT,
                    paddingLeft: 16,
                  }}
                >
                  15 min wait · 20 min duration
                </p>
                <div
                  style={{
                    borderTop: "1px solid rgba(0,0,0,0.05)",
                    marginTop: 10,
                    paddingTop: 10,
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <SectionLabel>Desks (1)</SectionLabel>
                    <button
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        fontFamily: HF,
                        padding: "4px 10px",
                        borderRadius: 8,
                        backgroundColor: PL,
                        color: P,
                      }}
                    >
                      + Add
                    </button>
                  </div>
                  <div
                    className="flex items-center justify-between"
                    style={{
                      padding: "8px 12px",
                      borderRadius: 10,
                      backgroundColor: "white",
                      border: "1px solid rgba(0,0,0,0.05)",
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          backgroundColor: GR,
                        }}
                      />
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          fontFamily: HF,
                          color: TX,
                        }}
                      >
                        Counter 1
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {[
                        {
                          bg: PL,
                          col: P,
                          icon: <Monitor size={11} />,
                        },
                        {
                          bg: "#FEF3C7",
                          col: AM,
                          icon: <Edit size={11} />,
                        },
                        {
                          bg: "#FEE2E2",
                          col: "#DC2626",
                          icon: <Trash2 size={11} />,
                        },
                      ].map((b, i) => (
                        <button
                          key={i}
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: 7,
                            backgroundColor: b.bg,
                            color: b.col,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {b.icon}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// AVAILABILITY SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
function AvailabilityScreen() {
  const [tab, setTab] = useState<AvailTab>("hours");
  const [selDay, setSelDay] = useState("Tue");
  const [slotDuration, setSlotDuration] = useState(30);
  const [capacity, setCapacity] = useState(3);

  const shortDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];
  const hours = [
    { day: "Sunday", from: "9:00 AM", to: "11:59 PM" },
    { day: "Monday", from: "12:00 AM", to: "5:00 PM" },
    { day: "Tuesday", from: "9:00 AM", to: "5:00 PM" },
    { day: "Wednesday", from: "9:00 AM", to: "5:00 PM" },
    { day: "Thursday", from: "9:00 AM", to: "5:00 PM" },
    { day: "Friday", from: "12:00 AM", to: "11:59 PM" },
    { day: "Saturday", from: "12:00 AM", to: "8:00 PM" },
  ];
  const slotData = [
    { t: "09:00", u: 2, s: "partial" },
    { t: "09:30", u: 1, s: "partial" },
    { t: "10:00", u: 2, s: "partial" },
    { t: "10:30", u: 0, s: "available" },
    { t: "11:00", u: 3, s: "full" },
    { t: "11:30", u: 0, s: "available" },
    { t: "12:00", u: 2, s: "partial" },
    { t: "12:30", u: 1, s: "partial" },
    { t: "13:00", u: 2, s: "partial" },
    { t: "13:30", u: 2, s: "partial" },
    { t: "14:00", u: 1, s: "partial" },
    { t: "14:30", u: 0, s: "available" },
  ];
  const tabDefs: { id: AvailTab; label: string }[] = [
    { id: "hours", label: "Hours" },
    { id: "breaks", label: "Breaks" },
    { id: "holidays", label: "Holidays" },
    { id: "slots", label: "Slots" },
  ];

  const DayPicker = () => (
    <div className="flex gap-1.5 mb-4">
      {shortDays.map((d) => (
        <button
          key={d}
          onClick={() => setSelDay(d)}
          style={{
            flex: 1,
            padding: "8px 0",
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 700,
            fontFamily: HF,
            backgroundColor: selDay === d ? P : "white",
            color: selDay === d ? "white" : MT,
            boxShadow:
              selDay === d
                ? `0 4px 14px rgba(139,22,98,0.35)`
                : "0 1px 4px rgba(0,0,0,0.06)",
            transition: "all 0.2s",
          }}
        >
          {d}
        </button>
      ))}
    </div>
  );

  const EmptyState = ({
    icon,
    title,
    body,
  }: {
    icon: React.ReactNode;
    title: string;
    body: string;
  }) => (
    <Card
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
      }}
    >
      <div
        style={{
          width: 60,
          height: 60,
          borderRadius: 20,
          backgroundColor: PL,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 14,
          color: P,
        }}
      >
        {icon}
      </div>
      <p
        style={{
          fontSize: 16,
          fontWeight: 800,
          fontFamily: HF,
          color: TX,
          marginBottom: 6,
        }}
      >
        {title}
      </p>
      <p
        style={{
          fontSize: 13,
          fontFamily: BF,
          color: MT,
          textAlign: "center",
        }}
      >
        {body}
      </p>
    </Card>
  );

  return (
    <div
      className="absolute inset-0 overflow-y-auto"
      style={{ backgroundColor: BG, paddingBottom: 90 }}
    >
      <StatusBar />
      <div style={{ padding: "0 16px 16px" }}>
        <p
          style={{
            fontSize: 20,
            fontWeight: 800,
            fontFamily: HF,
            color: TX,
            textAlign: "center",
            marginBottom: 14,
          }}
        >
          Availability
        </p>

        <Card
          style={{
            padding: "12px 16px",
            marginBottom: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <p
              style={{
                fontSize: 11,
                fontFamily: BF,
                color: MT,
                fontWeight: 400,
              }}
            >
              Branch & Service
            </p>
            <p
              style={{
                fontSize: 16,
                fontWeight: 800,
                fontFamily: HF,
                color: TX,
              }}
            >
              Main Branch
            </p>
            <p
              style={{
                fontSize: 12,
                fontFamily: BF,
                color: MT,
              }}
            >
              Main Service
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 14,
                backgroundColor: PL,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Building2 size={18} color={P} />
            </div>
            <ChevronDown size={16} color={MT} />
          </div>
        </Card>

        {/* Tabs */}
        <div
          className="flex gap-1 mb-4"
          style={{
            backgroundColor: PL,
            borderRadius: 16,
            padding: 4,
          }}
        >
          {tabDefs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1,
                padding: "9px 0",
                borderRadius: 12,
                fontSize: 12,
                fontWeight: 700,
                fontFamily: HF,
                backgroundColor:
                  tab === t.id ? P : "transparent",
                color: tab === t.id ? "white" : MT,
                transition: "all 0.2s",
                boxShadow:
                  tab === t.id
                    ? "0 2px 8px rgba(139,22,98,0.3)"
                    : "none",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Hours */}
        {tab === "hours" && (
          <Card style={{ overflow: "hidden" }}>
            {hours.map((h, i) => (
              <div
                key={h.day}
                className="flex items-center justify-between"
                style={{
                  padding: "14px 16px",
                  borderBottom:
                    i < hours.length - 1
                      ? "1px solid rgba(0,0,0,0.05)"
                      : "none",
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 6,
                      backgroundColor: PL,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 11 11"
                      fill="none"
                    >
                      <path
                        d="M1.5 5L4 7.5L9.5 2"
                        stroke={P}
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      fontFamily: HF,
                      color: TX,
                    }}
                  >
                    {h.day}
                  </span>
                </div>
                <div
                  className="flex items-center gap-2"
                  style={{ fontSize: 13, color: "#5C4D6E" }}
                >
                  <div className="flex items-center gap-1">
                    <Clock size={11} color={P} />
                    <span
                      style={{
                        fontFamily: BF,
                        fontWeight: 500,
                      }}
                    >
                      {h.from}
                    </span>
                  </div>
                  <span style={{ color: MT }}>—</span>
                  <div className="flex items-center gap-1">
                    <Clock size={11} color={P} />
                    <span
                      style={{
                        fontFamily: BF,
                        fontWeight: 500,
                      }}
                    >
                      {h.to}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </Card>
        )}

        {/* Breaks */}
        {tab === "breaks" && (
          <>
            <DayPicker />
            <div className="flex items-center justify-between mb-3">
              <p
                style={{
                  fontSize: 15,
                  fontWeight: 800,
                  fontFamily: HF,
                  color: TX,
                }}
              >
                Breaks for{" "}
                {selDay === "Tue" ? "Tuesday" : selDay}
              </p>
              <GradBtn
                fullWidth={false}
                style={{
                  padding: "8px 14px",
                  fontSize: 13,
                  borderRadius: 12,
                }}
              >
                <Plus size={13} />
                Add Break
              </GradBtn>
            </div>
            <EmptyState
              icon={<Coffee size={26} />}
              title="No breaks scheduled"
              body="Add lunch or other break times here."
            />
          </>
        )}

        {/* Holidays */}
        {tab === "holidays" && (
          <>
            <Card style={{ padding: 16, marginBottom: 14 }}>
              <div className="flex items-center justify-between mb-4">
                <button
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 12,
                    backgroundColor: PL,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <ChevronLeft size={16} color={P} />
                </button>
                <span
                  style={{
                    fontSize: 16,
                    fontWeight: 800,
                    fontFamily: HF,
                    color: TX,
                  }}
                >
                  June 2026
                </span>
                <button
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 12,
                    backgroundColor: PL,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <ChevronRight size={16} color={P} />
                </button>
              </div>
              <div className="grid grid-cols-7 mb-2">
                {["S", "M", "T", "W", "T", "F", "S"].map(
                  (d, i) => (
                    <div
                      key={i}
                      style={{
                        textAlign: "center",
                        fontSize: 11,
                        fontWeight: 700,
                        fontFamily: HF,
                        color: MT,
                        paddingBottom: 4,
                      }}
                    >
                      {d}
                    </div>
                  ),
                )}
              </div>
              <div
                className="grid grid-cols-7"
                style={{ gap: "2px 0" }}
              >
                <div />
                {Array.from(
                  { length: 30 },
                  (_, i) => i + 1,
                ).map((d) => (
                  <button
                    key={d}
                    style={{
                      aspectRatio: "1",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 13,
                      fontFamily: BF,
                      fontWeight: d === 16 ? 700 : 400,
                      borderRadius: 10,
                      backgroundColor:
                        d === 16 ? P : "transparent",
                      color: d === 16 ? "white" : TX,
                    }}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </Card>
            <div className="flex items-center justify-between mb-3">
              <p
                style={{
                  fontSize: 15,
                  fontWeight: 800,
                  fontFamily: HF,
                  color: TX,
                }}
              >
                All Holidays
              </p>
              <GradBtn
                fullWidth={false}
                style={{
                  padding: "8px 14px",
                  fontSize: 13,
                  borderRadius: 12,
                }}
              >
                <Plus size={13} />
                Add Holiday
              </GradBtn>
            </div>
            <EmptyState
              icon={<Calendar size={26} />}
              title="No holidays added"
              body="Mark specific days as holidays to close the queue."
            />
          </>
        )}

        {/* Slots */}
        {tab === "slots" && (
          <>
            <DayPicker />
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                {
                  label: "Slot Duration",
                  value: `${slotDuration}m`,
                  onMinus: () =>
                    setSlotDuration((v) =>
                      Math.max(15, v - 15),
                    ),
                  onPlus: () => setSlotDuration((v) => v + 15),
                },
                {
                  label: "Capacity / Slot",
                  value: `${capacity}`,
                  onMinus: () =>
                    setCapacity((v) => Math.max(1, v - 1)),
                  onPlus: () => setCapacity((v) => v + 1),
                },
              ].map((c) => (
                <Card key={c.label} style={{ padding: 14 }}>
                  <p
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      fontFamily: HF,
                      letterSpacing: "0.07em",
                      color: MT,
                      textTransform: "uppercase",
                      marginBottom: 10,
                    }}
                  >
                    {c.label}
                  </p>
                  <div className="flex items-center justify-between">
                    <button
                      onClick={c.onMinus}
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 9,
                        backgroundColor: PL,
                        color: P,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Minus size={14} />
                    </button>
                    <span
                      style={{
                        fontSize: 22,
                        fontWeight: 800,
                        fontFamily: HF,
                        color: TX,
                      }}
                    >
                      {c.value}
                    </span>
                    <button
                      onClick={c.onPlus}
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 9,
                        background: `linear-gradient(135deg, ${P}, ${PD})`,
                        color: "white",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </Card>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
              {[
                { c: GR, l: "Available" },
                { c: AM, l: "Partial" },
                { c: "#F97316", l: "Full" },
                { c: MT, l: "Blocked" },
                { c: P, l: "Break" },
              ].map((x) => (
                <div
                  key={x.l}
                  className="flex items-center gap-1.5"
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      backgroundColor: x.c,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: BF,
                      color: MT,
                    }}
                  >
                    {x.l}
                  </span>
                </div>
              ))}
            </div>
            <Card style={{ padding: 12 }}>
              <p
                style={{
                  fontSize: 11,
                  fontFamily: BF,
                  color: MT,
                  textAlign: "center",
                  marginBottom: 10,
                }}
              >
                Tap a slot to block / unblock it
              </p>
              <div className="grid grid-cols-4 gap-2">
                {slotData.map((s) => {
                  const dc =
                    s.s === "available"
                      ? GR
                      : s.s === "full"
                        ? "#F97316"
                        : AM;
                  return (
                    <button
                      key={s.t}
                      style={{
                        borderRadius: 12,
                        padding: "10px 6px",
                        backgroundColor: BG,
                        border: "1px solid rgba(0,0,0,0.06)",
                        textAlign: "center",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          fontFamily: HF,
                          color: TX,
                          marginBottom: 2,
                        }}
                      >
                        {s.t}
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          fontFamily: BF,
                          color: MT,
                          marginBottom: 4,
                        }}
                      >
                        {s.u}/{capacity}
                      </div>
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          backgroundColor: dc,
                          margin: "0 auto",
                        }}
                      />
                    </button>
                  );
                })}
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
function SettingsScreen() {
  const [bluetooth, setBluetooth] = useState(false);
  const [tvDisplay, setTvDisplay] = useState(false);

  return (
    <div
      className="absolute inset-0 overflow-y-auto"
      style={{ backgroundColor: BG, paddingBottom: 90 }}
    >
      <StatusBar />
      <div style={{ padding: "0 16px 16px" }}>
        <p
          style={{
            fontSize: 20,
            fontWeight: 800,
            fontFamily: HF,
            color: TX,
            textAlign: "center",
            marginBottom: 16,
          }}
        >
          Settings
        </p>

        {/* Context pill */}
        <Card
          style={{
            padding: 14,
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 14,
                backgroundColor: PL,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Settings size={18} color={P} />
            </div>
            <div>
              <div
                className="flex items-center gap-1"
                style={{ fontSize: 13 }}
              >
                <span
                  style={{
                    fontFamily: BF,
                    color: MT,
                    fontWeight: 400,
                  }}
                >
                  Main Branch
                </span>
                <ChevronRight size={12} color={MT} />
                <span
                  style={{
                    fontFamily: HF,
                    fontWeight: 700,
                    color: P,
                  }}
                >
                  Main Service
                </span>
              </div>
              <p
                style={{
                  fontSize: 12,
                  fontFamily: BF,
                  color: MT,
                }}
              >
                Editing service settings
              </p>
            </div>
          </div>
          <button
            style={{
              width: 34,
              height: 34,
              borderRadius: 12,
              backgroundColor: PL,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Edit size={14} color={P} />
          </button>
        </Card>

        {/* Queue Processing */}
        <div style={{ marginBottom: 20 }}>
          <SectionLabel>Queue Processing</SectionLabel>
          <Card style={{ overflow: "hidden" }}>
            <div
              className="flex items-center justify-between"
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid rgba(0,0,0,0.05)",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  fontFamily: HF,
                  padding: "3px 10px",
                  borderRadius: 99,
                  backgroundColor: "#DCFCE7",
                  color: GR,
                }}
              >
                Service override
              </span>
              <button
                className="flex items-center gap-1"
                style={{
                  fontSize: 12,
                  fontFamily: BF,
                  color: MT,
                }}
              >
                <RefreshCw size={12} />
                Reset
              </button>
            </div>
            <div
              className="flex items-center justify-between"
              style={{ padding: 16 }}
            >
              <div className="flex items-start gap-3">
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 14,
                    background: `linear-gradient(135deg, ${P}, ${PD})`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 18 18"
                    fill="none"
                  >
                    <path
                      d="M9 3V15M9 15L5.5 11.5M9 15L12.5 11.5"
                      stroke="white"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div>
                  <p
                    style={{
                      fontSize: 14,
                      fontWeight: 800,
                      fontFamily: HF,
                      color: TX,
                    }}
                  >
                    FIFO — First In, First Out
                  </p>
                  <p
                    style={{
                      fontSize: 12,
                      fontFamily: BF,
                      color: MT,
                      lineHeight: 1.5,
                    }}
                  >
                    Customers are served in the exact order they
                    join the queue
                  </p>
                </div>
              </div>
              <ChevronRight size={16} color={MT} />
            </div>
          </Card>
        </div>

        {/* Notifications */}
        <div style={{ marginBottom: 20 }}>
          <SectionLabel>Notifications</SectionLabel>
          <Card style={{ overflow: "hidden" }}>
            <div style={{ padding: "12px 16px 8px" }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  fontFamily: HF,
                  padding: "3px 10px",
                  borderRadius: 99,
                  backgroundColor: "#EEF2FF",
                  color: "#6366F1",
                }}
              >
                Organization default
              </span>
            </div>
            <div
              className="flex items-center justify-between"
              style={{ padding: "4px 16px 16px" }}
            >
              <div className="flex items-start gap-3">
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 14,
                    background: `linear-gradient(135deg, ${P}, ${PD})`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Bell size={18} color="white" />
                </div>
                <div>
                  <p
                    style={{
                      fontSize: 14,
                      fontWeight: 800,
                      fontFamily: HF,
                      color: TX,
                    }}
                  >
                    All Queue Alerts
                  </p>
                  <p
                    style={{
                      fontSize: 12,
                      fontFamily: BF,
                      color: MT,
                      lineHeight: 1.5,
                    }}
                  >
                    Notify customers at 3rd, 2nd, next position
                    and when it's their turn
                  </p>
                </div>
              </div>
              <ChevronRight size={16} color={MT} />
            </div>
          </Card>
        </div>

        {/* Display & Hardware */}
        <div style={{ marginBottom: 20 }}>
          <SectionLabel>Display & Hardware</SectionLabel>
          <Card style={{ overflow: "hidden" }}>
            <div style={{ padding: "12px 16px 8px" }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  fontFamily: HF,
                  padding: "3px 10px",
                  borderRadius: 99,
                  backgroundColor: "#FEF3C7",
                  color: AM,
                }}
              >
                Branch override
              </span>
            </div>
            {[
              {
                icon: <Bluetooth size={18} color={P} />,
                label: "Bluetooth Speaker",
                desc: "Announce ticket numbers via speaker",
                val: bluetooth,
                onChange: () => setBluetooth((v) => !v),
              },
              {
                icon: <Monitor size={18} color={P} />,
                label: "TV Display",
                desc: "Show live queue status on screen",
                val: tvDisplay,
                onChange: () => setTvDisplay((v) => !v),
              },
            ].map((row, i) => (
              <div
                key={row.label}
                className="flex items-center justify-between"
                style={{
                  padding: "12px 16px",
                  borderTop:
                    i === 0
                      ? "none"
                      : "1px solid rgba(0,0,0,0.05)",
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 14,
                      backgroundColor: PL,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {row.icon}
                  </div>
                  <div>
                    <p
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        fontFamily: HF,
                        color: TX,
                      }}
                    >
                      {row.label}
                    </p>
                    <p
                      style={{
                        fontSize: 12,
                        fontFamily: BF,
                        color: MT,
                      }}
                    >
                      {row.desc}
                    </p>
                  </div>
                </div>
                <Toggle
                  value={row.val}
                  onChange={row.onChange}
                />
              </div>
            ))}
          </Card>
        </div>

        {/* App version */}
        <div
          className="flex flex-col items-center"
          style={{ marginTop: 8, gap: 8 }}
        >
          <InlineSvg raw={tiqketsLogoRaspberryRaw} width={120} height={40} />
          <p
            style={{ fontSize: 11, fontFamily: BF, color: MT }}
          >
            Version 2.0.0 · Queue Management System
          </p>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// APP ROOT
// ═══════════════════════════════════════════════════════════════════════════════
const SCREEN_DEMOS = [
  { id: "splash", label: "Splash" },
  { id: "onboard1", label: "Onboard 1" },
  { id: "onboard2", label: "Onboard 2" },
  { id: "onboard3", label: "Onboard 3" },
  { id: "home", label: "Home" },
  { id: "queue", label: "Queue" },
  { id: "branches", label: "Branches" },
  { id: "availability", label: "Availability" },
  { id: "settings", label: "Settings" },
];
const NAV_SCREENS = new Set<Screen>([
  "home",
  "queue",
  "branches",
  "availability",
  "settings",
]);

export default function App() {
  const [screen, setScreen] = useState<Screen>("splash");
  const [navTab, setNavTab] = useState<NavTab>("home");

  const handleNavChange = (tab: NavTab) => {
    setNavTab(tab);
    setScreen(tab);
  };
  const handleDemoJump = (id: string) => {
    const s = id as Screen;
    setScreen(s);
    if (NAV_SCREENS.has(s)) setNavTab(s as NavTab);
  };

  const renderScreen = () => {
    switch (screen) {
      case "splash":
        return (
          <SplashScreen onDone={() => setScreen("onboard1")} />
        );
      case "onboard1":
        return (
          <OnboardScreen
            step={1}
            onNext={() => setScreen("onboard2")}
            onSkip={() => {
              setScreen("home");
              setNavTab("home");
            }}
          />
        );
      case "onboard2":
        return (
          <OnboardScreen
            step={2}
            onNext={() => setScreen("onboard3")}
            onSkip={() => {
              setScreen("home");
              setNavTab("home");
            }}
          />
        );
      case "onboard3":
        return (
          <OnboardScreen
            step={3}
            onNext={() => {
              setScreen("home");
              setNavTab("home");
            }}
            onSkip={() => {
              setScreen("home");
              setNavTab("home");
            }}
          />
        );
      case "home":
        return <HomeScreen />;
      case "queue":
        return <QueueScreen />;
      case "branches":
        return <BranchesScreen />;
      case "availability":
        return <AvailabilityScreen />;
      case "settings":
        return <SettingsScreen />;
      default:
        return <HomeScreen />;
    }
  };

  const showNav = NAV_SCREENS.has(screen);

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(160deg, #0E0218 0%, #1E0535 40%, #0A0118 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 28,
        padding: 32,
        fontFamily: BF,
      }}
    >
      {/* Phone frame */}
      <div
        style={{
          position: "relative",
          width: 390,
          height: 844,
          borderRadius: 52,
          border: "12px solid #0E0218",
          backgroundColor: BG,
          overflow: "hidden",
          flexShrink: 0,
          boxShadow: [
            "0 0 0 1px rgba(255,255,255,0.07)",
            "0 40px 80px rgba(0,0,0,0.7)",
            "0 0 60px rgba(139,22,98,0.15)",
          ].join(", "),
        }}
      >
        {/* Notch */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: 130,
            height: 34,
            backgroundColor: "#0E0218",
            borderRadius: "0 0 22px 22px",
            zIndex: 60,
          }}
        />
        {/* Screen */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            overflow: "hidden",
            borderRadius: 40,
          }}
        >
          {renderScreen()}
        </div>
        {/* Bottom nav */}
        {showNav && (
          <BottomNav
            active={navTab}
            onChange={handleNavChange}
          />
        )}
      </div>

      {/* Screen picker */}
      

      
    </div>
  );
}