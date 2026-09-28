/**
 * Utility functions for parsing UOP student CSV files and building image URLs.
 */

export const FACULTY_PREFIX_MAP = {
  A: "ART",
  ART: "ART",
  ARTS: "ART",
  AHS: "AHS",
  AG: "AGR",
  AGR: "AGR",
  AGRICULTURE: "AGR",
  M: "MED",
  MED: "MED",
  MEDICINE: "MED",
  E: "ENG",
  ENG: "ENG",
  ENGINEERING: "ENG",
  S: "SCI",
  SCI: "SCI",
  SCIENCE: "SCI",
  D: "DEN",
  DEN: "DEN",
  DENTAL: "DEN",
  DENTISTRY: "DEN",
  V: "VET",
  VS: "VET",
  VM: "VET",
  VET: "VET",
  VETERINARY: "VET",
  MG: "MGT",
  MGT: "MGT",
  MANAGEMENT: "MGT",
};

/**
 * Resolves any faculty string (prefix, code, or faculty name) to canonical UOP code (e.g. MGT, VET).
 */
export function resolveFacultyCode(input) {
  if (!input) return "UNKNOWN";
  const s = String(input).trim().toUpperCase();
  if (FACULTY_PREFIX_MAP[s]) return FACULTY_PREFIX_MAP[s];
  if (/MANAG|MGT|\bMG\b/i.test(s)) return "MGT";
  if (/VET|ANIMAL|\bVS\b|\bVM\b/i.test(s)) return "VET";
  if (/DENT|\bDEN\b|\bD\b/i.test(s)) return "DEN";
  if (/ALLIED|HEALTH|\bAHS\b/i.test(s)) return "AHS";
  if (/AGRI|\bAGR\b|\bAG\b/i.test(s)) return "AGR";
  if (/ENG|\bE\b/i.test(s)) return "ENG";
  if (/MED|\bM\b/i.test(s)) return "MED";
  if (/SCI|\bS\b/i.test(s)) return "SCI";
  if (/ART|\bA\b/i.test(s)) return "ART";
  return s;
}

/**
 * Extracts admission/batch year from a UOP student registration/index number.
 * e.g. "A/16/AI/877" -> 2016
 *      "AHS/14/RAD/FQ/002" -> 2014
 *      "AG/23/AI/903" -> 2023
 *      "E/17/063" -> 2017
 *      "19/ENG/045" -> 2019
 * @param {string} regno
 * @returns {number|null}
 */
export function parseYearFromIndex(regno) {
  if (!regno) return null;
  const clean = String(regno).trim();
  // Match 2 or 4 digits between slashes or following prefix
  const match = clean.match(/(?:^|[A-Za-z]+\/)([0-9]{2,4})(?:\/|$)/) || clean.match(/\b([0-9]{2,4})\b/);
  if (match) {
    const val = parseInt(match[1], 10);
    if (val < 50) return 2000 + val;
    if (val < 100) return 1900 + val;
    return val;
  }
  return null;
}

/**
 * Builds student photo URL.
 * Note: Direct university photo URLs are protected and kept strictly on the
 * backend service to ensure student data privacy. Frontend displays initials
 * avatars or locally enrolled photos.
 * @param {string} regno
 * @returns {string}
 */
export function buildImageUrl(_regno) {
  // Kept empty on client side for data privacy compliance.
  return "";
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
    /^(reg_?no|regno|registration_?no|index|index_?no)$/i.test(h)
  );
  if (regNoIdx === -1) {
    // Fallback: look for any header containing 'reg' or 'index'
    regNoIdx = headers.findIndex((h) => /reg|index/i.test(h));
  }
  if (regNoIdx === -1) {
    // Default to first column if no header matches
    regNoIdx = 0;
  }

  // Check for optional name, faculty, or year headers
  const nameIdx = headers.findIndex((h) => /^name$/i.test(h));
  const facultyIdx = headers.findIndex((h) => /^faculty$/i.test(h));
  const yearIdx = headers.findIndex((h) => /^year$/i.test(h));

  const students = [];
  const seenRegNos = new Set();
  let duplicateCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i]
      .split(",")
      .map((cell) => cell.trim().replace(/^["']|["']$/g, ""));
    const regno = row[regNoIdx];

    if (!regno) continue;

    // Check for internal duplicates within the CSV file
    const normalizedRegNo = regno.trim();
    if (seenRegNos.has(normalizedRegNo.toUpperCase())) {
      duplicateCount++;
      continue;
    }
    seenRegNos.add(normalizedRegNo.toUpperCase());

    // Extract prefix before first '/' and resolve canonical faculty code
    const prefix = normalizedRegNo.split("/")[0].toUpperCase();
    const explicitFaculty = (facultyIdx !== -1 && row[facultyIdx]) ? row[facultyIdx].trim() : "";
    const canonicalFaculty = resolveFacultyCode(explicitFaculty || prefix);

    const name =
      nameIdx !== -1 && row[nameIdx]
        ? row[nameIdx]
        : `Student (${normalizedRegNo})`;

    // Initials generation
    const parts = normalizedRegNo.split("/").filter(Boolean);
    const initials =
      parts.length > 1
        ? `${parts[0]}${parts[parts.length - 1]}`
        : normalizedRegNo.substring(0, 4);

    // Extract year from index number (e.g. A/16/AI/877 -> 2016)
    const yearFromIndex = parseYearFromIndex(normalizedRegNo);
    const yearExplicit = yearIdx !== -1 && row[yearIdx] ? parseInt(row[yearIdx], 10) : null;
    const year = yearFromIndex || yearExplicit || 1;

    students.push({
      id: normalizedRegNo,
      regno: normalizedRegNo,
      name: name,
      facultyId: canonicalFaculty,
      faculty: canonicalFaculty,
      year: year,
      initials: initials,
      photoUrl: buildImageUrl(normalizedRegNo),
    });
  }

  // Attach metadata properties
  students.totalRows = lines.length - 1;
  students.duplicateCount = duplicateCount;

  return students;
}
