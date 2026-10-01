import { useState, useRef } from "react";
import { X, Upload, CheckCircle, AlertCircle, ScanFace, Sparkles } from "lucide-react";
import { UOP_FACULTIES, getFacultyById } from "../data/faculties.js";
import { parseYearFromIndex, resolveFacultyCode } from "../utils/csvParser.js";

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
  text:    "#F0F4F8",
  sub:     "#8FA3BF",
  muted:   "#4B6080",
};

export default function EnrollStudentModal({ isOpen, onClose, onEnrolled, students = [] }) {
  const [studentId, setStudentId] = useState("");
  const [fullName, setFullName] = useState("");
  const [faculty, setFaculty] = useState("Faculty of Engineering");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);

  if (!isOpen) return null;

  const handleIdChange = (id) => {
    setStudentId(id);
    const existing = students.find(s => s.id?.toLowerCase() === id.trim().toLowerCase());
    if (existing) {
      if (existing.name) setFullName(existing.name);
      if (existing.faculty || existing.facultyId) {
        const facObj = getFacultyById(existing.facultyId || existing.faculty);
        setFaculty(facObj?.name || existing.faculty || existing.facultyId);
      }
    } else if (id.includes("/")) {
      const code = resolveFacultyCode(id);
      const facObj = getFacultyById(code);
      if (facObj && facObj.name && facObj.code !== "UNK") {
        setFaculty(facObj.name);
      }
    }
  };

  const handleFileSelect = (file) => {
    if (!file) return;
    setError("");
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target.result);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!studentId.trim()) {
      setError("Please enter a student registration/index number.");
      return;
    }
    if (!fullName.trim()) {
      setError("Please enter the student's full name.");
      return;
    }
    if (!imageFile) {
      setError("Please select a front-facing photo for facial biometric enrollment.");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const formData = new FormData();
      formData.append("student_id", studentId.trim());
      formData.append("full_name", fullName.trim());
      formData.append("image", imageFile);
      const parsedYear = parseYearFromIndex(studentId.trim()) || 1;
      formData.append("year", parsedYear);
      formData.append("email", `${studentId.trim().replace(/\//g, "_")}@pdn.ac.lk`);

      let res = null;
      try {
        res = await fetch("http://localhost:5000/register", {
          method: "POST",
          body: formData,
        });
      } catch (networkErr) {
        throw new Error(
          "Cannot reach Python AI service on http://localhost:5000. Please ensure 'python app.py' is running in the python-ai-service folder.",
          { cause: networkErr }
        );
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Enrollment failed on AI backend.");
      }

      setSuccess(`✓ Successfully registered ${fullName} with ${data.embeddings_generated || 6} ArcFace biometric embeddings!`);

      const facCode = resolveFacultyCode(faculty);
      const facObj = getFacultyById(facCode);

      const enrolledStudent = {
        id: studentId.trim(),
        regno: studentId.trim(),
        name: fullName.trim(),
        facultyId: facCode,
        faculty: facObj?.name || faculty,
        accentColor: facObj?.color || "#3B82F6",
        year: parsedYear,
        initials: fullName.trim().split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(),
        photoUrl: imagePreview,
      };

      if (onEnrolled) {
        onEnrolled(enrolledStudent);
      }

      try {
        const stored = JSON.parse(localStorage.getItem("sentinel_enrolled_photos") || "{}");
        stored[studentId.trim().toUpperCase()] = imagePreview;
        localStorage.setItem("sentinel_enrolled_photos", JSON.stringify(stored));
      } catch {
        // ignore localStorage error
      }

      setTimeout(() => {
        onClose();
      }, 1400);

    } catch (err) {
      setError(err.message || "Failed to enroll student.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1200,
      background: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20
    }} onClick={onClose}>
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16,
        maxWidth: 520, width: "100%", padding: 26, boxShadow: "0 24px 70px rgba(0,0,0,0.8)",
        position: "relative",
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: `${C.accent}20`, border: `1px solid ${C.accent}40`,
              display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              <ScanFace size={20} color={C.accent} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>
                Enroll Student Face Biometrics
              </div>
              <div style={{ fontSize: 11, color: C.muted }}>
                Generate 512-dim ArcFace identity vectors for instant matching
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: C.muted, cursor: "pointer", padding: 4
          }}>
            <X size={18} />
          </button>
        </div>

        {error && (
          <div style={{
            padding: "10px 14px", borderRadius: 8, background: `${C.danger}18`,
            border: `1px solid ${C.danger}40`, color: C.danger, fontSize: 12,
            marginBottom: 16, display: "flex", alignItems: "center", gap: 8
          }}>
            <AlertCircle size={15} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div style={{
            padding: "10px 14px", borderRadius: 8, background: `${C.success}18`,
            border: `1px solid ${C.success}40`, color: C.success, fontSize: 12,
            marginBottom: 16, display: "flex", alignItems: "center", gap: 8
          }}>
            <CheckCircle size={15} style={{ flexShrink: 0 }} />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Student ID */}
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.sub, marginBottom: 5 }}>
              STUDENT REGISTRATION / INDEX NUMBER *
            </label>
            <input
              type="text"
              list="student-ids-list"
              value={studentId}
              onChange={e => handleIdChange(e.target.value)}
              placeholder="e.g. A/16/AI/877, E/20/123, AG/23/AI/903"
              style={{
                width: "100%", padding: "10px 12px", borderRadius: 8,
                background: C.raised, border: `1px solid ${C.border}`,
                color: C.text, fontSize: 13, fontFamily: "'JetBrains Mono',monospace", outline: "none",
              }}
            />
            <datalist id="student-ids-list">
              {students.slice(0, 50).map(s => (
                <option key={s.id} value={s.id}>{s.name ? `${s.id} - ${s.name}` : s.id}</option>
              ))}
            </datalist>
          </div>

          {/* Full Name */}
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.sub, marginBottom: 5 }}>
              FULL NAME *
            </label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="e.g. K.M. Perera"
              style={{
                width: "100%", padding: "10px 12px", borderRadius: 8,
                background: C.raised, border: `1px solid ${C.border}`,
                color: C.text, fontSize: 13, outline: "none",
              }}
            />
          </div>

          {/* Faculty */}
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.sub, marginBottom: 5 }}>
              FACULTY
            </label>
            <select
              value={faculty}
              onChange={e => setFaculty(e.target.value)}
              style={{
                width: "100%", padding: "10px 12px", borderRadius: 8,
                background: C.raised, border: `1px solid ${C.border}`,
                color: C.text, fontSize: 12, outline: "none"
              }}
            >
              {UOP_FACULTIES.filter(f => f.code !== "ALL").map(f => (
                <option key={f.code} value={f.name}>{f.name} ({f.code})</option>
              ))}
            </select>
          </div>

          {/* Photo Upload Zone */}
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.sub, marginBottom: 5 }}>
              REFERENCE / PASSPORT PHOTO *
            </label>
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); handleFileSelect(e.dataTransfer.files[0]); }}
              style={{
                border: `2px dashed ${dragging ? C.accent : C.border}`,
                borderRadius: 10, padding: "20px 16px", textAlign: "center", cursor: "pointer",
                background: dragging ? `${C.accent}12` : C.raised, transition: "all 0.2s"
              }}
            >
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={e => handleFileSelect(e.target.files[0])}
              />
              {imagePreview ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}>
                  <img
                    src={imagePreview}
                    alt="Preview"
                    style={{ width: 72, height: 72, borderRadius: 10, objectFit: "cover", border: `2px solid ${C.accent}` }}
                  />
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Photo Selected</div>
                    <div style={{ fontSize: 11, color: C.muted }}>Click or drop to replace</div>
                  </div>
                </div>
              ) : (
                <>
                  <Upload size={24} color={C.accent} style={{ margin: "0 auto 8px" }} />
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>
                    Upload Front-Facing ID Photo
                  </div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                    Clear passport photo or selfie · JPEG, PNG
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                flex: 1, padding: "11px", borderRadius: 8, border: `1px solid ${C.border}`,
                background: "transparent", color: C.sub, fontSize: 12, fontWeight: 600, cursor: "pointer"
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                flex: 2, padding: "11px", borderRadius: 8, border: "none",
                background: `linear-gradient(135deg, ${C.accent}, ${C.accentD})`,
                color: "#fff", fontSize: 12, fontWeight: 700, cursor: loading ? "default" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                opacity: loading ? 0.7 : 1,
              }}
            >
              <Sparkles size={14} />
              {loading ? "Extracting ArcFace Vectors…" : "Enroll Face & Generate Vectors"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
