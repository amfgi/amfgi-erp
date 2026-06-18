export function generateEmployeeCode() {
  const stamp = Date.now().toString(36).toUpperCase();
  return `EMP-${stamp.slice(-6)}`;
}
