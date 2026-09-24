/**
 * API Service
 * -----------
 * All real HTTP calls go here.
 * Components import from this file instead of using fetch() directly.
 *
 * Base URL is empty — Vite proxy routes:
 *   /api/*      → Spring Boot (localhost:8080)
 *   Flask is called indirectly through Spring Boot
 */

// ── Auth ─────────────────────────────────────────────────────────────────────

/**
 * Login with username + password.
 * Returns { token, user } or throws an error.
 */
export async function login(username, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || 'Login failed');
  }
  return data; // { success, data: { token } }
}

// ── Identification ────────────────────────────────────────────────────────────

/**
 * Identify faces in an uploaded image.
 * Calls Spring Boot → Spring Boot calls Flask → returns matches.
 *
 * Returns array of matches:
 * [{ studentId, confidence, studentName, faculty, ... }]
 */
export async function identifyImage(imageFile, token) {
  const form = new FormData();
  form.append('image', imageFile);

  const res = await fetch('/api/identification/search', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || 'Identification failed');
  }
  return data;
}

// ── Students ──────────────────────────────────────────────────────────────────

/**
 * Get all students registered in the system.
 * Used by the student registry table.
 */
export async function getStudents(token) {
  const res = await fetch('/api/students', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to fetch students');
  return data;
}

/**
 * Check which reg numbers in a list already exist in the DB.
 * Used before syncing a CSV to detect duplicates.
 *
 * Returns { total, newCount, duplicateCount, duplicates: [...] }
 */
export async function checkCsvDuplicates(regNumbers, token) {
  const res = await fetch('/api/students/check-duplicates', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ regNumbers }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Duplicate check failed');
  return data;
}

/**
 * Send a CSV to the AI sync service. The service fetches student photos,
 * generates embeddings, and stores them through Spring Boot in MySQL.
 */
export async function syncCsv(file, replace = false) {
  const form = new FormData();
  form.append('file', file);
  form.append('replace', String(replace));

  const res = await fetch('/ai/sync/csv', {
    method: 'POST',
    body: form,
  });

  const responseText = await res.text();
  let data = {};
  if (responseText.trim()) {
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { error: responseText.trim() };
    }
  }
  if (!res.ok) {
    throw new Error(data.error || `CSV sync failed (HTTP ${res.status})`);
  }
  if (!responseText.trim()) {
    throw new Error(`CSV sync failed: the AI service returned an empty response (HTTP ${res.status})`);
  }
  return data;
}

/**
 * Get system stats — total students, identifications, registrations.
 */
export async function getStats(token) {
  const res = await fetch('/api/stats', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error('Failed to fetch stats');
  return data;
}
