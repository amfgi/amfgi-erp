/** Resolve numeric delivery note # from structured row or legacy `notes` header. */
export function resolveDeliveryNoteNumber(
  notes: string | null | undefined,
  deliveryNote?: { number: number } | null
): number {
  if (deliveryNote != null && Number.isFinite(deliveryNote.number)) {
    return deliveryNote.number;
  }
  const m = notes?.match(/--- DELIVERY NOTE #(\d+)/);
  return m?.[1] ? parseInt(m[1], 10) : 0;
}

/** Label segment for Drive filenames, e.g. `DN001`. */
export function formatDeliveryNoteDriveLabel(number: number): string {
  const raw = Number.isFinite(number) && number > 0 ? String(Math.trunc(number)) : '0';
  return `DN${raw.padStart(3, '0')}`;
}
