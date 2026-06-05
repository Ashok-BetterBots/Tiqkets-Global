import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  Platform,
  ViewStyle,
  useColorScheme,
  Switch,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import Animated, { FadeIn, FadeOut, Layout } from "react-native-reanimated";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Colors, Spacing, BorderRadius, BrandColors } from "@/constants/theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Branch, BreakTime, Holiday, DaySchedule } from "@/types/organization";

type TabType = "hours" | "breaks" | "holidays" | "slots";

interface TimeSlot {
  time: string;
  maxCapacity: number;
  currentBookings: number;
  isBlocked: boolean;
  isBreak: boolean;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FULL_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const generateId = () => Math.random().toString(36).substr(2, 9);

const formatDate = (date: Date): string => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const parseDate = (dateStr: string): Date => {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const isTimeInBreak = (time: string, breaks: BreakTime[]): boolean => {
  const [hour, min] = time.split(":").map(Number);
  const timeMinutes = hour * 60 + min;
  
  return breaks.some((b) => {
    if (!b.isActive) return false;
    const [startH, startM] = b.startTime.split(":").map(Number);
    const [endH, endM] = b.endTime.split(":").map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    return timeMinutes >= startMinutes && timeMinutes < endMinutes;
  });
};

export default function OrgBookingsScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    organization,
    updateBranchSettings,
    getAccessibleBranches,
    selectedBranchId,
    setSelectedBranchId,
    hasPermission,
  } = useOrganization();
  const canSeeSlots = hasPermission("org.bookings.slots");

  const [activeTab, setActiveTab] = useState<TabType>("hours");
  useEffect(() => {
    if (activeTab === "slots" && !canSeeSlots) {
      setActiveTab("hours");
    }
  }, [activeTab, canSeeSlots]);
  const [selectedDay, setSelectedDay] = useState(new Date().getDay());
  const [showBranchPicker, setShowBranchPicker] = useState(false);
  const [showBreakModal, setShowBreakModal] = useState(false);
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [editingBreak, setEditingBreak] = useState<BreakTime | null>(null);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  
  const [breakName, setBreakName] = useState("");
  const [breakStart, setBreakStart] = useState("12:00");
  const [breakEnd, setBreakEnd] = useState("13:00");
  
  const [holidayName, setHolidayName] = useState("");
  const [holidayDate, setHolidayDate] = useState(new Date());
  const [holidayRecurring, setHolidayRecurring] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [activeBreakPicker, setActiveBreakPicker] = useState<"start" | "end" | null>(null);
  const [editingHoursDay, setEditingHoursDay] = useState<number | null>(null);
  const [editingHoursField, setEditingHoursField] = useState<"openTime" | "closeTime" | null>(null);
  const [showHoursTimePicker, setShowHoursTimePicker] = useState(false);
  
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  const timeStringToDate = (timeStr: string): Date => {
    const [hours, minutes] = timeStr.split(":").map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date;
  };

  const dateToTimeString = (date: Date): string => {
    return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
  };

