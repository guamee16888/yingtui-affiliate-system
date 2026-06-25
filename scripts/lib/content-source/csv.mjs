export function sourceImportRowsToCsv(rows) {
  const headers = ["researchId", "priority", "name", "url", "tagline", "source", "circle", "candidateType", "sourceUrl", "published", "researchProvider", "researchQuery", "researchUrl", "acceptanceChecklist", "notes"];
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header] ?? "")).join(","))
  ].join("\n");
}

function csvCell(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll("\"", "\"\"")}"`;
}
