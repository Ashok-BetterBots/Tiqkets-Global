import React, { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { Platform, Alert } from "react-native";
import { Appointment, Reservation, Organization, TimeSlot } from "@/types/queue";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/query-client";

interface AppointmentContextType {
  appointments: Appointment[];
  reservations: Reservation[];
  isLoading: boolean;
  bookAppointment: (params: BookAppointmentParams) => Promise<Appointment>;
  makeReservation: (params: MakeReservationParams) => Promise<Reservation>;
  cancelAppointment: (appointmentId: string) => Promise<void>;
  cancelReservation: (reservationId: string) => Promise<void>;
  checkInAppointment: (appointmentId: string) => Promise<void>;
  modifyAppointment: (appointmentId: string, updates: ModifyAppointmentParams) => Promise<void>;
  getAvailableSlots: (organizationId: string, serviceId: string, date: string) => TimeSlot[];
  upcomingAppointments: Appointment[];
  locationPermissionGranted: boolean;
  requestLocationPermission: () => Promise<boolean>;
  startLocationTracking: () => void;
  stopLocationTracking: () => void;
  userLocation: { latitude: number; longitude: number } | null;
  isAtLocation: (organizationId: string) => boolean;
  checkLocationNow: () => Promise<boolean>;
}

interface ModifyAppointmentParams {
  scheduledDate?: string;
  scheduledTime?: string;
  endTime?: string;
  serviceId?: string;
  serviceName?: string;
}

interface BookAppointmentParams {
  organizationId: string;
  organizationName: string;
  serviceId: string;
  serviceName: string;
  scheduledDate: string;
  scheduledTime: string;
  endTime: string;
  notes?: string;
  formData?: Record<string, any>;
}

interface MakeReservationParams {
  organizationId: string;
  organizationName: string;
  serviceId: string;
  serviceName: string;
  reservationType: "table" | "service" | "consultation" | "other";
  scheduledDate: string;
  scheduledTime: string;
  duration: number;
  partySize?: number;
  specialRequests?: string;
}

const AppointmentContext = createContext<AppointmentContextType | undefined>(undefined);

const APPOINTMENTS_STORAGE_KEY = "@tiqkets_appointments";
const RESERVATIONS_STORAGE_KEY = "@tiqkets_reservations";

function generateTicketNumber(): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const prefix = letters[Math.floor(Math.random() * letters.length)] + 
                 letters[Math.floor(Math.random() * letters.length)];
  const number = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
  return `${prefix}${number}`;
}

function generateConfirmationCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function generateTimeSlots(date: string, slotDuration: number = 30): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const startHour = 9;
  const endHour = 17;
  const selectedDate = new Date(date);
  
  for (let hour = startHour; hour < endHour; hour++) {
    for (let minute = 0; minute < 60; minute += slotDuration) {
      const startTime = new Date(selectedDate);
      startTime.setHours(hour, minute, 0, 0);
      
      const endTime = new Date(startTime);
      endTime.setMinutes(endTime.getMinutes() + slotDuration);
      
      const isPast = startTime < new Date();
      const randomBookings = Math.floor(Math.random() * 4);
      
      slots.push({
        id: `slot_${hour}_${minute}`,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        available: !isPast && randomBookings < 3,
        maxCapacity: 3,
        currentBookings: randomBookings,
      });
    }
  }
  
  return slots;
}