  const formatTimeForDisplay = (timeStr: string): string => {
    const [hours, minutes] = timeStr.split(":").map(Number);
    const period = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, "0")} ${period}`;
  };

  const accessibleBranches = getAccessibleBranches();
  const canSelectBranch = accessibleBranches.length > 1;
  const selectedBranch = accessibleBranches.find((b) => b.id === selectedBranchId) || accessibleBranches[0];
  // Availability edits apply only to the single shared selected branch.
  const targetBranches = selectedBranch ? [selectedBranch] : [];

  const operatingHours = selectedBranch?.settings.operatingHours || [];
  const holidays = selectedBranch?.settings.holidays || [];
  const todayHours = operatingHours.find((h) => h.dayOfWeek === selectedDay);

  const timeSlots = useMemo(() => {
    if (!todayHours?.isOpen) return [];
    
    const slots: TimeSlot[] = [];
    const [openH, openM] = todayHours.openTime.split(":").map(Number);
    const [closeH, closeM] = todayHours.closeTime.split(":").map(Number);
    const duration = selectedBranch?.settings.defaultSlotDuration || 30;
    const capacity = selectedBranch?.settings.defaultSlotCapacity || 3;
    
    let currentMinutes = openH * 60 + openM;
    const endMinutes = closeH * 60 + closeM;
    
    while (currentMinutes < endMinutes) {
      const hour = Math.floor(currentMinutes / 60);
      const min = currentMinutes % 60;
      const time = `${hour.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`;
      const isBreak = isTimeInBreak(time, todayHours.breaks || []);
      
      slots.push({
        time,
        maxCapacity: capacity,
        currentBookings: Math.floor(Math.random() * capacity),
        isBlocked: false,
        isBreak,
      });
      
      currentMinutes += duration;
    }
    
    return slots;
  }, [todayHours, selectedBranch]);

  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDay = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    
    const days: (number | null)[] = [];
    for (let i = 0; i < startDay; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    return days;
  }, [calendarMonth]);

  if (!organization) return null;

  if (accessibleBranches.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <View style={[styles.emptyState, { paddingTop: Spacing.xl }]}>
          <Feather name="alert-circle" size={48} color={colors.textSecondary} />
          <ThemedText style={styles.emptyTitle}>No Branches Assigned</ThemedText>
          <ThemedText style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            You don't have access to any branches. Please contact your administrator.
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (!selectedBranch) return null;

  const handleToggleDay = async (dayOfWeek: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Compute the next open/closed state from the displayed branch, then apply
    // the same state to every target branch (each keeps its own times).
    const displayDay = operatingHours.find((h) => h.dayOfWeek === dayOfWeek);
    const nextOpen = !displayDay?.isOpen;
    for (const branch of targetBranches) {
      const branchHours = branch.settings?.operatingHours || [];
      const updatedHours = branchHours.map((h) =>
        h.dayOfWeek === dayOfWeek ? { ...h, isOpen: nextOpen } : h
      );
      await updateBranchSettings(branch.id, { operatingHours: updatedHours });
    }
  };

  const handleUpdateHours = async (dayOfWeek: number, field: "openTime" | "closeTime", value: string) => {
    for (const branch of targetBranches) {
      const branchHours = branch.settings?.operatingHours || [];
      const updatedHours = branchHours.map((h) =>
        h.dayOfWeek === dayOfWeek ? { ...h, [field]: value } : h
      );
      await updateBranchSettings(branch.id, { operatingHours: updatedHours });
    }
  };

  const handleSelectBranch = (branch: Branch) => {
    setSelectedBranchId(branch.id);
    setShowBranchPicker(false);
    Haptics.selectionAsync();
  };

  const handleAddBreak = () => {
    setEditingBreak(null);
    setBreakName("");
    setBreakStart("12:00");
    setBreakEnd("13:00");
    setActiveBreakPicker(null);
    setShowBreakModal(true);
  };

  const handleEditBreak = (breakItem: BreakTime) => {
    setEditingBreak(breakItem);
    setBreakName(breakItem.name);
    setBreakStart(breakItem.startTime);
    setBreakEnd(breakItem.endTime);
    setActiveBreakPicker(null);
    setShowBreakModal(true);
  };

  const handleSaveBreak = async () => {
    if (!breakName.trim()) return;

    if (editingBreak) {
      // Editing an existing break targets that one record on the displayed branch.
      const currentBreaks = todayHours?.breaks || [];
      const updatedBreaks = currentBreaks.map((b) =>
        b.id === editingBreak.id
          ? { ...b, name: breakName, startTime: breakStart, endTime: breakEnd }
          : b
      );
      const updatedHours = operatingHours.map((h) =>
        h.dayOfWeek === selectedDay ? { ...h, breaks: updatedBreaks } : h
      );
      await updateBranchSettings(selectedBranch.id, { operatingHours: updatedHours });
    } else {
      // Adding a break: apply to every target branch, each with its own new id.
      for (const branch of targetBranches) {
        const branchHours = branch.settings?.operatingHours || [];
        const updatedHours = branchHours.map((h) =>
          h.dayOfWeek === selectedDay
            ? {
                ...h,
                breaks: [
                  ...(h.breaks || []),
                  { id: generateId(), name: breakName, startTime: breakStart, endTime: breakEnd, isActive: true },
                ],
              }
            : h
        );
        await updateBranchSettings(branch.id, { operatingHours: updatedHours });
      }
    }
    setShowBreakModal(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleToggleBreak = async (breakId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const currentBreaks = todayHours?.breaks || [];
    const updatedBreaks = currentBreaks.map((b) =>
      b.id === breakId ? { ...b, isActive: !b.isActive } : b
    );
    
    const updatedHours = operatingHours.map((h) =>
      h.dayOfWeek === selectedDay ? { ...h, breaks: updatedBreaks } : h
    );
    
    await updateBranchSettings(selectedBranch.id, { operatingHours: updatedHours });
  };

  const handleDeleteBreak = async (breakId: string) => {
    const currentBreaks = todayHours?.breaks || [];
    const updatedBreaks = currentBreaks.filter((b) => b.id !== breakId);
    
    const updatedHours = operatingHours.map((h) =>
      h.dayOfWeek === selectedDay ? { ...h, breaks: updatedBreaks } : h
    );
    
    await updateBranchSettings(selectedBranch.id, { operatingHours: updatedHours });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleAddHoliday = () => {
    setEditingHoliday(null);
    setHolidayName("");
    setHolidayDate(new Date());
    setHolidayRecurring(false);
    setShowHolidayModal(true);
  };

  const handleSaveHoliday = async () => {
    if (!holidayName.trim()) return;

    if (editingHoliday) {
      // Editing an existing holiday targets that record on the displayed branch.
      const updatedHolidays = holidays.map((h) =>
        h.id === editingHoliday.id
          ? { ...h, name: holidayName, date: formatDate(holidayDate), isRecurring: holidayRecurring }
          : h
      );
      await updateBranchSettings(selectedBranch.id, { holidays: updatedHolidays });
    } else {
      // Adding a holiday: apply to every target branch, each with its own new id.
      for (const branch of targetBranches) {
        const branchHolidays = branch.settings?.holidays || [];
        const updatedHolidays = [
          ...branchHolidays,
          { id: generateId(), name: holidayName, date: formatDate(holidayDate), isRecurring: holidayRecurring },
        ];
        await updateBranchSettings(branch.id, { holidays: updatedHolidays });
      }
    }
    setShowHolidayModal(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleDeleteHoliday = async (holidayId: string) => {
    const updatedHolidays = holidays.filter((h) => h.id !== holidayId);
    await updateBranchSettings(selectedBranch.id, { holidays: updatedHolidays });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const [blockedSlots, setBlockedSlots] = useState<Record<number, string[]>>({});

  const handleToggleSlotBlocked = (slotTime: string) => {
    setBlockedSlots((prev) => {
      const dayBlocked = prev[selectedDay] || [];
      let updatedDayBlocked: string[];
      if (dayBlocked.includes(slotTime)) {
        updatedDayBlocked = dayBlocked.filter((t: string) => t !== slotTime);
      } else {
        updatedDayBlocked = [...dayBlocked, slotTime];
      }
      return { ...prev, [selectedDay]: updatedDayBlocked };
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const isSlotBlocked = (slotTime: string): boolean => {
    const dayBlocked = blockedSlots[selectedDay] || [];
    return dayBlocked.includes(slotTime);
  };

  const isHolidayOnDay = (day: number): Holiday | undefined => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const dateStr = formatDate(new Date(year, month, day));
    
    return holidays.find((h) => {
      if (h.isRecurring) {
        const holidayDate = parseDate(h.date);
        return holidayDate.getMonth() === month && holidayDate.getDate() === day;
      }
      return h.date === dateStr;
    });
  };

  const handleDayPress = (day: number) => {
    const holiday = isHolidayOnDay(day);
    if (holiday) {
      setEditingHoliday(holiday);
      setHolidayName(holiday.name);
      setHolidayDate(parseDate(holiday.date));
      setHolidayRecurring(holiday.isRecurring);
      setShowHolidayModal(true);
    } else {
      const year = calendarMonth.getFullYear();
      const month = calendarMonth.getMonth();
      setHolidayDate(new Date(year, month, day));
      handleAddHoliday();
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case "hours":
        return (
          <Animated.View entering={FadeIn} exiting={FadeOut}>
            <Card variant="outlined" style={styles.hoursCard}>
              {operatingHours.map((hours) => (
                <View key={hours.dayOfWeek} style={[styles.hourRow, { borderBottomColor: colors.border }]}>
                  <Pressable
                    style={styles.dayToggle}
                    onPress={() => handleToggleDay(hours.dayOfWeek)}
                  >
                    <Feather
                      name={hours.isOpen ? "check-square" : "square"}
                      size={18}
                      color={hours.isOpen ? colors.success : colors.textSecondary}
                    />
                    <ThemedText style={[styles.dayName, !hours.isOpen && { color: colors.textSecondary }]}>
                      {FULL_DAYS[hours.dayOfWeek]}
                    </ThemedText>
                  </Pressable>

                  {hours.isOpen ? (
                    <View style={styles.timeInputs}>
                      <Pressable
                        style={[styles.timePickerButton, { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle }]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setEditingHoursDay(hours.dayOfWeek);
                          setEditingHoursField("openTime");
                          setShowHoursTimePicker(true);
                        }}
                      >
                        <Feather name="clock" size={14} color={colors.primary} />
                        <ThemedText style={styles.timePickerText}>
                          {formatTimeForDisplay(hours.openTime)}
                        </ThemedText>
                      </Pressable>
                      <ThemedText style={[styles.timeSeparator, { color: colors.textSecondary }]}>-</ThemedText>
                      <Pressable
                        style={[styles.timePickerButton, { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle }]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setEditingHoursDay(hours.dayOfWeek);
                          setEditingHoursField("closeTime");
                          setShowHoursTimePicker(true);
                        }}
                      >
                        <Feather name="clock" size={14} color={colors.primary} />
                        <ThemedText style={styles.timePickerText}>
                          {formatTimeForDisplay(hours.closeTime)}
                        </ThemedText>
                      </Pressable>
                    </View>
                  ) : (
                    <ThemedText style={[styles.closedText, { color: colors.textSecondary }]}>Closed</ThemedText>
                  )}
                </View>
              ))}
            </Card>
          </Animated.View>
        );

      case "breaks":
        return (
          <Animated.View entering={FadeIn} exiting={FadeOut}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.daysRow}
            >
              {DAYS.map((day, index) => (
                <Pressable
                  key={day}
                  style={[
                    styles.dayChip,
                    { backgroundColor: selectedDay === index ? colors.primary : (colors.surfaceMuted) },
                    !operatingHours[index]?.isOpen && { opacity: 0.5 },
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedDay(index);
                  }}
                >
                  <ThemedText style={[
                    styles.dayChipText,
                    { color: selectedDay === index ? "#FFFFFF" : colors.textSecondary },
                  ]}>
                    {day}
                  </ThemedText>
                </Pressable>
              ))}
            </ScrollView>

            {!todayHours?.isOpen ? (
              <View style={styles.closedState}>
                <Feather name="x-circle" size={48} color={colors.textSecondary} />
                <ThemedText style={styles.closedTitle}>Closed on {FULL_DAYS[selectedDay]}</ThemedText>
                <ThemedText style={[styles.closedSubtitle, { color: colors.textSecondary }]}>
                  Enable this day in Operating Hours to add breaks
                </ThemedText>
              </View>
            ) : (
              <>
                <View style={styles.breaksHeader}>
                  <ThemedText type="body" style={styles.breaksDayTitle}>
                    Breaks for {FULL_DAYS[selectedDay]}
                  </ThemedText>
                  <Button
                    title="Add Break"
                    onPress={handleAddBreak}
                    size="small"
                    icon={<Feather name="plus" size={14} color="#FFFFFF" />}
                  />
                </View>

                {(todayHours.breaks || []).length === 0 ? (
                  <Card variant="outlined" style={styles.emptyBreaksCard}>
                    <Feather name="coffee" size={32} color={colors.textSecondary} />
                    <ThemedText style={styles.emptyBreaksText}>No breaks scheduled</ThemedText>
                    <ThemedText style={[styles.emptyBreaksSubtext, { color: colors.textSecondary }]}>
                      Add lunch or other break times
                    </ThemedText>
                  </Card>
                ) : (
                  (todayHours.breaks || []).map((breakItem) => (
                    <Animated.View key={breakItem.id} entering={FadeIn} layout={Layout}>
                      <Card variant="outlined" style={StyleSheet.flatten([styles.breakCard, !breakItem.isActive ? { opacity: 0.6 } : undefined])}>
                        <View style={styles.breakInfo}>
                          <View style={[styles.breakIconContainer, { backgroundColor: (breakItem.isActive ? colors.primary : colors.textSecondary) + "15" }]}>
                            <Feather
                              name={breakItem.name.toLowerCase().includes("lunch") ? "coffee" : "pause-circle"}
                              size={20}
                              color={breakItem.isActive ? colors.primary : colors.textSecondary}
                            />
                          </View>
                          <View style={styles.breakDetails}>
                            <ThemedText style={[styles.breakName, !breakItem.isActive && { color: colors.textSecondary }]}>
                              {breakItem.name}
                            </ThemedText>
                            <ThemedText style={[styles.breakTime, { color: colors.textSecondary }]}>
                              {breakItem.startTime} - {breakItem.endTime}
                            </ThemedText>
                          </View>
                        </View>
                        <View style={styles.breakActions}>
                          <Pressable
                            style={styles.breakAction}
                            onPress={() => handleToggleBreak(breakItem.id)}
                          >
                            <Feather
                              name={breakItem.isActive ? "toggle-right" : "toggle-left"}
                              size={24}
                              color={breakItem.isActive ? colors.success : colors.textSecondary}
                            />
                          </Pressable>
                          <Pressable
                            style={styles.breakAction}
                            onPress={() => handleEditBreak(breakItem)}
                          >
                            <Feather name="edit-2" size={18} color={colors.primary} />
                          </Pressable>
                          <Pressable
                            style={styles.breakAction}
                            onPress={() => handleDeleteBreak(breakItem.id)}
                          >
                            <Feather name="trash-2" size={18} color={colors.accent} />
                          </Pressable>
                        </View>
                      </Card>
                    </Animated.View>
                  ))
                )}
              </>
            )}
          </Animated.View>
        );

      case "holidays":
        return (
          <Animated.View entering={FadeIn} exiting={FadeOut}>
            <View style={styles.calendarHeader}>
              <Pressable
                style={styles.calendarNav}
                onPress={() => {
                  Haptics.selectionAsync();
                  setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1));
                }}
              >
                <Feather name="chevron-left" size={24} color={colors.primary} />
              </Pressable>
              <ThemedText style={styles.calendarTitle}>
                {MONTHS[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
              </ThemedText>
              <Pressable
                style={styles.calendarNav}
                onPress={() => {
                  Haptics.selectionAsync();
                  setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1));
                }}
              >
                <Feather name="chevron-right" size={24} color={colors.primary} />
              </Pressable>
            </View>

            <Card variant="outlined" style={styles.calendarCard}>
              <View style={styles.calendarWeekDays}>
                {DAYS.map((day) => (
                  <ThemedText key={day} style={[styles.calendarWeekDay, { color: colors.textSecondary }]}>{day}</ThemedText>
                ))}
              </View>
              <View style={styles.calendarGrid}>
                {calendarDays.map((day, index) => {
                  const holiday = day ? isHolidayOnDay(day) : undefined;
                  const isToday = day && 
                    new Date().getDate() === day &&
                    new Date().getMonth() === calendarMonth.getMonth() &&
                    new Date().getFullYear() === calendarMonth.getFullYear();

                  return (
                    <Pressable
                      key={index}
                      style={[
                        styles.calendarDay,
                        holiday ? styles.calendarDayHoliday : undefined,
                        isToday ? styles.calendarDayToday : undefined,
                      ]}
                      onPress={() => day ? handleDayPress(day) : null}
                      disabled={!day}
                    >
                      {day ? (
                        <>
                          <ThemedText style={[
                            styles.calendarDayText,
                            holiday ? styles.calendarDayTextHoliday : undefined,
                          ]}>
                            {day}
                          </ThemedText>
                          {holiday ? (
                            <View style={styles.holidayDot} />
                          ) : null}
                        </>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </Card>

            <View style={styles.holidaysListHeader}>
              <ThemedText type="body" style={styles.holidaysListTitle}>All Holidays</ThemedText>
              <Button
                title="Add Holiday"
                onPress={handleAddHoliday}
                size="small"
                icon={<Feather name="plus" size={14} color="#FFFFFF" />}
              />
            </View>

            {holidays.length === 0 ? (
              <Card variant="outlined" style={styles.emptyHolidaysCard}>
                <Feather name="calendar" size={32} color={colors.textSecondary} />
                <ThemedText style={styles.emptyHolidaysText}>No holidays added</ThemedText>
                <ThemedText style={[styles.emptyHolidaysSubtext, { color: colors.textSecondary }]}>
                  Tap on a date or add button to create a holiday
                </ThemedText>
              </Card>
            ) : (
              holidays.map((holiday) => (
                <Animated.View key={holiday.id} entering={FadeIn} layout={Layout}>
                  <Card variant="outlined" style={styles.holidayCard}>
                    <View style={styles.holidayInfo}>
                      <View style={[styles.holidayIconContainer, { backgroundColor: colors.accent + "15" }]}>
                        <Feather name="calendar" size={20} color={colors.accent} />
                      </View>
                      <View style={styles.holidayDetails}>
                        <ThemedText style={styles.holidayName}>{holiday.name}</ThemedText>
                        <View style={styles.holidayMeta}>
                          <ThemedText style={[styles.holidayDate, { color: colors.textSecondary }]}>
                            {new Date(holiday.date).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: holiday.isRecurring ? undefined : "numeric",
                            })}
                          </ThemedText>
                          {holiday.isRecurring ? (
                            <View style={[styles.recurringBadge, { backgroundColor: colors.primary + "15" }]}>
                              <Feather name="repeat" size={10} color={colors.primary} />
                              <ThemedText style={[styles.recurringText, { color: colors.primary }]}>Yearly</ThemedText>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    </View>
                    <Pressable
                      style={styles.deleteHoliday}
                      onPress={() => handleDeleteHoliday(holiday.id)}
                    >
                      <Feather name="trash-2" size={18} color={colors.accent} />
                    </Pressable>
                  </Card>
                </Animated.View>
              ))
            )}
          </Animated.View>
        );

      case "slots":
        return (
          <Animated.View entering={FadeIn} exiting={FadeOut}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.daysRow}
            >
              {DAYS.map((day, index) => (
                <Pressable
                  key={day}
                  style={[
                    styles.dayChip,
                    { backgroundColor: selectedDay === index ? colors.primary : (colors.surfaceMuted) },
                    !operatingHours[index]?.isOpen && { opacity: 0.5 },
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedDay(index);
                  }}
                >
                  <ThemedText style={[
                    styles.dayChipText,
                    { color: selectedDay === index ? "#FFFFFF" : colors.textSecondary },
                  ]}>
                    {day}
                  </ThemedText>
                </Pressable>
              ))}
            </ScrollView>

            {!todayHours?.isOpen ? (
              <View style={styles.closedState}>
                <Feather name="x-circle" size={48} color={colors.textSecondary} />
                <ThemedText style={styles.closedTitle}>Closed on {FULL_DAYS[selectedDay]}</ThemedText>
                <ThemedText style={[styles.closedSubtitle, { color: colors.textSecondary }]}>
                  Enable this day in Operating Hours to manage slots
                </ThemedText>
              </View>
            ) : (
              <>
                <View style={styles.slotsLegend}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
                    <ThemedText style={[styles.legendText, { color: colors.textSecondary }]}>Available</ThemedText>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: "#F59E0B" }]} />
                    <ThemedText style={[styles.legendText, { color: colors.textSecondary }]}>Partial</ThemedText>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: colors.accent }]} />
                    <ThemedText style={[styles.legendText, { color: colors.textSecondary }]}>Full</ThemedText>
                  </View>
                  <View style={styles.legendItem}>
                    <Feather name="x-circle" size={12} color={colors.accent} />
                    <ThemedText style={[styles.legendText, { color: colors.textSecondary }]}>Blocked</ThemedText>
                  </View>
                  <View style={styles.legendItem}>
                    <Feather name="coffee" size={12} color={colors.primary} />
                    <ThemedText style={[styles.legendText, { color: colors.textSecondary }]}>Break</ThemedText>
                  </View>
                </View>

                <ThemedText style={[styles.slotHint, { color: colors.textSecondary }]}>
                  Tap a slot to block/unblock it
                </ThemedText>

                <View style={styles.slotsGrid}>
                  {timeSlots.map((slot) => {
                    const slotBlocked = isSlotBlocked(slot.time);
                    return (
                      <Pressable
                        key={slot.time}
                        style={[
                          styles.slotCard,
                          { backgroundColor: colors.surfaceMuted },
                          slot.isBreak && [styles.slotCardBreak, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "30" }],
                          slotBlocked && [styles.slotCardBlocked, { backgroundColor: colors.accent + "10", borderColor: colors.accent + "30" }],
                          slot.currentBookings >= slot.maxCapacity && !slot.isBreak && !slotBlocked && { backgroundColor: isDark ? "#3D2020" : "#FEE2E2" },
                        ]}
                        onPress={() => {
                          if (!slot.isBreak) {
                            handleToggleSlotBlocked(slot.time);
                          }
                        }}
                        disabled={slot.isBreak}
                      >
                        <ThemedText style={[
                          styles.slotTime,
                          slot.isBreak && styles.slotTimeBreak,
                          slotBlocked && styles.slotTimeBlocked,
                        ]}>
                          {slot.time}
                        </ThemedText>
                        {slot.isBreak ? (
                          <Feather name="coffee" size={14} color={colors.primary} />
                        ) : slotBlocked ? (
                          <Feather name="x-circle" size={14} color={colors.accent} />
                        ) : (
                          <>
                            <ThemedText style={[styles.slotBookings, { color: colors.textSecondary }]}>
                              {slot.currentBookings}/{slot.maxCapacity}
                            </ThemedText>
                            <View style={[
                              styles.slotIndicator,
                              slot.currentBookings >= slot.maxCapacity && { backgroundColor: colors.accent },
                              slot.currentBookings > 0 && slot.currentBookings < slot.maxCapacity && { backgroundColor: "#F59E0B" },
                              slot.currentBookings === 0 && { backgroundColor: colors.success },
                            ]} />
                          </>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}
          </Animated.View>
        );
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          style={[styles.branchSelector, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}
          onPress={() => setShowBranchPicker(true)}
          testID="branch-selector"
        >
          <View style={styles.branchSelectorContent}>
            <View style={[styles.branchIcon, { backgroundColor: colors.primary + "15" }]}>
              <MaterialCommunityIcons name="storefront-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.branchInfo}>
              <ThemedText style={[styles.branchLabel, { color: colors.textSecondary }]}>Selected Branch</ThemedText>
              <ThemedText style={styles.branchName}>
                {selectedBranch.name}
              </ThemedText>
            </View>
          </View>
          <Feather name="chevron-down" size={20} color={colors.textSecondary} />
        </Pressable>

        <View style={[styles.tabsContainer, { backgroundColor: colors.surfaceMuted }]}>
          {(([
            { key: "hours", label: "Hours", icon: "clock" },
            { key: "breaks", label: "Breaks", icon: "coffee" },
            { key: "holidays", label: "Holidays", icon: "calendar" },
            { key: "slots", label: "Slots", icon: "grid" },
          ] as { key: TabType; label: string; icon: keyof typeof Feather.glyphMap }[]).filter(
            (tab) => tab.key !== "slots" || canSeeSlots
          )).map((tab) => (
            <Pressable
              key={tab.key}
              style={[styles.tab, { backgroundColor: activeTab === tab.key ? colors.primary + "15" : "transparent", borderColor: activeTab === tab.key ? colors.primary : (colors.border) }]}
              onPress={() => {
                Haptics.selectionAsync();
                setActiveTab(tab.key);
              }}
            >
              <Feather
                name={tab.icon}
                size={16}
                color={activeTab === tab.key ? colors.primary : colors.textSecondary}
              />
              <ThemedText style={[styles.tabText, { color: activeTab === tab.key ? colors.primary : colors.textSecondary }]}>
                {tab.label}
              </ThemedText>
            </Pressable>
          ))}
        </View>

        {renderTabContent()}
      </ScrollView>

      <Modal
        visible={showBranchPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBranchPicker(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowBranchPicker(false)}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <ThemedText type="h4">Select Branch</ThemedText>
              <Pressable onPress={() => setShowBranchPicker(false)}>
                <Feather name="x" size={24} color={colors.text} />
              </Pressable>
            </View>
            <ScrollView style={styles.branchList}>
              {accessibleBranches.map((branch) => (
                <Pressable
                  key={branch.id}
                  style={[
                    styles.branchOption,
                    { backgroundColor: branch.id === selectedBranch.id ? colors.primary + "15" : (colors.surfaceMuted), borderColor: branch.id === selectedBranch.id ? colors.primary : (colors.border) },
                  ]}
                  onPress={() => handleSelectBranch(branch)}
                >
                  <View style={styles.branchOptionContent}>
                    <MaterialCommunityIcons
                      name="storefront-outline"
                      size={18}
                      color={branch.id === selectedBranch.id ? colors.primary : colors.textSecondary}
                    />
                    <View style={styles.branchOptionInfo}>
                      <ThemedText style={[
                        styles.branchOptionName,
                        branch.id === selectedBranch.id && { color: colors.primary },
                      ]}>
                        {branch.name}
                      </ThemedText>
                      <ThemedText style={[styles.branchOptionAddress, { color: colors.textSecondary }]}>{branch.address}</ThemedText>
                    </View>
                  </View>
                  {branch.id === selectedBranch.id ? (
                    <Feather name="check" size={20} color={colors.primary} />
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={showBreakModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBreakModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowBreakModal(false)}>
          <View style={[styles.modalContent, styles.breakModalContent, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <ThemedText type="h4">{editingBreak ? "Edit Break" : "Add Break"}</ThemedText>
              <Pressable onPress={() => setShowBreakModal(false)}>
                <Feather name="x" size={24} color={colors.text} />
              </Pressable>
            </View>
            <View style={styles.breakFormContent}>
              {activeBreakPicker === null ? (
                <>
                  <View style={styles.formGroup}>
                    <ThemedText style={[styles.formLabel, { color: colors.text }]}>Break Name</ThemedText>
                    <TextInput
                      style={[styles.formInput, { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle, color: colors.text }]}
                      value={breakName}
                      onChangeText={setBreakName}
                      placeholder="e.g., Lunch Break"
                      placeholderTextColor={colors.mutedText}
                    />
                  </View>
                  <View style={styles.formGroup}>
                    <ThemedText style={[styles.formLabel, { color: colors.text }]}>Start Time</ThemedText>
                    <Pressable
                      style={[styles.datePickerButton, { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle }]}
                      onPress={() => setActiveBreakPicker("start")}
                    >
                      <Feather name="clock" size={18} color={colors.primary} />
                      <ThemedText style={[styles.datePickerText, { color: colors.text }]}>
                        {formatTimeForDisplay(breakStart)}
                      </ThemedText>
                    </Pressable>
                  </View>
                  <View style={styles.formGroup}>
                    <ThemedText style={[styles.formLabel, { color: colors.text }]}>End Time</ThemedText>
                    <Pressable
                      style={[styles.datePickerButton, { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle }]}
                      onPress={() => setActiveBreakPicker("end")}
                    >
                      <Feather name="clock" size={18} color={colors.primary} />
                      <ThemedText style={[styles.datePickerText, { color: colors.text }]}>
                        {formatTimeForDisplay(breakEnd)}
                      </ThemedText>
                    </Pressable>
                  </View>
                  <View style={styles.modalActions}>
                    <Button title="Cancel" onPress={() => setShowBreakModal(false)} variant="outline" />
                    <Button title={editingBreak ? "Save Changes" : "Add Break"} onPress={handleSaveBreak} />
                  </View>
                </>
              ) : (
                <View style={styles.pickerFullScreen}>
                  <ThemedText type="h4" style={styles.pickerTitle}>
                    {activeBreakPicker === "start" ? "Select Start Time" : "Select End Time"}
                  </ThemedText>
                  <DateTimePicker
                    value={timeStringToDate(activeBreakPicker === "start" ? breakStart : breakEnd)}
                    mode="time"
                    is24Hour={false}
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    themeVariant={isDark ? "dark" : "light"}
                    onChange={(event: DateTimePickerEvent, date?: Date) => {
                      if (Platform.OS !== "ios" && date) {
                        if (activeBreakPicker === "start") {
                          setBreakStart(dateToTimeString(date));
                        } else {
                          setBreakEnd(dateToTimeString(date));
                        }
                        setActiveBreakPicker(null);
                      } else if (date) {
                        if (activeBreakPicker === "start") {
                          setBreakStart(dateToTimeString(date));
                        } else {
                          setBreakEnd(dateToTimeString(date));
                        }
                      }
                    }}
                  />
                  <Button
                    title="Done"
                    onPress={() => setActiveBreakPicker(null)}
                    style={{ marginTop: Spacing.lg }}
                  />
                </View>
              )}
            </View>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={showHolidayModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!showDatePicker) {
            setShowHolidayModal(false);
          } else {
            setShowDatePicker(false);
          }
        }}
      >
        <Pressable style={styles.modalOverlay} onPress={() => {
          if (!showDatePicker) {
            setShowHolidayModal(false);
          }
        }}>
          <Pressable style={[styles.modalContent, styles.holidayModalContent, { backgroundColor: colors.surface }]} onPress={(e) => e.stopPropagation()}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <ThemedText type="h4">{editingHoliday ? "Edit Holiday" : "Add Holiday"}</ThemedText>
              <Pressable onPress={() => setShowHolidayModal(false)}>
                <Feather name="x" size={24} color={colors.text} />
              </Pressable>
            </View>
            <ScrollView style={styles.holidayFormContent}>
              <View style={styles.formGroup}>
                <ThemedText style={[styles.formLabel, { color: colors.text }]}>Holiday Name</ThemedText>
                <TextInput
                  style={[styles.formInput, { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle, color: colors.text }]}
                  value={holidayName}
                  onChangeText={setHolidayName}
                  placeholder="e.g., Christmas Day"
                  placeholderTextColor={colors.mutedText}
                />
              </View>
              <View style={styles.formGroup}>
                <ThemedText style={[styles.formLabel, { color: colors.text }]}>Date</ThemedText>
                <Pressable
                  style={[styles.datePickerButton, { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle }]}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Feather name="calendar" size={18} color={colors.primary} />
                  <ThemedText style={[styles.datePickerText, { color: colors.text }]}>
                    {holidayDate.toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </ThemedText>
                </Pressable>
              </View>
              {showDatePicker ? (
                <DateTimePicker
                  value={holidayDate}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  themeVariant={isDark ? "dark" : "light"}
                  onChange={(event: DateTimePickerEvent, date?: Date) => {
                    if (Platform.OS !== "ios") {
                      setShowDatePicker(false);
                    }
                    if (date) setHolidayDate(date);
                  }}
                />
              ) : null}
              <View style={styles.formGroup}>
                <Pressable
                  style={styles.checkboxRow}
                  onPress={() => setHolidayRecurring(!holidayRecurring)}
                >
                  <Feather
                    name={holidayRecurring ? "check-square" : "square"}
                    size={20}
                    color={holidayRecurring ? colors.primary : colors.textSecondary}
                  />
                  <ThemedText style={styles.checkboxLabel}>Repeat every year</ThemedText>
                </Pressable>
              </View>
              <View style={styles.modalActions}>
                <Button title="Cancel" onPress={() => setShowHolidayModal(false)} variant="outline" />
                <Button title={editingHoliday ? "Save Changes" : "Add Holiday"} onPress={handleSaveHoliday} />
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showHoursTimePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowHoursTimePicker(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowHoursTimePicker(false)}>
          <View style={[styles.modalContent, styles.timePickerModalContent, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <ThemedText type="h4">
                {editingHoursField === "openTime" ? "Opening Time" : "Closing Time"}
              </ThemedText>
              <Pressable onPress={() => setShowHoursTimePicker(false)}>
                <Feather name="x" size={24} color={colors.text} />
              </Pressable>
            </View>
            <View style={styles.timePickerContent}>
              {editingHoursDay !== null && editingHoursField !== null ? (
                <DateTimePicker
                  value={timeStringToDate(
                    operatingHours.find((h) => h.dayOfWeek === editingHoursDay)?.[editingHoursField] || "09:00"
                  )}
                  mode="time"
                  is24Hour={false}
                  display="spinner"
                  themeVariant={isDark ? "dark" : "light"}
                  onChange={async (event: DateTimePickerEvent, date?: Date) => {
                    if (event.type === "set" && date && editingHoursDay !== null && editingHoursField !== null) {
                      await handleUpdateHours(editingHoursDay, editingHoursField, dateToTimeString(date));
                    }
                    if (Platform.OS !== "ios") {
                      setShowHoursTimePicker(false);
                    }
                  }}
                />
              ) : null}
              {Platform.OS === "ios" ? (
                <Button
                  title="Done"
                  onPress={() => setShowHoursTimePicker(false)}
                  style={{ marginTop: Spacing.md }}
                />
              ) : null}
            </View>
          </View>
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

const createStyles = (colors: typeof Colors.light) => StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  branchSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: BrandColors.primary + "10",
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: BrandColors.primary + "30",
  },
  branchSelectorContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    flex: 1,
  },
  branchIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    backgroundColor: BrandColors.primary + "20",
    justifyContent: "center",
    alignItems: "center",
  },
  branchInfo: {
    flex: 1,
  },
  branchLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  branchName: {
    fontSize: 16,
    fontWeight: "600",
    color: BrandColors.primary,
  },
  tabsContainer: {
    flexDirection: "row",
    borderRadius: BorderRadius.lg,
    padding: 4,
    marginBottom: Spacing.xl,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  tabActive: {
    backgroundColor: colors.backgroundDefault,
  },
  tabText: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: BrandColors.primary,
    fontWeight: "600",
  },
  hoursCard: {
    padding: Spacing.lg,
  },
  hourRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  dayToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  dayName: {
    fontWeight: "500",
    width: 100,
  },
  dayNameInactive: {
    color: colors.textSecondary,
  },
  timeInputs: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  timeInput: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    fontSize: 14,
    width: 60,
    textAlign: "center",
  },
  timePickerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: BrandColors.primary + "10",
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: BrandColors.primary + "30",
  },
  timePickerText: {
    fontSize: 13,
    fontWeight: "500",
    color: BrandColors.primary,
  },
  timePickerModalContent: {
    maxHeight: "50%",
  },
  timePickerContent: {
    padding: Spacing.lg,
    alignItems: "center",
  },
  timeSeparator: {
    color: colors.textSecondary,
  },
  closedText: {
    color: colors.textSecondary,
    fontStyle: "italic",
  },
  daysRow: {
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  dayChip: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: colors.surfaceMuted,
  },
  dayChipActive: {
    backgroundColor: BrandColors.primary,
  },
  dayChipClosed: {
    opacity: 0.5,
  },
  dayChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  dayChipTextActive: {
    color: colors.buttonText,
  },
  closedState: {
    alignItems: "center",
    paddingVertical: Spacing["4xl"],
  },
  closedTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: Spacing.lg,
  },
  closedSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: Spacing.xs,
    textAlign: "center",
  },
  breaksHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  breaksDayTitle: {
    fontWeight: "600",
  },
  emptyBreaksCard: {
    alignItems: "center",
    padding: Spacing["2xl"],
    gap: Spacing.sm,
  },
  emptyBreaksText: {
    fontSize: 16,
    fontWeight: "600",
  },
  emptyBreaksSubtext: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  breakCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  breakCardInactive: {
    opacity: 0.6,
  },
  breakInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    flex: 1,
  },
  breakIconContainer: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    backgroundColor: BrandColors.primary + "15",
    justifyContent: "center",
    alignItems: "center",
  },
  breakDetails: {
    flex: 1,
  },
  breakName: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  breakNameInactive: {
    textDecorationLine: "line-through",
  },
  breakTime: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  breakActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  breakAction: {
    padding: Spacing.sm,
  },
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
  },
  calendarNav: {
    padding: Spacing.sm,
  },
  calendarTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  calendarCard: {
    padding: Spacing.md,
    marginBottom: Spacing.xl,
  },
  calendarWeekDays: {
    flexDirection: "row",
    marginBottom: Spacing.sm,
  },
  calendarWeekDay: {
    flex: 1,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  calendarDay: {
    width: "14.28%",
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: BorderRadius.sm,
  },
  calendarDayHoliday: {
    backgroundColor: colors.accent + "15",
  },
  calendarDayToday: {
    borderWidth: 2,
    borderColor: BrandColors.primary,
  },
  calendarDayText: {
    fontSize: 14,
    fontWeight: "500",
  },
  calendarDayTextHoliday: {
    color: colors.accent,
    fontWeight: "700",
  },
  holidayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accent,
    marginTop: 2,
  },
  holidaysListHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  holidaysListTitle: {
    fontWeight: "600",
  },
  emptyHolidaysCard: {
    alignItems: "center",
    padding: Spacing["2xl"],
    gap: Spacing.sm,
  },
  emptyHolidaysText: {
    fontSize: 16,
    fontWeight: "600",
  },
  emptyHolidaysSubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
  },
  holidayCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  holidayInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    flex: 1,
  },
  holidayIconContainer: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    backgroundColor: colors.accent + "15",
    justifyContent: "center",
    alignItems: "center",
  },
  holidayDetails: {
    flex: 1,
  },
  holidayName: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  holidayMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  holidayDate: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  recurringBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: BrandColors.primary + "15",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  recurringText: {
    fontSize: 10,
    fontWeight: "600",
    color: BrandColors.primary,
  },
  deleteHoliday: {
    padding: Spacing.sm,
  },
  slotsLegend: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  slotHint: {
    fontSize: 12,
    textAlign: "center",
    marginBottom: Spacing.md,
    fontStyle: "italic",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  slotsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  slotCard: {
    width: "23%",
    backgroundColor: colors.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    alignItems: "center",
  },
  slotCardBreak: {
    backgroundColor: BrandColors.primary + "10",
    borderWidth: 1,
    borderColor: BrandColors.primary + "30",
    borderStyle: "dashed",
  },
  slotCardBlocked: {
    backgroundColor: colors.accent + "15",
  },
  slotCardFull: {
    backgroundColor: colors.error + "1A",
  },
  slotTime: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 2,
  },
  slotTimeBreak: {
    color: BrandColors.primary,
  },
  slotTimeBlocked: {
    color: colors.accent,
    textDecorationLine: "line-through",
  },
  slotBookings: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  slotIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: Spacing.lg,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: Spacing.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: colors.backgroundDefault,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: "70%",
  },
  breakModalContent: {
    maxHeight: "70%",
  },
  holidayModalContent: {
    maxHeight: "75%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  branchList: {
    padding: Spacing.lg,
  },
  branchOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    backgroundColor: colors.backgroundRoot,
  },
  branchOptionSelected: {
    backgroundColor: BrandColors.primary + "15",
    borderWidth: 1,
    borderColor: BrandColors.primary,
  },
  branchOptionContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    flex: 1,
  },
  branchOptionInfo: {
    flex: 1,
  },
  branchOptionName: {
    fontSize: 15,
    fontWeight: "600",
  },
  branchOptionNameSelected: {
    color: BrandColors.primary,
  },
  branchOptionAddress: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  breakFormContent: {
    padding: Spacing.lg,
  },
  pickerFullScreen: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
  },
  pickerTitle: {
    marginBottom: Spacing.lg,
    textAlign: "center",
  },
  holidayFormContent: {
    padding: Spacing.lg,
  },
  formGroup: {
    marginBottom: Spacing.lg,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: Spacing.sm,
    color: colors.text,
  },
  formInput: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: 15,
  },
  formRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  datePickerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: colors.surfaceMuted,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  datePickerText: {
    fontSize: 15,
    color: colors.text,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  checkboxLabel: {
    fontSize: 15,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
});
