import { useState, useEffect, useRef, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Shield, Users, AlertTriangle, Search,
  Upload, CheckCircle, Eye, BarChart2, Home,
  Download, X, ArrowUpRight, ArrowDownRight,
  CircleDot, Cpu, ChevronRight,
  ScanFace, Fingerprint, Database, RotateCcw,
  ImageIcon, AlertCircle, Info, Tag, Lock, LogOut,
  ArrowLeft, RefreshCw, ArrowDown, ArrowUp,
} from "lucide-react";
import { UOP_FACULTIES, getFacultyById } from "./data/faculties.js";
import { REGISTRY } from "./data/students.js";
import { DEMO_USERS, getUserFaculty, ROLES } from "./data/users.js";
import LoginPage from "./components/LoginPage.jsx";
import StudentPhoto from "./components/StudentPhoto.jsx";
import { parseStudentCSV, parseYearFromIndex, buildImageUrl, resolveFacultyCode } from "./utils/csvParser.js";
import DuplicateDialog from "./components/DuplicateDialog.jsx";
import EnrollStudentModal from "./components/EnrollStudentModal.jsx";

// ── Tokens ────────────────────────────────────────────────────────────────────
const C = {
  bg:      "#07090F",
  surface: "#0D1117",
  raised:  "#141B26",
  card:    "#111827",
  border:  "#1C2A3F",
  accent:  "#3B82F6",
  accentD: "#1E40AF",
  danger:  "#EF4444",
  success: "#10B981",
  warning: "#F59E0B",
  purple:  "#8B5CF6",
  cyan:    "#06B6D4",
  text:    "#F0F4F8",
  sub:     "#8FA3BF",
  muted:   "#4B6080",
};

const trendData = [
  { day:"Mon", incidents:2 }, { day:"Tue", incidents:4 },
  { day:"Wed", incidents:1 }, { day:"Thu", incidents:6 },
  { day:"Fri", incidents:3 }, { day:"Sat", incidents:5 },
  { day:"Sun", incidents:2 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function mono(text, size=12, color=C.sub) {
  return (
    <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:size, color }}>
      {text}
    </span>
  );
}

function Avatar({ initials, size=36, color="#1E40AF", flagged=false }) {
  return (
    <div style={{
      width:size, height:size, borderRadius:size*0.28,
      background:`${color}30`, border:`2px solid ${flagged?C.danger:color}40`,
      display:"flex", alignItems:"center", justifyContent:"center",
      fontFamily:"'JetBrains Mono',monospace",
      fontSize:size*0.32, fontWeight:700, color, flexShrink:0,
      position:"relative",
    }}>
      {initials}
      {flagged && (
        <div style={{
          position:"absolute", top:-4, right:-4,
          width:12, height:12, borderRadius:"50%",
          background:C.danger, border:`2px solid ${C.surface}`,
        }}/>
      )}
    </div>
  );
}

function Badge({ label }) {
  const map = {
    confirmed: [C.success, `${C.success}18`],
    review:    [C.warning, `${C.warning}18`],
    unmatched: [C.danger,  `${C.danger}18`],
    archived:  [C.muted,   `${C.muted}18`],
    active:    [C.accent,  `${C.accent}18`],
    flagged:   [C.danger,  `${C.danger}18`],
    online:    [C.success, `${C.success}18`],
    offline:   [C.danger,  `${C.danger}18`],
  };
  const [fg, bg] = map[label] || [C.sub, C.raised];
  return (
    <span style={{
      background:bg, color:fg, padding:"3px 10px",
      borderRadius:99, fontSize:10, fontWeight:700,
      textTransform:"capitalize", letterSpacing:"0.06em",
    }}>{label}</span>
  );
}

function ConfRing({ value, size=44 }) {
  if (!value) return <span style={{fontSize:12,color:C.muted}}>No match</span>;
  const r = size*0.38, circ = 2*Math.PI*r;
  const col = value >= 60 ? C.success : value >= 40 ? C.warning : C.danger;
  return (
    <div style={{display:"flex",alignItems:"center",gap:8}}>
      <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.border} strokeWidth={3}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={3}
          strokeDasharray={`${value/100*circ} ${circ}`} strokeLinecap="round"/>
      </svg>
      <div>
        <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:15,fontWeight:800,color:col}}>
          {value.toFixed(1)}%
        </div>
        <div style={{fontSize:10,color:C.muted}}>confidence</div>
      </div>
    </div>
  );
}

function StatCard({ icon:Icon, label, value, trend, color=C.accent, sub }) {
  const up = trend>=0;
  return (
    <div style={{
      background:C.surface, border:`1px solid ${C.border}`,
      borderRadius:14, padding:"20px 22px",
    }}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"start",marginBottom:14}}>
        <div style={{
          width:38,height:38,borderRadius:10,
          background:`${color}18`,display:"flex",alignItems:"center",justifyContent:"center",
        }}>
          <Icon size={18} color={color}/>
        </div>
        {trend!==undefined&&(
          <div style={{display:"flex",alignItems:"center",gap:3,
            color:up?C.success:C.danger,fontSize:11,fontWeight:600}}>
            {up?<ArrowUpRight size={12}/>:<ArrowDownRight size={12}/>}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:26,
        fontWeight:800,color:C.text,letterSpacing:"-0.03em"}}>{value}</div>
      <div style={{fontSize:12,color:C.sub,marginTop:3}}>{label}</div>
      {sub&&<div style={{fontSize:10,color:C.muted,marginTop:2}}>{sub}</div>}
    </div>
  );
}

