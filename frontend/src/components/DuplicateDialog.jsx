/**
 * DuplicateDialog Component
 * --------------------------
 * Shows when a CSV upload contains reg numbers already in the DB.
 * Admin can choose to:
 *   - Skip duplicates (only sync new students)
 *   - Replace duplicates (re-generate embeddings for existing students)
 *   - Cancel the whole operation
 */

const C = {
  bg:      "#07090F",
  surface: "#0D1117",
  raised:  "#141B26",
  border:  "#1C2A3F",
  accent:  "#3B82F6",
  danger:  "#EF4444",
  success: "#10B981",
  warning: "#F59E0B",
  text:    "#F0F4F8",
  sub:     "#8FA3BF",
  muted:   "#4B6080",
};

export default function DuplicateDialog({
  duplicates = [],
  newCount = 0,
  onSkip,      // proceed but skip duplicates
  onReplace,   // proceed and replace duplicates
  onCancel,    // cancel everything
}) {
  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(0,0,0,0.75)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: 20,
    }}>
      <div style={{
        background: C.surface,
        border: `1px solid ${C.warning}60`,
        borderRadius: 16, padding: 28,
        maxWidth: 500, width: "100%",
        boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: `${C.warning}20`,
            border: `1px solid ${C.warning}40`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22,
          }}>⚠</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>
              Duplicate Students Detected
            </div>
            <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>
              Some students in this CSV are already registered
            </div>
          </div>
        </div>

        {/* Summary */}
        <div style={{
          background: C.raised, borderRadius: 10,
          padding: "14px 16px", marginBottom: 20,
          border: `1px solid ${C.border}`,
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12,
        }}>
          <div style={{ textAlign: "center" }}>
            <div style={{
              fontSize: 28, fontWeight: 800, color: C.success,
              fontFamily: "'JetBrains Mono',monospace",
            }}>{newCount}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
              New students
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{
              fontSize: 28, fontWeight: 800, color: C.warning,
              fontFamily: "'JetBrains Mono',monospace",
            }}>{duplicates.length}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
              Already in database
            </div>
          </div>
        </div>

        {/* Duplicate list */}
        {duplicates.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: C.muted,
              letterSpacing: "0.06em", marginBottom: 8,
            }}>
              EXISTING RECORDS ({duplicates.length})
            </div>
            <div style={{
              maxHeight: 160, overflowY: "auto",
              background: C.raised, borderRadius: 8,
              border: `1px solid ${C.border}`,
            }}>
              {duplicates.map((reg, i) => (
                <div key={reg} style={{
                  padding: "8px 12px",
                  borderBottom: i < duplicates.length - 1 ? `1px solid ${C.border}` : "none",
                  display: "flex", alignItems: "center", gap: 8,
                  fontSize: 12,
                }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: C.warning, flexShrink: 0,
                  }} />
                  <span style={{
                    fontFamily: "'JetBrains Mono',monospace",
                    color: C.accent,
                  }}>{reg}</span>
                  <span style={{ color: C.muted, fontSize: 10, marginLeft: "auto" }}>
                    already registered
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Options explanation */}
        <div style={{
          background: `${C.accent}08`,
          border: `1px solid ${C.accent}25`,
          borderRadius: 8, padding: "12px 14px",
          marginBottom: 20, fontSize: 11, color: C.sub, lineHeight: 1.6,
        }}>
          <strong style={{ color: C.text }}>Skip duplicates</strong> — only sync the {newCount} new students.
          Existing records stay unchanged.<br />
          <strong style={{ color: C.text }}>Replace duplicates</strong> — re-fetch photos and regenerate
          embeddings for all {duplicates.length} existing students too.
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onCancel} style={{
            padding: "10px 16px", borderRadius: 8, cursor: "pointer",
            border: `1px solid ${C.border}`, background: "transparent",
            color: C.sub, fontSize: 12, fontWeight: 600,
          }}>
            Cancel
          </button>
          <button onClick={onSkip} style={{
            flex: 1, padding: "10px", borderRadius: 8, cursor: "pointer",
            border: `1px solid ${C.success}40`,
            background: `${C.success}15`,
            color: C.success, fontSize: 12, fontWeight: 700,
          }}>
            Skip Duplicates — Sync {newCount} New Only
          </button>
          <button onClick={onReplace} style={{
            flex: 1, padding: "10px", borderRadius: 8, cursor: "pointer",
            border: `1px solid ${C.warning}40`,
            background: `${C.warning}15`,
            color: C.warning, fontSize: 12, fontWeight: 700,
          }}>
            Replace All — Sync {newCount + duplicates.length} Students
          </button>
        </div>
      </div>
    </div>
  );
}
