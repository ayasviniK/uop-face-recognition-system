import { useState, useRef, useEffect } from "react";
import { DEMO_USERS, getUserFaculty, ROLES } from "../data/users.js";
import { ChevronDown, UserCheck, Sparkles } from "lucide-react";

export default function DevSwitcher({ currentUser, setCurrentUser }) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  const activeFaculty = getUserFaculty(currentUser);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} style={{ position: "relative", zIndex: 500 }}>
      {/* Dev Switcher Trigger Button */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "linear-gradient(135deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.9))",
          border: `1px solid ${activeFaculty.color || "#3B82F6"}60`,
          borderRadius: 10,
          padding: "6px 12px",
          cursor: "pointer",
          color: "#F0F4F8",
          boxShadow: `0 0 12px ${activeFaculty.color || "#3B82F6"}20`,
          transition: "all 0.2s ease",
        }}
      >
        <div style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: activeFaculty.color || "#3B82F6",
          boxShadow: `0 0 8px ${activeFaculty.color || "#3B82F6"}`,
        }} />

        <div style={{ textAlign: "left" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.03em" }}>
              {currentUser.name}
            </span>
            <span style={{
              fontSize: 8,
              fontWeight: 800,
              padding: "1px 5px",
              borderRadius: 4,
              background: currentUser.role === ROLES.ADMIN ? "#EF444430" : `${activeFaculty.color}30`,
              color: currentUser.role === ROLES.ADMIN ? "#EF4444" : activeFaculty.color,
              border: `1px solid ${currentUser.role === ROLES.ADMIN ? "#EF444450" : activeFaculty.color + "50"}`,
            }}>
              {currentUser.role === ROLES.ADMIN ? "GLOBAL ADMIN" : currentUser.facultyId}
            </span>
          </div>
          <div style={{ fontSize: 9, color: "#8FA3BF" }}>
            {activeFaculty.name}
          </div>
        </div>

        <ChevronDown size={14} color="#8FA3BF" style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
      </button>

      {/* Dropdown Menu */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 320,
            background: "#0D1117",
            border: "1px solid #1C2A3F",
            borderRadius: 14,
            padding: 12,
            boxShadow: "0 20px 40px rgba(0,0,0,0.8), 0 0 1px rgba(255,255,255,0.1)",
            color: "#F0F4F8",
          }}
        >
          {/* Header Disclaimer */}
          <div style={{
            background: "#141B26",
            borderRadius: 8,
            padding: "8px 10px",
            marginBottom: 10,
            border: "1px solid #1C2A3F",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}>
            <Sparkles size={14} color="#F59E0B" />
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#F59E0B", letterSpacing: "0.05em" }}>
                DEV RBAC DEMO SWITCHER
              </div>
              <div style={{ fontSize: 9, color: "#8FA3BF" }}>
                Simulating user personas for supervisor demonstration.
              </div>
            </div>
          </div>

          <div style={{ fontSize: 10, fontWeight: 700, color: "#4B6080", padding: "4px 6px 6px", letterSpacing: "0.08em" }}>
            SELECT PERSONA / SCOPE
          </div>

          <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {DEMO_USERS.map((user) => {
              const fac = getUserFaculty(user);
              const isSelected = currentUser.id === user.id;

              return (
                <button
                  key={user.id}
                  onClick={() => {
                    setCurrentUser(user);
                    setOpen(false);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: isSelected ? `1px solid ${fac.color}80` : "1px solid transparent",
                    background: isSelected ? `${fac.color}15` : "transparent",
                    color: "#F0F4F8",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s",
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: `${fac.color}25`,
                      border: `1px solid ${fac.color}50`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 11,
                      fontWeight: 700,
                      color: fac.color,
                      flexShrink: 0,
                    }}
                  >
                    {user.initials}
                  </div>

                  <div style={{ flex: 1, overflow: "hidden" }}>
                    <div style={{ fontSize: 12, fontWeight: isSelected ? 700 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
                      {user.name}
                      {isSelected && <UserCheck size={12} color={fac.color} />}
                    </div>
                    <div style={{ fontSize: 10, color: "#8FA3BF", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                      {fac.name}
                    </div>
                  </div>

                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 800,
                      padding: "2px 6px",
                      borderRadius: 4,
                      background: user.role === ROLES.ADMIN ? "#EF444420" : `${fac.color}20`,
                      color: user.role === ROLES.ADMIN ? "#EF4444" : fac.color,
                      flexShrink: 0,
                    }}
                  >
                    {user.role === ROLES.ADMIN ? "ADMIN" : user.facultyId}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
