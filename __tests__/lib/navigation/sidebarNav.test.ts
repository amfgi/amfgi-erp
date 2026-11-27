import {
  collectSidebarHrefs,
  filterSidebarNavEntries,
  isSidebarGroupActive,
  isSidebarPathActive,
  SIDEBAR_NAV_ENTRIES,
  type SidebarNavGroup,
} from '@/lib/navigation/sidebarNav';

const visibility = {
  isSuperAdmin: false,
  linkedEmployeeId: null,
};

function employeesGroup(permissions: string[]) {
  const entries = filterSidebarNavEntries(SIDEBAR_NAV_ENTRIES, { ...visibility, permissions });
  const group = entries.find((entry) => entry.type === 'group' && entry.id === 'employees');
  if (!group || group.type !== 'group') throw new Error('Employees group missing');
  return group;
}

function labels(group: SidebarNavGroup) {
  return group.children.map((child) => ('type' in child && child.type === 'group' ? child.label : child.label));
}

describe('employees sidebar group', () => {
  const hrefs = collectSidebarHrefs(SIDEBAR_NAV_ENTRIES);

  it('keeps history off the all-employees item and highlights profiles', () => {
    expect(isSidebarPathActive('/hr/employees/history', '/hr/employees', hrefs)).toBe(false);
    expect(isSidebarPathActive('/hr/employees/history', '/hr/employees/history', hrefs)).toBe(true);
    expect(isSidebarPathActive('/hr/employees/new', '/hr/employees', hrefs)).toBe(true);
    expect(isSidebarPathActive('/hr/employees/emp-1', '/hr/employees', hrefs)).toBe(true);
  });

  it('opens Employees and Leave on the leave-types page', () => {
    const group = employeesGroup(['hr.payroll.settings']);
    const leave = group.children.find((child) => 'type' in child && child.type === 'group');
    expect(isSidebarGroupActive('/hr/settings/leave-types', group, hrefs)).toBe(true);
    expect(leave && isSidebarGroupActive('/hr/settings/leave-types', leave, hrefs)).toBe(true);
    expect(isSidebarPathActive('/hr/settings/leave-types', '/hr/leave', hrefs)).toBe(false);
  });

  it('shows only the sections a permission can open', () => {
    expect(labels(employeesGroup(['hr.leave.view']))).toEqual(['Leave Management']);
    expect(labels(employeesGroup(['hr.employee.view']))).toEqual([
      'All employees',
      'Employee History & Reports',
      'Employee Setup',
    ]);
    expect(labels(employeesGroup(['hr.payroll.settings']))).toEqual(['Leave Management']);
  });

  it('drops Leave Management when none of its links are visible', () => {
    const entries = filterSidebarNavEntries(SIDEBAR_NAV_ENTRIES, {
      ...visibility,
      permissions: ['hr.leave.approve'],
    });
    expect(entries.some((entry) => entry.type === 'group' && entry.id === 'employees')).toBe(false);
  });
});
