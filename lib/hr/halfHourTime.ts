export type HalfHourMeridiem = 'AM' | 'PM';

export type HalfHourPickerValue = {
  hour12: number;
  minute: 0 | 30;
  meridiem: HalfHourMeridiem;
};

export const HALF_HOUR_MINUTES: readonly (0 | 30)[] = [0, 30];
export const HOUR12_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export function snapMinuteToHalfHour(minute: number): 0 | 30 {
  if (!Number.isFinite(minute)) return 0;
  return minute >= 15 && minute < 45 ? 30 : 0;
}

export function parseTime24Parts(time24: string): { hour24: number; minute: number } | null {
  const match = String(time24 ?? '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour24 = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour24) || !Number.isFinite(minute)) return null;
  if (hour24 < 0 || hour24 > 23 || minute < 0 || minute > 59) return null;
  return { hour24, minute };
}

export function time24ToHalfHourPicker(time24: string, fallback?: HalfHourPickerValue): HalfHourPickerValue {
  const parts = parseTime24Parts(time24);
  if (!parts) {
    return (
      fallback ?? {
        hour12: 8,
        minute: 0,
        meridiem: 'AM',
      }
    );
  }

  const { hour24, minute } = parts;
  const meridiem: HalfHourMeridiem = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return {
    hour12,
    minute: snapMinuteToHalfHour(minute),
    meridiem,
  };
}

export function halfHourPickerToTime24(value: HalfHourPickerValue): string {
  let hour24 = value.hour12 % 12;
  if (value.meridiem === 'PM') hour24 += 12;
  return `${String(hour24).padStart(2, '0')}:${value.minute === 30 ? '30' : '00'}`;
}

export function formatHalfHourPickerLabel(value: HalfHourPickerValue): string {
  return `${String(value.hour12).padStart(2, '0')}:${value.minute === 30 ? '30' : '00'} ${value.meridiem}`;
}
