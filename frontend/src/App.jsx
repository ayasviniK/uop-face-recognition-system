import { useState, useEffect, useRef, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Shield, Users, AlertTriangle, Search,
  Upload, CheckCircle, Eye, BarChart2, Home,
  UserPlus, Download, X, ArrowUpRight, ArrowDownRight,
  CircleDot, Cpu, ChevronRight,
  ScanFace, Fingerprint, Database, RotateCcw,
  ImageIcon, AlertCircle, Info, Tag, Lock, LogOut,
} from "lucide-react";
import { UOP_FACULTIES, getFacultyById } from "./data/faculties.js";
import { REGISTRY, MOCK_MATCHES, INCIDENTS_LOG } from "./data/students.js";
import { DEMO_USERS, getUserFaculty, ROLES } from "./data/users.js";
import LoginPage from "./components/LoginPage.jsx";
import DevSwitcher from "./components/DevSwitcher.jsx";

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
  const col = value>90?C.success:value>80?C.warning:C.danger;
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

function Topbar({ title, sub, currentUser, onLogout }) {
  const [t, setT] = useState(new Date());
  const activeFaculty = getUserFaculty(currentUser);
  useEffect(() => { const iv = setInterval(() => setT(new Date()), 1000); return () => clearInterval(iv); }, []);
  return (
    <div style={{
      height: 60, background: C.surface, borderBottom: `1px solid ${C.border}`,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 26px", position: "sticky", top: 0, zIndex: 50
    }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{title}</div>
        <div style={{ fontSize: 11, color: C.muted }}>{sub}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
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
  { key:"detect",  label:"Face Detection",       tech:"RetinaFace",       icon:ScanFace,    color:C.cyan    },
  { key:"embed",   label:"Embedding Extraction",  tech:"ArcFace (buffalo_l)", icon:Fingerprint, color:C.accent },
  { key:"search",  label:"FAISS Index Search",   tech:"FAISS L2 Search",  icon:Database,    color:C.purple  },
  { key:"results", label:"Match Results",         tech:"Threshold ≥ 80%",  icon:CheckCircle, color:C.success },
];

function IncidentCanvas({ matches, stage }) {
  const canvasRef = useRef(null);
  useEffect(()=>{
    const canvas = canvasRef.current;
    if(!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0,0,canvas.width,canvas.height);

    // BG
    ctx.fillStyle="#07090F";
    ctx.fillRect(0,0,canvas.width,canvas.height);
    // grid
    ctx.strokeStyle="#1C2A3F";
    ctx.lineWidth=0.5;
    for(let x=0;x<canvas.width;x+=20){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);ctx.stroke();}
    for(let y=0;y<canvas.height;y+=20){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke();}

    if(stage<1) return;

    // Draw face bounding boxes
    matches.forEach((m,i)=>{
      const {x,y,w,h}=m.facePos;
      const matched = m.matchedStudent!==null;
      const col = stage<3?"#F59E0B":matched?"#10B981":"#EF4444";
      ctx.strokeStyle=col;
      ctx.lineWidth=2;
      // Corner brackets
      const b=10;
      [
        [x,y, 1, 1],[x+w,y,-1,1],[x,y+h,1,-1],[x+w,y+h,-1,-1]
      ].forEach(([cx,cy,sx,sy])=>{
        ctx.beginPath();ctx.moveTo(cx+b*sx,cy);ctx.lineTo(cx,cy);ctx.lineTo(cx,cy+b*sy);ctx.stroke();
      });

      // Face ID label
      if(stage>=2){
        const lbl = `F-${String(i+1).padStart(2,"0")}`;
        ctx.fillStyle=col;
        ctx.font="bold 9px 'JetBrains Mono',monospace";
        const tw=ctx.measureText(lbl).width+8;
        ctx.fillRect(x,y-17,tw,15);
        ctx.fillStyle="#000";
        ctx.fillText(lbl,x+4,y-6);
      }

      // Match label
      if(stage>=3){
        const lbl2 = matched?`${m.confidence.toFixed(1)}%`:"NO MATCH";
        ctx.fillStyle=col+"CC";
        ctx.font="bold 9px 'JetBrains Mono',monospace";
        const tw2=ctx.measureText(lbl2).width+8;
        ctx.fillRect(x,y+h+2,tw2,15);
        ctx.fillStyle="#000";
        ctx.fillText(lbl2,x+4,y+h+12);
      }
    });

    // Timestamp + source label
    ctx.fillStyle=C.muted;
    ctx.font="9px 'JetBrains Mono',monospace";
    ctx.fillText("INCIDENT · UOP-GATE-A · 2024-03-15 14:32:11",6,canvas.height-6);
  },[stage,matches]);

  return (
    <canvas ref={canvasRef} width={480} height={300}
      style={{width:"100%",borderRadius:10,display:"block",
        border:`1px solid ${C.border}`}}/>
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
  const { faceLabel, matchedStudent: s, confidence, appearanceChanges } = match;
  const activeFaculty = getUserFaculty(currentUser);
  const isGlobalAdmin = currentUser?.role === ROLES.ADMIN;

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
              display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8,
              alignItems: "center", marginBottom: 16
            }}>
              {/* Detected face */}
              <div style={{ textAlign: "center" }}>
                <div style={{
                  fontSize: 9, fontWeight: 700, color: C.muted,
                  letterSpacing: "0.1em", marginBottom: 6
                }}>FROM INCIDENT</div>
                <div style={{
                  width: "100%", paddingTop: "115%", position: "relative",
                  background: C.raised, border: `1px solid ${C.border}`,
                  borderRadius: 8, overflow: "hidden",
                }}>
                  <div style={{
                    position: "absolute", inset: 0, display: "flex",
                    flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4
                  }}>
                    <Avatar initials={s.initials} size={52}
                      color={s.accentColor} flagged={s.flagged} />
                    <div style={{
                      fontSize: 8, color: C.muted, fontFamily: "'JetBrains Mono',monospace",
                      textAlign: "center", padding: "0 4px"
                    }}>
                      CCTV · {match.facePos.w}×{match.facePos.h}px
                    </div>
                  </div>
                  {/* scanline overlay */}
                  <div style={{
                    position: "absolute", inset: 0,
                    background: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.06) 4px)"
                  }} />
                  {appearanceChanges.length > 0 && (
                    <div style={{
                      position: "absolute", bottom: 0, left: 0, right: 0,
                      background: "rgba(239,68,68,0.85)",
                      padding: "3px 5px", fontSize: 8, color: "#fff", fontWeight: 700,
                      textAlign: "center", letterSpacing: "0.05em",
                    }}>APPEARANCE CHANGE</div>
                  )}
                </div>
              </div>

              {/* Arrow */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ width: 1, height: 20, background: C.border }} />
                <div style={{
                  width: 28, height: 28, borderRadius: "50%",
                  background: `${C.success}20`, border: `1px solid ${C.success}40`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Fingerprint size={13} color={C.success} />
                </div>
                <div style={{ width: 1, height: 20, background: C.border }} />
              </div>

              {/* ID photo */}
              <div style={{ textAlign: "center" }}>
                <div style={{
                  fontSize: 9, fontWeight: 700, color: C.muted,
                  letterSpacing: "0.1em", marginBottom: 6
                }}>STUDENT ID PHOTO</div>
                <div style={{
                  width: "100%", paddingTop: "115%", position: "relative",
                  background: C.raised, border: `2px solid ${s.accentColor}50`,
                  borderRadius: 8, overflow: "hidden",
                }}>
                  <div style={{
                    position: "absolute", inset: 0, display: "flex",
                    flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4
                  }}>
                    <Avatar initials={s.initials} size={52}
                      color={s.accentColor} flagged={s.flagged} />
                    <div style={{
                      fontSize: 8, color: C.muted, fontFamily: "'JetBrains Mono',monospace",
                      textAlign: "center", padding: "0 4px"
                    }}>
                      REGISTRY · {s.id}
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
                <Avatar initials={s.initials} size={34} color={s.accentColor} flagged={s.flagged} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{s.name}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>{s.dept} · Year {s.year}</div>
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
                  ArcFace identity embedding is robust to these surface changes
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
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{
              width: 56, height: 56, borderRadius: "50%",
              background: `${C.danger}15`, border: `1px solid ${C.danger}30`,
              display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px"
            }}>
              <X size={24} color={C.danger} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 6 }}>
              No Match Found
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 14 }}>
              Confidence below threshold (80%)<br />Not in student registry
            </div>
            <button style={{
              padding: "7px 16px", borderRadius: 7, fontSize: 11, cursor: "pointer",
              border: `1px solid ${C.border}`, background: "transparent", color: C.sub,
            }}>Add to Watchlist</button>
          </div>
        )}
      </div>
    </div>
  );
}