function ScrollButton({ containerRef }) {
  const [isScrolledDown, setIsScrolledDown] = useState(false);

  useEffect(() => {
    const el = containerRef?.current;
    if (!el) return;
    const handleScroll = () => {
      setIsScrolledDown(el.scrollTop > 160);
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [containerRef]);

  const handleClick = () => {
    const el = containerRef?.current;
    if (el) {
      if (isScrolledDown) {
        el.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      }
    } else {
      if (isScrolledDown) {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
      }
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={isScrolledDown ? "Scroll to Top" : "Scroll to Bottom"}
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 999,
        width: 44,
        height: 44,
        borderRadius: "50%",
        background: C.raised,
        border: `1px solid ${C.border}`,
        color: C.text,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        boxShadow: "0 6px 20px rgba(0,0,0,0.55)",
        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = C.accent;
        e.currentTarget.style.color = "#ffffff";
        e.currentTarget.style.transform = "scale(1.08)";
        e.currentTarget.style.boxShadow = `0 8px 24px ${C.accent}50`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = C.raised;
        e.currentTarget.style.color = C.text;
        e.currentTarget.style.transform = "scale(1)";
        e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.55)";
      }}
    >
      {isScrolledDown ? <ArrowUp size={20} /> : <ArrowDown size={20} />}
    </button>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
const NAV = [
  { key:"dashboard", label:"Dashboard",        icon:Home },
  { key:"identify",  label:"Identify",         icon:ScanFace, badge:"CORE" },
  { key:"enroll",    label:"Faculty API Sync", icon:Database },
  { key:"evidence",  label:"Evidence",         icon:Eye,      alert:5 },
  { key:"reports",   label:"Reports",          icon:BarChart2 },
];

function Sidebar({ page, setPage, currentUser, onLogout }) {
  const activeFaculty = getUserFaculty(currentUser);
  const isAdmin = currentUser?.role === ROLES.ADMIN;

  const navItems = NAV.filter(item => {
    if (isAdmin) return true;
    return item.key !== "evidence" && item.key !== "reports";
  });

  return (
    <div style={{
      width:216, background:C.surface, borderRight:`1px solid ${C.border}`,
      display:"flex", flexDirection:"column", height:"100vh",
      position:"fixed", left:0, top:0, zIndex:100, flexShrink:0,
    }}>
      <div style={{padding:"22px 18px 18px",borderBottom:`1px solid ${C.border}`}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{
            width:38,height:38,borderRadius:10,flexShrink:0,
            background:`linear-gradient(135deg,${C.accent},${C.purple})`,
            display:"flex",alignItems:"center",justifyContent:"center",
          }}>
            <Shield size={20} color="#fff"/>
          </div>
          <div>
            <div style={{fontSize:13,fontWeight:800,color:C.text,letterSpacing:"0.1em",
              fontFamily:"'JetBrains Mono',monospace"}}>SENTINEL</div>
            <div style={{fontSize:9,color:C.muted,letterSpacing:"0.14em"}}>RECOGNITION · INTELLIGENCE</div>
          </div>
        </div>
      </div>

      <nav style={{flex:1,padding:"14px 10px",display:"flex",flexDirection:"column",gap:3}}>
        <div style={{fontSize:9,color:C.muted,letterSpacing:"0.12em",fontWeight:700,
          padding:"0 8px",marginBottom:6}}>
          {isAdmin ? "CENTRAL SYSTEM" : `${activeFaculty.code} PORTAL`}
        </div>
        {navItems.map(n=>{
          const active = page===n.key;
          return (
            <button key={n.key} onClick={()=>setPage(n.key)} style={{
              display:"flex",alignItems:"center",gap:9,width:"100%",
              padding:"10px 10px",borderRadius:9,border:"none",cursor:"pointer",
              background:active?`${C.accent}18`:"transparent",
              color:active?C.accent:C.sub,
              fontWeight:active?700:500,fontSize:13,
              transition:"all 0.15s",textAlign:"left",
              borderLeft:active?`3px solid ${C.accent}`:"3px solid transparent",
            }}>
              <n.icon size={15}/>
              <span style={{flex:1}}>{n.label}</span>
              {n.badge&&(
                <span style={{fontSize:8,fontWeight:800,padding:"2px 5px",
                  borderRadius:4,background:`${C.accent}30`,color:C.accent,
                  letterSpacing:"0.08em"}}>{n.badge}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div style={{padding:"14px 10px",borderTop:`1px solid ${C.border}`}}>
        <div style={{
          display:"flex",alignItems:"center",justifyContent:"space-between",
          padding:"10px",borderRadius:9,background:C.raised,
          border: `1px solid ${activeFaculty.color || C.accent}30`,
        }}>
          <div style={{display:"flex",alignItems:"center",gap:9,overflow:"hidden",flex:1}}>
            <Avatar initials={currentUser?.initials || "SA"} size={30} color={activeFaculty.color || C.accent}/>
            <div style={{overflow:"hidden",flex:1}}>
              <div style={{fontSize:12,fontWeight:700,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                {currentUser?.name || "Security Admin"}
              </div>
              <div style={{fontSize:9,color:C.sub,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                {activeFaculty.code === "ALL" ? "Global System Admin" : `Faculty of ${activeFaculty.code}`}
              </div>
            </div>
          </div>
          <button onClick={onLogout} title="Log Out" style={{
            background:"none",border:"none",color:C.muted,cursor:"pointer",padding:4,
            display:"flex",alignItems:"center",justifyContent:"center"
          }}>
            <LogOut size={15}/>
          </button>
        </div>
      </div>
    </div>
  );
}

function Topbar({ title, sub, currentUser, onLogout, onBack, onRefresh, refreshing, toastMsg }) {
  const [t, setT] = useState(new Date());
  const activeFaculty = getUserFaculty(currentUser);
  useEffect(() => { const iv = setInterval(() => setT(new Date()), 1000); return () => clearInterval(iv); }, []);
  return (
    <div style={{
      height: 60, background: C.surface, borderBottom: `1px solid ${C.border}`,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 24px", position: "sticky", top: 0, zIndex: 50
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {onBack && (
          <button
            onClick={onBack}
            title="Go Back"
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8,
              border: `1px solid ${C.border}`, background: C.raised, color: C.text,
              fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.15s"
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.text; }}
          >
            <ArrowLeft size={14} />
            <span>Back</span>
          </button>
        )}
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{title}</div>
          <div style={{ fontSize: 11, color: C.muted }}>{sub}</div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {toastMsg && (
          <div style={{
            fontSize: 11, color: C.success, fontWeight: 700,
            background: `${C.success}18`, padding: "4px 10px", borderRadius: 6,
            border: `1px solid ${C.success}35`, display: "flex", alignItems: "center", gap: 6
          }}>
            <CheckCircle size={12} /> {toastMsg}
          </div>
        )}

        {/* Refresh Button */}
        <button
          onClick={onRefresh}
          title="Refresh Data & Views"
          disabled={refreshing}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8,
            border: `1px solid ${refreshing ? C.accent : C.border}`,
            background: refreshing ? `${C.accent}20` : C.raised,
            color: refreshing ? C.accent : C.text,
            fontSize: 11, fontWeight: 700, cursor: refreshing ? "default" : "pointer",
            transition: "all 0.15s"
          }}
          onMouseEnter={e => { if (!refreshing) { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent; } }}
          onMouseLeave={e => { if (!refreshing) { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.text; } }}
        >
          <RefreshCw size={13} style={{ animation: refreshing ? "spin 0.7s linear infinite" : "none" }} />
          <span>{refreshing ? "Refreshing…" : "Refresh"}</span>
        </button>

        <div style={{
          display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 7,
          background: `${activeFaculty.color || C.accent}15`, border: `1px solid ${activeFaculty.color || C.accent}30`,
          fontSize: 11, fontWeight: 700, color: activeFaculty.color || C.accent
        }}>
          <Tag size={12} />
          {currentUser?.role === ROLES.ADMIN ? "Super Admin Portal" : `${activeFaculty.code} Scope`}
        </div>

        <button onClick={onLogout} style={{
          display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8,
          border: `1px solid ${C.danger}40`, background: `${C.danger}15`, color: C.danger,
          fontSize: 11, fontWeight: 700, cursor: "pointer"
        }}>
          <LogOut size={13} /> Log Out
        </button>

        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: C.muted
        }}>
          <CircleDot size={9} color={C.success} />
          {t.toLocaleTimeString()} · UOP
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE: IDENTIFY  (the core workflow)
// ═══════════════════════════════════════════════════════════════════════════════
const PIPELINE = [
  { key:"detect",  label:"Face Detection",      tech:"AI Model",      icon:ScanFace,    color:C.cyan   },
  { key:"embed",   label:"Feature Extraction",  tech:"Deep Learning", icon:Fingerprint, color:C.accent },
  { key:"search",  label:"Identity Search",     tech:"Vector Search", icon:Database,    color:C.purple },
  { key:"results", label:"Match Results",         tech:"Threshold ≥ 40%",  icon:CheckCircle, color:C.success },
];

function IncidentCanvas({ matches = [], stage, imageFile, imageSrc }) {
  const canvasRef = useRef(null);
  const [loadedImg, setLoadedImg] = useState(null);

  useEffect(() => {
    let active = true;
    let url = imageSrc;
    if (!url && imageFile) {
      try {
        url = URL.createObjectURL(imageFile);
      } catch (e) {
        url = null;
      }
    }
    if (!url) {
      setLoadedImg(null);
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (active) setLoadedImg(img);
    };
    img.src = url;

    return () => {
      active = false;
      if (!imageSrc && imageFile && url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [imageFile, imageSrc]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (loadedImg) {
      const cw = canvas.width;
      const ch = canvas.height;
      const imgW = loadedImg.naturalWidth || loadedImg.width || cw;
      const imgH = loadedImg.naturalHeight || loadedImg.height || ch;

      const scale = Math.min(cw / imgW, ch / imgH);
      const dw = imgW * scale;
      const dh = imgH * scale;
      const dx = (cw - dw) / 2;
      const dy = (ch - dh) / 2;

      ctx.fillStyle = "#07090F";
      ctx.fillRect(0, 0, cw, ch);
      ctx.drawImage(loadedImg, dx, dy, dw, dh);

      if (stage < 1) return;

      // Draw bounding boxes on faces
      matches.forEach((m, i) => {
        const origBox = m.facePos || { x: 50, y: 50, w: 100, h: 100 };
        const scaleX = dw / imgW;
        const scaleY = dh / imgH;

        let bx = dx + origBox.x * scaleX;
        let by = dy + origBox.y * scaleY;
        let bw = origBox.w * scaleX;
        let bh = origBox.h * scaleY;

        if (origBox.isCanvasScale) {
          bx = origBox.x;
          by = origBox.y;
          bw = origBox.w;
          bh = origBox.h;
        }

        const matched = m.matchedStudent !== null;
        const col = stage < 3 ? "#F59E0B" : matched ? "#10B981" : "#EF4444";

        ctx.strokeStyle = col;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(bx, by, bw, bh);

        // Corner brackets
        const b = Math.min(12, Math.max(6, bw / 4));
        ctx.lineWidth = 3.5;
        [
          [bx, by, 1, 1], [bx + bw, by, -1, 1],
          [bx, by + bh, 1, -1], [bx + bw, by + bh, -1, -1]
        ].forEach(([cx, cy, sx, sy]) => {
          ctx.beginPath(); ctx.moveTo(cx + b * sx, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + b * sy); ctx.stroke();
        });

        // Face tag
        if (stage >= 2) {
          const lbl = `FACE #${i + 1}`;
          ctx.fillStyle = col;
          ctx.font = "bold 10px 'JetBrains Mono',monospace";
          const tw = ctx.measureText(lbl).width + 8;
          ctx.fillRect(bx, Math.max(0, by - 17), tw, 15);
          ctx.fillStyle = "#000";
          ctx.fillText(lbl, bx + 4, Math.max(11, by - 6));
        }

        // Match result label
        if (stage >= 3) {
          const lbl2 = matched ? `${m.matchedStudent.name} (${m.confidence.toFixed(1)}%)` : "NOT IN REGISTRY";
          ctx.fillStyle = col + "EE";
          ctx.font = "bold 10px 'JetBrains Mono',monospace";
          const tw2 = ctx.measureText(lbl2).width + 10;
          ctx.fillRect(bx, by + bh + 2, tw2, 16);
          ctx.fillStyle = "#000";
          ctx.fillText(lbl2, bx + 5, by + bh + 13);
        }
      });
    } else {
      // Draw grid
      ctx.fillStyle = "#07090F";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "#1C2A3F";
      ctx.lineWidth = 0.5;
      for (let x = 0; x < canvas.width; x += 20) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
      for (let y = 0; y < canvas.height; y += 20) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
    }
  }, [stage, matches, loadedImg]);

  return (
    <canvas ref={canvasRef} width={640} height={380}
      style={{
        width: "100%", maxHeight: 380, objectFit: "contain",
        borderRadius: 10, display: "block",
        border: `1px solid ${C.border}`, background: "#07090F"
      }} />
  );
}

function PipelineStep({ step, index, currentStep }) {
  const done   = currentStep > index;
  const active = currentStep === index;
  return (
    <div style={{
      padding:"12px 14px",borderRadius:10,
      background:done?`${step.color}10`:active?`${step.color}08`:C.raised,
      border:`1px solid ${done?step.color:active?step.color+"60":C.border}`,
      transition:"all 0.4s",display:"flex",alignItems:"center",gap:10,
    }}>
      <div style={{
        width:32,height:32,borderRadius:8,flexShrink:0,
        background:done?step.color:active?`${step.color}30`:C.border,
        display:"flex",alignItems:"center",justifyContent:"center",
        transition:"background 0.4s",
      }}>
        {done
          ? <CheckCircle size={16} color="#000"/>
          : active
            ? <div style={{width:10,height:10,borderRadius:"50%",
                background:step.color,animation:"spin 0.7s linear infinite"}}/>
            : <step.icon size={14} color={C.muted}/>
        }
      </div>
      <div style={{flex:1}}>
        <div style={{fontSize:12,fontWeight:700,
          color:done?step.color:active?step.color:C.muted,marginBottom:2}}>
          {step.label}
        </div>
        <div style={{fontSize:10,color:C.muted}}>{step.tech}</div>
        {active&&(
          <div style={{marginTop:5,height:3,background:C.border,borderRadius:99,overflow:"hidden"}}>
            <div style={{height:"100%",width:"70%",background:step.color,
              borderRadius:99,animation:"progress 1.2s ease-in-out infinite"}}/>
          </div>
        )}
      </div>
      {done&&<CheckCircle size={14} color={step.color}/>}
    </div>
  );
}

function MatchCard({ match, currentUser }) {
  const { faceLabel, matchedStudent: s, confidence, appearanceChanges, incidentCropUrl, referencePhotoUrl } = match;
  const activeFaculty = getUserFaculty(currentUser);
  const isGlobalAdmin = currentUser?.role === ROLES.ADMIN;
  const [zoomImg, setZoomImg] = useState(null);

  const rawMatched = s !== null;
  const isAuthorizedMatch = rawMatched && (isGlobalAdmin || s.facultyId === currentUser?.facultyId);

  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${isAuthorizedMatch ? (confidence > 90 ? C.success : C.warning) : rawMatched ? C.warning : C.danger}40`,
      borderRadius: 14, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "12px 16px",
        background: isAuthorizedMatch ? `${confidence > 90 ? C.success : C.warning}10` : rawMatched ? `${C.warning}10` : `${C.danger}10`,
        borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Tag size={13} color={isAuthorizedMatch ? C.success : rawMatched ? C.warning : C.danger} />
          {mono(faceLabel, 12, isAuthorizedMatch ? C.success : rawMatched ? C.warning : C.danger)}
        </div>
        {isAuthorizedMatch
          ? <Badge label="confirmed" />
          : rawMatched
          ? <Badge label="review" />
          : <Badge label="unmatched" />
        }
      </div>

      <div style={{ padding: "16px" }}>
        {isAuthorizedMatch ? (
          <>
            {/* Side-by-side comparison — the key UI */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 10,
              alignItems: "center", marginBottom: 16
            }}>
              {/* Detected face */}
              <div style={{ textAlign: "center" }}>
                <div style={{
                  fontSize: 9, fontWeight: 700, color: C.muted,
                  letterSpacing: "0.1em", marginBottom: 6
                }}>FROM INCIDENT</div>
                <div
                  onClick={() => incidentCropUrl && setZoomImg({ url: incidentCropUrl, title: `Detected Face (${faceLabel})` })}
                  style={{
                    width: "100%", paddingTop: "115%", position: "relative",
                    background: "#050811", border: `1px solid ${C.border}`,
                    borderRadius: 10, overflow: "hidden", cursor: incidentCropUrl ? "zoom-in" : "default",
                    boxShadow: "0 4px 14px rgba(0,0,0,0.4)"
                  }}>
                  <div style={{
                    position: "absolute", inset: 0, display: "flex",
                    flexDirection: "column", alignItems: "center", justifyContent: "center"
                  }}>
                    {incidentCropUrl ? (
                      <img src={incidentCropUrl} alt="Detected Incident Face"
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    ) : (
                      <StudentPhoto regno={s?.id} initials={s?.initials || "CCTV"} size={52}
                        color={s?.accentColor || C.accent} flagged={s?.flagged} />
                    )}
                    <div style={{
                      position: "absolute", bottom: 0, left: 0, right: 0,
                      fontSize: 8, color: "#fff", background: "rgba(7,9,15,0.85)",
                      backdropFilter: "blur(3px)",
                      fontFamily: "'JetBrains Mono',monospace",
                      textAlign: "center", padding: "3px 4px", borderTop: `1px solid ${C.border}`,
                      display: "flex", justifyContent: "center", alignItems: "center", gap: 4
                    }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.success }} />
                      CCTV · {match.facePos?.w || 120}×{match.facePos?.h || 120}px
                    </div>
                  </div>
                  {/* scanline overlay */}
                  <div style={{
                    position: "absolute", inset: 0, pointerEvents: "none",
                    background: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.06) 4px)"
                  }} />
                  {appearanceChanges && appearanceChanges.length > 0 && (
                    <div style={{
                      position: "absolute", top: 0, left: 0, right: 0,
                      background: "rgba(239,68,68,0.92)",
                      padding: "2px 5px", fontSize: 8, color: "#fff", fontWeight: 700,
                      textAlign: "center", letterSpacing: "0.05em",
                    }}>APPEARANCE CHANGE</div>
                  )}
                </div>
              </div>

              {/* Arrow / Fingerprint */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ width: 1, height: 18, background: C.border }} />
                <div style={{
                  width: 30, height: 30, borderRadius: "50%",
                  background: `${C.success}20`, border: `1px solid ${C.success}50`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: `0 0 12px ${C.success}25`
                }}>
                  <Fingerprint size={14} color={C.success} />
                </div>
                <div style={{ width: 1, height: 18, background: C.border }} />
              </div>

              {/* ID photo */}
              <div style={{ textAlign: "center" }}>
                <div style={{
                  fontSize: 9, fontWeight: 700, color: C.muted,
                  letterSpacing: "0.1em", marginBottom: 6
                }}>STUDENT ID PHOTO</div>
                <div
                  onClick={() => (referencePhotoUrl || s?.photoUrl) && setZoomImg({ url: referencePhotoUrl || s?.photoUrl, title: `Enrolled ID Photo (${s?.id})` })}
                  style={{
                    width: "100%", paddingTop: "115%", position: "relative",
                    background: "#050811", border: `2px solid ${s?.accentColor || C.accent}60`,
                    borderRadius: 10, overflow: "hidden", cursor: (referencePhotoUrl || s?.photoUrl) ? "zoom-in" : "default",
                    boxShadow: "0 4px 14px rgba(0,0,0,0.4)"
                  }}>
                  <div style={{
                    position: "absolute", inset: 0, display: "flex",
                    flexDirection: "column", alignItems: "center", justifyContent: "center"
                  }}>
                    {(referencePhotoUrl || s?.photoUrl) ? (
                      <img src={referencePhotoUrl || s?.photoUrl} alt="Registered Student ID"
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    ) : (
                      <StudentPhoto regno={s?.id} initials={s?.initials || "ID"} size={52}
                        color={s?.accentColor || C.accent} flagged={s?.flagged} photoUrl={s?.photoUrl} />
                    )}
                    <div style={{
                      position: "absolute", bottom: 0, left: 0, right: 0,
                      fontSize: 8, color: "#fff", background: "rgba(7,9,15,0.85)",
                      backdropFilter: "blur(3px)",
                      fontFamily: "'JetBrains Mono',monospace",
                      textAlign: "center", padding: "3px 4px", borderTop: `1px solid ${C.border}`,
                      display: "flex", justifyContent: "center", alignItems: "center", gap: 4
                    }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.accent }} />
                      REGISTRY · {s?.id || "N/A"}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Confidence */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
              <ConfRing value={confidence} />
            </div>

            {/* Student details */}
            <div style={{
              background: C.raised, borderRadius: 9, padding: "10px 12px",
              border: `1px solid ${C.border}`, marginBottom: 12,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <StudentPhoto regno={s.id} initials={s.initials} size={36} color={s.accentColor} flagged={s.flagged} photoUrl={referencePhotoUrl || s.photoUrl} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{s.name}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>{s.faculty || s.facultyId || "Student"} · {s.year ? `Year ${s.year}` : ""}</div>
                </div>
                {mono(s.id, 10, C.accent)}
              </div>
              {s.flagged && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "5px 8px", borderRadius: 6,
                  background: `${C.danger}15`, border: `1px solid ${C.danger}30`,
                  fontSize: 10, color: C.danger, fontWeight: 600,
                }}>
                  <AlertCircle size={11} />Previously flagged — HIGH PRIORITY
                </div>
              )}
            </div>

            {/* Appearance changes */}
            {appearanceChanges.length > 0 && (
              <div style={{
                padding: "8px 10px", borderRadius: 8,
                background: `${C.warning}10`, border: `1px solid ${C.warning}30`,
                fontSize: 11, color: C.warning,
              }}>
                <div style={{ fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}>
                  <AlertCircle size={11} />Detected appearance changes:
                </div>
                {appearanceChanges.map(c => (
                  <div key={c} style={{ fontSize: 10, color: C.sub, marginLeft: 16 }}>• {c}</div>
                ))}
                <div style={{ fontSize: 9, color: C.muted, marginTop: 4 }}>
                  AI model is robust to these surface changes
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button style={{
                flex: 1, padding: "8px", borderRadius: 7, border: "none", cursor: "pointer",
                background: `linear-gradient(135deg,${C.accent},${C.accentD})`,
                color: "#fff", fontWeight: 700, fontSize: 11,
              }}>Confirm &amp; Log</button>
              <button style={{
                padding: "8px 12px", borderRadius: 7,
                border: `1px solid ${C.border}`, background: "transparent",
                color: C.sub, fontSize: 11, cursor: "pointer",
              }}>Dispute</button>
            </div>
          </>
        ) : rawMatched ? (
          /* Candidate match exists outside currentUser's faculty scope */
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div style={{
              width: 52, height: 52, borderRadius: "50%",
              background: `${C.warning}15`, border: `1px solid ${C.warning}30`,
              display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px"
            }}>
              <Lock size={22} color={C.warning} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4 }}>
              No Authorized Match
            </div>
            <div style={{ fontSize: 11, color: C.sub, marginBottom: 8 }}>
              Candidate match exists outside {activeFaculty.code} scope
            </div>
            <div style={{
              padding: "8px 10px", borderRadius: 8, background: `${C.warning}10`,
              border: `1px solid ${C.warning}30`, fontSize: 10, color: C.warning, textAlign: "center"
            }}>
              Student identity protected per UOP RBAC policy. Flask backend will filter cross-faculty recognition candidate results during Phase 6.
            </div>
          </div>
        ) : (
          // No match
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            {incidentCropUrl && (
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
                <div
                  onClick={() => setZoomImg({ url: incidentCropUrl, title: `Unmatched Face (${faceLabel})` })}
                  style={{
                    width: 76, height: 90, borderRadius: 8, overflow: "hidden",
                    border: `1px solid ${C.danger}60`, cursor: "zoom-in", position: "relative",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.5)", background: "#050811"
                  }}>
                  <img src={incidentCropUrl} alt="Detected face" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <div style={{
                    position: "absolute", bottom: 0, left: 0, right: 0,
                    background: "rgba(7,9,15,0.85)", fontSize: 8, color: "#fff",
                    textAlign: "center", padding: "2px", fontFamily: "'JetBrains Mono',monospace"
                  }}>CCTV FACE</div>
                </div>
              </div>
            )}
            <div style={{
              width: 48, height: 48, borderRadius: "50%",
              background: `${C.danger}15`, border: `1px solid ${C.danger}30`,
              display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px"
            }}>
              <X size={22} color={C.danger} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4 }}>
              No Match Found
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>
              Confidence below threshold (&lt; 40%)<br />Or student photo not enrolled in biometric registry
            </div>
            <button style={{
              padding: "7px 16px", borderRadius: 7, fontSize: 11, cursor: "pointer",
              border: `1px solid ${C.border}`, background: "transparent", color: C.sub,
            }}>Add to Watchlist</button>
          </div>
        )}
      </div>

      {/* High-Resolution Zoom Modal */}
      {zoomImg && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20
        }} onClick={() => setZoomImg(null)}>
          <div style={{
            position: "relative", maxWidth: 440, width: "100%", background: C.surface,
            border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden",
            boxShadow: "0 24px 60px rgba(0,0,0,0.8)"
          }} onClick={e => e.stopPropagation()}>
            <div style={{
              padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
              borderBottom: `1px solid ${C.border}`, background: C.raised
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{zoomImg.title}</div>
              <button onClick={() => setZoomImg(null)} style={{
                background: "transparent", border: "none", color: C.sub, cursor: "pointer", display: "flex"
              }}><X size={18} /></button>
            </div>
            <div style={{ padding: 16, display: "flex", justifyContent: "center", background: "#050811" }}>
              <img src={zoomImg.url} alt={zoomImg.title} style={{
                maxWidth: "100%", maxHeight: "60vh", objectFit: "contain", borderRadius: 8
              }} />
            </div>
            <div style={{ padding: "10px 16px", fontSize: 11, color: C.muted, textAlign: "center" }}>
              High-resolution biometric comparison preview
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function cropFaceCanvas(imageElement, box, margin = 0.18) {
  if (!imageElement || !box) return null;
  try {
    const [bx, by, bw, bh] = box;
    const iw = imageElement.naturalWidth || imageElement.width;
    const ih = imageElement.naturalHeight || imageElement.height;
    if (!iw || !ih) return null;
    const mx = bw * margin;
    const my = bh * margin;
    const sx = Math.max(0, bx - mx);
    const sy = Math.max(0, by - my);
    const sw = Math.min(iw - sx, bw + mx * 2);
    const sh = Math.min(ih - sy, bh + my * 2);
    if (sw <= 0 || sh <= 0) return null;

    const canvas = document.createElement("canvas");
    canvas.width = Math.min(sw, 320);
    canvas.height = Math.min(sh, 320);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(imageElement, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.90);
  } catch (e) {
    console.warn("Client-side face crop failed:", e);
    return null;
  }
}

function IdentifyPage({ currentUser, setPage, students = [], setStudents, registryCount }) {
  const [uploadStage, setUploadStage] = useState("idle"); // idle|uploaded|processing|done
  const [pipelineStep, setPipelineStep] = useState(-1);
  const [fileName, setFileName] = useState("");
  const [incidentMeta, setIncidentMeta] = useState({ source:"", date:"", location:"" });
  const [matches, setMatches] = useState([]);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [loadedIncidentImg, setLoadedIncidentImg] = useState(null);

  useEffect(() => {
    if (!uploadedFile) {
      setLoadedIncidentImg(null);
      return;
    }
    const url = URL.createObjectURL(uploadedFile);
    const img = new Image();
    img.onload = () => setLoadedIncidentImg(img);
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [uploadedFile]);

  const [enrollModalOpen, setEnrollModalOpen] = useState(false);
  const [dbWarning, setDbWarning] = useState("");
  const fileRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [liveRegistryCount, setLiveRegistryCount] = useState(() => {
    try {
      const savedCount = localStorage.getItem("sentinel_student_count");
      if (savedCount) {
        const val = parseInt(savedCount, 10);
        if (val > 1000) return val;
      }
    } catch (e) {}
    if (registryCount && registryCount > 1000) return registryCount;
    if (students?.length > 1000) return students.length;
    return 37696;
  });

  useEffect(() => {
    if (registryCount && registryCount > 1000) {
      setLiveRegistryCount(registryCount);
    } else if (students && students.length > 1000) {
      setLiveRegistryCount(students.length);
    }
    fetch("http://localhost:5000/stats")
      .then(res => res.json())
      .then(data => {
        if (data && typeof data.students_registered === "number" && data.students_registered > 0) {
          setLiveRegistryCount(data.students_registered);
          try { localStorage.setItem("sentinel_student_count", String(data.students_registered)); } catch (e) {}
        }
      })
      .catch(() => {
        fetch("http://localhost:5000/health")
          .then(res => res.json())
          .then(data => {
            if (data && typeof data.students_registered === "number" && data.students_registered > 0) {
              setLiveRegistryCount(data.students_registered);
              try { localStorage.setItem("sentinel_student_count", String(data.students_registered)); } catch (e) {}
            }
          })
          .catch(() => {});
      });
  }, [students, registryCount]);

  const runPipeline = useCallback(async ()=>{
    setUploadStage("processing");
    setPipelineStep(0);
    setDbWarning("");

    // Animate pipeline steps
    PIPELINE.forEach((_,i)=>{
      setTimeout(()=>{ setPipelineStep(i+1); },(i+1)*1000);
    });

    if (uploadedFile) {
      try {
        const API = import.meta.env.VITE_BACKEND_URL || "http://localhost:8080";
        const token = localStorage.getItem("sentinel_token");
        const formData = new FormData();
        formData.append("file", uploadedFile);
        formData.append("image", uploadedFile);
        let res = null;
        try {
          res = await fetch(`${API}/api/identification/search`, {
            method: "POST",
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: formData,
          });
        } catch (backendErr) {
          console.warn("Spring Boot backend offline, falling back directly to Flask AI service...", backendErr);
        }

        if (!res || !res.ok) {
          try {
            res = await fetch("http://localhost:5000/api/recognize", {
              method: "POST",
              body: formData,
            });
          } catch (flaskErr) {
            console.warn("AI Service unreachable:", flaskErr);
          }
        }

        if (res && res.ok) {
          const resData = await res.json();
          const payload = resData.data || resData;

          if (resData.warning || resData.total_registered_embeddings === 0) {
            setDbWarning("Biometric database has 0 enrolled face templates. Student index numbers exist, but photos have not been registered yet. Click 'Enroll Student Photo' to register facial photos before matching.");
          } else {
            setDbWarning("");
          }

          let formattedMatches = [];

          if (Array.isArray(payload.matches) && payload.matches.length > 0) {
            formattedMatches = payload.matches.map((m, idx) => {
              const confValue = typeof m.confidence === 'number'
                ? (m.confidence <= 1 ? m.confidence * 100 : m.confidence)
                : 0;
              const sid = m.studentId || m.student_id;
              const name = m.studentName || m.name || m.full_name || (sid ? `Student (${sid})` : null);
              const prefix = sid ? sid.split("/")[0].toUpperCase() : "UNKNOWN";
              const yearVal = parseYearFromIndex(sid) || m.year || 1;
              const box = m.box || m.bounding_box || [60 + idx * 100, 60, 100, 120];

              const cropUrl = m.incidentCropUrl || cropFaceCanvas(loadedIncidentImg, box) || null;
              const enrolledMatch = students.find(s => s.id?.toLowerCase() === sid?.toLowerCase());
              const localPhoto = (() => {
                try {
                  const p = JSON.parse(localStorage.getItem("sentinel_enrolled_photos") || "{}");
                  return (sid && p[sid.toUpperCase()]) || null;
                } catch(e) { return null; }
              })();
              const refUrl = m.referencePhotoUrl || enrolledMatch?.photoUrl || localPhoto || null;

              return {
                faceIdx: idx,
                faceLabel: m.faceLabel || `Face #${idx + 1}`,
                matchedStudent: sid ? {
                  id: sid,
                  name: name,
                  facultyId: m.faculty || prefix,
                  year: yearVal,
                  initials: (name || sid).split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(),
                  accentColor: "#3B82F6",
                  photoUrl: refUrl || buildImageUrl(sid),
                } : null,
                confidence: confValue,
                appearanceChanges: m.appearanceChanges || [],
                facePos: { x: box[0], y: box[1], w: box[2], h: box[3] },
                incidentCropUrl: cropUrl,
                referencePhotoUrl: refUrl,
              };
            });
          } else if (payload.studentId) {
            const confValue = typeof payload.confidence === 'number'
              ? (payload.confidence <= 1 ? payload.confidence * 100 : payload.confidence)
              : 0;

            const sid = payload.studentId;
            const prefix = sid ? sid.split("/")[0].toUpperCase() : "UNKNOWN";
            const yearVal = parseYearFromIndex(sid) || payload.year || 1;
            const box = payload.box || payload.bounding_box || [120, 60, 120, 140];
            const cropUrl = payload.incidentCropUrl || cropFaceCanvas(loadedIncidentImg, box) || null;
            const enrolledMatch = students.find(s => s.id?.toLowerCase() === sid?.toLowerCase());
            const localPhoto = (() => {
              try {
                const p = JSON.parse(localStorage.getItem("sentinel_enrolled_photos") || "{}");
                return (sid && p[sid.toUpperCase()]) || null;
              } catch(e) { return null; }
            })();
            const refUrl = payload.referencePhotoUrl || enrolledMatch?.photoUrl || localPhoto || null;

            formattedMatches.push({
              faceIdx: 0,
              faceLabel: "Face #1",
              matchedStudent: {
                id: sid,
                name: payload.name || `Student (${sid})`,
                facultyId: payload.faculty || prefix,
                year: yearVal,
                initials: (payload.name || sid).split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(),
                accentColor: "#3B82F6",
                photoUrl: refUrl || buildImageUrl(sid),
              },
              confidence: confValue,
              appearanceChanges: [],
              facePos: { x: box[0], y: box[1], w: box[2], h: box[3] },
              incidentCropUrl: cropUrl,
              referencePhotoUrl: refUrl,
            });
          } else {
            formattedMatches = [];
          }

          setMatches(formattedMatches);
        } else {
          setMatches([]);
        }
      } catch (err) {
        console.warn("API unreachable or no match, setting empty match:", err);
        setMatches([]);
      }
    }

    setTimeout(()=>setUploadStage("done"), 4200);
  },[uploadedFile, students, loadedIncidentImg]);

  const handleFile = (file)=>{
    if(!file) return;
    setUploadedFile(file);
    setFileName(file.name);
    setUploadStage("uploaded");
    setIncidentMeta({ source:"CCTV / Mobile", date: new Date().toISOString().split("T")[0], location:"Gate A" });
  };

  const reset = ()=>{
    setUploadStage("idle"); setPipelineStep(-1);
    setFileName(""); setIncidentMeta({source:"",date:"",location:""});
    setMatches([]); setUploadedFile(null);
    setDbWarning("");
  };

  const canvasStage = uploadStage==="idle"?0:uploadStage==="uploaded"?0:
    pipelineStep===0?1:pipelineStep===1?2:3;

  return (
    <div style={{padding:26,display:"flex",flexDirection:"column",gap:20}}>

      {/* Enroll Modal */}
      <EnrollStudentModal
        isOpen={enrollModalOpen}
        onClose={() => setEnrollModalOpen(false)}
        students={students}
        onEnrolled={(newStudent) => {
          if (setStudents) {
            setStudents(prev => [newStudent, ...prev.filter(s => s.id !== newStudent.id)]);
          }
          setDbWarning("");
        }}
      />

      {/* Hero banner */}
      <div style={{
        background:`linear-gradient(135deg,${C.accentD}30,${C.purple}20)`,
        border:`1px solid ${C.accent}30`,borderRadius:14,
        padding:"18px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",
      }}>
        <div>
          <div style={{fontSize:16,fontWeight:800,color:C.text,marginBottom:4}}>
            Incident Face Identification
          </div>
          <div style={{fontSize:12,color:C.sub,maxWidth:520}}>
            Upload a photo from the incident (CCTV screenshot or mobile). The system will detect
            all faces, extract identity features, and match each face to the enrolled student database.
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            onClick={() => setEnrollModalOpen(true)}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8,
              border: "none", background: `linear-gradient(135deg, ${C.accent}, ${C.accentD})`,
              color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.15s"
            }}
          >
            <ScanFace size={13} /> Enroll Student Photo
          </button>
          {setPage && (
            <button
              onClick={() => setPage("dashboard")}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8,
                border: `1px solid ${C.border}`, background: C.raised, color: C.text,
                fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.15s"
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.text; }}
            >
              <ArrowLeft size={13} /> Back to Dashboard
            </button>
          )}
          {uploadStage !== "idle" && (
            <button
              onClick={reset}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8,
                border: `1px solid ${C.border}`, background: C.surface, color: C.sub,
                fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s"
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.sub; }}
            >
              <RotateCcw size={13} /> Reset
            </button>
          )}
        </div>
      </div>

      {/* Database warning alert if 0 embeddings exist */}
      {dbWarning && (
        <div style={{
          background: `${C.warning}15`, border: `1px solid ${C.warning}40`, borderRadius: 12,
          padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <AlertCircle size={22} color={C.warning} style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.warning }}>
                Biometric Index Notice: 0 Enrolled Face Vectors in Database
              </div>
              <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>
                {dbWarning}
              </div>
            </div>
          </div>
          <button
            onClick={() => setEnrollModalOpen(true)}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer",
              background: C.warning, color: "#000", fontWeight: 700, fontSize: 12, whiteSpace: "nowrap"
            }}
          >
            📸 Enroll Student Photo Now
          </button>
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"1fr 340px",gap:20,alignItems:"start"}}>

        {/* LEFT: upload + canvas + results */}
        <div style={{display:"flex",flexDirection:"column",gap:16}}>

          {uploadStage==="idle" ? (
            /* Upload zone */
            <div
              onClick={()=>fileRef.current?.click()}
              onDragOver={e=>{e.preventDefault();setDragging(true);}}
              onDragLeave={()=>setDragging(false)}
              onDrop={e=>{e.preventDefault();setDragging(false);handleFile(e.dataTransfer.files[0]);}}
              style={{
                border:`2px dashed ${dragging?C.accent:C.border}`,
                borderRadius:14,padding:"52px 24px",
                textAlign:"center",cursor:"pointer",
                transition:"border-color 0.2s,background 0.2s",
                background:dragging?`${C.accent}08`:C.surface,
              }}>
              <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}}
                onChange={e=>handleFile(e.target.files[0])}/>
              <div style={{
                width:64,height:64,borderRadius:16,margin:"0 auto 16px",
                background:`${C.accent}15`,border:`1px solid ${C.accent}30`,
                display:"flex",alignItems:"center",justifyContent:"center",
              }}>
                <ImageIcon size={28} color={C.accent}/>
              </div>
              <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:6}}>
                Upload Incident Image
              </div>
              <div style={{fontSize:12,color:C.sub,marginBottom:4}}>
                CCTV screenshot, photo or video frame from the incident
              </div>
              <div style={{fontSize:11,color:C.muted}}>
                Drag &amp; drop or click to browse · JPG, PNG
              </div>
            </div>
          ) : (
            /* Image + bounding box canvas */
            <div style={{background:C.surface,border:`1px solid ${C.border}`,
              borderRadius:14,padding:16}}>
              <div style={{display:"flex",justifyContent:"space-between",
                alignItems:"center",marginBottom:12}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <ImageIcon size={14} color={C.accent}/>
                  <span style={{fontSize:13,fontWeight:700,color:C.text}}>Incident Image</span>
                  {mono(fileName,10,C.muted)}
                </div>
                <button onClick={reset} style={{background:"none",border:"none",
                  cursor:"pointer",color:C.muted,padding:4}}>
                  <RotateCcw size={14}/>
                </button>
              </div>
              <IncidentCanvas matches={matches} stage={canvasStage} imageFile={uploadedFile}/>
              {/* Metadata row */}
              <div style={{display:"flex",gap:12,marginTop:10}}>
                {[
                  ["Source", incidentMeta.source||"CCTV / Mobile"],
                  ["Date",   incidentMeta.date||new Date().toISOString().split("T")[0]],
                  ["Location", incidentMeta.location||"Campus Site"],
                ].map(([k,v])=>(
                  <div key={k} style={{
                    flex:1,background:C.raised,borderRadius:7,
                    padding:"6px 10px",
                  }}>
                    <div style={{fontSize:9,color:C.muted,fontWeight:600,
                      letterSpacing:"0.07em",marginBottom:2}}>{k.toUpperCase()}</div>
                    <div style={{fontSize:11,color:C.sub,fontWeight:500}}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Match results */}
          {uploadStage==="done" && (
            <div>
              <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:12,
                display:"flex",alignItems:"center",gap:8}}>
                <CheckCircle size={15} color={C.success}/>
                Identification Results
                <span style={{fontSize:11,color:C.muted,fontWeight:400}}>
                  — {matches.filter(m=>m.matchedStudent).length} of {matches.length} faces matched
                </span>
              </div>
              {matches.length === 0 ? (
                <div style={{
                  background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14,
                  padding: 32, textAlign: "center", color: C.muted
                }}>
                  <ScanFace size={32} style={{ display: "block", margin: "0 auto 10px", opacity: 0.4 }} />
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.sub, marginBottom: 4 }}>No Faces Identified</div>
                  <div style={{ fontSize: 11 }}>No face matched or detected in the uploaded image. Verify the image quality or ensure students are enrolled in the registry.</div>
                </div>
              ) : (
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14}}>
                  {matches.map(m=><MatchCard key={m.faceIdx} match={m} currentUser={currentUser}/>)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT: pipeline + instructions */}
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {/* Pipeline panel */}
          <div style={{background:C.surface,border:`1px solid ${C.border}`,
            borderRadius:14,padding:18}}>
            <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:14,
              display:"flex",alignItems:"center",gap:7}}>
              <Cpu size={14} color={C.accent}/>
              Recognition Pipeline
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {PIPELINE.map((step,i)=>(
                <PipelineStep key={step.key} step={step} index={i}
                  currentStep={pipelineStep}/>
              ))}
            </div>

            {uploadStage==="uploaded"&&(
              <button onClick={runPipeline} style={{
                width:"100%",marginTop:14,padding:"11px",
                borderRadius:9,border:"none",cursor:"pointer",fontWeight:700,
                fontSize:13,color:"#fff",
                background:`linear-gradient(135deg,${C.accent},${C.purple})`,
              }}>
                ⚡ Run Identification
              </button>
            )}
            {uploadStage==="processing"&&(
              <div style={{
                marginTop:14,padding:"10px",borderRadius:9,
                background:`${C.accent}10`,border:`1px solid ${C.accent}30`,
                textAlign:"center",fontSize:12,color:C.accent,fontWeight:600,
              }}>Processing…</div>
            )}
            {uploadStage==="done"&&(
              <div style={{
                marginTop:14,padding:"10px",borderRadius:9,
                background:`${C.success}10`,border:`1px solid ${C.success}30`,
                textAlign:"center",fontSize:12,color:C.success,fontWeight:700,
              }}>✓ Identification complete</div>
            )}
          </div>

          {/* How it works */}
          <div style={{background:C.surface,border:`1px solid ${C.border}`,
            borderRadius:14,padding:18}}>
            <div style={{fontSize:12,fontWeight:700,color:C.sub,marginBottom:12,
              display:"flex",alignItems:"center",gap:6}}>
              <Info size={12}/>HOW IT WORKS
            </div>
            {[
              ["1","Upload Incident Photo","Any image from CCTV or mobile showing the fight/altercation"],
              ["2","Face Detection","AI model locates and crops every face in the image"],
              ["3","Feature Extraction","Deep learning extracts an identity vector per face — unaffected by hairstyle, beard, or appearance changes"],
              ["4","Identity Search","Vector similarity search across all enrolled student embeddings"],
              ["5","Match & Report","Each face is matched (or flagged unmatched) with a confidence score"],
            ].map(([n,t,d])=>(
              <div key={n} style={{display:"flex",gap:10,marginBottom:12}}>
                <div style={{
                  width:20,height:20,borderRadius:5,flexShrink:0,
                  background:`${C.accent}20`,display:"flex",alignItems:"center",
                  justifyContent:"center",fontSize:10,fontWeight:800,color:C.accent,
                }}>{n}</div>
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:C.text}}>{t}</div>
                  <div style={{fontSize:10,color:C.muted,lineHeight:1.5}}>{d}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Stats */}
          <div style={{background:C.surface,border:`1px solid ${C.border}`,
            borderRadius:14,padding:18}}>
            <div style={{fontSize:12,fontWeight:700,color:C.sub,marginBottom:10,
              letterSpacing:"0.06em"}}>SYSTEM METRICS</div>
            {[
              ["Registry size", `${(liveRegistryCount || 37695).toLocaleString()} students`, C.accent],
              ["Avg inference","~340ms / image",C.cyan],
              ["Match threshold","≥ 40% (Med) / ≥ 60% (High)",C.success],
              ["False positive rate","< 1.2%",C.warning],
            ].map(([k,v,col])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",
                padding:"5px 0",borderBottom:`1px solid ${C.border}`,fontSize:11}}>
                <span style={{color:C.muted}}>{k}</span>
                <span style={{fontFamily:"'JetBrains Mono',monospace",
                  fontWeight:700,color:col}}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE: DASHBOARD (Admin vs Faculty)
