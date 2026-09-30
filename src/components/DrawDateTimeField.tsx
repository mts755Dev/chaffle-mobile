import React, { useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Pressable,
} from 'react-native';
import { Text, Button, Icon } from 'react-native-paper';
import { COLORS } from '../constants';
import {
  formatRaffleDate,
  fromRaffleDateTimeLocalValue,
  toRaffleDateTimeLocalValue,
} from '../lib/raffleDates';

type Props = {
  value?: string | null;
  error?: boolean;
  onChange: (nextLocalValue: string) => void;
};

type Parts = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
};

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Calendar + time sheet that mirrors web `<input type="datetime-local" />`.
 * Pure JS (no native rebuild) — stores Eastern wall-clock YYYY-MM-DDTHH:mm.
 */
export default function DrawDateTimeField({ value, error, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [parts, setParts] = useState<Parts>(() => parseParts(value));
  const [viewYear, setViewYear] = useState(() => parseParts(value).year);
  const [viewMonth, setViewMonth] = useState(() => parseParts(value).month);

  const displayLabel = useMemo(() => {
    const local = toRaffleDateTimeLocalValue(value);
    if (!local) return '';
    return formatRaffleDate(local);
  }, [value]);

  const openSheet = () => {
    const next = parseParts(value);
    setParts(next);
    setViewYear(next.year);
    setViewMonth(next.month);
    setOpen(true);
  };

  const commit = () => {
    onChange(fromRaffleDateTimeLocalValue(partsToLocal(parts)));
    setOpen(false);
  };

  const calendarCells = useMemo(
    () => buildCalendarCells(viewYear, viewMonth),
    [viewYear, viewMonth],
  );

  const shiftMonth = (delta: number) => {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    setViewMonth(m);
    setViewYear(y);
  };

  return (
    <View>
      <Text style={styles.fieldLabel}>Draw Date & Time (EST)</Text>
      <TouchableOpacity
        onPress={openSheet}
        style={[styles.trigger, error ? styles.triggerError : null]}
        accessibilityRole="button"
        accessibilityLabel="Select draw date and time"
      >
        <View style={styles.triggerCopy}>
          <Icon source="calendar-clock" size={20} color={COLORS.primary} />
          <Text
            style={[
              styles.triggerText,
              !displayLabel ? styles.placeholder : null,
            ]}
          >
            {displayLabel || 'Select date and time'}
          </Text>
        </View>
        <Icon source="chevron-down" size={20} color={COLORS.textSecondary} />
      </TouchableOpacity>
      <Text style={styles.helperText}>
        Timezone is fixed to US Eastern (EST/EDT).
      </Text>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Draw Date & Time (EST)</Text>
              <Button
                mode="text"
                onPress={() => setOpen(false)}
                textColor={COLORS.textSecondary}
                compact
              >
                Cancel
              </Button>
            </View>

            {/* Month navigation */}
            <View style={styles.monthNav}>
              <TouchableOpacity onPress={() => shiftMonth(-1)} hitSlop={12}>
                <Icon source="chevron-left" size={28} color={COLORS.foreground} />
              </TouchableOpacity>
              <Text style={styles.monthTitle}>
                {MONTH_NAMES[viewMonth - 1]} {viewYear}
              </Text>
              <TouchableOpacity onPress={() => shiftMonth(1)} hitSlop={12}>
                <Icon source="chevron-right" size={28} color={COLORS.foreground} />
              </TouchableOpacity>
            </View>

            {/* Weekday headers */}
            <View style={styles.weekRow}>
              {WEEKDAYS.map((d) => (
                <Text key={d} style={styles.weekday}>
                  {d}
                </Text>
              ))}
            </View>

            {/* Calendar grid */}
            <View style={styles.grid}>
              {calendarCells.map((cell, idx) => {
                if (!cell) {
                  return <View key={`e-${idx}`} style={styles.dayCell} />;
                }
                const selected =
                  cell.year === parts.year &&
                  cell.month === parts.month &&
                  cell.day === parts.day;
                return (
                  <TouchableOpacity
                    key={`${cell.year}-${cell.month}-${cell.day}`}
                    style={styles.dayCell}
                    onPress={() =>
                      setParts((p) => ({
                        ...p,
                        year: cell.year,
                        month: cell.month,
                        day: cell.day,
                      }))
                    }
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.dayInner,
                        selected ? styles.dayInnerSelected : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          selected ? styles.dayTextSelected : null,
                        ]}
                      >
                        {cell.day}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Time — 12-hour + AM/PM */}
            <Text style={styles.timeLabel}>Time (EST)</Text>
            <View style={styles.timeRow}>
              <ScrollPicker
                values={HOURS_12}
                selected={to12Hour(parts.hour).hour12}
                onSelect={(hour12) =>
                  setParts((p) => ({
                    ...p,
                    hour: to24Hour(hour12, to12Hour(p.hour).isPm),
                  }))
                }
                format={(n) => String(n)}
              />
              <Text style={styles.timeColon}>:</Text>
              <ScrollPicker
                values={MINUTES}
                selected={parts.minute}
                onSelect={(minute) => setParts((p) => ({ ...p, minute }))}
                format={(n) => String(n).padStart(2, '0')}
              />
              <ScrollPicker
                values={MERIDIEM}
                selected={to12Hour(parts.hour).isPm ? 1 : 0}
                onSelect={(meridiem) =>
                  setParts((p) => ({
                    ...p,
                    hour: to24Hour(to12Hour(p.hour).hour12, meridiem === 1),
                  }))
                }
                format={(n) => (n === 1 ? 'PM' : 'AM')}
                wide
              />
            </View>

            <Text style={styles.preview}>
              Selected: {formatRaffleDate(partsToLocal(parts))}
            </Text>

            <Button
              mode="contained"
              onPress={commit}
              buttonColor={COLORS.primary}
              style={styles.doneButton}
            >
              Done
            </Button>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const HOURS_12 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
/** 0 = AM, 1 = PM */
const MERIDIEM = [0, 1];

function to12Hour(hour24: number): { hour12: number; isPm: boolean } {
  const isPm = hour24 >= 12;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour12, isPm };
}

function to24Hour(hour12: number, isPm: boolean): number {
  if (hour12 === 12) return isPm ? 12 : 0;
  return isPm ? hour12 + 12 : hour12;
}

function ScrollPicker({
  values,
  selected,
  onSelect,
  format,
  wide,
}: {
  values: number[];
  selected: number;
  onSelect: (n: number) => void;
  format: (n: number) => string;
  wide?: boolean;
}) {
  return (
    <ScrollView
      style={[styles.pickerColumn, wide ? styles.pickerColumnWide : null]}
      contentContainerStyle={styles.pickerContent}
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled
    >
      {values.map((n) => {
        const active = n === selected;
        return (
          <TouchableOpacity
            key={n}
            style={[styles.pickerItem, active ? styles.pickerItemActive : null]}
            onPress={() => onSelect(n)}
          >
            <Text
              style={[
                styles.pickerItemText,
                active ? styles.pickerItemTextActive : null,
              ]}
            >
              {format(n)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function parseParts(value?: string | null): Parts {
  const local = toRaffleDateTimeLocalValue(value);
  const match = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (match) {
    return {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: Number(match[4]),
      minute: Number(match[5]),
    };
  }
  // Default: today (US Eastern) at 20:00 wall clock
  const east = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const map = Object.fromEntries(east.map((p) => [p.type, p.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: 20,
    minute: 0,
  };
}

function partsToLocal(p: Parts): string {
  const y = String(p.year);
  const m = String(p.month).padStart(2, '0');
  const d = String(p.day).padStart(2, '0');
  const hh = String(p.hour).padStart(2, '0');
  const mm = String(p.minute).padStart(2, '0');
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

function buildCalendarCells(
  year: number,
  month: number,
): Array<{ year: number; month: number; day: number } | null> {
  const first = new Date(year, month - 1, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: Array<{ year: number; month: number; day: number } | null> = [];
  for (let i = 0; i < startPad; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ year, month, day });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

const styles = StyleSheet.create({
  fieldLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 6,
    marginTop: 4,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: COLORS.surface,
    marginBottom: 4,
  },
  triggerError: {
    borderColor: COLORS.error,
  },
  triggerCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  triggerText: {
    fontSize: 14,
    color: COLORS.foreground,
    flex: 1,
  },
  placeholder: {
    color: COLORS.textLight,
  },
  helperText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 8,
    marginTop: 4,
    lineHeight: 17,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    maxHeight: '92%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.foreground,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  monthTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.foreground,
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  weekday: {
    width: '14.2857%',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.2857%',
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayInnerSelected: {
    backgroundColor: COLORS.primary,
  },
  dayText: {
    fontSize: 15,
    color: COLORS.foreground,
    fontWeight: '500',
    textAlign: 'center',
    includeFontPadding: false,
    lineHeight: 18,
  },
  dayTextSelected: {
    color: COLORS.white,
    fontWeight: '700',
  },
  timeLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.foreground,
    marginTop: 12,
    marginBottom: 6,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  timeColon: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.foreground,
  },
  pickerColumn: {
    height: 140,
    width: 64,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceMuted,
  },
  pickerColumnWide: {
    width: 72,
  },
  pickerContent: {
    paddingVertical: 8,
  },
  pickerItem: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  pickerItemActive: {
    backgroundColor: COLORS.primary,
    marginHorizontal: 6,
    borderRadius: 6,
  },
  pickerItemText: {
    fontSize: 16,
    color: COLORS.foreground,
  },
  pickerItemTextActive: {
    color: COLORS.white,
    fontWeight: '700',
  },
  preview: {
    textAlign: 'center',
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 10,
  },
  doneButton: {
    borderRadius: 10,
  },
});