function IdentifyPage({ currentUser }) {
  const [uploadStage, setUploadStage] = useState("idle"); // idle|uploaded|processing|done
  const [pipelineStep, setPipelineStep] = useState(-1);
  const [fileName, setFileName] = useState("");
  const [incidentMeta, setIncidentMeta] = useState({ source:"", date:"", location:"" });
  const [matches, setMatches] = useState(MOCK_MATCHES);
  const [uploadedFile, setUploadedFile] = useState(null);
  const fileRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const runPipeline = useCallback(async ()=>{
    setUploadStage("processing");
    setPipelineStep(0);
    PIPELINE.forEach((_,i)=>{
      setTimeout(()=>{
        setPipelineStep(i+1);
      },(i+1)*1000);
    });

    if (uploadedFile) {
      try {
        const formData = new FormData();
        formData.append("file", uploadedFile);
        const res = await fetch("http://localhost:5000/api/recognize", {
          method: "POST",
          body: formData,
        });
        if (res.ok) {
          const data = await res.json();
          if (data.faces && data.faces.length > 0) {
            setMatches(data.faces);
          }
        }
      } catch (err) {
        console.warn("Python AI Service unreachable, using fallback dataset.", err);
      }
    }

    setTimeout(()=>setUploadStage("done"), 4200);
  },[uploadedFile]);

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
    setMatches(MOCK_MATCHES); setUploadedFile(null);
  };

  const canvasStage = uploadStage==="idle"?0:uploadStage==="uploaded"?0:
    pipelineStep===0?1:pipelineStep===1?2:3;

  return (
    <div style={{padding:26,display:"flex",flexDirection:"column",gap:20}}>

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
            all faces, extract ArcFace embeddings, and match each face to the student registry —
            even if the student has since changed their appearance.
          </div>
        </div>
        <div style={{display:"flex",gap:10,flexShrink:0}}>
          {["RetinaFace","ArcFace","FAISS"].map(t=>(
            <div key={t} style={{
              padding:"5px 10px",borderRadius:7,
              background:`${C.accent}15`,border:`1px solid ${C.accent}30`,
              fontSize:10,fontWeight:700,color:C.accent,letterSpacing:"0.06em",
            }}>{t}</div>
          ))}
        </div>
      </div>

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
              <IncidentCanvas matches={matches} stage={canvasStage}/>
              {/* Metadata row */}
              <div style={{display:"flex",gap:12,marginTop:10}}>
                {[
                  ["Source", incidentMeta.source||"CCTV / Mobile"],
                  ["Date",   incidentMeta.date||"2024-03-15"],
                  ["Location", incidentMeta.location||"Gate A"],
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
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14}}>
                {matches.map(m=><MatchCard key={m.faceIdx} match={m} currentUser={currentUser}/>)}
              </div>
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
              ["2","Face Detection","RetinaFace locates and crops every face in the image"],
              ["3","Embedding Extraction","ArcFace extracts a 512-dim identity vector per face — unaffected by hairstyle, beard, or minor appearance changes"],
              ["4","Registry Search","FAISS performs L2 similarity search across all enrolled student embeddings"],
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
              ["Registry size","847 students",C.accent],
              ["Avg inference","~340ms / image",C.cyan],
              ["Match threshold","≥ 80% confidence",C.success],
              ["False positive rate","< 1.2%",C.warning],
              ["Model","ArcFace buffalo_l",C.purple],
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

function AdminDashboard({ setPage, currentUser }) {
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
            Global surveillance intelligence across all 9 UOP faculties. Monitor OpenCV AI engine health, FAISS vector index database, campus CCTV node networks, and cross-faculty incident logs.
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <StatCard icon={Users} label="Total Campus Students" value="847" trend={12} color={C.accent} sub="All 9 Faculties Registered" />
        <StatCard icon={Cpu} label="AI Vector Index (FAISS)" value="847" trend={100} color={C.cyan} sub="ArcFace 512-dim Vectors" />
        <StatCard icon={AlertTriangle} label="Global Security Incidents" value="5" trend={25} color={C.danger} sub="Cross-Faculty Logs" />
        <StatCard icon={CheckCircle} label="OpenCV AI Engine" value="ONLINE" trend={100} color={C.success} sub="Port 5000 Active" />
      </div>

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
              Upload incident screenshot or CCTV photo to search global FAISS student registry
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

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {UOP_FACULTIES.map((fac) => {
            const facStudents = REGISTRY.filter(s => s.facultyId === fac.code);
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
                  <span style={{ fontWeight: 700, color: C.text }}>{facStudents.length * 12 + 40}</span>
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
          {INCIDENTS_LOG.slice(0, 4).map(inc => (
            <div key={inc.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: `1px solid ${C.border}` }}>
              <Avatar initials={inc.student.split(" ").map(w => w[0]).join("").slice(0, 2) || "?"} size={32} color={inc.conf > 0 ? C.accent : C.muted} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inc.student}</div>
                <div style={{ fontSize: 10, color: C.muted }}>{inc.camera} · {inc.facultyId} Scope</div>
              </div>
              <Badge label={inc.status} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FacultyDashboard({ setPage, currentUser }) {
  const activeFaculty = getUserFaculty(currentUser);
  const [studentSearch, setStudentSearch] = useState("");
  
  // Strict Faculty Student Filtering
  const facultyStudents = REGISTRY.filter(s => s.facultyId === currentUser?.facultyId);
  const filteredStudents = facultyStudents.filter(s =>
    s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
    s.id.toLowerCase().includes(studentSearch.toLowerCase()) ||
    s.dept.toLowerCase().includes(studentSearch.toLowerCase())
  );

  const facultyIncidents = INCIDENTS_LOG.filter(inc => inc.ownerFacultyId === currentUser?.facultyId);

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
        <StatCard icon={Cpu} label="Recognition Accuracy" value="94.2%" trend={5} color={C.purple} sub="ArcFace Embeddings" />
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
              placeholder={`Search ${activeFaculty.code} students by name, ID number, department...`}
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
              filteredStudents.map((s) => (
                <div key={s.id} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 14px", background: C.raised, borderRadius: 10,
                  border: `1px solid ${C.border}`
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <Avatar initials={s.initials} size={38} color={s.accentColor || activeFaculty.color} flagged={s.flagged} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: C.sub }}>
                        {s.dept} Department · Year {s.year} Student
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {mono(s.id, 12, activeFaculty.color || C.accent)}
                    <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>Biometric Enrolled</div>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ fontSize: 12, color: C.muted, textAlign: "center", padding: "24px 0" }}>
                No students found matching "{studentSearch}" in {activeFaculty.code}
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
                <Avatar initials={inc.student.split(" ").map(w => w[0]).join("").slice(0, 2) || "?"} size={34} color={inc.conf > 0 ? activeFaculty.color : C.muted} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inc.student}</div>
                  <div style={{ fontSize: 10, color: C.sub }}>{inc.camera} · {inc.time.split(" ")[1]}</div>
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

function DashboardPage({ setPage, currentUser }) {
  const isGlobalAdmin = currentUser?.role === ROLES.ADMIN;
  return isGlobalAdmin ? (
    <AdminDashboard setPage={setPage} currentUser={currentUser} />
  ) : (
    <FacultyDashboard setPage={setPage} currentUser={currentUser} />
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE: FACULTY API BATCH SYNC & AI INDEXING
// ═══════════════════════════════════════════════════════════════════════════════
const SYNC_STEPS = [
  { key: "api", label: "Querying Faculty MIS API", tech: "GET /api/v1/faculties/{code}/students" },
  { key: "validate", label: "Validating Student Records & Photos", tech: "Schema & Image Quality Check" },
  { key: "embedding", label: "Extracting 512-dim ArcFace Embeddings", tech: "Python OpenCV AI Backend" },
  { key: "indexing", label: "Indexing Vectors to FAISS Database", tech: "L2 Vector Index Registered" }
];

function FacultySyncPage({ currentUser, students, setStudents }) {
  const activeFaculty = getUserFaculty(currentUser);
  const isGlobalAdmin = currentUser?.role === ROLES.ADMIN;
  
  const [syncStage, setSyncStage] = useState("idle"); // idle | syncing | done
  const [currentStep, setCurrentStep] = useState(-1);
  const [lastSyncTime, setLastSyncTime] = useState("2026-08-21 11:30 AM");
  const [syncedCount, setSyncedCount] = useState(0);

  const handleSyncBatch = async () => {
    setSyncStage("syncing");
    setCurrentStep(0);

    // Step progression animation
    SYNC_STEPS.forEach((_, i) => {
      setTimeout(() => {
        setCurrentStep(i + 1);
      }, (i + 1) * 1100);
    });

    try {
      const facCode = isGlobalAdmin ? "ENG" : activeFaculty.code;
      const res = await fetch(`http://localhost:5000/api/faculty/${facCode}/sync`);
      if (res.ok) {
        const data = await res.json();
        if (data.students) {
          setSyncedCount(data.students.length);
        }
      }
    } catch (err) {
      console.warn("Python AI Service sync endpoint fallback:", err);
    }

    setTimeout(() => {
      setSyncStage("done");
      setLastSyncTime(new Date().toLocaleString());
    }, 4800);
  };

  const scopedStudents = students.filter(s => {
    if (isGlobalAdmin) return true;
    return s.facultyId === currentUser?.facultyId;
  });

  return (
    <div style={{ padding: 26, display: "flex", flexDirection: "column", gap: 20 }}>
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
            Automated Faculty API Integration: Student enrollment is managed directly by {isGlobalAdmin ? "each faculty MIS system" : activeFaculty.name}. This module queries the Faculty MIS API to retrieve new student batches, generate 512-dim ArcFace identity embeddings, and index vectors for biometric identification.
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
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

      <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 20, alignItems: "start" }}>
        {/* Left Panel: Batch Sync Trigger */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>
            Faculty Batch Sync Control
          </div>
          <div style={{ fontSize: 11, color: C.sub, lineHeight: 1.5 }}>
            When a new batch of students is registered at {activeFaculty.name}, run the sync process below to pull student records and generate AI biometric embeddings.
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
              <span style={{ fontWeight: 700, color: C.purple }}>ArcFace 512-dim</span>
            </div>
          </div>

          <button
            onClick={handleSyncBatch}
            disabled={syncStage === "syncing"}
            style={{
              padding: "13px", borderRadius: 10, border: "none", cursor: syncStage === "syncing" ? "default" : "pointer",
              fontWeight: 800, fontSize: 13, color: "#fff",
              background: syncStage === "syncing" ? C.border : `linear-gradient(135deg, ${activeFaculty.color || C.accent}, ${C.accentD})`,
              boxShadow: syncStage === "syncing" ? "none" : `0 4px 14px ${activeFaculty.color || C.accent}30`,
              transition: "all 0.2s"
            }}>
            {syncStage === "syncing" ? "⚡ Fetching Faculty API Batch…" : "⚡ Sync Batch from Faculty API"}
          </button>

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
                  ✓ Batch Synced: {syncedCount || scopedStudents.length} Students Indexed into FAISS Vector DB
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
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search name or ID…"
                style={{
                  background: C.raised, border: `1px solid ${C.border}`, borderRadius: 7,
                  padding: "8px 10px 8px 28px", color: C.text, fontSize: 12, outline: "none", width: 210
                }} />
            </div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>{["Student", "ID", "Faculty", "Dept", "Year", "Status"].map(h => (
                <th key={h} style={{
                  textAlign: "left", padding: "7px 12px", fontSize: 10,
                  fontWeight: 700, color: C.muted, borderBottom: `1px solid ${C.border}`,
                  letterSpacing: "0.06em"
                }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const sFac = getFacultyById(s.facultyId);
                return (
                  <tr key={s.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "11px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        <Avatar initials={s.initials} size={30} color={sFac.color || s.accentColor} flagged={s.flagged} />
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
                    <td style={{ padding: "11px 12px", fontSize: 12, color: C.sub }}>{s.dept}</td>
                    <td style={{ padding: "11px 12px", fontSize: 12, color: C.sub }}>Year {s.year}</td>
                    <td style={{ padding: "11px 12px" }}>
                      <Badge label={s.flagged ? "flagged" : "active"} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE: EVIDENCE
// ═══════════════════════════════════════════════════════════════════════════════
function EvidencePage({ currentUser }) {
  const [filter, setFilter] = useState("all");
  const [sel, setSel] = useState(null);
  const activeFaculty = getUserFaculty(currentUser);
  const isGlobalAdmin = currentUser?.role === ROLES.ADMIN;

  const scopedIncidents = INCIDENTS_LOG.filter(inc => {
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
            {filtered.map(inc => {
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
                      <Avatar initials={inc.student.split(" ").map(w => w[0]).join("").slice(0, 2) || "?"}
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
            })}
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
                <Avatar initials={sel.student.split(" ").map(w=>w[0]).join("").slice(0,2)||"?"}
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
              ["Model","ArcFace buffalo_l",C.accent],
              ["FAISS index","847 vectors",C.cyan],
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
  enroll:    { title:"Faculty API Batch Sync & Indexing", sub:"Fetch student batches from Faculty MIS API & generate ArcFace embeddings" },
  evidence:  { title:"Evidence Dashboard",   sub:"Review confirmed and pending incident records" },
  reports:   { title:"Reports & Analytics",  sub:"System performance and incident statistics" },
};

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [page, setPage] = useState("identify");
  const [currentUser, setCurrentUser] = useState(DEMO_USERS[0]);
  const [students, setStudents] = useState(REGISTRY);

  const handleLogin = (user) => {
    setCurrentUser(user);
    setIsAuthenticated(true);
    setPage("dashboard");
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setPage("identify");
  };

  if (!isAuthenticated) {
    return <LoginPage onLogin={handleLogin} />;
  }

  const m = META[page];
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:${C.bg};font-family:'Inter',sans-serif;color:${C.text};}
        ::-webkit-scrollbar{width:5px;}
        ::-webkit-scrollbar-track{background:${C.bg};}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px;}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes progress{0%{transform:translateX(-100%)}100%{transform:translateX(200%)}}
        select,input{color-scheme:dark;}
      `}</style>
      <div style={{display:"flex",minHeight:"100vh"}}>
        <Sidebar page={page} setPage={setPage} currentUser={currentUser} onLogout={handleLogout} />
        <div style={{marginLeft:216,flex:1,display:"flex",flexDirection:"column"}}>
          <Topbar title={m.title} sub={m.sub} currentUser={currentUser} setCurrentUser={setCurrentUser} onLogout={handleLogout} />
          <div style={{flex:1,overflowY:"auto"}}>
            {page==="dashboard" && <DashboardPage setPage={setPage} currentUser={currentUser}/>}
            {page==="identify"  && <IdentifyPage currentUser={currentUser}/>}
            {page==="enroll"    && <EnrollPage currentUser={currentUser} students={students} setStudents={setStudents}/>}
            {page==="evidence"  && (currentUser?.role === ROLES.ADMIN ? <EvidencePage currentUser={currentUser}/> : <DashboardPage setPage={setPage} currentUser={currentUser}/>)}
            {page==="reports"   && (currentUser?.role === ROLES.ADMIN ? <ReportsPage currentUser={currentUser}/> : <DashboardPage setPage={setPage} currentUser={currentUser}/>)}
          </div>
        </div>
      </div>
    </>
  );
}
