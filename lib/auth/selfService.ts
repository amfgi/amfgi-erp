type SelfServiceCandidate = {
  isSuperAdmin?: boolean | null;
  permissions?: string[] | null;
  linkedEmployeeId?: string | null;
};

/** Row / session shape: linked employee login, not a super admin. */
export function isEmployeeSelfServiceAccount(
  user: { isSuperAdmin?: boolean | null; linkedEmployeeId?: string | null } | null | undefined,
) {
  if (!user) return false;
  if (user.isSuperAdmin) return false;
  return Boolean(user.linkedEmployeeId);
}

export function isEmployeeSelfServiceUser(user: SelfServiceCandidate | null | undefined) {
  if (!user) return false;
  return isEmployeeSelfServiceAccount(user);
}
