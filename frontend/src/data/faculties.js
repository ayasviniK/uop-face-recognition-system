/**
 * Canonical 9 Faculties of the University of Peradeniya (UOP)
 */
export const UOP_FACULTIES = [
  { id: "AGR", code: "AGR", name: "Faculty of Agriculture", color: "#10B981" },
  { id: "AHS", code: "AHS", name: "Faculty of Allied Health Sciences", color: "#06B6D4" },
  { id: "ART", code: "ART", name: "Faculty of Arts", color: "#EF4444" },
  { id: "DEN", code: "DEN", name: "Faculty of Dental Sciences", color: "#EC4899" },
  { id: "ENG", code: "ENG", name: "Faculty of Engineering", color: "#3B82F6" },
  { id: "MGT", code: "MGT", name: "Faculty of Management", color: "#F59E0B" },
  { id: "MED", code: "MED", name: "Faculty of Medicine", color: "#10B981" },
  { id: "SCI", code: "SCI", name: "Faculty of Science", color: "#8B5CF6" },
  { id: "VET", code: "VET", name: "Faculty of Veterinary Medicine & Animal Science", color: "#6366F1" },
];

export const FACULTY_MAP = UOP_FACULTIES.reduce((acc, f) => {
  acc[f.id] = f;
  return acc;
}, {});

export function getFacultyById(id) {
  return FACULTY_MAP[id] || { id: id || "UNKNOWN", code: id || "UNK", name: id || "Unknown Faculty", color: "#3B82F6" };
}
