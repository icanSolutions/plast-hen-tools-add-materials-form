/** Google Docs replaceText expects formatted price strings (he-IL). */
export function formatPriceForDoc(value) {
  const n = value != null && value !== '' ? Number(value) : NaN
  if (!Number.isFinite(n)) return '0'
  return n.toLocaleString('he-IL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}
