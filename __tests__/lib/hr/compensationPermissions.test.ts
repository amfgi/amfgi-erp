import { P } from '@/lib/permissions';
import {
  canHrCompensationAddPackage,
  canHrCompensationCreate,
  canHrCompensationDelete,
  canHrCompensationEdit,
  canHrCompensationPostPackage,
  canHrCompensationReadPayrollCatalog,
  canHrCompensationRecordChange,
  canHrCompensationRecordPackage,
  canHrCompensationView,
  canHrPayrollCatalogRead,
  canHrPayrollSettingsView,
  hasLegacyHrCompensationFullAccess,
} from '@/lib/hr/compensationPermissions';

describe('compensationPermissions', () => {
  const user = (permissions: string[]) => ({
    isSuperAdmin: false,
    permissions,
  });

  it('grants full CRUD to legacy hr.payroll.compensation', () => {
    const perms = [P.HR_PAYROLL_COMPENSATION];
    expect(hasLegacyHrCompensationFullAccess(perms)).toBe(true);
    expect(canHrCompensationView(user(perms))).toBe(true);
    expect(canHrCompensationCreate(user(perms))).toBe(true);
    expect(canHrCompensationEdit(user(perms))).toBe(true);
    expect(canHrCompensationDelete(user(perms))).toBe(true);
    expect(canHrCompensationRecordPackage(user(perms))).toBe(true);
  });

  it('does not grant compensation access from payroll settings or employee perms alone', () => {
    expect(canHrCompensationView(user([P.HR_PAYROLL_SETTINGS]))).toBe(false);
    expect(canHrCompensationView(user([P.HR_EMPLOYEE_VIEW]))).toBe(false);
    expect(canHrCompensationCreate(user([P.HR_EMPLOYEE_EDIT]))).toBe(false);
    expect(canHrCompensationReadPayrollCatalog(user([P.HR_PAYROLL_SETTINGS]))).toBe(false);
    expect(canHrPayrollSettingsView(user([P.HR_PAYROLL_SETTINGS]))).toBe(true);
    expect(canHrPayrollCatalogRead(user([P.HR_PAYROLL_SETTINGS]))).toBe(true);
  });

  it('splits granular compensation permissions', () => {
    const viewOnly = user([P.HR_COMPENSATION_VIEW]);
    expect(canHrCompensationView(viewOnly)).toBe(true);
    expect(canHrCompensationRecordPackage(viewOnly)).toBe(false);
    expect(canHrCompensationDelete(viewOnly)).toBe(false);

    const creator = user([P.HR_COMPENSATION_VIEW, P.HR_COMPENSATION_CREATE]);
    expect(canHrCompensationAddPackage(creator)).toBe(true);
    expect(canHrCompensationRecordChange(creator)).toBe(false);
    expect(canHrCompensationPostPackage(creator, false)).toBe(true);
    expect(canHrCompensationPostPackage(creator, true)).toBe(false);

    const editor = user([P.HR_COMPENSATION_VIEW, P.HR_COMPENSATION_EDIT]);
    expect(canHrCompensationRecordChange(editor)).toBe(true);
    expect(canHrCompensationAddPackage(editor)).toBe(false);
    expect(canHrCompensationPostPackage(editor, true)).toBe(true);
    expect(canHrCompensationPostPackage(editor, false)).toBe(false);

    const deleter = user([P.HR_COMPENSATION_VIEW, P.HR_COMPENSATION_DELETE]);
    expect(canHrCompensationDelete(deleter)).toBe(true);
    expect(canHrCompensationRecordPackage(deleter)).toBe(false);
  });

  it('does not elevate legacy payroll.compensation when granular compensation perms are assigned', () => {
    const perms = [P.HR_PAYROLL_COMPENSATION, P.HR_COMPENSATION_VIEW];
    expect(hasLegacyHrCompensationFullAccess(perms)).toBe(false);
    expect(canHrCompensationView(user(perms))).toBe(true);
    expect(canHrCompensationCreate(user(perms))).toBe(false);
    expect(canHrCompensationRecordPackage(user(perms))).toBe(false);
  });

  it('allows payroll catalog read for compensation roles only', () => {
    expect(canHrCompensationReadPayrollCatalog(user([P.HR_COMPENSATION_VIEW]))).toBe(true);
    expect(canHrCompensationReadPayrollCatalog(user([P.HR_COMPENSATION_CREATE]))).toBe(true);
    expect(canHrCompensationReadPayrollCatalog(user([P.HR_EMPLOYEE_VIEW]))).toBe(false);
  });
});
