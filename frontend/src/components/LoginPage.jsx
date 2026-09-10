import { useState } from "react";
import { Lock, AlertTriangle, Eye, EyeOff, User, ShieldCheck } from "lucide-react";
import { DEMO_USERS, ROLES } from "../data/users.js";

const MAROON = "#6B0012";
const MAROON_DARK = "#4A000C";
const GOLD = "#B48328";

export default function LoginPage({ onLogin }) {
  const [roleTab, setRoleTab] = useState("FACULTY"); // "ADMIN" | "FACULTY"
  const [selectedUserId, setSelectedUserId] = useState(
    roleTab === "ADMIN" ? "usr-admin" : "usr-eng"
  );
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const availableUsers = DEMO_USERS.filter((u) =>
    roleTab === "ADMIN" ? u.role === ROLES.ADMIN : u.role !== ROLES.ADMIN
  );

  const selectedUser =
    availableUsers.find((u) => u.id === selectedUserId) || availableUsers[0] || DEMO_USERS[0];

  const handleRoleSwitch = (tab) => {
    setRoleTab(tab);
    setErrorMsg("");
    setPassword("");
    if (tab === "ADMIN") {
      setSelectedUserId("usr-admin");
    } else if (selectedUserId === "usr-admin") {
      setSelectedUserId("usr-eng");
    }
  };

  const handleLoginSubmit = (e) => {
    e.preventDefault();
    setErrorMsg("");

    const targetUser = DEMO_USERS.find((u) => u.id === selectedUserId);
    if (!targetUser) {
      setErrorMsg("Please select a valid demo user account.");
      return;
    }

    // Password verification
    if (password !== targetUser.password) {
      setErrorMsg(`Invalid password for account "${targetUser.name}". Try "${targetUser.password}"`);
      return;
    }

    // Role-based portal access restriction check
    if (roleTab === "ADMIN" && targetUser.role !== ROLES.ADMIN) {
      setErrorMsg(
        `Access Restricted: "${targetUser.name}" (Faculty User) is not authorized to log into the Admin portal.`
      );
      return;
    }

    // Successful authentication
    onLogin(targetUser);
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#FAF8F5",
      position: "relative",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
      fontFamily: "'Inter', sans-serif",
      overflow: "hidden",
    }}>
      {/* Background Decorative Swooshes matching official UOP palette */}
      <svg style={{
        position: "absolute",
        left: 0,
        bottom: 0,
        width: "45vw",
        height: "60vh",
        pointerEvents: "none",
        zIndex: 1,
      }} viewBox="0 0 500 500" preserveAspectRatio="none">
        <path d="M 0,150 C 150,250 250,350 0,500 Z" fill={MAROON} opacity="0.95" />
        <path d="M 0,250 C 200,320 300,420 0,500 Z" fill={MAROON_DARK} opacity="0.6" />
      </svg>

      <div style={{
        position: "absolute",
        right: "-10%",
        bottom: "-10%",
        width: "50vw",
        height: "60vh",
        background: `radial-gradient(circle, ${GOLD}15 0%, transparent 70%)`,
        pointerEvents: "none",
        zIndex: 1,
      }} />

      <div style={{
        position: "relative",
        zIndex: 10,
        maxWidth: "480px",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}>

        {/* Top Header Logo & Crest */}
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          {/* UOP Emblem Crest */}
          <div style={{
            width: "72px",
            height: "72px",
            borderRadius: "50%",
            background: `radial-gradient(circle, #FFD700 0%, ${GOLD} 100%)`,
            border: `3px solid ${MAROON}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 12px",
            boxShadow: "0 8px 20px rgba(107, 0, 18, 0.2)",
          }}>
            <div style={{
              width: "58px",
              height: "58px",
              borderRadius: "50%",
              border: `1.5px dashed ${MAROON}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: "10px",
              color: MAROON,
              textAlign: "center",
              lineHeight: 1.1,
            }}>
              UOP<br />1942
            </div>
          </div>

          <h1 style={{
            fontFamily: "'Georgia', 'Playfair Display', serif",
            fontSize: "26px",
            fontWeight: 700,
            color: MAROON,
            margin: 0,
            letterSpacing: "-0.01em",
          }}>
            University of Peradeniya
          </h1>

          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
            marginTop: "4px",
          }}>
            <div style={{ width: "30px", height: "1px", background: GOLD }} />
            <span style={{
              fontSize: "13px",
              fontWeight: 500,
              color: GOLD,
              letterSpacing: "0.08em",
            }}>
              Management Portal
            </span>
            <div style={{ width: "30px", height: "1px", background: GOLD }} />
          </div>
        </div>

        {/* Main White Login Card */}
        <div style={{
          width: "100%",
          background: "#FFFFFF",
          borderRadius: "20px",
          padding: "36px 36px 28px",
          boxShadow: "0 20px 45px rgba(107, 0, 18, 0.08), 0 4px 12px rgba(0, 0, 0, 0.03)",
          border: "1px solid #F1E5D5",
          boxSizing: "border-box",
        }}>
          <h2 style={{
            fontFamily: "'Georgia', serif",
            fontSize: "22px",
            fontWeight: 700,
            color: "#1E293B",
            margin: "0 0 22px 0",
            textAlign: "center",
          }}>
            Sign in to your account
          </h2>



          {errorMsg && (
            <div style={{
              background: "#FEF2F2",
              border: "1px solid #FCA5A5",
              borderRadius: "10px",
              padding: "10px 12px",
              marginBottom: "18px",
              fontSize: "12px",
              color: "#B91C1C",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}>
              <AlertTriangle size={16} color="#B91C1C" />
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleLoginSubmit} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            {/* Select Role Segmented Control */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "#64748B" }}>
                Select role
              </label>
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                border: `1.5px solid ${MAROON}`,
                borderRadius: "10px",
                overflow: "hidden",
                height: "42px",
              }}>
                <button
                  type="button"
                  onClick={() => handleRoleSwitch("ADMIN")}
                  style={{
                    border: "none",
                    background: roleTab === "ADMIN" ? MAROON : "transparent",
                    color: roleTab === "ADMIN" ? "#FFFFFF" : MAROON,
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "7px",
                    transition: "all 0.2s",
                  }}>
                  <ShieldCheck size={16} /> Admin
                </button>

                <button
                  type="button"
                  onClick={() => handleRoleSwitch("FACULTY")}
                  style={{
                    border: "none",
                    background: roleTab === "FACULTY" ? MAROON : "transparent",
                    color: roleTab === "FACULTY" ? "#FFFFFF" : MAROON,
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "7px",
                    transition: "all 0.2s",
                  }}>
                  <User size={16} /> User
                </button>
              </div>
            </div>

            {/* Username or Email Input / Demo Selector */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "#64748B" }}>
                Username or Email
              </label>
              <div style={{ position: "relative" }}>
                <div style={{
                  position: "absolute",
                  left: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#94A3B8",
                  display: "flex",
                  alignItems: "center",
                }}>
                  <User size={18} />
                </div>
                <select
                  value={selectedUserId}
                  onChange={(e) => {
                    setSelectedUserId(e.target.value);
                    setErrorMsg("");
                  }}
                  style={{
                    width: "100%",
                    height: "44px",
                    paddingLeft: "40px",
                    paddingRight: "12px",
                    borderRadius: "8px",
                    border: "1px solid #CBD5E1",
                    background: "#FFFFFF",
                    fontSize: "13px",
                    color: "#1E293B",
                    outline: "none",
                    cursor: "pointer",
                    boxSizing: "border-box",
                  }}>
                  {availableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.email} ({u.name}) — {u.role === ROLES.ADMIN ? "Central Admin" : u.facultyId}
                    </option>
                  ))}
                </select>
              </div>

            </div>

            {/* Password Input */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "#64748B" }}>
                Password
              </label>
              <div style={{ position: "relative" }}>
                <div style={{
                  position: "absolute",
                  left: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#94A3B8",
                  display: "flex",
                  alignItems: "center",
                }}>
                  <Lock size={18} />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  style={{
                    width: "100%",
                    height: "44px",
                    paddingLeft: "40px",
                    paddingRight: "40px",
                    borderRadius: "8px",
                    border: "1px solid #CBD5E1",
                    background: "#FFFFFF",
                    fontSize: "13px",
                    color: "#1E293B",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute",
                    right: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    color: "#94A3B8",
                    cursor: "pointer",
                    padding: 0,
                    display: "flex",
                    alignItems: "center",
                  }}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <div style={{ fontSize: "11px", color: "#64748B" }}>
                Demo Password Hint: <code style={{ color: MAROON, fontWeight: 700 }}>{selectedUser.password}</code>
              </div>
            </div>

            {/* Remember Me & Forgot Password */}
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "12px",
              marginTop: "-4px",
            }}>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", color: "#475569", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  style={{ accentColor: MAROON, width: "14px", height: "14px" }}
                />
                Remember me
              </label>

              <button
                type="button"
                onClick={() => setErrorMsg("Demo mode: Password reset feature requires Flask backend in Phase 6.")}
                style={{
                  background: "none",
                  border: "none",
                  color: MAROON,
                  fontWeight: 600,
                  fontSize: "12px",
                  cursor: "pointer",
                }}>
                Forgot password?
              </button>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              style={{
                height: "46px",
                borderRadius: "8px",
                border: "none",
                background: MAROON,
                color: "#FFFFFF",
                fontSize: "14px",
                fontWeight: 700,
                cursor: "pointer",
                marginTop: "6px",
                boxShadow: "0 4px 12px rgba(107, 0, 18, 0.25)",
                transition: "background 0.2s",
              }}>
              Log in
            </button>

            {/* Security Badge Footer */}
            <div style={{
              borderTop: "1px solid #F1F5F9",
              paddingTop: "14px",
              marginTop: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              fontSize: "11px",
              color: "#64748B",
            }}>
              <Lock size={13} color={GOLD} />
              <span>Secure access for authorized users only</span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
