/** What the analysis can read. Shared by the classic and the v3 mode of the analyse route. */

export const MAX_ANALYSE_BYTES = 25 * 1024 * 1024;

export const ACCEPTED_MIME = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"]);

export const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
};

export function mimeTypeFor(fileName: string): { extension: string; mimeType: string } {
  const extension = (fileName.split(".").pop() || "").toLowerCase();
  return { extension, mimeType: MIME_BY_EXTENSION[extension] ?? "" };
}
