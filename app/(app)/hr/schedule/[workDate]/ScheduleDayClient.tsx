'use client';

import { type CSSProperties, type DragEvent, type KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/shadcn/button';
import SearchSelect from '@/components/ui/SearchSelect';
import { parseWorkforceProfile } from '@/lib/hr/workforceProfile';
import { useTheme } from '@/providers/ThemeProvider';
import type { WorkScheduleContext } from '@/lib/utils/templateData';
import {
  WORK_SCHEDULE_PRINT_CHANNEL,
  WORK_SCHEDULE_PRINT_PAYLOAD_KEY,
  type WorkSchedulePrintPayload,
} from '@/lib/utils/printTemplateSession';
import toast from 'react-hot-toast';

interface EmpOpt {
  id: string;
  fullName: string;
  preferredName: string | null;
  employeeCode: string;
  status?: string | null;
  profileExtension?: unknown;
  basicHoursPerDay?: number;
  defaultTiming?: {
    dutyStart?: string;
    dutyEnd?: string;
    breakStart?: string;
    breakEnd?: string;
  } | null;
}
interface JobOpt {
  id: string;
  jobNumber: string;
  customerName?: string | null;
  description?: string | null;
  projectDetails?: string | null;
  quotationNumber?: string | null;
  lpoNumber?: string | null;
  site?: string | null;
  finishedGoods?: unknown;
  requiredExpertises?: unknown;
}

interface MemberRow {
  employeeId: string;
  role: 'WORKER' | 'HELPER' | 'TEAM_LEADER';
  slot: number;
}

interface subTeamDraft {
  id: string;
  label: string;
  members: MemberRow[];
}

interface AsgDraft {
  columnIndex: number;
  label: string;
  locationType: 'SITE_JOB' | 'FACTORY' | 'OTHER';
  jobId: string;
  factoryCode: string;
  jobNumberSnapshot: string;
  workProcessDetails: string;
  targetQty: string;
  driver1EmployeeId: string;
  driver2EmployeeId: string;
  dutyStart: string;
  dutyEnd: string;
  breakStart: string;
  breakEnd: string;
  remarks: string;
  splitMode: boolean;
  members: MemberRow[];
  subTeams: subTeamDraft[];
}

interface ScheduleTemplateOption {
  id: string;
  workDate: string;
  status: string;
}

function getNextTeamNumber(rows: AsgDraft[]): number {
  const numericLabels = rows
    .map((row) => {
      const match = row.label.match(/Team#(\d+)/i);
      return match ? Number(match[1]) : 0;
    })
    .filter((value) => Number.isFinite(value) && value > 0);
  return (numericLabels.length > 0 ? Math.max(...numericLabels) : 0) + 1;
}

function parseBrk(raw: string | null | undefined): { breakStart: string; breakEnd: string } {
  if (!raw) return { breakStart: '', breakEnd: '' };
  const m = raw.trim().match(/^(\d{1,2}:\d{2})\s*[-Ã¢â‚¬â€œ]\s*(\d{1,2}:\d{2})$/);
  return m ? { breakStart: m[1], breakEnd: m[2] } : { breakStart: '', breakEnd: '' };
}

function formatScheduleTimeForPrint(raw: string | null | undefined): string {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return value;
  const hour24 = Number(match[1]);
  const minute = match[2];
  if (!Number.isFinite(hour24) || hour24 < 0 || hour24 > 23) return value;
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${minute} ${suffix}`;
}

function getInitialWorkProcessDetails(job: JobOpt | null | undefined): string {
  const saved = String(job?.description ?? '').trim();
  return saved;
}

function resolveWorkProcessDetails(workProcessDetails: string, job: JobOpt | null | undefined): string {
  if (workProcessDetails) return String(workProcessDetails).trim();
  if (job?.description) return String(job.description).trim();
  return String(workProcessDetails ?? '').trim();
}

async function readApiEnvelope<T = Record<string, unknown>>(response: Response): Promise<T | null> {
  try {
    const text = await response.text();
    if (!text.trim()) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function nextSubTeamLabel(index: number): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (index < letters.length) return `Sub-team ${letters[index]}`;
  return `Sub-team ${index + 1}`;
}

function createEmptySubTeam(index: number): subTeamDraft {
  return {
    id: crypto.randomUUID(),
    label: nextSubTeamLabel(index),
    members: [],
  };
}

function normalizeMemberList(members: MemberRow[]): MemberRow[] {
  return members.map((member, index) => ({
    employeeId: String(member.employeeId ?? ''),
    role: member.role === 'HELPER' || member.role === 'TEAM_LEADER' ? member.role : 'WORKER',
    slot: index + 1,
  }));
}

function extractSubTeamsFromMembers(members: MemberRow[]): { splitMode: boolean; members: MemberRow[]; subTeams: subTeamDraft[] } {
  const ordered = [...members].sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
  const leaderMembers = ordered.filter((member) => member.role === 'TEAM_LEADER');

  // Single-team schedules also persist the first assigned person as TEAM_LEADER.
  // Treat that as a normal team unless multiple TEAM_LEADER markers exist.
  if (leaderMembers.length <= 1) {
    return {
      splitMode: false,
      members: normalizeMemberList(
        ordered.map((member) => ({
          ...member,
          role: member.role === 'TEAM_LEADER' ? 'WORKER' : member.role,
        }))
      ),
      subTeams: [],
    };
  }

  const subTeams: subTeamDraft[] = [];
  let currentSubTeam: subTeamDraft | null = null;

  for (const member of ordered) {
    if (member.role === 'TEAM_LEADER') {
      currentSubTeam = createEmptySubTeam(subTeams.length);
      subTeams.push(currentSubTeam);
      currentSubTeam.members.push({
        employeeId: member.employeeId,
        role: 'TEAM_LEADER',
        slot: currentSubTeam.members.length + 1,
      });
      continue;
    }

    if (!currentSubTeam) {
      currentSubTeam = createEmptySubTeam(subTeams.length);
      subTeams.push(currentSubTeam);
    }
    currentSubTeam.members.push({
      employeeId: member.employeeId,
      role: member.role === 'HELPER' ? 'HELPER' : 'WORKER',
      slot: currentSubTeam.members.length + 1,
    });
  }

  return {
    splitMode: true,
    members: [],
    subTeams: subTeams.map((subTeam, index) => ({
      ...subTeam,
      label: subTeam.label || nextSubTeamLabel(index),
      members: normalizeMemberList(subTeam.members),
    })),
  };
}

function normalizeDraft(raw: Partial<AsgDraft>, fallbackIndex = 0): AsgDraft {
  const baseMembers = Array.isArray(raw.members) ? normalizeMemberList(raw.members) : [];
  const derived = extractSubTeamsFromMembers(baseMembers);
  const subTeams = Array.isArray(raw.subTeams) && raw.subTeams.length > 0
    ? raw.subTeams.map((subTeam, index) => ({
        id: subTeam.id || crypto.randomUUID(),
        label: subTeam.label || nextSubTeamLabel(index),
        members: normalizeMemberList(Array.isArray(subTeam.members) ? subTeam.members : []),
      }))
    : derived.subTeams;

  const splitMode = typeof raw.splitMode === 'boolean' ? raw.splitMode : subTeams.length > 0 || derived.splitMode;

  return {
    columnIndex: typeof raw.columnIndex === 'number' ? raw.columnIndex : fallbackIndex + 1,
    label: String(raw.label ?? `Team#${fallbackIndex + 1}`),
    locationType: raw.locationType === 'FACTORY' || raw.locationType === 'OTHER' ? raw.locationType : 'SITE_JOB',
    jobId: String(raw.jobId ?? ''),
    factoryCode: String(raw.factoryCode ?? ''),
    jobNumberSnapshot: String(raw.jobNumberSnapshot ?? ''),
    workProcessDetails: String(raw.workProcessDetails ?? ''),
    targetQty: String(raw.targetQty ?? ''),
    driver1EmployeeId: String(raw.driver1EmployeeId ?? ''),
    driver2EmployeeId: String(raw.driver2EmployeeId ?? ''),
    dutyStart: String(raw.dutyStart ?? ''),
    dutyEnd: String(raw.dutyEnd ?? ''),
    breakStart: String(raw.breakStart ?? ''),
    breakEnd: String(raw.breakEnd ?? ''),
    remarks: String(raw.remarks ?? ''),
    splitMode,
    members: splitMode ? [] : baseMembers,
    subTeams: splitMode ? subTeams : [],
  };
}

function createEmptyDraft(columnIndex: number, label: string): AsgDraft {
  return {
    columnIndex,
    label,
    locationType: 'SITE_JOB',
    jobId: '',
    factoryCode: '',
    jobNumberSnapshot: '',
    workProcessDetails: '',
    targetQty: '',
    driver1EmployeeId: '',
    driver2EmployeeId: '',
    dutyStart: '',
    dutyEnd: '',
    breakStart: '',
    breakEnd: '',
    remarks: '',
    splitMode: false,
    members: [],
    subTeams: [],
  };
}

function normalizeSkill(input: string): string {
  return input.trim().toLowerCase();
}

function parseJobExpertise(job: JobOpt | undefined): string[] {
  if (!job) return [];
  const bag = new Set<string>();
  const addMany = (vals: unknown) => {
    if (!Array.isArray(vals)) return;
    for (const raw of vals) {
      const str = String(raw ?? '').trim();
      if (str) bag.add(str);
    }
  };

  addMany(job.requiredExpertises);

  if (Array.isArray(job.finishedGoods)) {
    for (const item of job.finishedGoods) {
      if (typeof item === 'string') {
        if (item.trim()) bag.add(item.trim());
        continue;
      }
      if (item && typeof item === 'object') {
        const row = item as Record<string, unknown>;
        addMany(row.requiredExpertise);
        addMany(row.expertises);
        addMany(row.skills);
      }
    }
  }

  const details = String(job.projectDetails ?? '');
  const m = details.match(/(?:required\s*expertise|expertise)\s*[:=-]\s*([^\n]+)/i);
  if (m?.[1]) {
    m[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((s) => bag.add(s));
  }

  return [...bag];
}

const FIELD_ROWS: { key: string; label: string }[] = [
  { key: 'locationType', label: 'Location' },
  { key: 'job', label: 'Job number' },
  { key: 'jobCompany', label: 'Customer / reference' },
  { key: 'workProcessDetails', label: 'Work process details' },
  { key: 'dutyRange', label: 'Duty in / duty out' },
  { key: 'breakRange', label: 'Break out / break in' },
];
const NAV_ROW = {
  locationType: 0,
  job: 1,
  workProcess: 2,
  targetQty: 3,
  driver1: 4,
  driver2: 5,
  duty: 6,
  break: 7,
  workers: 8,
  remarks: 9,
} as const;

const DRAFT_STORAGE_PREFIX = 'hr-schedule-draft:';
const VIEW_PREFS_STORAGE_KEY = 'hr-schedule-view-prefs';

function readStoredScheduleViewPrefs() {
  if (typeof window === 'undefined') {
    return {
      showWorkerRail: true,
      showRowLabels: true,
      viewScale: 1,
      useLightGridTheme: false,
    };
  }
  try {
    const raw = window.localStorage.getItem(VIEW_PREFS_STORAGE_KEY);
    if (!raw) {
      return {
        showWorkerRail: true,
        showRowLabels: true,
        viewScale: 1,
        useLightGridTheme: false,
      };
    }
    const parsed = JSON.parse(raw) as {
      showWorkerRail?: boolean;
      showRowLabels?: boolean;
      viewScale?: number;
      useLightGridTheme?: boolean;
    };
    return {
      showWorkerRail: typeof parsed.showWorkerRail === 'boolean' ? parsed.showWorkerRail : true,
      showRowLabels: typeof parsed.showRowLabels === 'boolean' ? parsed.showRowLabels : true,
      viewScale:
        typeof parsed.viewScale === 'number' && parsed.viewScale >= 0.8 && parsed.viewScale <= 1.35
          ? parsed.viewScale
          : 1,
      useLightGridTheme: typeof parsed.useLightGridTheme === 'boolean' ? parsed.useLightGridTheme : false,
    };
  } catch {
    return {
      showWorkerRail: true,
      showRowLabels: true,
      viewScale: 1,
      useLightGridTheme: false,
    };
  }
}

export default function HrScheduleDayPage() {
  const params = useParams();
  const workDate = String(params.workDate ?? '');
  const { data: session } = useSession();
  const { theme, toggle } = useTheme();

  const [schedule, setSchedule] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [employees, setEmployees] = useState<EmpOpt[]>([]);
  const [jobs, setJobs] = useState<JobOpt[]>([]);
  const [previousSchedules, setPreviousSchedules] = useState<ScheduleTemplateOption[]>([]);
  const [selectedTemplateDate, setSelectedTemplateDate] = useState('');
  const [drafts, setDrafts] = useState<AsgDraft[]>([]);
  const [scheduleInfo, setScheduleInfo] = useState('');
  const [driverTripState, setDriverTripState] = useState<{
    version: string;
    values: Record<string, string>;
    selectedIds: string[];
  }>({
    version: '',
    values: {},
    selectedIds: [],
  });
  const [selectedDriverToAdd, setSelectedDriverToAdd] = useState('');
  const [showWorkerRail, setShowWorkerRail] = useState(() => readStoredScheduleViewPrefs().showWorkerRail);
  const [showRowLabels, setShowRowLabels] = useState(() => readStoredScheduleViewPrefs().showRowLabels);
  const [viewScale, setViewScale] = useState(() => readStoredScheduleViewPrefs().viewScale);
  const [useLightGridTheme, setUseLightGridTheme] = useState(() => readStoredScheduleViewPrefs().useLightGridTheme);
  const [draggingWorkerId, setDraggingWorkerId] = useState('');
  const [activeDropColumn, setActiveDropColumn] = useState<number | null>(null);
  const [undoStack, setUndoStack] = useState<AsgDraft[][]>([]);
  const [redoStack, setRedoStack] = useState<AsgDraft[][]>([]);
  const suspendHistoryRef = useRef(false);
  const restoredDraftRef = useRef(false);

  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canView = isSA || perms.includes('hr.schedule.view');
  const canEdit = isSA || perms.includes('hr.schedule.edit');
  const canPub = isSA || perms.includes('hr.schedule.publish');
  const status = schedule && typeof schedule === 'object' ? String((schedule as { status?: string }).status ?? '') : '';
  const locked = status === 'LOCKED';
  const dis = !canEdit || locked;
  const isLight = theme === 'light';
  const draftStorageKey = useMemo(() => `${DRAFT_STORAGE_PREFIX}${workDate}`, [workDate]);
  const canZoomOut = viewScale > 0.8;
  const canZoomIn = viewScale < 1.35;
  const pageShellCls = isLight
    ? 'bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.08),transparent_26%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.08),transparent_24%)]'
    : 'bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.08),transparent_24%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.08),transparent_22%)]';
  const heroCls = isLight
    ? 'border border-slate-200 bg-white/90 shadow-[0_24px_80px_-36px_rgba(148,163,184,0.35)] backdrop-blur-xl'
    : 'border border-white/10 bg-slate-950/75 shadow-[0_24px_80px_-36px_rgba(15,23,42,0.85)] backdrop-blur-xl';
  const sectionCls = isLight
    ? 'border border-slate-200 bg-white/90 shadow-[0_20px_70px_-40px_rgba(148,163,184,0.35)]'
    : 'border border-white/10 bg-slate-950/70 shadow-[0_20px_70px_-40px_rgba(15,23,42,0.9)]';
  const dividerCls = isLight ? 'border-slate-200' : 'border-white/10';
  const headingCls = isLight ? 'text-slate-900' : 'text-white';
  const bodyTextCls = isLight ? 'text-slate-600' : 'text-slate-400';
  const subtleTextCls = isLight ? 'text-slate-500' : 'text-slate-500';
  const thCls = isLight
    ? 'sticky left-0 z-10 whitespace-nowrap border-r border-slate-200 bg-white/95 px-2 py-1.5 text-left align-top text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 backdrop-blur-sm'
    : 'sticky left-0 z-10 whitespace-nowrap border-r border-white/10 bg-slate-950/95 px-2 py-1.5 text-left align-top text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 backdrop-blur-sm';
  const tdCls = 'min-w-[235px] px-2 py-1.5 align-top';
  const inputCls = isLight
    ? 'w-full rounded border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-900 shadow-sm transition-colors focus:border-emerald-400/60 focus:outline-none'
    : 'w-full rounded border border-white/10 bg-slate-950 px-1.5 py-1 text-xs text-white shadow-sm transition-colors focus:border-emerald-400/40 focus:outline-none';
  const metricCardCls = isLight
    ? 'rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2'
    : 'rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2';
  const metricAccentCls = isLight
    ? 'rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2'
    : 'rounded-lg border border-emerald-500/15 bg-emerald-500/[0.06] px-2.5 py-2';

  useEffect(() => {
    try {
      localStorage.setItem(
        VIEW_PREFS_STORAGE_KEY,
        JSON.stringify({
          showWorkerRail,
          showRowLabels,
          viewScale,
          useLightGridTheme,
        })
      );
    } catch {
      // ignore storage quota / availability issues
    }
  }, [showWorkerRail, showRowLabels, viewScale, useLightGridTheme]);

  const getRowThemeClasses = useCallback(
    (rowKey: string) => {
      if (!isLight || !useLightGridTheme) {
        return {
          row: 'border-t border-white/5',
          label: thCls,
          cell: `${tdCls} border-l border-white/5`,
        };
      }

      const shared = { row: 'border-t border-slate-200' };
      if (rowKey === 'locationType' || rowKey === 'job' || rowKey === 'jobCompany' || rowKey === 'workProcessDetails' || rowKey === 'targetQty') {
        return {
          row: shared.row,
          label: 'sticky left-0 z-10 whitespace-nowrap border-r border-sky-200 bg-sky-100 px-2 py-1.5 text-left align-top text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-700 backdrop-blur-sm',
          cell: `${tdCls} border-l border-sky-100 bg-sky-50/80`,
        };
      }
      if (rowKey === 'dutyRange' || rowKey === 'breakRange') {
        return {
          row: shared.row,
          label: 'sticky left-0 z-10 whitespace-nowrap border-r border-emerald-200 bg-emerald-100 px-2 py-1.5 text-left align-top text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700 backdrop-blur-sm',
          cell: `${tdCls} border-l border-emerald-100 bg-emerald-50/80`,
        };
      }
      if (rowKey === 'workers' || rowKey === 'suggestedWorkers') {
        return {
          row: shared.row,
          label: 'sticky left-0 z-10 whitespace-nowrap border-r border-amber-200 bg-amber-100 px-2 py-1.5 text-left align-top text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-800 backdrop-blur-sm',
          cell: `${tdCls} border-l border-amber-100 bg-amber-50/80`,
        };
      }
      if (rowKey === 'workerCount') {
        return {
          row: shared.row,
          label: 'sticky left-0 z-10 whitespace-nowrap border-r border-orange-200 bg-orange-100 px-2 py-1.5 text-left align-top text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-800 backdrop-blur-sm',
          cell: `${tdCls} border-l border-orange-100 bg-orange-50/80`,
        };
      }
      if (rowKey === 'driver1EmployeeId' || rowKey === 'driver2EmployeeId') {
        return {
          row: shared.row,
          label: 'sticky left-0 z-10 whitespace-nowrap border-r border-rose-200 bg-rose-100 px-2 py-1.5 text-left align-top text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-700 backdrop-blur-sm',
          cell: `${tdCls} border-l border-rose-100 bg-rose-50/80`,
        };
      }
      if (rowKey === 'remarks') {
        return {
          row: shared.row,
          label: 'sticky left-0 z-10 whitespace-nowrap border-r border-slate-200 bg-slate-100 px-2 py-1.5 text-left align-top text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-700 backdrop-blur-sm',
          cell: `${tdCls} border-l border-slate-100 bg-slate-50/80`,
        };
      }
      return {
        row: shared.row,
        label: thCls,
        cell: `${tdCls} border-l border-slate-200`,
      };
    },
    [isLight, useLightGridTheme, thCls, tdCls]
  );

  const loadSchedule = useCallback(async () => {
    const res = await fetch(`/api/hr/schedule?workDate=${encodeURIComponent(workDate)}`, { cache: 'no-store' });
    const json = await res.json();
    if (res.ok && json?.success) setSchedule(json.data);
    else setSchedule(null);
  }, [workDate]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!canView) return;
      if (!cancelled) setLoading(true);
      await loadSchedule();
      const [er, jr, sr] = await Promise.all([
        fetch('/api/hr/employees', { cache: 'no-store' }),
        fetch('/api/jobs?status=ACTIVE', { cache: 'no-store' }),
        fetch('/api/hr/schedule', { cache: 'no-store' }),
      ]);
      const [ej, jj, sj] = await Promise.all([er.json(), jr.json(), sr.json()]);
      if (cancelled) return;
      if (er.ok && ej?.success) setEmployees(ej.data);
      if (jr.ok && jj?.success) setJobs(jj.data);
      if (sr.ok && sj?.success) {
        const options = (sj.data as Array<Record<string, unknown>>)
          .map((row) => ({
            id: String(row.id ?? ''),
            workDate: String(row.workDate ?? '').slice(0, 10),
            status: String(row.status ?? ''),
          }))
          .filter((row) => row.id && row.workDate && row.workDate !== workDate);
        setPreviousSchedules(options);
        setSelectedTemplateDate((current) => current || options[0]?.workDate || '');
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [canView, loadSchedule, workDate]);

  const mapFromApi = useCallback((sch: Record<string, unknown>) => {
    const asg = (sch.assignments as Array<Record<string, unknown>>) ?? [];
    suspendHistoryRef.current = true;
    setScheduleInfo(String((sch as { notes?: string | null }).notes ?? ''));
    setDrafts(
      asg.map((a, idx) =>
        normalizeDraft(
          {
            columnIndex: typeof a.columnIndex === 'number' ? a.columnIndex : idx + 1,
            label: String(a.label ?? `Team#${idx + 1}`),
            locationType: (a.locationType as AsgDraft['locationType']) ?? 'SITE_JOB',
            jobId: (a.job as { id?: string })?.id ?? '',
            factoryCode: String(a.factoryCode ?? ''),
            jobNumberSnapshot: String(a.jobNumberSnapshot ?? ''),
            workProcessDetails:
              getInitialWorkProcessDetails({
              id: String((a.job as { id?: string })?.id ?? ''),
              jobNumber: String((a.job as { jobNumber?: string })?.jobNumber ?? a.jobNumberSnapshot ?? ''),
                customerName: String((a.job as { customer?: { name?: string } })?.customer?.name ?? ''),
                description: String((a.job as { description?: string })?.description ?? ''),
                projectDetails:
                  String((a.job as { projectDetails?: string })?.projectDetails ?? '') || '',
              }) || String(a.projectDetailsSnapshot ?? ''),
            targetQty: String(a.targetQty ?? ''),
            driver1EmployeeId: String(a.driver1EmployeeId ?? ''),
            driver2EmployeeId: String(a.driver2EmployeeId ?? ''),
            dutyStart: String(a.shiftStart ?? ''),
            dutyEnd: String(a.shiftEnd ?? ''),
            ...parseBrk(String(a.breakWindow ?? '')),
            remarks: String(a.remarks ?? ''),
            members: ((a.members as Array<Record<string, unknown>>) ?? []).map((m, i) => ({
              employeeId: String(m.employeeId),
              role: (m.role as MemberRow['role']) ?? 'WORKER',
              slot: typeof m.slot === 'number' ? m.slot : i + 1,
            })),
          },
          idx
        )
      )
    );
    setUndoStack([]);
    setRedoStack([]);
    queueMicrotask(() => {
      suspendHistoryRef.current = false;
    });
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      if (schedule && typeof schedule === 'object' && 'id' in schedule) mapFromApi(schedule as Record<string, unknown>);
      else {
        suspendHistoryRef.current = true;
        setScheduleInfo('');
        setDrafts([]);
        setUndoStack([]);
        setRedoStack([]);
        queueMicrotask(() => {
          suspendHistoryRef.current = false;
        });
      }
    });
  }, [schedule, mapFromApi]);

  useEffect(() => {
    restoredDraftRef.current = false;
  }, [draftStorageKey]);

  useEffect(() => {
    if (!schedule || restoredDraftRef.current || dis) return;
    try {
      const raw = localStorage.getItem(draftStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { drafts?: Array<Partial<AsgDraft>>; savedAt?: string };
      if (!Array.isArray(parsed?.drafts)) return;
      restoredDraftRef.current = true;
      queueMicrotask(() => {
        suspendHistoryRef.current = true;
        setDrafts((parsed.drafts ?? []).map((draft, index) => normalizeDraft(draft, index)));
        setUndoStack([]);
        setRedoStack([]);
        suspendHistoryRef.current = false;
      });
      toast.success(`Recovered local draft${parsed.savedAt ? ` (${new Date(parsed.savedAt).toLocaleTimeString()})` : ''}`);
    } catch {
      // ignore invalid localStorage payload
    }
  }, [schedule, dis, draftStorageKey]);

  useEffect(() => {
    if (!schedule || dis) return;
    try {
      localStorage.setItem(
        draftStorageKey,
        JSON.stringify({
          drafts,
          savedAt: new Date().toISOString(),
        })
      );
    } catch {
      // ignore storage quota / availability issues
    }
  }, [drafts, schedule, dis, draftStorageKey]);

  const employeeProfiles = useMemo(
    () =>
      employees.map((e) => ({
        ...e,
        workforce: parseWorkforceProfile(e.profileExtension),
      })),
    [employees]
  );

  const activeProfiles = useMemo(
    () => employeeProfiles.filter((e) => !e.status || e.status === 'ACTIVE'),
    [employeeProfiles]
  );

  const workerPool = useMemo(
    () =>
      activeProfiles.filter(
        (e) => e.workforce.employeeType === 'LABOUR_WORKER' || e.workforce.employeeType === 'HYBRID_STAFF'
      ),
    [activeProfiles]
  );

  const driverPool = useMemo(
    () => activeProfiles.filter((e) => e.workforce.employeeType === 'DRIVER'),
    [activeProfiles]
  );

  const workerItems = useMemo(
    () =>
      workerPool.map((e) => ({
        id: e.id,
        label: e.preferredName || e.fullName,
        searchText: `${e.fullName} ${e.preferredName ?? ''} ${e.employeeCode} ${e.workforce.expertises.join(' ')}`,
      })),
    [workerPool]
  );

  const driverItems = useMemo(
    () =>
      driverPool.map((e) => ({
        id: e.id,
        label: e.preferredName || e.fullName,
        searchText: `${e.fullName} ${e.preferredName ?? ''} ${e.employeeCode}`,
    })),
    [driverPool]
  );

  const jobItems = useMemo(
    () =>
      jobs.map((job) => {
        const quotationNumber = String(job.quotationNumber ?? '').trim();
        const lpoNumber = String(job.lpoNumber ?? '').trim();
        const companyName = String(job.customerName ?? '').trim();
        const siteName = String(job.site ?? '').trim();
        return {
          id: job.id,
          label: job.jobNumber,
          searchText: [quotationNumber, lpoNumber, companyName, siteName, job.projectDetails ?? '', job.description ?? '']
            .map((value) => String(value).trim())
            .filter(Boolean)
            .join(' '),
          quotationNumber,
          lpoNumber,
          companyName,
          siteName,
        };
      }),
    [jobs]
  );

  const driverLogVersion = schedule && typeof schedule === 'object' && 'id' in schedule
    ? String((schedule as { id: string }).id)
    : workDate;

  const driverTripRows = useMemo(() => {
    const scheduleLogs = ((schedule as { driverLogs?: Array<Record<string, unknown>> } | null)?.driverLogs ?? []) as Array<Record<string, unknown>>;
    const logMap = new Map(
      scheduleLogs.map((log, index) => [
        String(log.driverEmployeeId ?? (log.driver as { id?: string } | undefined)?.id ?? ''),
        {
          routeText: String(log.routeText ?? ''),
          sequence: typeof log.sequence === 'number' ? log.sequence : index,
        },
      ])
    );

    const savedDriverIds = scheduleLogs
      .map((log) => String(log.driverEmployeeId ?? (log.driver as { id?: string } | undefined)?.id ?? ''))
      .filter(Boolean);
    const selectedIds = Array.from(
      new Set(driverTripState.version === driverLogVersion ? driverTripState.selectedIds : savedDriverIds)
    );

    return selectedIds.map((driverEmployeeId, index) => ({
      driverEmployeeId,
      routeText:
        driverTripState.version === driverLogVersion && driverTripState.values[driverEmployeeId] !== undefined
          ? driverTripState.values[driverEmployeeId]
          : logMap.get(driverEmployeeId)?.routeText ?? '',
      sequence: logMap.get(driverEmployeeId)?.sequence ?? index,
    }));
  }, [schedule, driverTripState, driverLogVersion]);

  const availableDriverItems = useMemo(
    () => driverItems.filter((item) => !driverTripRows.some((row) => row.driverEmployeeId === item.id)),
    [driverItems, driverTripRows]
  );

  // Count how many groups each employee appears in
  const empAssignCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of drafts) {
      const ids = new Set<string>();
      if (d.driver1EmployeeId) ids.add(d.driver1EmployeeId);
      if (d.driver2EmployeeId) ids.add(d.driver2EmployeeId);
      if (d.splitMode) {
        for (const subTeam of d.subTeams) {
          for (const member of subTeam.members) if (member.employeeId) ids.add(member.employeeId);
        }
      } else {
        for (const member of d.members) if (member.employeeId) ids.add(member.employeeId);
      }
      for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [drafts]);

  const multiAssigned = useMemo(() => {
    const s = new Set<string>();
    for (const [id, c] of empAssignCount) { if (c > 1) s.add(id); }
    return s;
  }, [empAssignCount]);

  const assignedEmployeeIds = useMemo(() => new Set(empAssignCount.keys()), [empAssignCount]);

  const unassignedWorkers = useMemo(
    () => workerPool.filter((e) => !assignedEmployeeIds.has(e.id)),
    [workerPool, assignedEmployeeIds]
  );

  const createSchedule = async () => {
    const res = await fetch('/api/hr/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workDate }),
    });
    const json = await readApiEnvelope<{ success?: boolean; error?: string }>(res);
    if (!res.ok || !json?.success) toast.error(json?.error ?? 'Failed');
    else { toast.success('Schedule created'); await loadSchedule(); }
  };

  const saveAssignments = async () => {
    if (!schedule || !('id' in schedule)) return;
    const invalidSplitTeam = drafts.find((draft) =>
      draft.splitMode && draft.subTeams.some((subTeam) => !subTeam.members.some((member) => member.employeeId))
    );
    if (invalidSplitTeam) {
      toast.error(`${invalidSplitTeam.label} has an empty sub-team.`);
      return;
    }
    setSaving(true);
    const sid = String((schedule as { id: string }).id);
    const uniqueJobUpdates = new Map<string, string>();
    for (const draft of drafts) {
      if (!draft.jobId || draft.locationType !== 'SITE_JOB') continue;
      const job = jobs.find((row) => row.id === draft.jobId);
      const resolvedWorkProcess = resolveWorkProcessDetails(draft.workProcessDetails, job);
      const currentSaved = String(job?.description ?? '').trim();
      if (resolvedWorkProcess !== currentSaved) {
        uniqueJobUpdates.set(draft.jobId, resolvedWorkProcess);
      }
    }

    if (uniqueJobUpdates.size > 0) {
      const jobUpdateResults = await Promise.all(
        [...uniqueJobUpdates.entries()].map(async ([jobId, projectDetails]) => {
          const response = await fetch(`/api/jobs/${jobId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description: projectDetails }),
          });
          const json = await response.json().catch(() => null);
          return { ok: response.ok && json?.success, error: json?.error as string | undefined };
        })
      );

      const failed = jobUpdateResults.find((result) => !result.ok);
      if (failed) {
        setSaving(false);
        toast.error(failed.error ?? 'Could not update work process details on the job.');
        return;
      }
    }

    const body = {
      notes: scheduleInfo || null,
      assignments: drafts.map((d) => {
        const job = jobs.find((row) => row.id === d.jobId);
        const resolvedWorkProcess = resolveWorkProcessDetails(d.workProcessDetails, job);
        const parsedTargetQty = Number.parseFloat(String(d.targetQty ?? '').trim());
        const nonSplitMembers = normalizeMemberList(d.members.filter((member) => member.employeeId));
        const splitMembers = d.subTeams.flatMap((subTeam) => {
          const people = normalizeMemberList(subTeam.members.filter((member) => member.employeeId));
          return people.map((member, index) => ({
            employeeId: member.employeeId,
            role: index === 0 ? ('TEAM_LEADER' as const) : member.role === 'HELPER' ? ('HELPER' as const) : ('WORKER' as const),
            slot: 0,
          }));
        });
        const memberPayload = d.splitMode
          ? splitMembers.map((member, index) => ({ ...member, slot: index + 1 }))
          : nonSplitMembers.map((member, index) => ({
              employeeId: member.employeeId,
              role: index === 0 ? ('TEAM_LEADER' as const) : member.role === 'HELPER' ? ('HELPER' as const) : ('WORKER' as const),
              slot: index + 1,
            }));
        const teamLeaderEmployeeId = memberPayload.find((member) => member.role === 'TEAM_LEADER')?.employeeId ?? null;
        return {
          columnIndex: d.columnIndex,
          label: d.label,
          locationType: d.locationType,
          jobId: d.jobId || null,
          factoryCode: d.locationType === 'FACTORY' ? d.factoryCode || null : null,
          factoryLabel: d.locationType === 'FACTORY' ? d.factoryCode || null : null,
          jobNumberSnapshot: d.jobNumberSnapshot || null,
          clientNameSnapshot: d.locationType === 'SITE_JOB' ? String(job?.customerName ?? '').trim() || null : null,
          projectDetailsSnapshot: d.locationType === 'SITE_JOB' ? resolvedWorkProcess || null : null,
          teamLeaderEmployeeId,
          driver1EmployeeId: d.driver1EmployeeId || null,
          driver2EmployeeId: d.driver2EmployeeId || null,
          shiftStart: d.dutyStart || null,
          shiftEnd: d.dutyEnd || null,
          breakWindow: d.breakStart && d.breakEnd ? `${d.breakStart} - ${d.breakEnd}` : null,
          targetQty: Number.isFinite(parsedTargetQty) ? parsedTargetQty : null,
          remarks: d.remarks || null,
          members: memberPayload,
        };
      }),
    };
    const res = await fetch(`/api/hr/schedule/${sid}/assignments`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await readApiEnvelope<{ success?: boolean; error?: string; data?: Record<string, unknown> }>(res);
    if (!res.ok || !json?.success) {
      setSaving(false);
      toast.error(json?.error ?? 'Save failed');
      return;
    }

    const driverRes = await fetch(`/api/hr/schedule/${sid}/driver-logs`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        logs: driverTripRows.map((log, index) => ({
          driverEmployeeId: log.driverEmployeeId,
          routeText: log.routeText.trim(),
          sequence: index,
        })),
      }),
    });
    const driverJson = await readApiEnvelope<{ success?: boolean; error?: string; data?: unknown }>(driverRes);
    setSaving(false);
    if (!driverRes.ok || !driverJson?.success) {
      toast.error(driverJson?.error ?? 'Driver trip save failed');
      return;
    }

    toast.success('Saved');
    localStorage.removeItem(draftStorageKey);
    restoredDraftRef.current = false;
    setSchedule({
      ...(json.data as Record<string, unknown>),
      driverLogs: driverJson.data,
    });
  };

  const publish = async () => {
    if (!schedule || !('id' in schedule)) return;
    const sid = String((schedule as { id: string }).id);
    const res = await fetch(`/api/hr/schedule/${sid}/publish`, { method: 'POST' });
    const json = await readApiEnvelope<{ success?: boolean; error?: string }>(res);
    if (!res.ok || !json?.success) toast.error(json?.error ?? 'Publish failed');
    else { toast.success('Published'); loadSchedule(); }
  };

  const applyPreviousScheduleTemplate = async () => {
    if (!selectedTemplateDate) return;
    const res = await fetch(`/api/hr/schedule?workDate=${encodeURIComponent(selectedTemplateDate)}`, { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok || !json?.success || !json.data) {
      toast.error(json?.error ?? 'Failed to load template');
      return;
    }
    mapFromApi(json.data as Record<string, unknown>);
    toast.success(`Template loaded from ${selectedTemplateDate}`);
  };

  const addColumn = () => {
    applyDrafts((prev) => {
      const nextNumber = getNextTeamNumber(prev);
      return [
        ...prev,
        createEmptyDraft(
          prev.length ? Math.max(...prev.map((x) => x.columnIndex)) + 1 : 1,
          `Team#${nextNumber}`
        ),
      ];
    });
  };

  const duplicateColumn = (idx: number) => {
    applyDrafts((prev) => {
      const src = prev[idx];
      if (!src) return prev;
      const nextNumber = getNextTeamNumber(prev);
      const newCol: AsgDraft = {
        ...src,
        columnIndex: prev.length ? Math.max(...prev.map((x) => x.columnIndex)) + 1 : 1,
        label: `Team#${nextNumber}`,
        members: src.members.map((m) => ({ ...m })),
        subTeams: src.subTeams.map((subTeam) => ({
          ...subTeam,
          id: crypto.randomUUID(),
          members: subTeam.members.map((member) => ({ ...member })),
        })),
      };
      return [...prev, newCol];
    });
  };

  const removeColumn = (idx: number) => applyDrafts((d) => d.filter((_, i) => i !== idx));

  const addDriverTripRow = (driverEmployeeId: string) => {
    if (!driverEmployeeId) return;
    setDriverTripState((current) => {
      const currentIds =
        current.version === driverLogVersion
          ? current.selectedIds
          : driverTripRows.map((row) => row.driverEmployeeId);
      if (currentIds.includes(driverEmployeeId)) return current;
      return {
        version: driverLogVersion,
        values: current.version === driverLogVersion ? current.values : {},
        selectedIds: [...currentIds, driverEmployeeId],
      };
    });
    setSelectedDriverToAdd('');
  };

  const removeDriverTripRow = (driverEmployeeId: string) => {
    setDriverTripState((current) => {
      const currentIds =
        current.version === driverLogVersion
          ? current.selectedIds
          : driverTripRows.map((row) => row.driverEmployeeId);
      return {
        version: driverLogVersion,
        values: Object.fromEntries(
          Object.entries(current.version === driverLogVersion ? current.values : {}).filter(([id]) => id !== driverEmployeeId)
        ),
        selectedIds: currentIds.filter((id) => id !== driverEmployeeId),
      };
    });
  };

  const applyDrafts = (updater: (current: AsgDraft[]) => AsgDraft[]) => {
    setDrafts((current) => {
      const next = updater(current);
      if (suspendHistoryRef.current) return next;
      if (JSON.stringify(next) === JSON.stringify(current)) return current;
      setUndoStack((prev) => [...prev.slice(-39), current]);
      setRedoStack([]);
      return next;
    });
  };

  const undo = () => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const previous = prev[prev.length - 1];
      setDrafts((current) => {
        setRedoStack((rs) => [...rs, current]);
        return previous;
      });
      return prev.slice(0, -1);
    });
  };

  const redo = () => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const next = prev[prev.length - 1];
      setDrafts((current) => {
        setUndoStack((us) => [...us.slice(-39), current]);
        return next;
      });
      return prev.slice(0, -1);
    });
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isTypingContext =
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable;
      if (isTypingContext) return;

      const key = e.key.toLowerCase();
      if (e.ctrlKey && !e.shiftKey && key === 'z') {
        if (undoStack.length > 0) {
          e.preventDefault();
          undo();
        }
        return;
      }
      if (e.ctrlKey && !e.shiftKey && key === 'y') {
        if (redoStack.length > 0) {
          e.preventDefault();
          redo();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undoStack.length, redoStack.length]);

  const upd = (idx: number, patch: Partial<AsgDraft>) =>
    applyDrafts((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const getDraftWorkerCount = useCallback(
    (draft: AsgDraft) => {
      const ids = new Set<string>();
      if (draft.splitMode) {
        draft.subTeams.forEach((subTeam) => {
          subTeam.members.forEach((member) => {
            if (member.employeeId) ids.add(member.employeeId);
          });
        });
      } else {
        draft.members.forEach((member) => {
          if (member.employeeId) ids.add(member.employeeId);
        });
      }
      return ids.size;
    },
    []
  );

  const getDraftAssignedIds = useCallback(
    (
      draft: AsgDraft,
      options?: {
        excludeFlatMemberIndex?: number;
        excludeSubTeamIndex?: number;
        excludeSubTeamMemberIndex?: number;
      }
    ) => {
      const ids = new Set<string>();

      if (!draft.splitMode) {
        draft.members.forEach((member, index) => {
          if (!member.employeeId) return;
          if (options?.excludeFlatMemberIndex === index) return;
          ids.add(member.employeeId);
        });
        return ids;
      }

      draft.subTeams.forEach((subTeam, subTeamIndex) => {
        subTeam.members.forEach((member, memberIndex) => {
          if (!member.employeeId) return;
          if (
            options?.excludeSubTeamIndex === subTeamIndex &&
            options?.excludeSubTeamMemberIndex === memberIndex
          ) {
            return;
          }
          ids.add(member.employeeId);
        });
      });
      return ids;
    },
    []
  );

  const getSelectableWorkerItems = useCallback(
    (
      draft: AsgDraft,
      options?: {
        excludeFlatMemberIndex?: number;
        excludeSubTeamIndex?: number;
        excludeSubTeamMemberIndex?: number;
      }
    ) => {
      const selectedIds = getDraftAssignedIds(draft, options);
      return workerItems.filter((item) => !selectedIds.has(item.id));
    },
    [getDraftAssignedIds, workerItems]
  );

  const toggleSplitMode = (colIdx: number) =>
    applyDrafts((rows) =>
      rows.map((row, idx) => {
        if (idx !== colIdx) return row;
        if (row.splitMode) {
          return {
            ...row,
            splitMode: false,
            members: normalizeMemberList(row.subTeams.flatMap((subTeam) => subTeam.members)),
            subTeams: [],
          };
        }
        return {
          ...row,
          splitMode: true,
          members: [],
          subTeams: [
            {
              ...createEmptySubTeam(0),
              members: normalizeMemberList(row.members),
            },
          ],
        };
      })
    );

  const updateFlatMember = (colIdx: number, memberIndex: number, employeeId: string) =>
    applyDrafts((rows) =>
      rows.map((row, idx) => {
        if (idx !== colIdx || row.splitMode) return row;
        if (employeeId && getDraftAssignedIds(row, { excludeFlatMemberIndex: memberIndex }).has(employeeId)) {
          return row;
        }
        return {
          ...row,
          members: row.members.map((member, index) =>
            index === memberIndex ? { ...member, employeeId, slot: memberIndex + 1 } : member
          ),
        };
      })
    );

  const addFlatMember = (colIdx: number, employeeId = '') =>
    applyDrafts((rows) =>
      rows.map((row, idx) => {
        if (idx !== colIdx || row.splitMode) return row;
        if (employeeId && getDraftAssignedIds(row).has(employeeId)) return row;
        const emptyIndex = row.members.findIndex((member) => !member.employeeId);
        if (emptyIndex >= 0) {
          return {
            ...row,
            members: row.members.map((member, index) =>
              index === emptyIndex ? { ...member, employeeId, slot: index + 1 } : member
            ),
          };
        }
        return {
          ...row,
          members: [
            ...row.members,
            { employeeId, role: 'WORKER' as const, slot: row.members.length + 1 },
          ],
        };
      })
    );

  const removeFlatMember = (colIdx: number, memberIndex: number) =>
    applyDrafts((rows) =>
      rows.map((row, idx) =>
        idx === colIdx && !row.splitMode
          ? {
              ...row,
              members: normalizeMemberList(row.members.filter((_, index) => index !== memberIndex)),
            }
          : row
      )
    );

  const addSubTeam = (colIdx: number) =>
    applyDrafts((rows) =>
      rows.map((row, idx) =>
        idx === colIdx && row.splitMode
          ? { ...row, subTeams: [...row.subTeams, createEmptySubTeam(row.subTeams.length)] }
          : row
      )
    );

  const removeSubTeam = (colIdx: number, subTeamIndex: number) =>
    applyDrafts((rows) =>
      rows.map((row, idx) =>
        idx === colIdx && row.splitMode
          ? {
              ...row,
              subTeams: row.subTeams
                .filter((_, index) => index !== subTeamIndex)
                .map((subTeam, index) => ({ ...subTeam, label: subTeam.label || nextSubTeamLabel(index) })),
            }
          : row
      )
    );

  const updateSubTeamMeta = (
    colIdx: number,
    subTeamIndex: number,
    patch: Partial<Pick<subTeamDraft, 'label'>>
  ) =>
    applyDrafts((rows) =>
      rows.map((row, idx) => {
        if (idx !== colIdx || !row.splitMode) return row;
        return {
          ...row,
          subTeams: row.subTeams.map((subTeam, index) =>
            index === subTeamIndex
              ? { ...subTeam, ...patch }
              : subTeam
          ),
        };
      })
    );

  const updateSubTeamMember = (colIdx: number, subTeamIndex: number, memberIndex: number, employeeId: string) =>
    applyDrafts((rows) =>
      rows.map((row, idx) => {
        if (idx !== colIdx || !row.splitMode) return row;
        if (
          employeeId &&
          getDraftAssignedIds(row, {
            excludeSubTeamIndex: subTeamIndex,
            excludeSubTeamMemberIndex: memberIndex,
          }).has(employeeId)
        ) {
          return row;
        }
        return {
          ...row,
          subTeams: row.subTeams.map((subTeam, index) =>
            index === subTeamIndex
              ? {
                  ...subTeam,
                  members: subTeam.members.map((member, innerIndex) =>
                    innerIndex === memberIndex
                      ? { ...member, employeeId, slot: memberIndex + 1 }
                      : member
                  ),
                }
              : subTeam
          ),
        };
      })
    );

  const addSubTeamMember = (colIdx: number, subTeamIndex: number, employeeId = '') =>
    applyDrafts((rows) =>
      rows.map((row, idx) => {
        if (idx !== colIdx || !row.splitMode) return row;
        if (employeeId && getDraftAssignedIds(row).has(employeeId)) return row;
        return {
          ...row,
          subTeams: row.subTeams.map((subTeam, index) => {
            if (index !== subTeamIndex) return subTeam;
            const emptyIndex = subTeam.members.findIndex((member) => !member.employeeId);
            if (emptyIndex >= 0) {
              return {
                ...subTeam,
                members: subTeam.members.map((member, innerIndex) =>
                  innerIndex === emptyIndex
                    ? { ...member, employeeId, slot: innerIndex + 1 }
                    : member
                ),
              };
            }
            return {
              ...subTeam,
              members: [
                ...subTeam.members,
                { employeeId, role: 'WORKER' as const, slot: subTeam.members.length + 1 },
              ],
            };
          }),
        };
      })
    );

  const removeSubTeamMember = (colIdx: number, subTeamIndex: number, memberIndex: number) =>
    applyDrafts((rows) =>
      rows.map((row, idx) => {
        if (idx !== colIdx || !row.splitMode) return row;
        return {
          ...row,
          subTeams: row.subTeams.map((subTeam, index) =>
            index === subTeamIndex
              ? {
                  ...subTeam,
                  members: normalizeMemberList(subTeam.members.filter((_, innerIndex) => innerIndex !== memberIndex)),
                }
              : subTeam
          ),
        };
      })
    );

  const addWorkerToTeam = (colIdx: number, employeeId: string) =>
    applyDrafts((rows) =>
      rows.map((row, idx) => {
        if (idx !== colIdx || !employeeId) return row;
        if (getDraftAssignedIds(row).has(employeeId)) return row;
        if (!row.splitMode) {
          const emptyIndex = row.members.findIndex((member) => !member.employeeId);
          if (emptyIndex >= 0) {
            return {
              ...row,
              members: row.members.map((member, index) =>
                index === emptyIndex ? { ...member, employeeId, slot: index + 1 } : member
              ),
            };
          }
          return {
            ...row,
            members: [...row.members, { employeeId, role: 'WORKER' as const, slot: row.members.length + 1 }],
          };
        }
        const targetIndex = row.subTeams.length > 0 ? row.subTeams.length - 1 : 0;
        const nextSubTeams = row.subTeams.length > 0 ? row.subTeams : [createEmptySubTeam(0)];
        return {
          ...row,
          splitMode: true,
          members: [],
          subTeams: nextSubTeams.map((subTeam, index) =>
            index === targetIndex
              ? {
                  ...subTeam,
                  members: [...subTeam.members, { employeeId, role: 'WORKER' as const, slot: subTeam.members.length + 1 }],
                }
              : subTeam
          ),
        };
      })
    );

  const addWorkerToSubTeamByDrop = (colIdx: number, subTeamIndex: number, employeeId: string) => {
    if (!employeeId) return;
    addSubTeamMember(colIdx, subTeamIndex, employeeId);
  };

  const onWorkerDragStart = (e: DragEvent<HTMLElement>, employeeId: string) => {
    if (dis) return;
    setDraggingWorkerId(employeeId);
    e.dataTransfer.setData('text/plain', employeeId);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const onWorkerDrop = (e: DragEvent<HTMLElement>, colIdx: number) => {
    if (dis) return;
    e.preventDefault();
    setActiveDropColumn(null);
    setDraggingWorkerId('');
    const employeeId = e.dataTransfer.getData('text/plain');
    if (!employeeId) return;
    addWorkerToTeam(colIdx, employeeId);
  };

  const onWorkerDropToSubTeam = (e: DragEvent<HTMLElement>, colIdx: number, subTeamIndex: number) => {
    if (dis) return;
    e.preventDefault();
    e.stopPropagation();
    setActiveDropColumn(null);
    setDraggingWorkerId('');
    const employeeId = e.dataTransfer.getData('text/plain');
    addWorkerToSubTeamByDrop(colIdx, subTeamIndex, employeeId);
  };

  const getColumnDropHighlightCls = useCallback(
    (colIdx: number) => {
      if (!draggingWorkerId || activeDropColumn !== colIdx) return '';
      return isLight
        ? 'ring-2 ring-emerald-300/80 ring-inset bg-emerald-50/80'
        : 'ring-2 ring-emerald-400/60 ring-inset bg-emerald-500/10';
    },
    [activeDropColumn, draggingWorkerId, isLight]
  );


  const empName = (id: string) => {
    const e = employees.find((x) => x.id === id);
    return e ? (e.preferredName || e.fullName) : '';
  };

  const focusScheduleCell = useCallback((row: number, col: number, sub = 0) => {
    const exact = document.querySelector<HTMLElement>(
      `[data-schedule-nav="true"][data-nav-row="${row}"][data-nav-col="${col}"][data-nav-sub="${sub}"]`
    );
    if (exact) {
      exact.focus();
      return;
    }
    const fallback = document.querySelector<HTMLElement>(
      `[data-schedule-nav="true"][data-nav-row="${row}"][data-nav-col="${col}"]`
    );
    fallback?.focus();
  }, []);

  const handleScheduleGridKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLElement>) => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      const target = e.currentTarget as HTMLElement;
      if (target.getAttribute('aria-expanded') === 'true') return;

      const row = Number(target.dataset.navRow ?? '-1');
      const col = Number(target.dataset.navCol ?? '-1');
      const sub = Number(target.dataset.navSub ?? '0');
      if (row < 0 || col < 0) return;

      e.preventDefault();

      if (e.key === 'ArrowUp') focusScheduleCell(Math.max(0, row - 1), col, sub);
      if (e.key === 'ArrowDown') focusScheduleCell(row + 1, col, sub);
      if (e.key === 'ArrowLeft') focusScheduleCell(row, Math.max(0, col - 1), sub);
      if (e.key === 'ArrowRight') focusScheduleCell(row, col + 1, sub);
    },
    [focusScheduleCell]
  );

  const getGridNavProps = useCallback(
    (row: number, col: number, sub = 0) => ({
      'data-schedule-nav': 'true',
      'data-nav-row': String(row),
      'data-nav-col': String(col),
      'data-nav-sub': String(sub),
      onKeyDown: handleScheduleGridKeyDown,
    }),
    [handleScheduleGridKeyDown]
  );

  const labourDefaultTiming = useMemo(
    () =>
      employeeProfiles.find(
        (employee) =>
          employee.workforce.employeeType === 'LABOUR_WORKER' &&
          employee.defaultTiming &&
          (
            employee.defaultTiming.dutyStart ||
            employee.defaultTiming.dutyEnd ||
            employee.defaultTiming.breakStart ||
            employee.defaultTiming.breakEnd
          )
      )?.defaultTiming ?? null,
    [employeeProfiles]
  );

  function applyTimingFromTemplate(
    draft: AsgDraft,
    timing:
      | {
          dutyStart?: string;
          dutyEnd?: string;
          breakStart?: string;
          breakEnd?: string;
        }
      | null
      | undefined
  ): AsgDraft {
    if (!timing) return draft;
    return {
      ...draft,
      dutyStart: draft.dutyStart || timing.dutyStart || '',
      dutyEnd: draft.dutyEnd || timing.dutyEnd || '',
      breakStart: draft.breakStart || timing.breakStart || '',
      breakEnd: draft.breakEnd || timing.breakEnd || '',
    };
  }

  function fillTimingTemplate(colIdx: number, mode: 'worker' | 'clear') {
    applyDrafts((rows) =>
      rows.map((row, idx) => {
        if (idx !== colIdx) return row;
        if (mode === 'clear') {
          return {
            ...row,
            dutyStart: '',
            dutyEnd: '',
            breakStart: '',
            breakEnd: '',
            };
          }
          return applyTimingFromTemplate(row, labourDefaultTiming);
        })
    );
  }

  const suggestedWorkersByColumn = useMemo(() => {
    const byColumn = new Map<number, typeof workerPool>();
    for (let ci = 0; ci < drafts.length; ci++) {
      const d = drafts[ci];
      const job = jobs.find((j) => j.id === d.jobId);
      const required = parseJobExpertise(job);
      if (required.length === 0) {
        byColumn.set(ci, []);
        continue;
      }
      const requiredNorm = new Set(required.map(normalizeSkill));
        const usedInColumn = getDraftAssignedIds(d);
        const suggestions = workerPool.filter((w) => {
          if (usedInColumn.has(w.id)) return false;
        const expertiseNorm = new Set(w.workforce.expertises.map(normalizeSkill));
        for (const r of requiredNorm) {
          if (expertiseNorm.has(r)) return true;
        }
        return false;
      });
      byColumn.set(ci, suggestions);
    }
    return byColumn;
  }, [drafts, jobs, workerPool, getDraftAssignedIds]);

  const scheduleSummary = useMemo(() => {
    const workerCount = drafts.reduce(
      (sum, draft) => sum + getDraftWorkerCount(draft),
      0
    );
    const groupsWithTiming = drafts.filter((draft) => draft.dutyStart && draft.dutyEnd).length;
    return {
      groups: drafts.length,
      workers: workerCount,
      groupsWithTiming,
    };
  }, [drafts, getDraftWorkerCount]);

  const buildSchedulePreviewData = (): WorkScheduleContext => {
    const primaryJob =
      drafts
        .map((draft) => jobs.find((row) => row.id === draft.jobId))
        .find((job): job is JobOpt => Boolean(job)) ?? null;

    return {
      company: {
        name: session?.user?.activeCompanyName ?? '',
        address: '',
        phone: '',
        email: '',
        letterheadUrl: '',
      },
      job: {
        jobNumber: primaryJob?.jobNumber ?? '',
        customerName: primaryJob?.customerName ?? '',
        projectDetails: primaryJob?.projectDetails ?? '',
        workProcessDetails: primaryJob?.description ?? '',
        locationLabel: primaryJob?.site ?? '',
      },
      schedule: {
        title: 'Daily Work Schedule',
        workDate,
        workDateLabel: new Date(`${workDate}T00:00:00`).toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }),
        status: status || 'DRAFT',
        groupCount: drafts.length,
        assignedWorkerCount: scheduleSummary.workers,
        groupsWithTiming: scheduleSummary.groupsWithTiming,
        driverCount: driverTripRows.length,
        driverTripSummary: `${driverTripRows.length} active driver${driverTripRows.length === 1 ? '' : 's'} listed`,
        notes: scheduleInfo.trim(),
        remarksSummary: [scheduleInfo.trim(), ...drafts.map((draft) => draft.remarks.trim()).filter(Boolean)].filter(Boolean).join(' | '),
      },
      scheduleGroups: drafts.map((draft) => {
        const job = jobs.find((row) => row.id === draft.jobId);
        const resolvedWorkProcess = resolveWorkProcessDetails(draft.workProcessDetails, job);
        const flatWorkerNames = draft.splitMode
          ? draft.subTeams.flatMap((subTeam) => subTeam.members.map((member) => empName(member.employeeId))).filter(Boolean)
          : draft.members.map((member) => empName(member.employeeId)).filter(Boolean);
        const numberedFlatWorkerNames = flatWorkerNames.map((name, index) => `${index + 1}. ${name}`);
        const dutyStartLabel = formatScheduleTimeForPrint(draft.dutyStart);
        const dutyEndLabel = formatScheduleTimeForPrint(draft.dutyEnd);
        const breakStartLabel = formatScheduleTimeForPrint(draft.breakStart);
        const breakEndLabel = formatScheduleTimeForPrint(draft.breakEnd);
        const workerNames = flatWorkerNames.join(', ');
        const driverNames = [draft.driver1EmployeeId, draft.driver2EmployeeId]
          .map((id) => empName(id))
          .filter(Boolean)
          .join(' / ');
        const workerBlockRows = !draft.splitMode
          ? flatWorkerNames.map((name, index) => ({
              kind: index === 0 ? ('leader' as const) : ('worker' as const),
              text: `${index + 1}. ${name}`,
            }))
          : draft.subTeams.flatMap((subTeam, subTeamIndex) => {
              const rows: Array<{ kind: 'subteam' | 'leader' | 'worker' | 'spacer'; text: string }> = [];
              if (subTeamIndex > 0) rows.push({ kind: 'spacer', text: '' });
              rows.push({ kind: 'subteam', text: subTeam.label });
              const subTeamPeople = subTeam.members.map((member) => empName(member.employeeId)).filter(Boolean);
              subTeamPeople.forEach((name, index) => {
                rows.push({
                  kind: index === 0 ? 'leader' : 'worker',
                  text: `${index + 1}. ${name}`,
                });
              });
              return rows;
            });
        return {
          label: draft.label,
          locationLabel:
            draft.locationType === 'SITE_JOB'
              ? 'Site job'
              : draft.locationType === 'FACTORY'
                ? 'Factory'
                : 'Other',
          siteName: draft.locationType === 'SITE_JOB' ? String(job?.site ?? '').trim() : '',
          locationDisplay:
            draft.locationType === 'SITE_JOB'
              ? String(job?.site ?? '').trim() || 'Site'
              : draft.locationType === 'FACTORY'
                ? 'Factory'
                : 'Other',
          locationBadgeVariant:
            draft.locationType === 'SITE_JOB'
              ? 'site'
              : draft.locationType === 'FACTORY'
                ? 'factory'
                : 'other',
          jobNumber:
            draft.locationType === 'SITE_JOB'
              ? job?.jobNumber ?? draft.jobNumberSnapshot ?? ''
              : draft.factoryCode || draft.jobNumberSnapshot || '',
          customerName: job?.customerName ?? '',
          projectDetails: String(job?.projectDetails ?? '').trim(),
          workProcessDetails: resolvedWorkProcess,
          targetQty: draft.targetQty,
          teamLeaderName: flatWorkerNames[0] ?? '',
          driverNames,
          workerNames,
          workerDisplay: workerBlockRows.map((row) => row.text).filter(Boolean).join('\n'),
          workerRows: numberedFlatWorkerNames,
          workerStructuredRows: workerBlockRows.map((row) => row.text),
          workerBlocks: workerBlockRows,
          workerCount: getDraftWorkerCount(draft),
          dutyStart: dutyStartLabel,
          dutyEnd: dutyEndLabel,
          breakStart: breakStartLabel,
          breakEnd: breakEndLabel,
          dutyRange:
            dutyStartLabel && dutyEndLabel ? `${dutyStartLabel} - ${dutyEndLabel}` : '',
          breakRange:
            breakStartLabel && breakEndLabel ? `${breakStartLabel} - ${breakEndLabel}` : '',
          remarks: draft.remarks,
        };
      }),
      driverTrips: driverTripRows.map((row) => ({
        driverName: empName(row.driverEmployeeId),
        tripOrder: row.routeText,
      })),
      today: new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
    };
  };

  const openSchedulePrintOutput = async (intent: 'print' | 'download') => {
    const previewData = buildSchedulePreviewData();
    const companyId =
      session?.user?.activeCompanyId ??
      (schedule && typeof schedule === 'object' && 'companyId' in schedule
        ? String((schedule as { companyId?: string | null }).companyId ?? '')
        : '');
    if (!companyId) {
      toast.error('No active company found for schedule printing.');
      return;
    }
    const printJobId = `schedule-print-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const payload: WorkSchedulePrintPayload = {
      printJobId,
      previewData,
      companyId,
      workDate,
      savedAt: new Date().toISOString(),
    };

    const printWindow = window.open(`/hr-schedule-print?mode=${intent}&job=${encodeURIComponent(printJobId)}`, '_blank');
    if (!printWindow) {
      toast.error('Could not open print window');
      return;
    }

    try {
      localStorage.removeItem(WORK_SCHEDULE_PRINT_PAYLOAD_KEY);
      localStorage.setItem(WORK_SCHEDULE_PRINT_PAYLOAD_KEY, JSON.stringify(payload));
    } catch {
      // Ignore quota/storage failures; the broadcast channel below will carry the payload.
    }

    try {
      const channel = new BroadcastChannel(WORK_SCHEDULE_PRINT_CHANNEL);
      const message = {
        type: 'work-schedule-print-payload',
        payload,
      };
      channel.postMessage(message);
      const retry1 = window.setTimeout(() => channel.postMessage(message), 120);
      const retry2 = window.setTimeout(() => channel.postMessage(message), 320);
      window.setTimeout(() => {
        window.clearTimeout(retry1);
        window.clearTimeout(retry2);
        channel.close();
      }, 700);
    } catch {
      // Older environments can still rely on the localStorage payload.
    }
  };

  
  if (!canView) return <div className="text-slate-400">Forbidden</div>;
  if (loading) return <div className="text-slate-400">Loading...</div>;

  const renderCell = (d: AsgDraft, colIdx: number, fieldKey: string) => {
    switch (fieldKey) {
      case 'locationType':
        return (
          <select
            value={d.locationType}
            onChange={(e) => upd(colIdx, { locationType: e.target.value as AsgDraft['locationType'] })}
            disabled={dis}
            className={inputCls}
            {...getGridNavProps(NAV_ROW.locationType, colIdx + 1)}
          >
            <option value="SITE_JOB">Site</option>
            <option value="FACTORY">Factory</option>
            <option value="OTHER">Other</option>
          </select>
        );
      case 'job':
        return (
          <SearchSelect
            items={jobItems}
            value={d.jobId}
              onChange={(jid) => {
                const job = jobs.find((row) => row.id === jid);
                const nextWorkProcess = getInitialWorkProcessDetails(job);
                upd(colIdx, {
                  jobId: jid,
                  jobNumberSnapshot: jid ? job?.jobNumber ?? d.jobNumberSnapshot : '',
                  workProcessDetails: nextWorkProcess,
                });
              }}
            placeholder="Type to search job..."
            disabled={dis}
            minCharactersToSearch={1}
            inputProps={getGridNavProps(NAV_ROW.job, colIdx + 1)}
            renderItem={(item, isHighlighted) => (
              <div className="space-y-0.5">
                <div className={`font-medium ${isHighlighted ? 'text-emerald-300' : 'text-white'}`}>{item.label}</div>
                <div className="text-[11px] text-slate-400">
                  {[item.companyName, item.siteName, item.quotationNumber && `QO ${item.quotationNumber}`, item.lpoNumber && `LPO ${item.lpoNumber}`]
                    .filter(Boolean)
                    .join(' | ') || 'No extra job details'}
                </div>
              </div>
            )}
          />
        );
      case 'jobCompany': {
        const job = jobs.find((x) => x.id === d.jobId);
        return (
          <div className="rounded border border-white/10 bg-slate-950 px-1.5 py-1 text-xs text-slate-300">
            {job?.customerName || '-'}
          </div>
        );
      }
      case 'workProcessDetails': {
        const job = jobs.find((x) => x.id === d.jobId);
        const resolvedWorkProcess = resolveWorkProcessDetails(d.workProcessDetails, job);
        return (
          <div className="space-y-1 rounded border border-white/10 bg-slate-950 px-1.5 py-1 text-xs text-slate-300">
            <textarea
              value={d.workProcessDetails}
              onChange={(e) => upd(colIdx, { workProcessDetails: e.target.value })}
              disabled={dis}
              rows={2}
              placeholder="Enter work process details..."
              className={`${inputCls} resize-y`}
              {...getGridNavProps(NAV_ROW.workProcess, colIdx + 1)}
            />
            {resolvedWorkProcess ? (
              <p className="text-[10px] text-slate-500">
                This value is loaded from the job and will update the job when you save.
              </p>
            ) : null}
          </div>
        );
      }
      case 'targetQty':
        return (
          <textarea
            value={d.targetQty}
            onChange={(e) => upd(colIdx, { targetQty: e.target.value })}
            disabled={dis}
            rows={2}
            placeholder="Enter target qty..."
            className={`${inputCls} resize-y`}
            {...getGridNavProps(NAV_ROW.targetQty, colIdx + 1)}
          />
        );
      case 'driver1EmployeeId':
      case 'driver2EmployeeId': {
        const isMulti = multiAssigned.has(d[fieldKey]);
        return (
          <div className={isMulti ? 'rounded ring-2 ring-amber-400/60' : ''}>
            <SearchSelect
              items={driverItems}
              value={d[fieldKey]}
              onChange={(v) => upd(colIdx, { [fieldKey]: v } as Partial<AsgDraft>)}
              placeholder="Search driver..."
              disabled={dis}
              minCharactersToSearch={1}
              inputProps={getGridNavProps(fieldKey === 'driver1EmployeeId' ? NAV_ROW.driver1 : NAV_ROW.driver2, colIdx + 1)}
            />
          </div>
        );
      }
      case 'dutyRange':
        return (
          <div className="space-y-1">
            <div className="grid grid-cols-2 gap-1">
              <div>
                <p className="mb-0.5 text-[10px] uppercase tracking-wide text-slate-500">Duty in</p>
                <input type="time" value={d.dutyStart} onChange={(e) => upd(colIdx, { dutyStart: e.target.value })} disabled={dis} className={inputCls} {...getGridNavProps(NAV_ROW.duty, colIdx + 1, 0)} />
              </div>
              <div>
                <p className="mb-0.5 text-[10px] uppercase tracking-wide text-slate-500">Duty out</p>
                <input type="time" value={d.dutyEnd} onChange={(e) => upd(colIdx, { dutyEnd: e.target.value })} disabled={dis} className={inputCls} {...getGridNavProps(NAV_ROW.duty, colIdx + 1, 1)} />
              </div>
            </div>
            {!dis && (
              <div className="flex flex-wrap gap-1">
                <button type="button" onClick={() => fillTimingTemplate(colIdx, 'worker')} className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-slate-300 hover:border-emerald-400/40 hover:text-emerald-300">
                  Use worker default
                </button>
                <button type="button" onClick={() => fillTimingTemplate(colIdx, 'clear')} className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-slate-400 hover:border-red-400/40 hover:text-red-300">
                  Clear timing
                </button>
              </div>
            )}
          </div>
        );
      case 'breakRange':
        return (
          <div className="grid grid-cols-2 gap-1">
            <div>
              <p className="mb-0.5 text-[10px] uppercase tracking-wide text-slate-500">Break out</p>
              <input type="time" value={d.breakStart} onChange={(e) => upd(colIdx, { breakStart: e.target.value })} disabled={dis} className={inputCls} {...getGridNavProps(NAV_ROW.break, colIdx + 1, 0)} />
            </div>
            <div>
              <p className="mb-0.5 text-[10px] uppercase tracking-wide text-slate-500">Break in</p>
              <input type="time" value={d.breakEnd} onChange={(e) => upd(colIdx, { breakEnd: e.target.value })} disabled={dis} className={inputCls} {...getGridNavProps(NAV_ROW.break, colIdx + 1, 1)} />
            </div>
          </div>
        );
      case 'remarks':
        return <textarea value={d.remarks} onChange={(e) => upd(colIdx, { remarks: e.target.value })} disabled={dis} rows={2} className={inputCls} {...getGridNavProps(NAV_ROW.remarks, colIdx + 1)} />;
      default:
        return null;
    }
  };

  const renderWorkersCell = (draft: AsgDraft, colIdx: number) => {
    const controlButtonCls = isLight
      ? 'rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:border-emerald-300 hover:text-emerald-700'
      : 'rounded-full border border-white/10 bg-slate-950 px-2 py-0.5 text-[11px] font-medium text-slate-300 hover:border-emerald-400/40 hover:text-emerald-300';
    const dangerButtonCls = isLight
      ? 'rounded-full border border-rose-200 bg-white px-2 py-0.5 text-[11px] font-medium text-rose-600 hover:border-rose-300 hover:text-rose-700'
      : 'rounded-full border border-rose-500/20 bg-slate-950 px-2 py-0.5 text-[11px] font-medium text-rose-300 hover:border-rose-400/40 hover:text-rose-200';
    const blockCls = isLight
      ? 'rounded-lg border border-amber-200 bg-white p-1.5 shadow-sm'
      : 'rounded-lg border border-white/10 bg-slate-950/70 p-1.5';

    return (
      <div className="space-y-1.5">
        {!dis && (
          <div className="flex flex-wrap items-center gap-1">
            <button type="button" onClick={() => toggleSplitMode(colIdx)} className={controlButtonCls}>
              {draft.splitMode ? 'Use single team' : 'Split team'}
            </button>
            {draft.splitMode && (
              <button type="button" onClick={() => addSubTeam(colIdx)} className={controlButtonCls}>
                + Add sub-team
              </button>
            )}
          </div>
        )}

        {!draft.splitMode ? (
          <div className="space-y-1">
            {draft.members.map((member, memberIndex) => {
              const isMulti = member.employeeId ? multiAssigned.has(member.employeeId) : false;
              return (
                <div key={`flat-worker-${memberIndex}`} className={`flex items-center gap-1 ${isMulti ? 'rounded ring-2 ring-amber-400/60' : ''}`}>
                  <div className="flex-1">
                    <SearchSelect
                      items={getSelectableWorkerItems(draft, { excludeFlatMemberIndex: memberIndex })}
                      value={member.employeeId}
                      onChange={(value) => updateFlatMember(colIdx, memberIndex, value)}
                      placeholder={memberIndex === 0 ? 'Team Leader' : `Worker ${memberIndex}`}
                      disabled={dis}
                      minCharactersToSearch={1}
                    />
                  </div>
                  {!dis && (
                    <button
                      type="button"
                      onClick={() => removeFlatMember(colIdx, memberIndex)}
                      className="px-1 text-red-400/70 transition-colors hover:text-red-300"
                      title="Remove worker"
                      aria-label="Remove worker"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 7h12" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7l1 12h6l1-12" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
            {!dis && (
              <button
                type="button"
                onClick={() => addFlatMember(colIdx)}
                className="text-xs text-emerald-400 hover:text-emerald-300"
                {...getGridNavProps(NAV_ROW.workers, colIdx + 1)}
              >
                + Add / drop worker
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            {draft.subTeams.length === 0 && (
              <p className="text-[11px] text-slate-500">Add a sub-team to start splitting this team.</p>
            )}
            {draft.subTeams.map((subTeam, subTeamIndex) => (
              <div
                key={subTeam.id}
                className={`${blockCls} ${draggingWorkerId ? 'transition-colors' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setActiveDropColumn(colIdx);
                }}
                onDragLeave={() => {
                  if (activeDropColumn === colIdx) setActiveDropColumn(null);
                }}
                onDrop={(e) => onWorkerDropToSubTeam(e, colIdx, subTeamIndex)}
              >
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <input
                    value={subTeam.label}
                    onChange={(e) => updateSubTeamMeta(colIdx, subTeamIndex, { label: e.target.value })}
                    disabled={dis}
                    className={`${inputCls} w-auto! min-w-36 flex-1`}
                    placeholder={nextSubTeamLabel(subTeamIndex)}
                  />
                  {!dis && (
                    <button type="button" onClick={() => removeSubTeam(colIdx, subTeamIndex)} className={dangerButtonCls}>
                      Remove
                    </button>
                  )}
                </div>
                <div className="mt-1.5 space-y-1">
                  {subTeam.members.map((member, memberIndex) => {
                    const isMulti = member.employeeId ? multiAssigned.has(member.employeeId) : false;
                    return (
                      <div key={`${subTeam.id}-member-${memberIndex}`} className={`flex items-center gap-1 ${isMulti ? 'rounded ring-2 ring-amber-400/60' : ''}`}>
                        <div className="flex-1">
                          <SearchSelect
                            items={getSelectableWorkerItems(draft, {
                              excludeSubTeamIndex: subTeamIndex,
                              excludeSubTeamMemberIndex: memberIndex,
                            })}
                            value={member.employeeId}
                            onChange={(value) => updateSubTeamMember(colIdx, subTeamIndex, memberIndex, value)}
                            placeholder={memberIndex === 0 ? 'Team Leader' : `Worker ${memberIndex}`}
                            disabled={dis}
                            minCharactersToSearch={1}
                          />
                        </div>
                        {!dis && (
                          <button
                            type="button"
                            onClick={() => removeSubTeamMember(colIdx, subTeamIndex, memberIndex)}
                            className="px-1 text-red-400/70 transition-colors hover:text-red-300"
                            title="Remove worker"
                            aria-label="Remove worker"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 7h12" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7l1 12h6l1-12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {!dis && (
                    <button type="button" onClick={() => addSubTeamMember(colIdx, subTeamIndex)} className="text-xs text-emerald-400 hover:text-emerald-300">
                      + Add / drop worker
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`relative left-1/2 right-1/2 w-screen max-w-none -translate-x-1/2 px-3 pb-4 pt-3 sm:px-4 sm:pt-4 xl:px-5 ${pageShellCls}`}>
      <div className="space-y-2" style={{ zoom: viewScale } as CSSProperties}>
        <section className={`overflow-hidden rounded-xl ${heroCls}`}>
          <div className={`border-b px-3 py-3 sm:px-4 ${dividerCls}`}>
            <div className="flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
              <div className="max-w-3xl">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className={`text-2xl font-semibold tracking-tight sm:text-[30px] ${headingCls}`}>Daily team planner</h1>
                  {status && (
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                        status === 'PUBLISHED'
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : status === 'LOCKED'
                            ? 'bg-amber-500/15 text-amber-300'
                            : 'bg-slate-500/20 text-slate-300'
                      }`}
                    >
                      {status}
                    </span>
                  )}
                </div>
                <p className={`mt-1.5 text-sm ${bodyTextCls}`}>
                  Build the day’s team plan, assign transport and timing, then hand it off cleanly to attendance.
                </p>
                <div className={`mt-2 flex flex-wrap items-center gap-1.5 text-xs ${subtleTextCls}`}>
                  <span className={`rounded-full px-2 py-0.5 ${isLight ? 'border border-slate-200 bg-slate-50' : 'border border-white/10 bg-white/3'}`}>{workDate}</span>
                  {schedule && (
                    <>
                      <span className="text-slate-600">•</span>
                      <span>{scheduleSummary.groups} teams</span>
                      <span className="text-slate-600">•</span>
                      <span>{scheduleSummary.workers} assigned workers</span>
                    </>
                  )}
                </div>
              </div>

              <div className="grid w-full gap-1.5 sm:grid-cols-3 xl:w-auto xl:min-w-116">
                {schedule ? (
                  <>
                    <div className={metricCardCls}>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Teams</p>
                      <p className={`mt-0.5 text-lg font-semibold ${headingCls}`}>{scheduleSummary.groups}</p>
                    </div>
                    <div className={metricCardCls}>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Workers</p>
                      <p className={`mt-0.5 text-lg font-semibold ${headingCls}`}>{scheduleSummary.workers}</p>
                    </div>
                    <div className={metricAccentCls}>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300/70">Timing ready</p>
                      <p className="mt-0.5 text-lg font-semibold text-emerald-300">{scheduleSummary.groupsWithTiming}</p>
                    </div>
                  </>
                ) : canEdit ? (
                  <div className="sm:col-span-3 xl:min-w-[18rem]">
                    <Button onClick={createSchedule} className="w-full">
                      Create draft
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 px-3 py-2.5 sm:px-4">
            {schedule && canEdit && !locked && (
              <>
                <Button variant="outline" onClick={() => void openSchedulePrintOutput('print')}>
                  Print
                </Button>
                <Button variant="outline" onClick={() => void openSchedulePrintOutput('download')}>
                  Download
                </Button>
                <select
                  value={selectedTemplateDate}
                  onChange={(e) => setSelectedTemplateDate(e.target.value)}
                  className="rounded-lg border border-white/10 bg-slate-950 px-2 py-1.5 text-sm text-white"
                >
                  <option value="">Use previous schedule</option>
                  {previousSchedules.map((item) => (
                    <option key={item.id} value={item.workDate}>
                      {item.workDate} ({item.status})
                    </option>
                  ))}
                </select>
                <Button variant="outline" onClick={applyPreviousScheduleTemplate} disabled={!selectedTemplateDate}>
                  Apply template
                </Button>
                <Button variant="secondary" onClick={addColumn}>
                  + Add team
                </Button>
                <Button variant="outline" onClick={toggle} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
                  {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                </Button>
                {isLight && (
                  <Button variant="outline" onClick={() => setUseLightGridTheme((current) => !current)}>
                    {useLightGridTheme ? 'Undo theme' : 'Apply theme'}
                  </Button>
                )}
                <Button variant="outline" onClick={() => setShowWorkerRail((current) => !current)}>
                  {showWorkerRail ? 'Hide worker rail' : 'Show worker rail'}
                </Button>
                <Button variant="outline" onClick={() => setShowRowLabels((current) => !current)}>
                  {showRowLabels ? 'Hide row labels' : 'Show row labels'}
                </Button>
                <Button variant="outline" onClick={() => setViewScale((current) => Math.max(0.8, Number((current - 0.1).toFixed(2))))} disabled={!canZoomOut}>
                  -
                </Button>
                <span className={`inline-flex items-center rounded-lg px-2 py-1 text-xs font-medium ${isLight ? 'border border-slate-200 bg-white text-slate-700' : 'border border-white/10 bg-slate-950 text-slate-300'}`}>
                  {Math.round(viewScale * 100)}%
                </span>
                <Button variant="outline" onClick={() => setViewScale((current) => Math.min(1.35, Number((current + 0.1).toFixed(2))))} disabled={!canZoomIn}>
                  +
                </Button>
                <Button variant="outline" onClick={undo} disabled={undoStack.length === 0}>
                  Undo
                </Button>
                <Button variant="outline" onClick={redo} disabled={redoStack.length === 0}>
                  Redo
                </Button>
                <Button variant="secondary" onClick={saveAssignments} disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              </>
            )}
            {schedule && canPub && status === 'DRAFT' && <Button onClick={publish}>Publish</Button>}
          </div>
        </section>

        {schedule && (
          <div className={`grid gap-2 ${showWorkerRail ? 'xl:grid-cols-[minmax(0,1fr)_20rem]' : 'grid-cols-1'}`}>
            <section className={`overflow-visible rounded-xl ${sectionCls}`}>
              <div className={`flex items-center justify-between border-b px-3 py-2 ${dividerCls}`}>
                <div>
                  <h2 className={`text-sm font-semibold uppercase tracking-[0.18em] ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Planning grid</h2>
                  <p className={`mt-1 text-xs ${subtleTextCls}`}>Teams run left to right. Use arrow keys to move cell-by-cell.</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${isLight ? 'border border-slate-200 bg-slate-50 text-slate-500' : 'border border-white/10 bg-white/3 text-slate-400'}`}>
                  {drafts.length} active team{drafts.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className={`overflow-x-auto shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] ${isLight ? 'bg-slate-50/70' : 'bg-slate-900/25'}`}>
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className={`border-b ${dividerCls} ${isLight ? 'bg-white/80' : 'bg-slate-950/40'}`}>
                  {showRowLabels && <th className={thCls}>Teams</th>}
                  {drafts.map((d, ci) => (
                    <th
                      key={ci}
                      className={`min-w-[200px] border-l px-2 py-1.5 text-center text-[11px] font-semibold ${isLight ? 'border-slate-200 text-slate-800' : 'border-white/10 text-white'} ${getColumnDropHighlightCls(ci)}`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setActiveDropColumn(ci);
                      }}
                      onDragLeave={() => {
                        if (activeDropColumn === ci) setActiveDropColumn(null);
                      }}
                      onDrop={(e) => onWorkerDrop(e, ci)}
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>#{d.columnIndex}</span>
                        {canEdit && !locked && (
                          <>
                            <button
                              type="button"
                              onClick={() => duplicateColumn(ci)}
                              className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-medium text-slate-300 transition-colors hover:border-emerald-400/40 hover:text-emerald-300"
                              title="Duplicate"
                              aria-label="Duplicate team"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 8h11v11H8z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 16H4a1 1 0 01-1-1V4a1 1 0 011-1h11a1 1 0 011 1v1" />
                              </svg>
                              <span>Copy</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => removeColumn(ci)}
                              className="inline-flex items-center gap-1 rounded-full border border-red-500/20 px-2 py-0.5 text-[10px] font-medium text-red-300 transition-colors hover:border-red-400/40 hover:text-red-200"
                              title="Remove"
                              aria-label="Delete team"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 7h12" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7l1 12h6l1-12" />
                              </svg>
                              <span>Delete</span>
                            </button>
                          </>
                        )}
                      </div>
                    </th>
                  ))}
                  {drafts.length === 0 && <th className="px-3 py-1.5 text-slate-500 text-xs">No teams yet</th>}
                </tr>
              </thead>
              <tbody>
                {FIELD_ROWS.map((f) => (
                  <tr key={f.key} className={getRowThemeClasses(f.key).row}>
                    {showRowLabels && <th className={getRowThemeClasses(f.key).label}>{f.label}</th>}
                    {drafts.map((d, ci) => (
                      <td
                        key={ci}
                        className={`${getRowThemeClasses(f.key).cell} ${getColumnDropHighlightCls(ci)}`}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setActiveDropColumn(ci);
                        }}
                        onDragLeave={() => {
                          if (activeDropColumn === ci) setActiveDropColumn(null);
                        }}
                        onDrop={(e) => onWorkerDrop(e, ci)}
                      >
                        {renderCell(d, ci, f.key)}
                      </td>
                    ))}
                  </tr>
                ))}

                <tr className={getRowThemeClasses('workers').row}>
                  {showRowLabels && <th className={getRowThemeClasses('workers').label}>Workers</th>}
                  {drafts.map((d, ci) => (
                    <td
                      key={ci}
                      className={`${getRowThemeClasses('workers').cell} ${getColumnDropHighlightCls(ci)}`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setActiveDropColumn(ci);
                      }}
                      onDragLeave={() => {
                        if (activeDropColumn === ci) setActiveDropColumn(null);
                      }}
                      onDrop={(e) => onWorkerDrop(e, ci)}
                    >
                      {renderWorkersCell(d, ci)}
                    </td>
                  ))}
                </tr>

                <tr className={getRowThemeClasses('workerCount').row}>
                  {showRowLabels && <th className={getRowThemeClasses('workerCount').label}>Assigned workers</th>}
                  {drafts.map((d, ci) => (
                    <td key={ci} className={getRowThemeClasses('workerCount').cell}>
                        <div className={`inline-flex min-w-12 items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold ${isLight ? 'border border-orange-200 bg-white text-orange-700' : 'border border-orange-500/30 bg-orange-500/10 text-orange-300'}`}>
                        {getDraftWorkerCount(d)}
                        </div>
                      </td>
                    ))}
                </tr>

                <tr className={getRowThemeClasses('suggestedWorkers').row}>
                  {showRowLabels && <th className={getRowThemeClasses('suggestedWorkers').label}>Suggested workers</th>}
                  {drafts.map((d, ci) => {
                    const job = jobs.find((j) => j.id === d.jobId);
                    const required = parseJobExpertise(job);
                    const suggestions = suggestedWorkersByColumn.get(ci) ?? [];
                    return (
                      <td key={ci} className={getRowThemeClasses('suggestedWorkers').cell}>
                        {required.length === 0 ? (
                          <p className="text-[11px] text-slate-500">No job expertise configured yet.</p>
                        ) : suggestions.length === 0 ? (
                          <p className="text-[11px] text-slate-500">No matching workers available.</p>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {suggestions.slice(0, 8).map((w) => (
                              <button
                                key={w.id}
                                type="button"
                                disabled={dis}
                                onClick={() => addWorkerToTeam(ci, w.id)}
                                className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-60"
                                title={w.workforce.expertises.join(', ')}
                              >
                                {w.preferredName || w.fullName}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>

                <tr className={getRowThemeClasses('targetQty').row}>
                  {showRowLabels && <th className={getRowThemeClasses('targetQty').label}>Target Qty</th>}
                  {drafts.map((d, ci) => (
                    <td key={ci} className={getRowThemeClasses('targetQty').cell}>
                      {renderCell(d, ci, 'targetQty')}
                    </td>
                  ))}
                </tr>

                <tr className={getRowThemeClasses('driver1EmployeeId').row}>
                  {showRowLabels && <th className={getRowThemeClasses('driver1EmployeeId').label}>Driver 1</th>}
                  {drafts.map((d, ci) => (
                    <td key={ci} className={getRowThemeClasses('driver1EmployeeId').cell}>
                      {renderCell(d, ci, 'driver1EmployeeId')}
                    </td>
                  ))}
                </tr>

                <tr className={getRowThemeClasses('driver2EmployeeId').row}>
                  {showRowLabels && <th className={getRowThemeClasses('driver2EmployeeId').label}>Driver 2</th>}
                  {drafts.map((d, ci) => (
                    <td key={ci} className={getRowThemeClasses('driver2EmployeeId').cell}>
                      {renderCell(d, ci, 'driver2EmployeeId')}
                    </td>
                  ))}
                </tr>

                {/* Remarks row */}
                <tr className={getRowThemeClasses('remarks').row}>
                  {showRowLabels && <th className={getRowThemeClasses('remarks').label}>Remarks</th>}
                  {drafts.map((d, ci) => (
                    <td key={ci} className={getRowThemeClasses('remarks').cell}>
                      {renderCell(d, ci, 'remarks')}
                    </td>
                  ))}
                </tr>

              </tbody>
            </table>
              </div>
            </section>

            {showWorkerRail && (
            <aside className={`sticky top-3 self-start overflow-hidden rounded-xl ${sectionCls}`}>
              <div className={`border-b px-3 py-2 ${dividerCls}`}>
                <h2 className={`text-sm font-semibold uppercase tracking-[0.18em] ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Worker rail</h2>
                <p className={`mt-1 text-xs ${subtleTextCls}`}>
                  {unassignedWorkers.length} unassigned of {workerPool.length} worker/hybrid staff.
                </p>
              </div>
              <div className="max-h-136 space-y-1 overflow-auto px-3 py-2.5">
              {unassignedWorkers.length === 0 ? (
                <p className="text-xs text-emerald-400">All workers assigned.</p>
              ) : (
                unassignedWorkers.map((e) => (
                  <div
                    key={e.id}
                    draggable={!dis}
                    onDragStart={(evt) => onWorkerDragStart(evt, e.id)}
                    onDragEnd={() => {
                      setDraggingWorkerId('');
                      setActiveDropColumn(null);
                    }}
                    className={`cursor-grab rounded-lg px-2 py-1.5 active:cursor-grabbing ${isLight ? 'border border-slate-200 bg-white' : 'border border-white/10 bg-white/3'}`}
                    title={dis ? '' : 'Drag to any worker slot'}
                  >
                    <p className={`text-xs font-medium ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>{e.preferredName || e.fullName}</p>
                    <p className="mt-0.5 text-[10px] text-slate-500">
                      {e.workforce.expertises.length > 0 ? e.workforce.expertises.join(', ') : 'No expertise set'}
                    </p>
                  </div>
                ))
              )}
              </div>

            {multiAssigned.size > 0 && (
              <div className={`border-t px-3 py-2.5 ${dividerCls}`}>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-amber-300">Multi-assigned</p>
                <div className="mt-1.5 flex flex-wrap gap-0.5">
                  {[...multiAssigned].map((id) => (
                    <span key={id} className="rounded-full bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] text-amber-300">
                      {empName(id)} x{empAssignCount.get(id)}
                    </span>
                  ))}
                </div>
              </div>
            )}
            </aside>
            )}
          </div>
        )}

        {schedule && (
          <section className={`rounded-xl px-3 py-2.5 ${sectionCls}`}>
            <div className="mb-2">
              <h2 className={`text-sm font-semibold uppercase tracking-[0.18em] ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Schedule notes</h2>
              <p className={`mt-1 text-xs ${subtleTextCls}`}>One shared note for the whole schedule, separate from team remarks.</p>
            </div>
          <textarea
            value={scheduleInfo}
            onChange={(e) => setScheduleInfo(e.target.value)}
            disabled={dis}
            rows={2}
            placeholder="General notes for this schedule..."
            className={`${inputCls} min-h-[56px] resize-y`}
          />
          </section>
        )}

        {schedule && (
          <section className={`rounded-xl p-3 ${sectionCls}`}>
            <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className={`text-sm font-semibold uppercase tracking-[0.18em] ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Driver trip planner</h2>
                <p className={`mt-1 text-xs ${subtleTextCls}`}>
                  Keep only the drivers needed for this day and define their trip order or route.
                </p>
              </div>
              <div className="min-w-[18rem] max-w-md flex-1">
                <p className={`mb-1.5 text-xs ${subtleTextCls}`}>
                Add only the drivers needed for this schedule. Older schedules keep their saved driver list.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <div className="min-w-56 flex-1">
                    <SearchSelect
                      items={availableDriverItems}
                      value={selectedDriverToAdd}
                      onChange={(value) => {
                        setSelectedDriverToAdd(value);
                        addDriverTripRow(value);
                      }}
                      placeholder={availableDriverItems.length > 0 ? 'Add driver...' : 'No more active drivers'}
                      disabled={dis || availableDriverItems.length === 0}
                      minCharactersToSearch={1}
                    />
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => addDriverTripRow(selectedDriverToAdd)}
                    disabled={dis || !selectedDriverToAdd}
                  >
                    Add driver
                  </Button>
                </div>
              </div>
            </div>
            <div className={`grid gap-2 ${showWorkerRail ? 'xl:grid-cols-[minmax(0,1fr)_18rem]' : 'grid-cols-1'}`}>
              <div className={`overflow-hidden rounded-lg ${isLight ? 'border border-slate-200' : 'border border-white/10'}`}>
                <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className={isLight ? 'bg-slate-50' : 'bg-slate-950/70'}>
                    <th className="px-2 py-1.5 text-left text-xs font-medium uppercase tracking-wide text-slate-400">Driver</th>
                    <th className="px-2 py-1.5 text-left text-xs font-medium uppercase tracking-wide text-slate-400">Trip order / route</th>
                    <th className="px-2 py-1.5 text-right text-xs font-medium uppercase tracking-wide text-slate-400">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {driverTripRows.length === 0 ? (
                    <tr className={isLight ? 'border-t border-slate-200' : 'border-t border-white/5'}>
                      <td colSpan={3} className="px-2 py-2.5 text-sm text-slate-500">
                        No drivers selected for this schedule yet.
                      </td>
                    </tr>
                  ) : (
                    driverTripRows.map((log, index) => (
                      <tr key={`${log.driverEmployeeId}-${log.sequence}-${index}`} className={isLight ? 'border-t border-slate-200' : 'border-t border-white/5'}>
                        <td className="px-2 py-1.5">
                          <div className={`rounded px-1.5 py-1 text-xs ${isLight ? 'border border-slate-200 bg-white text-slate-700' : 'border border-white/10 bg-slate-950 text-slate-300'}`}>
                            {empName(log.driverEmployeeId) || 'Driver'}
                          </div>
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            value={log.routeText}
                            onChange={(e) =>
                              setDriverTripState((current) => ({
                                version: driverLogVersion,
                                values: {
                                  ...(current.version === driverLogVersion ? current.values : {}),
                                  [log.driverEmployeeId]: e.target.value,
                                },
                                selectedIds:
                                  current.version === driverLogVersion
                                    ? current.selectedIds
                                    : driverTripRows.map((row) => row.driverEmployeeId),
                              }))
                            }
                            disabled={dis}
                            placeholder="Trip order / route"
                            className={inputCls}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <button
                            type="button"
                            onClick={() => removeDriverTripRow(log.driverEmployeeId)}
                            disabled={dis}
                            className="inline-flex items-center gap-0.5 rounded-full border border-red-500/20 px-1.5 py-0.5 text-[11px] font-medium text-red-300 transition-colors hover:border-red-400/40 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              </div>

              <aside className={`sticky top-3 self-start overflow-hidden rounded-lg ${sectionCls}`}>
                <div className={`border-b px-3 py-2 ${dividerCls}`}>
                  <h3 className={`text-sm font-semibold uppercase tracking-[0.18em] ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Unassigned drivers</h3>
                  <p className={`mt-1 text-xs ${subtleTextCls}`}>
                    {availableDriverItems.length} active driver{availableDriverItems.length === 1 ? '' : 's'} not yet added.
                  </p>
                </div>
                <div className="max-h-112 space-y-1 overflow-auto px-3 py-2.5">
                  {availableDriverItems.length === 0 ? (
                    <p className="text-xs text-emerald-400">All active drivers are already listed.</p>
                  ) : (
                    availableDriverItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        disabled={dis}
                        onClick={() => addDriverTripRow(item.id)}
                        className={`block w-full rounded-lg px-2 py-1.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${isLight ? 'border border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/60' : 'border border-white/10 bg-white/3 hover:border-emerald-400/30 hover:bg-emerald-500/10'}`}
                      >
                        <p className={`text-xs font-medium ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>{item.label}</p>
                        <p className="mt-0.5 text-[10px] text-slate-500">{item.searchText || 'Active driver'}</p>
                      </button>
                    ))
                  )}
                </div>
              </aside>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
