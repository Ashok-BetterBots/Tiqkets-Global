# TIQKETS

## Overview

TIQKETS is a mobile-first queue management application designed to eliminate physical waiting. It allows users to join queues remotely, monitor their position in real-time, snooze their turn, swap positions, and change services via their mobile device. The application now also features an appointment booking system with time slots and automatic check-in via location detection upon arrival at organizations. It is built as a cross-platform React Native app using Expo, with an Express.js backend, targeting iOS, Android, and web from a single codebase.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: React Native with Expo SDK 54, utilizing Expo's managed workflow with native modules and React 19.1.
**Navigation**: React Navigation v7, featuring a bottom tab navigator for both customer and organization views, with native stack navigators and modal presentations for various actions.
**State Management**: React Context for global state and TanStack Query for server state management and caching. AsyncStorage is used for local persistence.
**Appointment System**: Manages booking state, location tracking (100m geofence for auto check-in using Haversine formula), and a multi-step booking flow.
**Organization Dashboard**: Provides comprehensive tools for managing queues, branches, services, bookings, and settings. Key features include:
-   **QR Code Download**: For instant queue joining.
-   **In-Person Registration**: Services can require physical presence, with geofencing to enforce.
-   **Queue Processing Modes**: FIFO and Selective.
-   **Dine In Mode**: Full restaurant queue management with reservation and manual registration, customer source tracking, and sorting capabilities.
-   **Multi-Stage Mode**: Supports complex service journeys with sequential, configurable stages.
-   **Notification Modes**: Configurable push and WhatsApp notifications for queue status.
-   **Branch-Based Booking Management**: Operating hours and time slots are managed per-branch.
**User Access Management**: Role-based permissions (Admin, Location Manager, Floor Manager, Front Desk) with multi-branch assignment capabilities for Location Managers.
**UI/Styling**: Custom theme system with light/dark mode, Nunito font, Reanimated for animations, Expo Haptics, linear gradients, and blur effects.
**Web-Based App Clip**: Utilizes PWA technology for a universal "app clip" experience on `/join/{branchId}` for queue joining and `/reserve/{branchId}` for reservation booking, including offline support via a Service Worker. QR code join form shows only Full Name by default (no phone number); phone number can be added as a custom field per service. App-based joining auto-populates Full Name from the user's profile via AuthContext.

### Backend Architecture

**Framework**: Express.js 5 with TypeScript, handling API routes for queue joining, reservations, and PWA assets.
**Build System**: `tsx` for development and `esbuild` for production.

### Data Storage

**Database**: PostgreSQL via Drizzle ORM, with schema defined in `shared/schema.ts`. Drizzle-zod is used for runtime validation.
**Local Persistence**: AsyncStorage for user sessions and queue state.

### Path Aliases

`@/` for `client/` and `@shared/` for `shared/`, configured for both TypeScript and Babel.

## External Dependencies

### Third-Party Services

-   **Camera Access**: `expo-camera` for QR code scanning.
-   **Location Services**: `expo-location` for geofencing and automatic check-in.
-   **Push Notifications**: `expo-notifications` for queue status updates (customer and staff, with acknowledgment and snooze features) and WhatsApp notifications for all alert types. WhatsApp notifications now work independently of push tokens — QR-scanned customers without the app still receive WhatsApp notifications for get-ready, position updates, and turn alerts. Android notification channels (`queue-alerts`, `queue-urgent`) are initialized at app startup. All client-side local notifications include `channelId` for proper Android sound/vibration. Alert sound uses relative path for reliable asset resolution; falls back to local notification with channel sound on Android if audio playback fails.
-   **Icon Fonts**: Feather icon font (`...Feather.font`) explicitly loaded via `useFonts` in App.tsx to ensure icons render correctly on Android before splash screen hides.
-   **Platform Services**: Apple Sign-In, Google Sign-In, WhatsApp OTP, and SMS notifications are planned.

### Database

-   PostgreSQL database, configured via the `DATABASE_URL` environment variable.

### Environment Variables

-   `DATABASE_URL`: PostgreSQL connection string.
-   `EXPO_PUBLIC_DOMAIN`: API server domain for client.
-   `REPLIT_DEV_DOMAIN`: Development domain.
-   `REPLIT_DOMAINS`: Production domains.

### Key npm Packages

-   `drizzle-orm`, `drizzle-zod`, `pg`
-   `@tanstack/react-query`
-   `react-native-reanimated`, `expo-linear-gradient`, `expo-blur`, `expo-haptics`, `expo-clipboard`