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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
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
  const headerHeight = useHeaderHeight();
  const {
    organization,
    updateBranchSettings,
    getAccessibleBranches,
    selectedBookingBranchId,
    setSelectedBookingBranchId,
  } = useOrganization();

  const [activeTab, setActiveTab] = useState<TabType>("hours");
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
  const [showBreakStartPicker, setShowBreakStartPicker] = useState(false);
  const [showBreakEndPicker, setShowBreakEndPicker] = useState(false);
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
  const selectedBranch = accessibleBranches.find((b) => b.id === selectedBookingBranchId) || accessibleBranches[0];

  useEffect(() => {
    if (!selectedBookingBranchId && accessibleBranches.length > 0) {
      setSelectedBookingBranchId(accessibleBranches[0].id);
    }
  }, [accessibleBranches, selectedBookingBranchId, setSelectedBookingBranchId]);

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
        <View style={[styles.emptyState, { paddingTop: headerHeight + Spacing.xl }]}>
          <Feather name="alert-circle" size={48} color={Colors.light.textSecondary} />
          <ThemedText style={styles.emptyTitle}>No Branches Assigned</ThemedText>
          <ThemedText style={styles.emptySubtitle}>
            You don't have access to any branches. Please contact your administrator.
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (!selectedBranch) return null;

  const handleToggleDay = async (dayOfWeek: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const updatedHours = operatingHours.map((h) =>
      h.dayOfWeek === dayOfWeek ? { ...h, isOpen: !h.isOpen } : h
    );
    await updateBranchSettings(selectedBranch.id, { operatingHours: updatedHours });
  };

  const handleUpdateHours = async (dayOfWeek: number, field: "openTime" | "closeTime", value: string) => {
    const updatedHours = operatingHours.map((h) =>
      h.dayOfWeek === dayOfWeek ? { ...h, [field]: value } : h
    );
    await updateBranchSettings(selectedBranch.id, { operatingHours: updatedHours });
  };

  const handleSelectBranch = (branch: Branch) => {
    setSelectedBookingBranchId(branch.id);
    setShowBranchPicker(false);
    Haptics.selectionAsync();
  };

  const handleAddBreak = () => {
    setEditingBreak(null);
    setBreakName("");
    setBreakStart("12:00");
    setBreakEnd("13:00");
    setShowBreakModal(true);
  };

  const handleEditBreak = (breakItem: BreakTime) => {
    setEditingBreak(breakItem);
    setBreakName(breakItem.name);
    setBreakStart(breakItem.startTime);
    setBreakEnd(breakItem.endTime);
    setShowBreakModal(true);
  };

  const handleSaveBreak = async () => {
    if (!breakName.trim()) return;
    
    const currentBreaks = todayHours?.breaks || [];
    let updatedBreaks: BreakTime[];
    
    if (editingBreak) {
      updatedBreaks = currentBreaks.map((b) =>
        b.id === editingBreak.id
          ? { ...b, name: breakName, startTime: breakStart, endTime: breakEnd }
          : b
      );
    } else {
      updatedBreaks = [
        ...currentBreaks,
        {
          id: generateId(),
          name: breakName,
          startTime: breakStart,
          endTime: breakEnd,
          isActive: true,
        },
      ];
    }
    
    const updatedHours = operatingHours.map((h) =>
      h.dayOfWeek === selectedDay ? { ...h, breaks: updatedBreaks } : h
    );
    
    await updateBranchSettings(selectedBranch.id, { operatingHours: updatedHours });
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
    
    const currentHolidays = holidays;
    let updatedHolidays: Holiday[];
    
    if (editingHoliday) {
      updatedHolidays = currentHolidays.map((h) =>
        h.id === editingHoliday.id
          ? { ...h, name: holidayName, date: formatDate(holidayDate), isRecurring: holidayRecurring }
          : h
      );
    } else {
      updatedHolidays = [
        ...currentHolidays,
        {
          id: generateId(),
          name: holidayName,
          date: formatDate(holidayDate),
          isRecurring: holidayRecurring,
        },
      ];
    }
    
    await updateBranchSettings(selectedBranch.id, { holidays: updatedHolidays });
    setShowHolidayModal(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleDeleteHoliday = async (holidayId: string) => {
    const updatedHolidays = holidays.filter((h) => h.id !== holidayId);
    await updateBranchSettings(selectedBranch.id, { holidays: updatedHolidays });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
            <Card style={styles.hoursCard}>
              {operatingHours.map((hours) => (
                <View key={hours.dayOfWeek} style={styles.hourRow}>
                  <Pressable
                    style={styles.dayToggle}
                    onPress={() => handleToggleDay(hours.dayOfWeek)}
                  >
                    <Feather
                      name={hours.isOpen ? "check-square" : "square"}
                      size={18}
                      color={hours.isOpen ? Colors.light.success : Colors.light.textSecondary}
                    />
                    <ThemedText style={[styles.dayName, !hours.isOpen && styles.dayNameInactive]}>
                      {FULL_DAYS[hours.dayOfWeek]}
                    </ThemedText>
                  </Pressable>

                  {hours.isOpen ? (
                    <View style={styles.timeInputs}>
                      <Pressable
                        style={styles.timePickerButton}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setEditingHoursDay(hours.dayOfWeek);
                          setEditingHoursField("openTime");
                          setShowHoursTimePicker(true);
                        }}
                      >
                        <Feather name="clock" size={14} color={BrandColors.primary} />
                        <ThemedText style={styles.timePickerText}>
                          {formatTimeForDisplay(hours.openTime)}
                        </ThemedText>
                      </Pressable>
                      <ThemedText style={styles.timeSeparator}>-</ThemedText>
                      <Pressable
                        style={styles.timePickerButton}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setEditingHoursDay(hours.dayOfWeek);
                          setEditingHoursField("closeTime");
                          setShowHoursTimePicker(true);
                        }}
                      >
                        <Feather name="clock" size={14} color={BrandColors.primary} />
                        <ThemedText style={styles.timePickerText}>
                          {formatTimeForDisplay(hours.closeTime)}
                        </ThemedText>
                      </Pressable>
                    </View>
                  ) : (
                    <ThemedText style={styles.closedText}>Closed</ThemedText>
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
                    selectedDay === index && styles.dayChipActive,
                    !operatingHours[index]?.isOpen && styles.dayChipClosed,
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedDay(index);
                  }}
                >
                  <ThemedText style={[
                    styles.dayChipText,
                    selectedDay === index && styles.dayChipTextActive,
                  ]}>
                    {day}
                  </ThemedText>
                </Pressable>
              ))}
            </ScrollView>

            {!todayHours?.isOpen ? (
              <View style={styles.closedState}>
                <Feather name="x-circle" size={48} color={Colors.light.textSecondary} />
                <ThemedText style={styles.closedTitle}>Closed on {FULL_DAYS[selectedDay]}</ThemedText>
                <ThemedText style={styles.closedSubtitle}>
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
                  <Card style={styles.emptyBreaksCard}>
                    <Feather name="coffee" size={32} color={Colors.light.textSecondary} />
                    <ThemedText style={styles.emptyBreaksText}>No breaks scheduled</ThemedText>
                    <ThemedText style={styles.emptyBreaksSubtext}>
                      Add lunch or other break times
                    </ThemedText>
                  </Card>
                ) : (
                  (todayHours.breaks || []).map((breakItem) => (
                    <Animated.View key={breakItem.id} entering={FadeIn} layout={Layout}>
                      <Card style={StyleSheet.flatten([styles.breakCard, !breakItem.isActive ? styles.breakCardInactive : undefined])}>
                        <View style={styles.breakInfo}>
                          <View style={styles.breakIconContainer}>
                            <Feather
                              name={breakItem.name.toLowerCase().includes("lunch") ? "coffee" : "pause-circle"}
                              size={20}
                              color={breakItem.isActive ? BrandColors.primary : Colors.light.textSecondary}
                            />
                          </View>
                          <View style={styles.breakDetails}>
                            <ThemedText style={[styles.breakName, !breakItem.isActive && styles.breakNameInactive]}>
                              {breakItem.name}
                            </ThemedText>
                            <ThemedText style={styles.breakTime}>
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
                              color={breakItem.isActive ? Colors.light.success : Colors.light.textSecondary}
                            />
                          </Pressable>
                          <Pressable
                            style={styles.breakAction}
                            onPress={() => handleEditBreak(breakItem)}
                          >
                            <Feather name="edit-2" size={18} color={BrandColors.primary} />
                          </Pressable>
                          <Pressable
                            style={styles.breakAction}
                            onPress={() => handleDeleteBreak(breakItem.id)}
                          >
                            <Feather name="trash-2" size={18} color={Colors.light.accent} />
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
                <Feather name="chevron-left" size={24} color={BrandColors.primary} />
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
                <Feather name="chevron-right" size={24} color={BrandColors.primary} />
              </Pressable>
            </View>

            <Card style={styles.calendarCard}>
              <View style={styles.calendarWeekDays}>
                {DAYS.map((day) => (
                  <ThemedText key={day} style={styles.calendarWeekDay}>{day}</ThemedText>
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
              <Card style={styles.emptyHolidaysCard}>
                <Feather name="calendar" size={32} color={Colors.light.textSecondary} />
                <ThemedText style={styles.emptyHolidaysText}>No holidays added</ThemedText>
                <ThemedText style={styles.emptyHolidaysSubtext}>
                  Tap on a date or add button to create a holiday
                </ThemedText>
              </Card>
            ) : (
              holidays.map((holiday) => (
                <Animated.View key={holiday.id} entering={FadeIn} layout={Layout}>
                  <Card style={styles.holidayCard}>
                    <View style={styles.holidayInfo}>
                      <View style={styles.holidayIconContainer}>
                        <Feather name="calendar" size={20} color={Colors.light.accent} />
                      </View>
                      <View style={styles.holidayDetails}>
                        <ThemedText style={styles.holidayName}>{holiday.name}</ThemedText>
                        <View style={styles.holidayMeta}>
                          <ThemedText style={styles.holidayDate}>
                            {new Date(holiday.date).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: holiday.isRecurring ? undefined : "numeric",
                            })}
                          </ThemedText>
                          {holiday.isRecurring ? (
                            <View style={styles.recurringBadge}>
                              <Feather name="repeat" size={10} color={BrandColors.primary} />
                              <ThemedText style={styles.recurringText}>Yearly</ThemedText>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    </View>
                    <Pressable
                      style={styles.deleteHoliday}
                      onPress={() => handleDeleteHoliday(holiday.id)}
                    >
                      <Feather name="trash-2" size={18} color={Colors.light.accent} />
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
                    selectedDay === index && styles.dayChipActive,
                    !operatingHours[index]?.isOpen && styles.dayChipClosed,
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedDay(index);
                  }}
                >
                  <ThemedText style={[
                    styles.dayChipText,
                    selectedDay === index && styles.dayChipTextActive,
                  ]}>
                    {day}
                  </ThemedText>
                </Pressable>
              ))}
            </ScrollView>

            {!todayHours?.isOpen ? (
              <View style={styles.closedState}>
                <Feather name="x-circle" size={48} color={Colors.light.textSecondary} />
                <ThemedText style={styles.closedTitle}>Closed on {FULL_DAYS[selectedDay]}</ThemedText>
                <ThemedText style={styles.closedSubtitle}>
                  Enable this day in Operating Hours to manage slots
                </ThemedText>
              </View>
            ) : (
              <>
                <View style={styles.slotsLegend}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: Colors.light.success }]} />
                    <ThemedText style={styles.legendText}>Available</ThemedText>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: "#F59E0B" }]} />
                    <ThemedText style={styles.legendText}>Partial</ThemedText>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: Colors.light.accent }]} />
                    <ThemedText style={styles.legendText}>Full</ThemedText>
                  </View>
                  <View style={styles.legendItem}>
                    <Feather name="coffee" size={12} color={BrandColors.primary} />
                    <ThemedText style={styles.legendText}>Break</ThemedText>
                  </View>
                </View>

                <View style={styles.slotsGrid}>
                  {timeSlots.map((slot) => (
                    <View
                      key={slot.time}
                      style={[
                        styles.slotCard,
                        slot.isBreak && styles.slotCardBreak,
                        slot.isBlocked && styles.slotCardBlocked,
                        slot.currentBookings >= slot.maxCapacity && !slot.isBreak && styles.slotCardFull,
                      ]}
                    >
                      <ThemedText style={[
                        styles.slotTime,
                        slot.isBreak && styles.slotTimeBreak,
                        slot.isBlocked && styles.slotTimeBlocked,
                      ]}>
                        {slot.time}
                      </ThemedText>
                      {slot.isBreak ? (
                        <Feather name="coffee" size={14} color={BrandColors.primary} />
                      ) : slot.isBlocked ? (
                        <Feather name="x-circle" size={14} color={Colors.light.accent} />
                      ) : (
                        <>
                          <ThemedText style={styles.slotBookings}>
                            {slot.currentBookings}/{slot.maxCapacity}
                          </ThemedText>
                          <View style={[
                            styles.slotIndicator,
                            slot.currentBookings >= slot.maxCapacity && { backgroundColor: Colors.light.accent },
                            slot.currentBookings > 0 && slot.currentBookings < slot.maxCapacity && { backgroundColor: "#F59E0B" },
                            slot.currentBookings === 0 && { backgroundColor: Colors.light.success },
                          ]} />
                        </>
                      )}
                    </View>
                  ))}
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
          { paddingTop: headerHeight + Spacing.md, paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          style={styles.branchSelector}
          onPress={() => setShowBranchPicker(true)}
          testID="branch-selector"
        >
          <View style={styles.branchSelectorContent}>
            <View style={styles.branchIcon}>
              <Feather name="git-branch" size={18} color={BrandColors.primary} />
            </View>
            <View style={styles.branchInfo}>
              <ThemedText style={styles.branchLabel}>Selected Branch</ThemedText>
              <ThemedText style={styles.branchName}>{selectedBranch.name}</ThemedText>
            </View>
          </View>
          <Feather name="chevron-down" size={20} color={Colors.light.textSecondary} />
        </Pressable>

        <View style={styles.tabsContainer}>
          {([
            { key: "hours", label: "Hours", icon: "clock" },
            { key: "breaks", label: "Breaks", icon: "coffee" },
            { key: "holidays", label: "Holidays", icon: "calendar" },
            { key: "slots", label: "Slots", icon: "grid" },
          ] as { key: TabType; label: string; icon: keyof typeof Feather.glyphMap }[]).map((tab) => (
            <Pressable
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => {
                Haptics.selectionAsync();
                setActiveTab(tab.key);
              }}
            >
              <Feather
                name={tab.icon}
                size={16}
                color={activeTab === tab.key ? BrandColors.primary : Colors.light.textSecondary}
              />
              <ThemedText style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
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
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText type="h4">Select Branch</ThemedText>
              <Pressable onPress={() => setShowBranchPicker(false)}>
                <Feather name="x" size={24} color={Colors.light.text} />
              </Pressable>
            </View>
            <ScrollView style={styles.branchList}>
              {accessibleBranches.map((branch) => (
                <Pressable
                  key={branch.id}
                  style={[
                    styles.branchOption,
                    branch.id === selectedBranch.id && styles.branchOptionSelected,
                  ]}
                  onPress={() => handleSelectBranch(branch)}
                >
                  <View style={styles.branchOptionContent}>
                    <Feather
                      name="git-branch"
                      size={18}
                      color={branch.id === selectedBranch.id ? BrandColors.primary : Colors.light.textSecondary}
                    />
                    <View style={styles.branchOptionInfo}>
                      <ThemedText style={[
                        styles.branchOptionName,
                        branch.id === selectedBranch.id && styles.branchOptionNameSelected,
                      ]}>
                        {branch.name}
                      </ThemedText>
                      <ThemedText style={styles.branchOptionAddress}>{branch.address}</ThemedText>
                    </View>
                  </View>
                  {branch.id === selectedBranch.id ? (
                    <Feather name="check" size={20} color={BrandColors.primary} />
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
          <View style={[styles.modalContent, styles.breakModalContent]}>
            <View style={styles.modalHeader}>
              <ThemedText type="h4">{editingBreak ? "Edit Break" : "Add Break"}</ThemedText>
              <Pressable onPress={() => setShowBreakModal(false)}>
                <Feather name="x" size={24} color={Colors.light.text} />
              </Pressable>
            </View>
            <View style={styles.breakFormContent}>
              <View style={styles.formGroup}>
                <ThemedText style={styles.formLabel}>Break Name</ThemedText>
                <TextInput
                  style={styles.formInput}
                  value={breakName}
                  onChangeText={setBreakName}
                  placeholder="e.g., Lunch Break"
                  placeholderTextColor="#9CA3AF"
                />
              </View>
              <View style={styles.formRow}>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <ThemedText style={styles.formLabel}>Start Time</ThemedText>
                  <Pressable
                    style={styles.datePickerButton}
                    onPress={() => setShowBreakStartPicker(true)}
                  >
                    <Feather name="clock" size={18} color={BrandColors.primary} />
                    <ThemedText style={styles.datePickerText}>
                      {formatTimeForDisplay(breakStart)}
                    </ThemedText>
                  </Pressable>
                  {showBreakStartPicker ? (
                    <DateTimePicker
                      value={timeStringToDate(breakStart)}
                      mode="time"
                      is24Hour={false}
                      display={Platform.OS === "ios" ? "spinner" : "default"}
                      onChange={(event: DateTimePickerEvent, date?: Date) => {
                        setShowBreakStartPicker(Platform.OS === "ios");
                        if (date) setBreakStart(dateToTimeString(date));
                      }}
                    />
                  ) : null}
                </View>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <ThemedText style={styles.formLabel}>End Time</ThemedText>
                  <Pressable
                    style={styles.datePickerButton}
                    onPress={() => setShowBreakEndPicker(true)}
                  >
                    <Feather name="clock" size={18} color={BrandColors.primary} />
                    <ThemedText style={styles.datePickerText}>
                      {formatTimeForDisplay(breakEnd)}
                    </ThemedText>
                  </Pressable>
                  {showBreakEndPicker ? (
                    <DateTimePicker
                      value={timeStringToDate(breakEnd)}
                      mode="time"
                      is24Hour={false}
                      display={Platform.OS === "ios" ? "spinner" : "default"}
                      onChange={(event: DateTimePickerEvent, date?: Date) => {
                        setShowBreakEndPicker(Platform.OS === "ios");
                        if (date) setBreakEnd(dateToTimeString(date));
                      }}
                    />
                  ) : null}
                </View>
              </View>
              <View style={styles.modalActions}>
                <Button title="Cancel" onPress={() => setShowBreakModal(false)} variant="outline" />
                <Button title={editingBreak ? "Save Changes" : "Add Break"} onPress={handleSaveBreak} />
              </View>
            </View>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={showHolidayModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowHolidayModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowHolidayModal(false)}>
          <View style={[styles.modalContent, styles.holidayModalContent]}>
            <View style={styles.modalHeader}>
              <ThemedText type="h4">{editingHoliday ? "Edit Holiday" : "Add Holiday"}</ThemedText>
              <Pressable onPress={() => setShowHolidayModal(false)}>
                <Feather name="x" size={24} color={Colors.light.text} />
              </Pressable>
            </View>
            <View style={styles.holidayFormContent}>
              <View style={styles.formGroup}>
                <ThemedText style={styles.formLabel}>Holiday Name</ThemedText>
                <TextInput
                  style={styles.formInput}
                  value={holidayName}
                  onChangeText={setHolidayName}
                  placeholder="e.g., Christmas Day"
                  placeholderTextColor="#9CA3AF"
                />
              </View>
              <View style={styles.formGroup}>
                <ThemedText style={styles.formLabel}>Date</ThemedText>
                <Pressable
                  style={styles.datePickerButton}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Feather name="calendar" size={18} color={BrandColors.primary} />
                  <ThemedText style={styles.datePickerText}>
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
                  onChange={(event: DateTimePickerEvent, date?: Date) => {
                    setShowDatePicker(Platform.OS === "ios");
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
                    color={holidayRecurring ? BrandColors.primary : Colors.light.textSecondary}
                  />
                  <ThemedText style={styles.checkboxLabel}>Repeat every year</ThemedText>
                </Pressable>
              </View>
              <View style={styles.modalActions}>
                <Button title="Cancel" onPress={() => setShowHolidayModal(false)} variant="outline" />
                <Button title={editingHoliday ? "Save Changes" : "Add Holiday"} onPress={handleSaveHoliday} />
              </View>
            </View>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={showHoursTimePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowHoursTimePicker(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowHoursTimePicker(false)}>
          <View style={[styles.modalContent, styles.timePickerModalContent]}>
            <View style={styles.modalHeader}>
              <ThemedText type="h4">
                {editingHoursField === "openTime" ? "Opening Time" : "Closing Time"}
              </ThemedText>
              <Pressable onPress={() => setShowHoursTimePicker(false)}>
                <Feather name="x" size={24} color={Colors.light.text} />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
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
    color: Colors.light.textSecondary,
    marginBottom: 2,
  },
  branchName: {
    fontSize: 16,
    fontWeight: "600",
    color: BrandColors.primary,
  },
  tabsContainer: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
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
    backgroundColor: Colors.light.backgroundDefault,
  },
  tabText: {
    fontSize: 12,
    fontWeight: "500",
    color: Colors.light.textSecondary,
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
    borderBottomColor: "#F1F5F9",
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
    color: Colors.light.textSecondary,
  },
  timeInputs: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  timeInput: {
    backgroundColor: "#F3F4F6",
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
    color: Colors.light.textSecondary,
  },
  closedText: {
    color: Colors.light.textSecondary,
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
    backgroundColor: "#F1F5F9",
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
    color: Colors.light.textSecondary,
  },
  dayChipTextActive: {
    color: "#FFFFFF",
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
    color: Colors.light.textSecondary,
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
    color: Colors.light.textSecondary,
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
    color: Colors.light.textSecondary,
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
    color: Colors.light.textSecondary,
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
    backgroundColor: Colors.light.accent + "15",
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
    color: Colors.light.accent,
    fontWeight: "700",
  },
  holidayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.light.accent,
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
    color: Colors.light.textSecondary,
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
    backgroundColor: Colors.light.accent + "15",
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
    color: Colors.light.textSecondary,
  },
  recurringBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: BrandColors.primary + "15",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
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
    justifyContent: "center",
    gap: Spacing.lg,
    marginBottom: Spacing.lg,
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
    color: Colors.light.textSecondary,
  },
  slotsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  slotCard: {
    width: "23%",
    backgroundColor: "#F8FAFC",
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
    backgroundColor: Colors.light.accent + "15",
  },
  slotCardFull: {
    backgroundColor: "#FEE2E2",
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
    color: Colors.light.accent,
    textDecorationLine: "line-through",
  },
  slotBookings: {
    fontSize: 11,
    color: Colors.light.textSecondary,
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
    color: Colors.light.textSecondary,
    textAlign: "center",
    marginTop: Spacing.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: Colors.light.backgroundDefault,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: "70%",
  },
  breakModalContent: {
    maxHeight: "50%",
  },
  holidayModalContent: {
    maxHeight: "60%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
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
    backgroundColor: "#F8FAFC",
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
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  breakFormContent: {
    padding: Spacing.lg,
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
    color: Colors.light.text,
  },
  formInput: {
    backgroundColor: "#F3F4F6",
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
    backgroundColor: "#F3F4F6",
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  datePickerText: {
    fontSize: 15,
    color: Colors.light.text,
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
