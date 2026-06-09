# Lib HR

> 19 nodes · cohesion 0.17

## Key Concepts

- **route.ts** (22 connections) — `app/api/hr/attendance/monthly-report/route.ts`
- **attendanceReportFormatting.ts** (18 connections) — `lib/hr/attendanceReportFormatting.ts`
- **GET()** (10 connections) — `app/api/hr/attendance/monthly-report/route.ts`
- **formatAttendanceReportCell()** (7 connections) — `lib/hr/attendanceReportFormatting.ts`
- **DEFAULT_ATTENDANCE_REPORT_SCHEMA** (3 connections) — `lib/hr/attendanceReportBuilder.ts`
- **normalizeAttendanceReportBuilderSchema()** (3 connections) — `lib/hr/attendanceReportBuilder.ts`
- **normalizeAttendanceReportColumns()** (3 connections) — `lib/hr/attendanceReportFormatting.ts`
- **normalizeAttendanceReportFormats()** (3 connections) — `lib/hr/attendanceReportFormatting.ts`
- **attendanceReportColumnLabel()** (3 connections) — `lib/hr/attendanceReportFormatting.ts`
- **sanitizeSheetName()** (2 connections) — `app/api/hr/attendance/monthly-report/route.ts`
- **AttendanceReportFormatOptions** (2 connections) — `lib/hr/attendanceReportFormatting.ts`
- **DEFAULT_ATTENDANCE_REPORT_COLUMNS** (2 connections) — `lib/hr/attendanceReportFormatting.ts`
- **DEFAULT_ATTENDANCE_REPORT_FORMATS** (2 connections) — `lib/hr/attendanceReportFormatting.ts`
- **formatAttendanceReportDate()** (2 connections) — `lib/hr/attendanceReportFormatting.ts`
- **formatAttendanceReportTime()** (2 connections) — `lib/hr/attendanceReportFormatting.ts`
- **formatAttendanceReportHours()** (2 connections) — `lib/hr/attendanceReportFormatting.ts`
- **AttendanceReportEntryLike** (1 connections) — `lib/hr/attendanceReportFormatting.ts`
- **ATTENDANCE_REPORT_COLUMN_OPTIONS** (1 connections) — `lib/hr/attendanceReportFormatting.ts`
- **VALID_COLUMN_KEYS** (1 connections) — `lib/hr/attendanceReportFormatting.ts`

## Relationships

- [[API HR, Settings, and Stock Exception Approvals]] (7 shared connections)
- [[Lib HR]] (7 shared connections)
- [[HR Reports]] (7 shared connections)
- [[Lib and HR]] (5 shared connections)
- [[API Materials, Reports, and Settings]] (3 shared connections)
- [[API Categories, Transactions, and Units]] (2 shared connections)

## Source Files

- `app/api/hr/attendance/monthly-report/route.ts`
- `lib/hr/attendanceReportBuilder.ts`
- `lib/hr/attendanceReportFormatting.ts`

## Audit Trail

- EXTRACTED: 89 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*