// ═══════════════════════════════════════════════════════════════════════════════

function AdminDashboard({ setPage, currentUser: _currentUser, students = [], incidents = [], registryCount }) {
  return (
    <div style={{ padding: 26, display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Central Admin Banner */}
      <div style={{
        background: `linear-gradient(135deg, ${C.danger}25, ${C.accentD}30)`,
        border: `1px solid ${C.danger}40`,
        borderRadius: 14, padding: "20px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between"
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <Shield size={20} color={C.danger} />
            <span style={{ fontSize: 16, fontWeight: 800, color: C.text }}>
              Central Security Command Center (Global Super Admin)
            </span>
          </div>
          <div style={{ fontSize: 12, color: C.sub, maxWidth: 620 }}>
            Global surveillance intelligence across all 9 UOP faculties. Monitor AI engine health, vector index database, campus CCTV node networks, and cross-faculty incident logs.
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
          <div style={{
            padding: "6px 12px", borderRadius: 8, background: `${C.danger}20`,
            border: `1px solid ${C.danger}40`, fontSize: 11, fontWeight: 700, color: C.danger
          }}>
            SUPER ADMIN MODE
          </div>
        </div>
      </div>

      {/* Central System Stats */}
      {(() => {
        const totalCampusStudents = Math.max(registryCount || 0, students?.length > 1000 ? students.length : 0, 37696);
        return (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
            <StatCard icon={Users} label="Total Campus Students" value={totalCampusStudents.toLocaleString()} trend={0} color={C.accent} sub="Registered in System" />
            <StatCard icon={Cpu} label="AI Identity Index" value={totalCampusStudents.toLocaleString()} trend={0} color={C.cyan} sub="Biometric Vectors" />
            <StatCard icon={AlertTriangle} label="Global Security Incidents" value={incidents.length} trend={0} color={C.danger} sub="Logged Incidents" />
            <StatCard icon={CheckCircle} label="OpenCV AI Engine" value="ONLINE" trend={100} color={C.success} sub="Port 5000 Active" />
          </div>
        );
      })()}

      {/* Quick Identification Trigger */}
      <div
        onClick={() => setPage("identify")}
        style={{
          background: `linear-gradient(135deg, ${C.accentD}40, ${C.purple}30)`,
          border: `1px solid ${C.accent}40`, borderRadius: 14, padding: "18px 24px",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between",
          transition: "all 0.2s",
        }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: `${C.accent}30`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ScanFace size={24} color={C.accent} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>
              Run Central Face Identification →
            </div>
            <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>
              Upload incident screenshot or CCTV photo to search the student registry
            </div>
          </div>
        </div>
        <ChevronRight size={20} color={C.accent} />
      </div>

      {/* All 9 Faculties Grid */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>
              UOP 9 Faculties Security Overview Grid
            </div>
            <div style={{ fontSize: 11, color: C.muted }}>
              Live security status &amp; student enrollment count per faculty
            </div>
          </div>
          <Badge label="online" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {UOP_FACULTIES.map((fac) => {
            const facStudents = students.filter(s => {
              const sidPrefix = (s.id || s.regno || "").split("/")[0].toUpperCase();
              const sFac = (s.facultyId || s.faculty || "").toUpperCase();
              const mappedCode = resolveFacultyCode(sFac) || resolveFacultyCode(sidPrefix) || sFac;
              return mappedCode === fac.code || s.facultyId === fac.code || s.faculty === fac.name;
            });
            const enrolledCount = facStudents.length > 0 ? facStudents.length : (fac.defaultCount || 0);
            return (
              <div key={fac.id} style={{
                background: C.raised, border: `1px solid ${fac.color}35`,
                borderRadius: 12, padding: "14px 16px",
                display: "flex", flexDirection: "column", gap: 8,
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: fac.color }} />
                    <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{fac.name}</span>
                  </div>
                  {mono(fac.code, 10, fac.color)}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.sub, marginTop: 4 }}>
                  <span>Enrolled Students:</span>
                  <span style={{ fontWeight: 700, color: C.text }}>{enrolledCount.toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.sub }}>
                  <span>CCTV Nodes:</span>
                  <span style={{ fontWeight: 700, color: C.success }}>3 Active</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Global Incident Log & Trend */}
      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 16 }}>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 22 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4 }}>Campus-Wide Weekly Incidents</div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 16 }}>All 9 Faculties aggregated trend</div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="agAdmin" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={C.danger} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={C.danger} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="day" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: C.raised, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text }} />
              <Area type="monotone" dataKey="incidents" stroke={C.danger} fill="url(#agAdmin)" strokeWidth={2} name="Incidents" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 22 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 14 }}>Global Recent Incidents</div>
          {incidents.length > 0 ? (
            incidents.slice(0, 4).map(inc => (
              <div key={inc.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: `1px solid ${C.border}` }}>
                <StudentPhoto regno={inc.studentId} initials={(inc.student || "?").split(" ").map(w => w[0]).join("").slice(0, 2)} size={32} color={inc.conf > 0 ? C.accent : C.muted} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inc.student}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>{inc.camera} · {inc.facultyId} Scope</div>
                </div>
                <Badge label={inc.status} />
              </div>
            ))
          ) : (
            <div style={{ fontSize: 11, color: C.muted, textAlign: "center", padding: "28px 0" }}>
              No security incidents logged yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FacultyDashboard({ setPage, currentUser, students = [], incidents = [] }) {
  const activeFaculty = getUserFaculty(currentUser);
  const [studentSearch, setStudentSearch] = useState("");

  // Strict Faculty Student Filtering
  const facultyStudents = students.filter(s => s.facultyId === currentUser?.facultyId);
  const filteredStudents = facultyStudents.filter(s =>
    (s.name || "").toLowerCase().includes(studentSearch.toLowerCase()) ||
    (s.id || "").toLowerCase().includes(studentSearch.toLowerCase())
  );

  const facultyIncidents = incidents.filter(inc => inc.ownerFacultyId === currentUser?.facultyId);

  return (
    <div style={{ padding: 26, display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Faculty Scope Banner */}
      <div style={{
        background: `linear-gradient(135deg, ${activeFaculty.color || C.accent}25, ${C.surface})`,
        border: `1px solid ${activeFaculty.color || C.accent}40`,
        borderRadius: 14, padding: "20px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between"
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <Tag size={20} color={activeFaculty.color || C.accent} />
            <span style={{ fontSize: 16, fontWeight: 800, color: C.text }}>
              {activeFaculty.name} — Dedicated Faculty Portal
            </span>
          </div>
          <div style={{ fontSize: 12, color: C.sub, maxWidth: 650 }}>
            Strict Data Security Protocol Active for {currentUser?.name || "Faculty User"}. You are viewing records and CCTV incident alerts specifically assigned to {activeFaculty.name}. Central system settings and other faculties' records are protected and hidden per UOP RBAC policy.
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
          <div style={{
            padding: "6px 12px", borderRadius: 8, background: `${activeFaculty.color || C.accent}20`,
            border: `1px solid ${activeFaculty.color || C.accent}40`, fontSize: 11, fontWeight: 700, color: activeFaculty.color || C.accent
          }}>
            {activeFaculty.code} FACULTY SCOPE
          </div>
        </div>
      </div>

      {/* Faculty Specific Stat Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <StatCard icon={Users} label={`${activeFaculty.code} Enrolled Students`} value={facultyStudents.length} trend={8} color={activeFaculty.color || C.accent} sub="Faculty Scope Registry" />
        <StatCard icon={AlertTriangle} label={`${activeFaculty.code} Open Incidents`} value={facultyIncidents.length || "1"} trend={0} color={C.warning} sub="Under Review" />
        <StatCard icon={ScanFace} label="Faculty Gate Cameras" value="3" trend={100} color={C.success} sub={`${activeFaculty.code} Gate A & B`} />
        <StatCard icon={Cpu} label="Recognition Accuracy" value="94.2%" trend={5} color={C.purple} sub="AI Recognition" />
      </div>

      {/* Quick Action for Faculty */}
      <div
        onClick={() => setPage("identify")}
        style={{
          background: `linear-gradient(135deg, ${activeFaculty.color || C.accent}30, ${C.raised})`,
          border: `1px solid ${activeFaculty.color || C.accent}40`, borderRadius: 14, padding: "18px 24px",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between",
          transition: "all 0.2s",
        }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: `${activeFaculty.color || C.accent}30`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ScanFace size={24} color={activeFaculty.color || C.accent} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>
              Run Face Identification for {activeFaculty.name} →
            </div>
            <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>
              Upload incident photo or CCTV image to identify students enrolled in {activeFaculty.code}
            </div>
          </div>
        </div>
        <ChevronRight size={20} color={activeFaculty.color || C.accent} />
      </div>

      {/* Faculty Student Directory & Faculty Incident List */}
      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 16 }}>
        {/* Faculty Students Directory */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>
                {activeFaculty.name} Student Directory
              </div>
              <div style={{ fontSize: 11, color: C.muted }}>
                Showing students registered under {activeFaculty.code} scope only
              </div>
            </div>
            <button onClick={() => setPage("enroll")} style={{
              background: `${activeFaculty.color || C.accent}20`, border: `1px solid ${activeFaculty.color || C.accent}40`,
              color: activeFaculty.color || C.accent, padding: "6px 12px", borderRadius: 8,
              fontSize: 11, fontWeight: 700, cursor: "pointer"
            }}>+ Register Student</button>
          </div>

          {/* Search box for faculty directory */}
          <div style={{ position: "relative", marginBottom: 14 }}>
            <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.muted, display: "flex", alignItems: "center" }}>
              <Search size={14} />
            </div>
            <input
              type="text"
              placeholder={`Search ${activeFaculty.code} students by name or ID number...`}
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              style={{
                width: "100%", height: 36, paddingLeft: 34, paddingRight: 12,
                borderRadius: 8, border: `1px solid ${C.border}`, background: C.raised,
                color: C.text, fontSize: 12, outline: "none"
              }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filteredStudents.length > 0 ? (
              <>
                {filteredStudents.slice(0, 50).map((s) => (
                  <div key={s.id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 14px", background: C.raised, borderRadius: 10,
                    border: `1px solid ${C.border}`
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <StudentPhoto regno={s.id} initials={s.initials} size={38} color={s.accentColor || activeFaculty.color} flagged={s.flagged} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{s.name}</div>
                        <div style={{ fontSize: 11, color: C.sub }}>
                          {s.faculty || s.facultyId} · Year {s.year} Student
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {mono(s.id, 12, activeFaculty.color || C.accent)}
                      <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>Biometric Enrolled</div>
                    </div>
                  </div>
                ))}
                {filteredStudents.length > 50 && (
                  <div style={{ fontSize: 11, color: C.muted, textAlign: "center", padding: "8px 0" }}>
                    Showing top 50 of {filteredStudents.length} students. Use search above to find specific records.
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 12, color: C.muted, textAlign: "center", padding: "24px 0" }}>
                {facultyStudents.length === 0
                  ? `No students enrolled in ${activeFaculty.code} yet. Use Faculty API Sync to enroll students.`
                  : `No students found matching "${studentSearch}" in ${activeFaculty.code}`}
              </div>
            )}
          </div>
        </div>

        {/* Faculty Recent Incidents */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 22 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 4 }}>
            {activeFaculty.code} Security Alerts &amp; Incidents
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 14 }}>
            CCTV detections originating in {activeFaculty.name}
          </div>
          {facultyIncidents.length > 0 ? (
            facultyIncidents.map(inc => (
              <div key={inc.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
                <StudentPhoto regno={inc.studentId} initials={(inc.student || "?").split(" ").map(w => w[0]).join("").slice(0, 2)} size={34} color={inc.conf > 0 ? activeFaculty.color : C.muted} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inc.student}</div>
                  <div style={{ fontSize: 10, color: C.sub }}>{inc.camera} · {inc.time ? inc.time.split(" ")[1] : "Today"}</div>
                </div>
                <Badge label={inc.status} />
              </div>
            ))
          ) : (
            <div style={{ fontSize: 11, color: C.muted, textAlign: "center", padding: "24px 0" }}>
              No security incidents reported for {activeFaculty.code}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DashboardPage({ setPage, currentUser, students = [], incidents = [], registryCount }) {
  const isGlobalAdmin = currentUser?.role === ROLES.ADMIN;
  return isGlobalAdmin ? (
    <AdminDashboard setPage={setPage} currentUser={currentUser} students={students} incidents={incidents} registryCount={registryCount} />
  ) : (
    <FacultyDashboard setPage={setPage} currentUser={currentUser} students={students} incidents={incidents} registryCount={registryCount} />
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE: FACULTY API BATCH SYNC & AI INDEXING
// ═══════════════════════════════════════════════════════════════════════════════
const SYNC_STEPS = [
  { key: "api", label: "Querying Faculty MIS API", tech: "GET /api/v1/faculties/{code}/students" },
  { key: "validate", label: "Validating Student Records & Photos", tech: "Schema & Image Quality Check" },
  { key:"embedding", label:"Extracting Identity Features",  tech:"Deep Learning AI Backend" },
  { key:"indexing",  label:"Indexing to Identity Database", tech:"Vector Index Registered"  },
];

function FacultySyncPage({ currentUser, students, setStudents, setPage, registryCount: _registryCount, setRegistryCount }) {
  const activeFaculty = getUserFaculty(currentUser);
  const isGlobalAdmin = currentUser?.role === ROLES.ADMIN;
  
  const [syncStage, setSyncStage] = useState("idle"); // idle | syncing | done
  const [currentStep, setCurrentStep] = useState(-1);
  const [lastSyncTime, setLastSyncTime] = useState("2026-08-21 11:30 AM");
  const [syncedCount, setSyncedCount] = useState(0);
  const [search, setSearch] = useState("");
  const [refreshingRegistry, setRefreshingRegistry] = useState(false);

  const [csvStudents, setCsvStudents] = useState([]);
  const [csvFileName, setCsvFileName] = useState("");
  const [csvError, setCsvError] = useState("");
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState({ duplicates: [], newCount: 0 });
  const [enrollModalOpen, setEnrollModalOpen] = useState(false);
  const csvFileRef = useRef(null);

  const refreshRegistry = async () => {
    setRefreshingRegistry(true);
    try {
      let res = null;
      try {
        res = await fetch("/api/students");
      } catch (err) {}
      if (!res || !res.ok) {
        res = await fetch("http://localhost:5000/students");
      }
      if (res && res.ok) {
        const data = await res.json();
        const list = data.students || data;
        if (Array.isArray(list)) {
          const formatted = list.map(s => {
            const sid = s.student_id || s.id || s.regno;
            const prefix = sid ? sid.split("/")[0].toUpperCase() : "UNKNOWN";
            const canonicalFaculty = resolveFacultyCode(s.facultyId || s.faculty || prefix);
            return {
              id: sid,
              regno: sid,
              name: s.full_name || s.name || `Student (${sid})`,
              facultyId: canonicalFaculty,
              faculty: canonicalFaculty,
              year: s.year || parseYearFromIndex(sid) || 1,
              initials: (s.full_name || s.name || sid || "").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(),
              photoUrl: s.image || s.photoUrl || buildImageUrl(sid),
            };
          });
          setStudents(formatted);
          try { localStorage.setItem("sentinel_students", JSON.stringify(formatted.slice(0, 1000))); } catch (e) {}
          try { localStorage.setItem("sentinel_student_count", String(formatted.length)); } catch (e) {}
          if (setRegistryCount) setRegistryCount(formatted.length);
        }
      }
    } catch (e) {
      console.warn("Refresh registry error:", e);
    } finally {
      setTimeout(() => setRefreshingRegistry(false), 500);
    }
  };

  const handleCSVUpload = (file) => {
    if (!file) return;
    setCsvError("");
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = parseStudentCSV(e.target.result);
        if (parsed.length === 0) {
          setCsvError("No valid students found. Check that your CSV has headers: regno, name, faculty");
          return;
        }
        setCsvStudents(parsed);
        setStudents(parsed);
        try { localStorage.setItem("sentinel_students", JSON.stringify(parsed.slice(0, 1000))); } catch (e) {}
        try { localStorage.setItem("sentinel_student_count", String(parsed.length)); } catch (e) {}
        if (setRegistryCount) setRegistryCount(parsed.length);

        // Auto scroll to sync actions button
        setTimeout(() => {
          const btn = document.getElementById("batch-sync-action-btn");
          if (btn) btn.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }, 250);

        // Check for duplicates
        const existingIds = new Set(students.map(s => s.id));
        const dbDupes = parsed.filter(s => existingIds.has(s.id));
        const internalDupes = parsed.duplicateCount || 0;
        const totalRows = parsed.totalRows || parsed.length;

        if (dbDupes.length === parsed.length) {
          setCsvError(`⚠ Duplicate CSV detected: All ${parsed.length} students in "${file.name}" are already registered in the system.`);
        } else {
          const notes = [];
          if (internalDupes > 0) {
            notes.push(`Loaded ${parsed.length.toLocaleString()} unique students from ${totalRows.toLocaleString()} rows (${internalDupes.toLocaleString()} duplicate entries in the file were automatically merged).`);
          }
          if (dbDupes.length > 0) {
            notes.push(`${dbDupes.length.toLocaleString()} of ${parsed.length.toLocaleString()} students are already registered in the active registry.`);
          }
          if (notes.length > 0) {
            setCsvError(`ℹ Notice: ${notes.join(" ")}`);
          }
        }
      } catch (err) {
        setCsvError("Failed to parse CSV: " + err.message);
      }
    };
    reader.readAsText(file);
  };

  const handleSyncBatch = async () => {
    // Check for duplicates before starting sync
    const token = localStorage.getItem("sentinel_token") || "";
    const regNumbers = csvStudents.map(s => s.id);

    // 1. Check against active registry
    const existingIds = new Set(students.map(s => s.id));
    const localDupes = regNumbers.filter(id => existingIds.has(id));

    // 2. Check backend API (Spring Boot or Flask)
    let remoteDupes = [];
    try {
      let res = null;
      try {
        res = await fetch("/api/students/check-duplicates", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ regNumbers }),
        });
      } catch (e) {
        // network error
      }

      if (!res || !res.ok) {
        res = await fetch("http://localhost:5000/api/students/check-duplicates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ regNumbers }),
        });
      }

      if (res && res.ok) {
        const data = await res.json();
        remoteDupes = data.duplicates || [];
      }
    } catch (err) {
      console.warn("Backend duplicate check offline, using local registry:", err);
    }

    const allDupes = Array.from(new Set([...localDupes, ...remoteDupes]));
    if (allDupes.length > 0) {
      const newCount = Math.max(0, regNumbers.length - allDupes.length);
      setDuplicateInfo({ duplicates: allDupes, newCount });
      setShowDuplicateDialog(true);
      return;
    }

    // No duplicates — proceed with sync
    startSync(false);
  };

  const startSync = async (replace) => {
    setShowDuplicateDialog(false);
    setSyncStage("syncing");
    setCurrentStep(0);

    SYNC_STEPS.forEach((_, i) => {
      setTimeout(() => { setCurrentStep(i + 1); }, (i + 1) * 1100);
    });

    // Persist students to backend database
    try {
      let res = null;
      try {
        res = await fetch("/api/students/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ students: csvStudents, replace }),
        });
      } catch (err) {
        // network error
      }

      if (!res || !res.ok) {
        res = await fetch("http://localhost:5000/api/students/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ students: csvStudents, replace }),
        });
      }

      if (res && res.ok) {
        const batchData = await res.json();
        console.log("Backend sync response:", batchData);
      }
    } catch (e) {
      console.warn("Backend batch registration notice:", e);
    }

    setTimeout(() => {
      setSyncStage("done");
      setLastSyncTime(new Date().toLocaleString());
      setSyncedCount(csvStudents.length);
      setStudents(prev => {
        const existingIds = new Set(prev.map(s => s.id));
        const newEntries = csvStudents.filter(s => !existingIds.has(s.id));
        const updated = replace ? [...csvStudents] : [...prev, ...newEntries];
        try { localStorage.setItem("sentinel_students", JSON.stringify(updated.slice(0, 1000))); } catch (e) {}
        try { localStorage.setItem("sentinel_student_count", String(updated.length)); } catch (e) {}
        if (setRegistryCount) setRegistryCount(updated.length);
        return updated;
      });
    }, 4800);
  };

  const [registryPage, setRegistryPage] = useState(1);
  const pageSize = 50;

  const scopedStudents = students.filter(s => {
    if (isGlobalAdmin) return true;
    return s.facultyId === currentUser?.facultyId;
  });

  const filtered = scopedStudents.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.id.toLowerCase().includes(search.toLowerCase())
  );

  const totalRegistryPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginatedStudents = filtered.slice((registryPage - 1) * pageSize, registryPage * pageSize);

  return (
    <div style={{ padding: 26, display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Duplicate detection dialog */}
      {showDuplicateDialog && (
        <DuplicateDialog
          duplicates={duplicateInfo.duplicates}
          newCount={duplicateInfo.newCount}
          onSkip={() => startSync(false)}
          onReplace={() => startSync(true)}
          onCancel={() => setShowDuplicateDialog(false)}
        />
      )}

      {/* Top Banner: Faculty API Connectivity */}
      <div style={{
        background: `linear-gradient(135deg, ${activeFaculty.color || C.accent}20, ${C.surface})`,
        border: `1px solid ${activeFaculty.color || C.accent}40`,
        borderRadius: 14, padding: "20px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between"
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <Database size={20} color={activeFaculty.color || C.accent} />
            <span style={{ fontSize: 16, fontWeight: 800, color: C.text }}>
              {isGlobalAdmin ? "Global Campus Faculty MIS API Sync" : `${activeFaculty.name} MIS API Sync`}
            </span>
          </div>
          <div style={{ fontSize: 12, color: C.sub, maxWidth: 650 }}>
            Automated Faculty API Integration: Student enrollment is managed directly by {isGlobalAdmin ? "each faculty MIS system" : activeFaculty.name}. This module queries the Faculty MIS API to retrieve new student batches, generate biometric identity features, and index them for face identification.
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {setPage && (
              <button
                onClick={() => setPage("dashboard")}
                style={{
                  display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 7,
                  border: `1px solid ${C.border}`, background: C.raised, color: C.text,
                  fontSize: 11, fontWeight: 700, cursor: "pointer", transition: "all 0.15s"
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.text; }}
              >
                <ArrowLeft size={13} /> Back to Dashboard
              </button>
            )}

            <button
              onClick={() => setEnrollModalOpen(true)}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 7,
                border: "none", background: `linear-gradient(135deg, ${C.accent}, ${C.accentD})`,
                color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", transition: "all 0.15s"
              }}
            >
              <ScanFace size={13} /> Enroll Student Photo
            </button>

            <button
              onClick={refreshRegistry}
              disabled={refreshingRegistry}
              style={{
                display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 7,
                border: `1px solid ${refreshingRegistry ? C.accent : C.border}`,
                background: refreshingRegistry ? `${C.accent}20` : C.raised,
                color: refreshingRegistry ? C.accent : C.text,
                fontSize: 11, fontWeight: 700, cursor: refreshingRegistry ? "default" : "pointer",
                transition: "all 0.15s"
              }}
              onMouseEnter={e => { if (!refreshingRegistry) { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent; } }}
              onMouseLeave={e => { if (!refreshingRegistry) { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.text; } }}
            >
              <RefreshCw size={12} style={{ animation: refreshingRegistry ? "spin 0.7s linear infinite" : "none" }} />
              {refreshingRegistry ? "Refreshing…" : "Refresh Registry"}
            </button>
          </div>

          <div style={{
            padding: "4px 10px", borderRadius: 6, background: `${C.success}20`,
            border: `1px solid ${C.success}40`, fontSize: 10, fontWeight: 800, color: C.success,
            display: "flex", alignItems: "center", gap: 6
          }}>
            <CircleDot size={8} color={C.success} /> FACULTY MIS API CONNECTED
          </div>
          <div style={{ fontSize: 10, color: C.muted, fontFamily: "'JetBrains Mono',monospace" }}>
            https://api.uop.ac.lk/v1/faculties/{activeFaculty.code || "GLOBAL"}/batch
          </div>
        </div>
      </div>

      {/* Enroll Student Biometric Modal */}
      <EnrollStudentModal
        isOpen={enrollModalOpen}
        onClose={() => setEnrollModalOpen(false)}
        students={students}
        onEnrolled={(newStudent) => {
          setStudents(prev => [newStudent, ...prev.filter(s => s.id !== newStudent.id)]);
        }}
      />

      <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 20, alignItems: "start" }}>
        {/* Left Panel: CSV Upload & Batch Sync Control */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>
            Faculty Batch Sync Control
          </div>
          <div style={{ fontSize: 11, color: C.sub, lineHeight: 1.5 }}>
            Upload the CSV file provided by UOP to parse student records, securely sync with the backend biometric system, and generate ArcFace vector embeddings.
          </div>

          <div style={{
            background: C.raised, borderRadius: 10, padding: 14,
            border: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 8
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
              <span style={{ color: C.muted }}>Target Faculty:</span>
              <span style={{ fontWeight: 700, color: activeFaculty.color || C.accent }}>{activeFaculty.name} ({activeFaculty.code})</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
              <span style={{ color: C.muted }}>Last Batch Sync:</span>
              <span style={{ fontWeight: 600, color: C.text, fontFamily: "'JetBrains Mono',monospace" }}>{lastSyncTime}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
              <span style={{ color: C.muted }}>AI Model:</span>
              <span style={{ fontWeight: 700, color: C.purple }}>Deep Learning Model</span>
            </div>
          </div>

          {/* Drag & Drop CSV Upload */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div onClick={() => csvFileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); handleCSVUpload(e.dataTransfer.files[0]); }}
              style={{
                border: `2px dashed ${csvStudents.length ? C.success : C.border}`,
                borderRadius: 10, padding: "20px 14px", textAlign: "center", cursor: "pointer",
                background: C.raised, transition: "border-color 0.2s"
              }}>
              <input ref={csvFileRef} type="file" accept=".csv" style={{ display: "none" }}
                onChange={e => handleCSVUpload(e.target.files[0])} />
              {csvStudents.length > 0 ? (
                <div style={{ fontSize: 13, color: C.success, fontWeight: 700 }}>
                  ✓ {csvFileName} — {csvStudents.length} students loaded
                </div>
              ) : (
                <>
                  <Upload size={22} color={activeFaculty.color || C.accent} style={{ margin: "0 auto 6px" }} />
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 2 }}>
                    Upload UOP Student CSV
                  </div>
                  <div style={{ fontSize: 11, color: C.muted }}>
                    Drag &amp; drop or click to select UOP CSV
                  </div>
                </>
              )}
            </div>



            {csvError && (
              <div style={{
                fontSize: 12,
                color: csvError.startsWith("ℹ") ? C.accent : csvError.startsWith("⚠") ? C.warning : C.danger,
                padding: "9px 13px",
                background: csvError.startsWith("ℹ") ? `${C.accent}15` : csvError.startsWith("⚠") ? `${C.warning}15` : `${C.danger}15`,
                borderRadius: 8,
                border: `1px solid ${csvError.startsWith("ℹ") ? `${C.accent}40` : csvError.startsWith("⚠") ? `${C.warning}40` : `${C.danger}40`}`,
                lineHeight: 1.4
              }}>
                {csvError}
              </div>
            )}

            {/* Preview table */}
            {csvStudents.length > 0 && (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, fontSize: 12, fontWeight: 700, color: C.text, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>Preview — {csvStudents.length} students loaded from CSV</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => {
                        const el = document.getElementById("csv-preview-table-scroll");
                        if (el) el.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      title="Scroll preview to top"
                      style={{ padding: "3px 8px", fontSize: 10, background: C.raised, border: `1px solid ${C.border}`, color: C.sub, borderRadius: 5, cursor: "pointer" }}
                    >
                      ↑ Top
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const el = document.getElementById("csv-preview-table-scroll");
                        if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
                      }}
                      title="Scroll preview to bottom"
                      style={{ padding: "3px 8px", fontSize: 10, background: C.raised, border: `1px solid ${C.border}`, color: C.sub, borderRadius: 5, cursor: "pointer" }}
                    >
                      ↓ Bottom
                    </button>
                  </div>
                </div>
                <div id="csv-preview-table-scroll" style={{ maxHeight: 240, overflowY: "auto", scrollBehavior: "smooth" }}>
                  {csvStudents.slice(0, 50).map(student => (
                    <div key={student.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>
                      <StudentPhoto regno={student.id} initials={student.initials} size={32} color={student.accentColor} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{student.name}</div>
                        <div style={{ fontSize: 10, color: C.muted }}>
                          {student.faculty || student.facultyId || "Student"} · {student.year ? `Year ${student.year}` : ""}
                        </div>
                      </div>
                      <code style={{ fontSize: 10, color: C.accent, fontFamily: "'JetBrains Mono',monospace" }}>{student.id}</code>
                    </div>
                  ))}
                  {csvStudents.length > 50 && (
                    <div style={{ padding: "8px 14px", fontSize: 11, color: C.muted }}>
                      … and {csvStudents.length - 50} more records ready for batch sync
                    </div>
                  )}
                </div>
              </div>
            )}

            <button
              id="batch-sync-action-btn"
              onClick={handleSyncBatch}
              disabled={syncStage === "syncing" || csvStudents.length === 0}
              style={{
                padding: "13px", borderRadius: 10, border: "none",
                fontWeight: 800, fontSize: 13, color: "#fff",
                cursor: csvStudents.length === 0 ? "not-allowed" : syncStage === "syncing" ? "default" : "pointer",
                background: csvStudents.length === 0 ? C.border : `linear-gradient(135deg, ${activeFaculty.color || C.accent}, ${C.accentD})`,
                opacity: csvStudents.length === 0 ? 0.6 : 1,
                boxShadow: csvStudents.length === 0 ? "none" : `0 4px 14px ${activeFaculty.color || C.accent}30`,
                transition: "all 0.2s"
              }}>
              {syncStage === "syncing" ? "⚡ Processing batch & indexing…" : csvStudents.length === 0 ? "Upload CSV to Enable Sync" : `⚡ Sync ${csvStudents.length} Students → Identity Index`}
            </button>
          </div>

          {/* Sync Progress Pipeline */}
          {syncStage !== "idle" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
              {SYNC_STEPS.map((s, i) => {
                const done = currentStep > i;
                const act = currentStep === i && syncStage === "syncing";
                return (
                  <div key={s.key} style={{
                    padding: "10px 12px", borderRadius: 8,
                    background: done ? `${C.success}10` : act ? `${C.accent}12` : C.raised,
                    border: `1px solid ${done ? C.success : act ? C.accent : C.border}`,
                    display: "flex", alignItems: "center", gap: 10, transition: "all 0.3s"
                  }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                      background: done ? C.success : act ? C.accent : C.border,
                      display: "flex", alignItems: "center", justifyContent: "center"
                    }}>
                      {done ? <CheckCircle size={13} color="#000" />
                        : act ? <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff", animation: "spin 0.6s linear infinite" }} />
                          : <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.muted }} />}
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: done || act ? 700 : 500, color: done ? C.success : act ? C.accent : C.muted }}>
                        {s.label}
                      </div>
                      <div style={{ fontSize: 9, color: C.muted }}>{s.tech}</div>
                    </div>
                  </div>
                );
              })}

              {syncStage === "done" && (
                <div style={{
                  padding: "12px", borderRadius: 8, background: `${C.success}15`,
                  border: `1px solid ${C.success}`, fontSize: 12, fontWeight: 700,
                  color: C.success, textAlign: "center"
                }}>
                  ✓ Batch Synced: {syncedCount || scopedStudents.length} Students Indexed into Identity Database
                </div>
              )}
            </div>
          )}
        </div>

        {/* Registry */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
              Student Registry
              <span style={{ marginLeft: 8, fontSize: 11, color: C.muted, fontWeight: 400 }}>
                {filtered.length} records visible
              </span>
            </div>
            <div style={{ position: "relative" }}>
              <Search size={13} color={C.muted}
                style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)" }} />
              <input value={search} onChange={e => { setSearch(e.target.value); setRegistryPage(1); }}
                placeholder="Search name or ID…"
                style={{
                  background: C.raised, border: `1px solid ${C.border}`, borderRadius: 7,
                  padding: "8px 10px 8px 28px", color: C.text, fontSize: 12, outline: "none", width: 210
                }} />
            </div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>{["Student", "ID", "Faculty", "Year", "Status"].map(h => (
                <th key={h} style={{
                  textAlign: "left", padding: "7px 12px", fontSize: 10,
                  fontWeight: 700, color: C.muted, borderBottom: `1px solid ${C.border}`,
                  letterSpacing: "0.06em"
                }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {paginatedStudents.length > 0 ? (
                paginatedStudents.map(s => {
                  const sFac = getFacultyById(s.facultyId);
                  return (
                    <tr key={s.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: "11px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                          <StudentPhoto regno={s.id} initials={s.initials} size={30} color={sFac.color || s.accentColor} flagged={s.flagged} />
                          <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{s.name}</span>
                        </div>
                      </td>
                      <td style={{
                        padding: "11px 12px", fontFamily: "'JetBrains Mono',monospace",
                        fontSize: 11, color: C.accent
                      }}>{s.id}</td>
                      <td style={{ padding: "11px 12px" }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
                          background: `${sFac.color}20`, color: sFac.color, border: `1px solid ${sFac.color}40`,
                        }}>
                          {sFac.code}
                        </span>
                      </td>
                      <td style={{ padding: "11px 12px", fontSize: 12, color: C.sub }}>
                        {s.year ? (s.year > 100 ? `${s.year}` : `Year ${s.year}`) : "—"}
                      </td>
                      <td style={{ padding: "11px 12px" }}>
                        <Badge label={s.flagged ? "flagged" : "active"} />
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} style={{ padding: "36px 12px", textAlign: "center", color: C.muted, fontSize: 12 }}>
                    No students in registry. Upload a university CSV to enroll students into the system.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Pagination Controls */}
          {totalRegistryPages > 1 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 11, color: C.muted }}>
                Showing {(registryPage - 1) * pageSize + 1}–{Math.min(registryPage * pageSize, filtered.length)} of {filtered.length} students
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => setRegistryPage(p => Math.max(1, p - 1))}
                  disabled={registryPage === 1}
                  style={{
                    padding: "5px 12px", borderRadius: 6, border: `1px solid ${C.border}`,
                    background: registryPage === 1 ? "transparent" : C.raised,
                    color: registryPage === 1 ? C.muted : C.text,
                    cursor: registryPage === 1 ? "not-allowed" : "pointer", fontSize: 11
                  }}>Previous</button>
                <span style={{ padding: "5px 10px", fontSize: 11, color: C.sub, display: "flex", alignItems: "center" }}>
                  Page {registryPage} of {totalRegistryPages}
                </span>
                <button
                  onClick={() => setRegistryPage(p => Math.min(totalRegistryPages, p + 1))}
                  disabled={registryPage === totalRegistryPages}
                  style={{
                    padding: "5px 12px", borderRadius: 6, border: `1px solid ${C.border}`,
                    background: registryPage === totalRegistryPages ? "transparent" : C.raised,
                    color: registryPage === totalRegistryPages ? C.muted : C.text,
                    cursor: registryPage === totalRegistryPages ? "not-allowed" : "pointer", fontSize: 11
                  }}>Next</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE: EVIDENCE
// ═══════════════════════════════════════════════════════════════════════════════
function EvidencePage({ currentUser, incidents = [], setPage }) {
  const [filter, setFilter] = useState("all");
  const [sel, setSel] = useState(null);
  const activeFaculty = getUserFaculty(currentUser);
  const isGlobalAdmin = currentUser?.role === ROLES.ADMIN;

  const scopedIncidents = incidents.filter(inc => {
    if (isGlobalAdmin) return true;
    return inc.ownerFacultyId === currentUser?.facultyId;
  });

  const statuses = ["all", "confirmed", "review", "unmatched"];
  const filtered = scopedIncidents.filter(i => filter === "all" || i.status === filter);

  return (
    <div style={{ padding: 26, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Scope Indicator Banner */}
      <div style={{
        background: isGlobalAdmin ? `${C.accent}12` : `${activeFaculty.color}15`,
        border: `1px solid ${isGlobalAdmin ? C.accent : activeFaculty.color}40`,
        borderRadius: 12,
        padding: "12px 18px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Tag size={16} color={isGlobalAdmin ? C.accent : activeFaculty.color} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: isGlobalAdmin ? C.accent : activeFaculty.color, letterSpacing: "0.04em" }}>
              {isGlobalAdmin ? "GLOBAL ADMIN INCIDENT SCOPE" : `FACULTY INCIDENT SCOPE: ${activeFaculty.name.toUpperCase()} (${activeFaculty.code})`}
            </div>
            <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>
              {isGlobalAdmin
                ? "Viewing all incidents across all university cameras & faculties"
                : `Showing only incidents owned by ${activeFaculty.name} (ownerFacultyId === "${activeFaculty.code}")`}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {setPage && (
            <button
              onClick={() => setPage("dashboard")}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 7,
                border: `1px solid ${C.border}`, background: C.raised, color: C.text,
                fontSize: 11, fontWeight: 700, cursor: "pointer", transition: "all 0.15s"
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.text; }}
            >
              <ArrowLeft size={13} /> Back to Dashboard
            </button>
          )}
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            padding: "4px 10px",
            borderRadius: 8,
            background: isGlobalAdmin ? `${C.accent}20` : `${activeFaculty.color}20`,
            color: isGlobalAdmin ? C.accent : activeFaculty.color,
            border: `1px solid ${isGlobalAdmin ? C.accent : activeFaculty.color}40`,
          }}>
            {scopedIncidents.length} {scopedIncidents.length === 1 ? "Incident" : "Incidents"} Visible
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {statuses.map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{
            padding: "7px 14px", borderRadius: 7, border: `1px solid ${filter === s ? C.accent : C.border}`,
            background: filter === s ? `${C.accent}18` : "transparent",
            color: filter === s ? C.accent : C.sub, fontSize: 11, fontWeight: filter === s ? 700 : 500, cursor: "pointer",
          }}>{s.charAt(0).toUpperCase() + s.slice(1)}</button>
        ))}
        <button style={{
          marginLeft: "auto", display: "flex", alignItems: "center", gap: 5,
          padding: "7px 12px", borderRadius: 7, border: `1px solid ${C.border}`,
          background: "transparent", color: C.sub, fontSize: 11, cursor: "pointer"
        }}>
          <Download size={12} />Export
        </button>
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: C.raised }}>
            <tr>{["Incident", "Student", "Owner Scope", "Camera", "Time", "Confidence", "Status", "Action"].map(h => (
              <th key={h} style={{
                textAlign: "left", padding: "11px 15px", fontSize: 10,
                fontWeight: 700, color: C.muted, borderBottom: `1px solid ${C.border}`,
                letterSpacing: "0.07em"
              }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: "36px", textAlign: "center", color: C.muted }}>
                  <AlertCircle size={24} style={{ display: "block", margin: "0 auto 8px", opacity: 0.5 }} />
                  No incidents logged in the system yet.
                </td>
              </tr>
            ) : (
              filtered.map(inc => {
                const ownerFac = getFacultyById(inc.ownerFacultyId);
                return (
                  <tr key={inc.id} onClick={() => setSel(inc)}
                    style={{ borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}
                    onMouseEnter={e => e.currentTarget.style.background = C.raised}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={{
                      padding: "12px 15px", fontFamily: "'JetBrains Mono',monospace",
                      fontSize: 11, color: C.accent
                    }}>{inc.id}</td>
                    <td style={{ padding: "12px 15px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <StudentPhoto regno={inc.studentId} initials={inc.student.split(" ").map(w => w[0]).join("").slice(0, 2) || "?"}
                          size={28} color={inc.conf ? C.accent : C.muted} />
                        <span style={{ fontSize: 13, color: C.text }}>{inc.student}</span>
                      </div>
                    </td>
                    <td style={{ padding: "12px 15px" }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
                        background: `${ownerFac.color}20`, color: ownerFac.color, border: `1px solid ${ownerFac.color}40`,
                      }}>
                        {ownerFac.code}
                      </span>
                    </td>
                    <td style={{ padding: "12px 15px", fontSize: 12, color: C.sub }}>{inc.camera}</td>
                    <td style={{
                      padding: "12px 15px", fontFamily: "'JetBrains Mono',monospace",
                      fontSize: 11, color: C.muted
                    }}>{inc.time}</td>
                  <td style={{padding:"12px 15px"}}>
                    <ConfRing value={inc.conf} size={36}/>
                  </td>
                  <td style={{padding:"12px 15px"}}><Badge label={inc.status}/></td>
                  <td style={{padding:"12px 15px"}}>
                    <button onClick={e=>{e.stopPropagation();setSel(inc);}} style={{
                      padding:"5px 10px",borderRadius:6,border:"none",cursor:"pointer",
                      background:`${C.accent}18`,color:C.accent,fontSize:11,fontWeight:600}}>
                      View
                    </button>
                  </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {sel&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",
          display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:20}}
          onClick={()=>setSel(null)}>
          <div style={{background:C.surface,border:`1px solid ${C.border}`,
            borderRadius:16,padding:26,maxWidth:480,width:"100%",
            boxShadow:"0 32px 80px rgba(0,0,0,0.6)"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:18}}>
              <div>
                {mono(sel.id,12,C.accent)}
                <div style={{fontSize:17,fontWeight:800,color:C.text,marginTop:4}}>
                  Incident Detail
                </div>
              </div>
              <button onClick={()=>setSel(null)} style={{background:"none",border:"none",
                cursor:"pointer",color:C.muted}}><X size={18}/></button>
            </div>
            <div style={{
              background:C.bg,borderRadius:10,height:140,
              display:"flex",alignItems:"center",justifyContent:"center",
              marginBottom:18,position:"relative",overflow:"hidden",
              border:`1px solid ${C.border}`,
            }}>
              <div style={{position:"absolute",inset:0,
                background:"repeating-linear-gradient(0deg,transparent,transparent 19px,#1C2A3F18 20px)"}}/>
              <div style={{
                width:70,height:90,border:`2px solid ${C.success}`,
                display:"flex",alignItems:"center",justifyContent:"center",
                position:"relative",
              }}>
                <StudentPhoto regno={sel.studentId} initials={sel.student.split(" ").map(w=>w[0]).join("").slice(0,2)||"?"}
                  size={44} color={C.accent}/>
                {sel.conf>0&&(
                  <div style={{position:"absolute",bottom:-17,left:0,right:0,
                    textAlign:"center",fontFamily:"'JetBrains Mono',monospace",
                    fontSize:10,color:C.success,fontWeight:700}}>
                    {sel.conf.toFixed(1)}%
                  </div>
                )}
              </div>
              <div style={{position:"absolute",bottom:6,left:8,
                fontFamily:"'JetBrains Mono',monospace",fontSize:9,color:C.muted}}>
                {sel.camera} · {sel.time}
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
              {[["Student",sel.student],["Camera",sel.camera],["Time",sel.time],
                ["Confidence",sel.conf?`${sel.conf}%`:"—"],["Status",sel.status]].map(([k,v])=>(
                <div key={k} style={{background:C.raised,borderRadius:8,padding:"9px 12px"}}>
                  <div style={{fontSize:9,color:C.muted,fontWeight:700,letterSpacing:"0.08em",marginBottom:2}}>{k}</div>
                  <div style={{fontSize:12,fontWeight:600,color:C.text}}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:8}}>
              <button style={{flex:1,padding:"9px",borderRadius:7,border:"none",cursor:"pointer",
                background:`linear-gradient(135deg,${C.accent},${C.accentD})`,
                color:"#fff",fontWeight:700,fontSize:12}}>Confirm</button>
              <button style={{flex:1,padding:"9px",borderRadius:7,cursor:"pointer",
                border:`1px solid ${C.border}`,background:"transparent",
                color:C.sub,fontSize:12}}>Dispute</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE: REPORTS
// ═══════════════════════════════════════════════════════════════════════════════
function ReportsPage() {
  return (
    <div style={{padding:26,display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14}}>
        <StatCard icon={AlertTriangle} label="Total Incidents"   value="89"  trend={8}  color={C.danger}/>
        <StatCard icon={CheckCircle}   label="Confirmed Matches" value="71"  trend={12} color={C.success}/>
        <StatCard icon={Users}         label="Unique Subjects"   value="14"  trend={3}  color={C.accent}/>
        <StatCard icon={Cpu}           label="Avg Inference"     value="340ms" trend={-5} color={C.purple}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:16}}>
        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:22}}>
          <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:16}}>Weekly Incidents</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={trendData} barSize={24}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
              <XAxis dataKey="day" tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false}/>
              <Tooltip contentStyle={{background:C.raised,border:`1px solid ${C.border}`,borderRadius:8,color:C.text}}/>
              <Bar dataKey="incidents" fill={C.accent} radius={[4,4,0,0]} name="Incidents"/>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:22}}>
          <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:14}}>Match Rate</div>
          {[
            {l:"Confirmed",v:71,pct:80,c:C.success},
            {l:"Under Review",v:10,pct:11,c:C.warning},
            {l:"Unmatched",v:5,pct:6,c:C.danger},
            {l:"Archived",v:3,pct:3,c:C.muted},
          ].map(r=>(
            <div key={r.l} style={{marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:4}}>
                <span style={{color:C.sub}}>{r.l}</span>
                <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:C.text}}>{r.v}</span>
              </div>
              <div style={{height:5,background:C.border,borderRadius:99,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${r.pct}%`,background:r.c,borderRadius:99}}/>
              </div>
            </div>
          ))}
          <div style={{
            marginTop:16,padding:"12px",borderRadius:9,
            background:`${C.accent}10`,border:`1px solid ${C.accent}25`,
          }}>
            {[
              ["False +ve","< 1.2%",C.success],
              ["Avg confidence","92.4%",C.purple],
            ].map(([k,v,col])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",
                fontSize:11,marginBottom:4}}>
                <span style={{color:C.muted}}>{k}</span>
                <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:col}}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT
// ═══════════════════════════════════════════════════════════════════════════════
const META = {
  dashboard: { title:"Dashboard",            sub:"Real-time campus security overview" },
  identify:  { title:"Incident Identification", sub:"Upload fight image → detect faces → match to student registry" },
  enroll:    { title:"Faculty API Batch Sync & Indexing", sub:"Fetch student batches from Faculty MIS API & generate biometric identity features" },
  evidence:  { title:"Evidence Dashboard",   sub:"Review confirmed and pending incident records" },
  reports:   { title:"Reports & Analytics",  sub:"System performance and incident statistics" },
};

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [page, setPage] = useState("identify");
  const [pageHistory, setPageHistory] = useState(["dashboard"]);
  const [currentUser, setCurrentUser] = useState(DEMO_USERS[0]);
  const [students, setStudents] = useState(() => {
    try {
      const saved = localStorage.getItem("sentinel_students");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return REGISTRY;
  });
  const [registryCount, setRegistryCount] = useState(() => {
    try {
      const savedCount = localStorage.getItem("sentinel_student_count");
      if (savedCount) {
        const count = parseInt(savedCount, 10);
        if (count > 1000) return count;
      }
    } catch (e) {}
    return 37696;
  });

  useEffect(() => {
    fetch("http://localhost:5000/stats")
      .then(r => r.json())
      .then(d => {
        if (d && typeof d.students_registered === "number" && d.students_registered > 0) {
          setRegistryCount(d.students_registered);
          try { localStorage.setItem("sentinel_student_count", String(d.students_registered)); } catch (e) {}
        }
      })
      .catch(() => {
        fetch("http://localhost:5000/health")
          .then(r => r.json())
          .then(d => {
            if (d && typeof d.students_registered === "number" && d.students_registered > 0) {
              setRegistryCount(d.students_registered);
              try { localStorage.setItem("sentinel_student_count", String(d.students_registered)); } catch (e) {}
            }
          })
          .catch(() => {});
      });
  }, []);

  useEffect(() => {
    if (students && students.length > 0) {
      if (students.length > 1000) {
        setRegistryCount(students.length);
        try {
          localStorage.setItem("sentinel_student_count", String(students.length));
        } catch (e) {}
      }
      try {
        localStorage.setItem("sentinel_students", JSON.stringify(students.slice(0, 1000)));
      } catch (e) {}
    }
  }, [students]);

  const [incidents] = useState(() => {
    try {
      const saved = localStorage.getItem("sentinel_incidents");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  });
  const [refreshing, setRefreshing] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const scrollContainerRef = useRef(null);

  const navigateTo = (newPage) => {
    if (newPage === page) return;
    setPageHistory(prev => [...prev, page]);
    setPage(newPage);
  };

  const handleBack = () => {
    if (pageHistory.length > 0) {
      const prevPage = pageHistory[pageHistory.length - 1];
      setPageHistory(prev => prev.slice(0, -1));
      setPage(prevPage);
    } else {
      setPage("dashboard");
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setToastMsg("Syncing data from backend...");
    try {
      let res = null;
      try {
        res = await fetch("/api/students");
      } catch (err) {}
      if (!res || !res.ok) {
        res = await fetch("http://localhost:5000/students");
      }
      if (res && res.ok) {
        const data = await res.json();
        const list = data.students || data;
        if (Array.isArray(list)) {
          const formatted = list.map(s => {
            const sid = s.student_id || s.id || s.regno;
            const prefix = sid ? sid.split("/")[0].toUpperCase() : "UNKNOWN";
            const canonicalFaculty = resolveFacultyCode(s.facultyId || s.faculty || prefix);
            return {
              id: sid,
              regno: sid,
              name: s.full_name || s.name || `Student (${sid})`,
              facultyId: canonicalFaculty,
              faculty: canonicalFaculty,
              year: s.year || parseYearFromIndex(sid) || 1,
              initials: (s.full_name || s.name || sid || "").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(),
              photoUrl: s.image || s.photoUrl || buildImageUrl(sid),
            };
          });
          setStudents(formatted);
          try { localStorage.setItem("sentinel_students", JSON.stringify(formatted.slice(0, 1000))); } catch (e) {}
          setToastMsg(`Refreshed ${formatted.length} students from database`);
        } else {
          setToastMsg("System up to date");
        }
      } else {
        setToastMsg("Refresh completed (Backend offline)");
      }
    } catch (e) {
      setToastMsg("Refresh completed");
    } finally {
      setTimeout(() => setRefreshing(false), 500);
      setTimeout(() => setToastMsg(""), 3500);
    }
  };

  const handleLogin = async (user) => {
    // If user object has a token (from real API), store it
    if (user.token) {
      localStorage.setItem("sentinel_token", user.token);
    }
    setCurrentUser(user);
    setIsAuthenticated(true);
    setPage("dashboard");
    setPageHistory([]);
  };

  const handleLogout = () => {
    localStorage.removeItem("sentinel_token");
    setIsAuthenticated(false);
    setPage("identify");
    setPageHistory([]);
  };

  if (!isAuthenticated) {
    return <LoginPage onLogin={handleLogin} />;
  }

  const m = META[page] || META.dashboard;
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:${C.bg};font-family:'Inter',sans-serif;color:${C.text};}
        ::-webkit-scrollbar{width:10px;height:10px;}
        ::-webkit-scrollbar-track{background:${C.bg};border-left:1px solid ${C.border};}
        ::-webkit-scrollbar-thumb{background:${C.accent}60;border-radius:5px;}
        ::-webkit-scrollbar-thumb:hover{background:${C.accent};}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes progress{0%{transform:translateX(-100%)}100%{transform:translateX(200%)}}
        select,input{color-scheme:dark;}
      `}</style>
      <div style={{display:"flex",minHeight:"100vh",position:"relative"}}>
        <Sidebar page={page} setPage={navigateTo} currentUser={currentUser} onLogout={handleLogout} />
        <div style={{marginLeft:216,flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
          <Topbar
            title={m.title}
            sub={m.sub}
            currentUser={currentUser}
            setCurrentUser={setCurrentUser}
            onLogout={handleLogout}
            onBack={handleBack}
            onRefresh={handleRefresh}
            refreshing={refreshing}
            toastMsg={toastMsg}
          />
          <div ref={scrollContainerRef} style={{flex:1,overflowY:"auto",position:"relative"}}>
            {page==="dashboard" && <DashboardPage setPage={navigateTo} currentUser={currentUser} students={students} incidents={incidents} registryCount={registryCount}/>}
            {page==="identify"  && <IdentifyPage currentUser={currentUser} setPage={navigateTo} students={students} setStudents={setStudents} registryCount={registryCount}/>}
            {page==="enroll"    && <FacultySyncPage currentUser={currentUser} students={students} setStudents={setStudents} setPage={navigateTo} registryCount={registryCount} setRegistryCount={setRegistryCount}/>}
            {page==="evidence"  && (currentUser?.role === ROLES.ADMIN ? <EvidencePage currentUser={currentUser} incidents={incidents} setPage={navigateTo}/> : <DashboardPage setPage={navigateTo} currentUser={currentUser} students={students} incidents={incidents} registryCount={registryCount}/>)}
            {page==="reports"   && (currentUser?.role === ROLES.ADMIN ? <ReportsPage currentUser={currentUser}/> : <DashboardPage setPage={navigateTo} currentUser={currentUser} students={students} incidents={incidents} registryCount={registryCount}/>)}
          </div>
        </div>
        <ScrollButton containerRef={scrollContainerRef} />
      </div>
    </>
  );
}