export function AppointmentProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [locationPermissionGranted, setLocationPermissionGranted] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    loadData();
    checkLocationPermission();
  }, []);

  useEffect(() => {
    if (user && locationPermissionGranted && upcomingAppointments.length > 0) {
      startLocationTracking();
    }
    return () => {
      stopLocationTracking();
    };
  }, [user, locationPermissionGranted, appointments]);

  const loadData = async () => {
    try {
      const [storedAppointments, storedReservations] = await Promise.all([
        AsyncStorage.getItem(APPOINTMENTS_STORAGE_KEY),
        AsyncStorage.getItem(RESERVATIONS_STORAGE_KEY),
      ]);
      
      if (storedAppointments) {
        setAppointments(JSON.parse(storedAppointments));
      }
      if (storedReservations) {
        setReservations(JSON.parse(storedReservations));
      }
    } catch (error) {
      console.error("Failed to load appointments:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveAppointments = async (newAppointments: Appointment[]) => {
    await AsyncStorage.setItem(APPOINTMENTS_STORAGE_KEY, JSON.stringify(newAppointments));
    setAppointments(newAppointments);
  };

  const saveReservations = async (newReservations: Reservation[]) => {
    await AsyncStorage.setItem(RESERVATIONS_STORAGE_KEY, JSON.stringify(newReservations));
    setReservations(newReservations);
  };

  const checkLocationPermission = async () => {
    if (Platform.OS === "web") {
      setLocationPermissionGranted(false);
      return;
    }
    
    const { status } = await Location.getForegroundPermissionsAsync();
    setLocationPermissionGranted(status === "granted");
  };

  const requestLocationPermission = async (): Promise<boolean> => {
    if (Platform.OS === "web") {
      return false;
    }
    
    const { status } = await Location.requestForegroundPermissionsAsync();
    const granted = status === "granted";
    setLocationPermissionGranted(granted);
    return granted;
  };

  const startLocationTracking = async () => {
    if (!locationPermissionGranted || Platform.OS === "web") return;
    
    try {
      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 30000,
          distanceInterval: 50,
        },
        (location: Location.LocationObject) => {
          setUserLocation({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          });
          checkArrivalAtOrganizations(location.coords);
        }
      );
    } catch (error) {
      console.error("Failed to start location tracking:", error);
    }
  };

  const stopLocationTracking = () => {
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }
  };

  const checkArrivalAtOrganizations = (coords: { latitude: number; longitude: number }) => {
    const todayAppointments = upcomingAppointments.filter((apt) => {
      const aptDate = new Date(apt.scheduledDate);
      const today = new Date();
      return aptDate.toDateString() === today.toDateString() && !apt.arrivalDetected;
    });

    todayAppointments.forEach((appointment) => {
      const orgLocation = getOrganizationLocation(appointment.organizationId);
      if (orgLocation) {
        const distance = calculateDistance(
          coords.latitude,
          coords.longitude,
          orgLocation.latitude,
          orgLocation.longitude
        );
        
        if (distance <= orgLocation.radius) {
          handleArrivalDetected(appointment);
        }
      }
    });
  };

  const handleArrivalDetected = async (appointment: Appointment) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    
    const updatedAppointments = appointments.map((apt) =>
      apt.id === appointment.id
        ? { ...apt, arrivalDetected: true, status: "checked_in" as const, checkInTime: new Date().toISOString() }
        : apt
    );
    
    await saveAppointments(updatedAppointments);
    
    if (Platform.OS !== "web") {
      Alert.alert(
        "You've Arrived!",
        `Welcome to ${appointment.organizationName}. You've been automatically checked in for your ${appointment.serviceName} appointment.`,
        [{ text: "OK" }]
      );
    }
  };

  const getOrganizationLocation = (organizationId: string) => {
    const orgLocations: Record<string, { latitude: number; longitude: number; radius: number }> = {
      org_1: { latitude: 37.7749, longitude: -122.4194, radius: 100 },
      org_2: { latitude: 37.7849, longitude: -122.4094, radius: 100 },
      org_3: { latitude: 37.7649, longitude: -122.4294, radius: 100 },
      org_4: { latitude: 37.7549, longitude: -122.4394, radius: 100 },
      org_5: { latitude: 37.7449, longitude: -122.4494, radius: 100 },
    };
    return orgLocations[organizationId];
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  };

  const bookAppointment = async (params: BookAppointmentParams): Promise<Appointment> => {
    if (!user) throw new Error("User not authenticated");

    try {
      const response = await apiRequest("POST", `/api/branches/${params.organizationId}/bookings`, {
        serviceId: params.serviceId,
        userId: user.id,
        customerName: user.name || params.formData?.name || "Guest",
        customerPhone: user.phone || params.formData?.phone || "",
        customerEmail: user.email || params.formData?.email || "",
        scheduledDate: params.scheduledDate,
        scheduledTime: params.scheduledTime,
        endTime: params.endTime,
        notes: params.notes,
        formData: params.formData,
      });
      const data = await response.json();
      
      if (!data.booking) {
        throw new Error("Failed to book appointment");
      }

      const appointment: Appointment = {
        id: data.booking.id,
        userId: user.id,
        organizationId: params.organizationId,
        organizationName: params.organizationName,
        serviceId: params.serviceId,
        serviceName: params.serviceName,
        scheduledDate: params.scheduledDate,
        scheduledTime: params.scheduledTime,
        endTime: params.endTime,
        status: "upcoming",
        ticketNumber: data.booking.ticketNumber || generateTicketNumber(),
        createdAt: data.booking.createdAt || new Date().toISOString(),
        notes: params.notes,
        formData: params.formData || {},
      };

      const newAppointments = [...appointments, appointment];
      await saveAppointments(newAppointments);
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return appointment;
    } catch (error) {
      console.error("Error booking appointment:", error);
      throw error;
    }
  };

  const makeReservation = async (params: MakeReservationParams): Promise<Reservation> => {
    if (!user) throw new Error("User not authenticated");

    try {
      const response = await apiRequest("POST", `/api/reserve/${params.organizationId}`, {
        customerName: user.name || "Guest",
        customerPhone: user.phone || "",
        customerEmail: user.email || "",
        partySize: params.partySize || 1,
        reservationDate: params.scheduledDate,
        reservationTime: params.scheduledTime,
        specialRequests: params.specialRequests,
      });
      const data = await response.json();

      const reservation: Reservation = {
        id: data.reservation?.id || `res_${Date.now()}`,
        userId: user.id,
        organizationId: params.organizationId,
        organizationName: params.organizationName,
        serviceId: params.serviceId,
        serviceName: params.serviceName,
        reservationType: params.reservationType,
        scheduledDate: params.scheduledDate,
        scheduledTime: params.scheduledTime,
        duration: params.duration,
        partySize: params.partySize,
        status: "confirmed",
        confirmationCode: data.confirmationNumber || generateConfirmationCode(),
        specialRequests: params.specialRequests,
        createdAt: new Date().toISOString(),
      };

      const newReservations = [...reservations, reservation];
      await saveReservations(newReservations);
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return reservation;
    } catch (error) {
      console.error("Error making reservation:", error);
      throw error;
    }
  };

  const cancelAppointment = async (appointmentId: string): Promise<void> => {
    try {
      await apiRequest("POST", `/api/bookings/${appointmentId}/cancel`);
    } catch (error) {
      console.error("Error cancelling appointment:", error);
    }
    const updatedAppointments = appointments.map((apt) =>
      apt.id === appointmentId ? { ...apt, status: "cancelled" as const } : apt
    );
    await saveAppointments(updatedAppointments);
  };

  const cancelReservation = async (reservationId: string): Promise<void> => {
    try {
      await apiRequest("POST", `/api/reservations/${reservationId}/cancel`);
    } catch (error) {
      console.error("Error cancelling reservation:", error);
    }
    const updatedReservations = reservations.map((res) =>
      res.id === reservationId ? { ...res, status: "cancelled" as const } : res
    );
    await saveReservations(updatedReservations);
  };

  const checkInAppointment = async (appointmentId: string): Promise<void> => {
    const updatedAppointments = appointments.map((apt) =>
      apt.id === appointmentId
        ? { ...apt, status: "checked_in" as const, checkInTime: new Date().toISOString() }
        : apt
    );
    await saveAppointments(updatedAppointments);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const modifyAppointment = async (appointmentId: string, updates: ModifyAppointmentParams): Promise<void> => {
    const updatedAppointments = appointments.map((apt) =>
      apt.id === appointmentId ? { ...apt, ...updates } : apt
    );
    await saveAppointments(updatedAppointments);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const isAtLocation = (organizationId: string): boolean => {
    if (!userLocation) return false;
    const orgLocation = getOrganizationLocation(organizationId);
    if (!orgLocation) return false;
    
    const distance = calculateDistance(
      userLocation.latitude,
      userLocation.longitude,
      orgLocation.latitude,
      orgLocation.longitude
    );
    
    return distance <= orgLocation.radius;
  };

  const checkLocationNow = async (): Promise<boolean> => {
    if (Platform.OS === "web") return false;
    
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== "granted") return false;
      
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      
      setUserLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
      
      return true;
    } catch (error) {
      console.error("Failed to get current location:", error);
      return false;
    }
  };

  const getAvailableSlots = (organizationId: string, serviceId: string, date: string): TimeSlot[] => {
    return generateTimeSlots(date);
  };

  const upcomingAppointments = appointments.filter(
    (apt) => apt.status === "upcoming" || apt.status === "checked_in"
  );

  return (
    <AppointmentContext.Provider
      value={{
        appointments,
        reservations,
        isLoading,
        bookAppointment,
        makeReservation,
        cancelAppointment,
        cancelReservation,
        checkInAppointment,
        modifyAppointment,
        getAvailableSlots,
        upcomingAppointments,
        locationPermissionGranted,
        requestLocationPermission,
        startLocationTracking,
        stopLocationTracking,
        userLocation,
        isAtLocation,
        checkLocationNow,
      }}
    >
      {children}
    </AppointmentContext.Provider>
  );
}

export function useAppointments() {
  const context = useContext(AppointmentContext);
  if (!context) {
    throw new Error("useAppointments must be used within an AppointmentProvider");
  }
  return context;
}
