import { P } from '@/lib/permissions';
import {
  canHrVisaCreate,
  canHrVisaDelete,
  canHrVisaEdit,
  canHrVisaView,
} from '@/lib/hr/visaPermissions';

describe('visaPermissions', () => {
  const user = (permissions: string[]) => ({
    isSuperAdmin: false,
    permissions,
  });

  it('does not grant visa access from hr.employee.view or hr.employee.edit alone', () => {
    expect(canHrVisaView(user([P.HR_EMPLOYEE_VIEW]))).toBe(false);
    expect(canHrVisaCreate(user([P.HR_EMPLOYEE_EDIT]))).toBe(false);
    expect(canHrVisaEdit(user([P.HR_EMPLOYEE_EDIT]))).toBe(false);
    expect(canHrVisaDelete(user([P.HR_EMPLOYEE_EDIT]))).toBe(false);
  });

  it('splits granular visa permissions', () => {
    const viewOnly = user([P.HR_VISA_VIEW]);
    expect(canHrVisaView(viewOnly)).toBe(true);
    expect(canHrVisaEdit(viewOnly)).toBe(false);

    const editor = user([P.HR_VISA_VIEW, P.HR_VISA_EDIT]);
    expect(canHrVisaEdit(editor)).toBe(true);
    expect(canHrVisaDelete(editor)).toBe(false);
  });

  it('does not elevate employee.edit when granular visa view is assigned', () => {
    const perms = [P.HR_EMPLOYEE_EDIT, P.HR_VISA_VIEW];
    expect(canHrVisaView(user(perms))).toBe(true);
    expect(canHrVisaCreate(user(perms))).toBe(false);
    expect(canHrVisaEdit(user(perms))).toBe(false);
    expect(canHrVisaDelete(user(perms))).toBe(false);
  });
});
