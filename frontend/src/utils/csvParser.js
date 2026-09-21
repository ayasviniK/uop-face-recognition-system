/**
 * Utility functions for parsing UOP student CSV files and building image URLs.
 */

const FACULTY_PREFIX_MAP = {
  A: "ART",
  ART: "ART",
  AHS: "AHS",
  AG: "AGR",
  AGR: "AGR",
  M: "MED",
  MED: "MED",
  E: "ENG",
  ENG: "ENG",
  S: "SCI",
  SCI: "SCI",
  D: "DEN",
  DEN: "DEN",
  V: "VET",
  VET: "VET",
  MGT: "MGT",
};

/**
 * Builds the official UOP student photo URL given a registration number.
 * e.g. "A/16/AI/877" -> "https://stud.pdn.ac.lk/view.php?regno=A%2F16%2FAI%2F877"
 * @param {string} regno
 * @returns {string}
 */
export function buildImageUrl(regno) {
  if (!regno) return "";
  const clean = String(regno).trim();
  if (!clean) return "";
  return `https://stud.pdn.ac.lk/view.php?regno=${encodeURIComponent(clean)}`;
}

/**
 * Parses a CSV string containing student records.
 * Expects a header row with a column like "Reg_No" (or "regno", "reg_no").
 * @param {string} csvText
 * @returns {Array<Object>} List of student objects
 */
export function parseStudentCSV(csvText) {
  if (!csvText || typeof csvText !== "string") return [];

  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return [];

  // Parse header line
  const headerLine = lines[0];
  const headers = headerLine
    .split(",")
    .map((h) => h.trim().replace(/^["']|["']$/g, ""));

  // Find index of Reg_No column
  let regNoIdx = headers.findIndex((h) =>
    /^(reg_?no|regno|registration_?no)$/i.test(h)
  );
  if (regNoIdx === -1) {
    // Fallback: look for any header containing 'reg'
    regNoIdx = headers.findIndex((h) => /reg/i.test(h));
  }
  if (regNoIdx === -1) {
    // Default to first column if no header matches
    regNoIdx = 0;
  }

  // Check for optional name or faculty headers
  const nameIdx = headers.findIndex((h) => /^name$/i.test(h));
  const facultyIdx = headers.findIndex((h) => /^faculty$/i.test(h));

  const students = [];

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i]
      .split(",")
      .map((cell) => cell.trim().replace(/^["']|["']$/g, ""));
    const regno = row[regNoIdx];

    if (!regno) continue;

    // Extract prefix before first '/'
    const prefix = regno.split("/")[0].toUpperCase();
    const facultyId = FACULTY_PREFIX_MAP[prefix] || prefix || "UNKNOWN";

    const name =
      nameIdx !== -1 && row[nameIdx]
        ? row[nameIdx]
        : `Student (${regno})`;

    // Initials generation
    const parts = regno.split("/").filter(Boolean);
    const initials =
      parts.length > 1
        ? `${parts[0]}${parts[parts.length - 1]}`
        : regno.substring(0, 4);

    students.push({
      id: regno,
      regno: regno,
      name: name,
      facultyId: facultyIdx !== -1 && row[facultyIdx] ? row[facultyIdx] : facultyId,
      faculty: facultyId,
      initials: initials,
      photoUrl: buildImageUrl(regno),
    });
  }

  return students;
}
