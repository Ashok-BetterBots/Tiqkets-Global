# TIQKETS

## Overview

TIQKETS is a mobile-first queue management application that eliminates physical waiting by giving customers complete control and transparency over their queue position. Users can join queues remotely, monitor their position in real-time, snooze their turn, swap positions, and change services - all from their mobile device.

The application now includes an **appointment booking system** with available time slots, and **automatic check-in via location detection** when users arrive at organizations.

The application is built as a cross-platform React Native app using Expo, with an Express.js backend server. It targets iOS, Android, and web platforms with a single codebase.

## User Preferences

Preferred communication style: Simple, everyday language.

## Brand Colors

The application uses a custom color scheme:
- **Primary Brand**: #8c1867 (Magenta/Burgundy) - Main brand identity
- **Primary Light**: #a83d82 (Lighter magenta for dark mode)
- **Primary Dark**: #6a1250 (Darker shade for pressed states)
- **Secondary**: #1d499b (Blue - links and secondary actions)
- **Accent/Gold**: #ffd700 (Gold - premium features and highlights)
- **Neutrals**: #ffffff (white), #f2f2f2 (light gray), #272626 (dark gray)

Logo variants available in `client/assets/images/logo/`:
- logo-color.png, logo-white.png, logo-black.png (icon only)
- logo-color-side-text.png, logo-white-side-text.png, logo-black-side-text.png
- logo-color-bottom-text.png, logo-white-bottom-text.png, logo-black-bottom-text.png
- logo-app-icon.png (white logo with color background)

## System Architecture

### Frontend Architecture

**Framework**: React Native with Expo SDK 54
- Uses Expo's managed workflow with native modules enabled (`newArchEnabled: true`)
- React 19.1 for the latest React features including the React Compiler experiment

**Navigation**: React Navigation v7
- Customer app: Bottom tab navigator with 4 main tabs: Queue, Bookings, History, Profile
- Organization dashboard: Bottom tab navigator with 5 tabs: Dashboard, Queue, Branches, Bookings, Settings
- Native stack navigators for each tab with modal presentations for actions like QR scanning, joining queues, swapping positions, booking appointments
- Custom transparent headers with blur effects on iOS
- App switches between customer and organization views based on authentication state

**State Management**:
- React Context for global state (AuthContext, QueueContext, AppointmentContext, OrganizationContext)
- TanStack Query (React Query) for server state management and caching
- AsyncStorage for persistent local storage

**Appointment System**:
- AppointmentContext manages booking state, location tracking, and auto check-in
- Multi-step booking flow: organization → service → date → time → confirmation
- Time slots generated dynamically (9am-5pm, 30-min intervals, max 3 bookings per slot)
- Location-based arrival detection using Haversine formula (100m geofence radius)
- Automatic check-in with haptic feedback when user enters organization proximity

**Organization Dashboard**:
- OrganizationContext manages organization auth state, services, settings, users, and branches
- 5-tab navigation: Dashboard, Queue, Branches, Bookings, Settings
- Branch & Services management with hierarchical structure (services organized per branch)
- **QR Code Download**: Each branch has a downloadable QR code for queue joining
  - Admin users can download QR codes for all branches
  - Location Managers can only download QR codes for their assigned branch
  - QR codes link to `/join/{branchId}` for instant queue joining
  - Can save to photo gallery or share via native share dialog
- Service management with custom input fields (text, email, phone, number, select, checkbox, date)
- **In-Person Registration**: Services can require customers to be physically present at the branch
  - Toggle to enable/disable in-person requirement per service
  - Configurable perimeter (default 100m) using geofencing
  - Uses expo-location with Haversine formula for distance calculation
  - Customers outside the perimeter see their distance and cannot proceed
  - Green "In-Person" badge displayed on services requiring physical presence
- Queue processing modes: FIFO (first come, first served) and Selective (choose who to call)
- **Dine In Mode**: Full-featured restaurant queue management
  - 5-tab interface: Reservations, Waiting, Called, Hold, Arrived
  - Customer source tracking with visual badges (App, QR, Manual, Reservation)
  - Manual customer registration with form fields (name, phone, email, notes), creating tickets with "M" prefix
  - Reservation system with `addReservation` and `checkInReservation` functions, creating tickets with "R" prefix
  - Resume from Hold returns customer to Waiting tab (preserves original join time, clears table allocation)
  - Sorting: Reservations by reservationTime, Waiting/others by joinedAt (ascending)
  - Reservation link generation: Copyable `/reserve/{branchId}` links from branch settings
  - Dual FAB buttons for manual registration and camera scanning
- Notification modes: All (notify at 3rd, 2nd, next, turn) or Turn Only (notify only at turn)
- Display options: Bluetooth speaker announcements, TV display integration
- Booking slot management with capacity control and blocking
- API integration with key generation for third-party systems
- Operating hours configuration per day of week

**Branch-Based Booking Management**:
- Operating hours and time slots are managed per-branch via `Branch.settings.operatingHours`
- Bookings page includes a branch selector at the top for selecting which branch to manage
- `getAccessibleBranches()` function filters branches based on user role
- `updateBranchSettings()` function updates settings for a specific branch
- `selectedBookingBranchId` state in OrganizationContext tracks the currently selected branch

**User Access Management**:
- 4 role-based permission levels with distinct capabilities:
  - Admin (purple): Create branches, users, payments, change all settings
  - Location Manager (blue): Manage assigned branches settings, view reports, create staff users, process queue (supports multiple branch assignment)
  - Floor Manager (green): Process queue for multiple services in assigned branch
  - Front Desk (orange): Process queue for specific service in assigned branch
- User management screen accessible from Settings with full CRUD operations
- **Multi-branch assignment for Location Managers**: Can be assigned to multiple branches using checkbox selection
- OrgUser type supports both `branchId` (single, legacy) and `branchIds` (array) for backward compatibility
- Branch assignment for location-based access control
- Service assignment for Front Desk role to limit queue processing scope
- Role permission system defined in ROLE_PERMISSIONS constant
- Types defined in `client/types/organization.ts`: OrgUser, Branch, UserRole

**UI/Styling**:
- Custom theme system with light/dark mode support
- Nunito font family via Expo Google Fonts
- Reanimated for smooth animations
- Expo Haptics for tactile feedback
- Linear gradients and blur effects for premium aesthetic

**Key Design Patterns**:
- Themed components (ThemedText, ThemedView) that automatically adapt to color scheme
- Centralized theme constants in `client/constants/theme.ts`
- Screen options hook for consistent navigation styling
- Error boundary with fallback UI

**Web-Based App Clip** (QR Code Queue Joining):
- Mobile-optimized web page for customers without the app installed
- URL format: `/join/{branchId}` (e.g., `/join/branch-main`)
- 3-step flow: Select Service → Enter Details → Confirmation
- Dynamic input fields based on service configuration
- Returns ticket number, queue position, and estimated wait time
- Prompts users to download the full app for additional features

### Backend Architecture

**Framework**: Express.js 5 with TypeScript
- Single server entry point at `server/index.ts`
- CORS configured for Replit domains and localhost development
- Routes registered via `server/routes.ts`

**Queue Join API**:
- `GET /api/join/:branchId` - Returns branch info, services, and input fields
- `POST /api/join/:branchId` - Submits queue join request, returns ticket number
- `GET /join/:branchId` - Serves the web-based queue joining page

**Build System**:
- tsx for development with hot reload
- esbuild for production bundling

### Data Storage

**Database**: PostgreSQL via Drizzle ORM
- Schema defined in `shared/schema.ts`
- Drizzle-zod for runtime validation
- Currently has a basic users table; queue-related tables need to be added
- In-memory storage fallback available in `server/storage.ts`

**Local Persistence**: AsyncStorage for user sessions and queue state

### Path Aliases

- `@/` maps to `./client/`
- `@shared/` maps to `./shared/`

Configured in both `tsconfig.json` and `babel.config.js` for metro bundler compatibility.

## External Dependencies

### Third-Party Services

**Camera Access**: expo-camera for QR code scanning to join queues quickly

**Location Services**: expo-location for geofencing and automatic check-in when arriving at organizations

**Platform Services**:
- Apple Sign-In (planned)
- Google Sign-In (planned)
- WhatsApp OTP (planned)
- SMS notifications (planned)

### Database

PostgreSQL database required. Connection string expected in `DATABASE_URL` environment variable. Drizzle Kit used for schema migrations.

### Environment Variables

- `DATABASE_URL`: PostgreSQL connection string
- `EXPO_PUBLIC_DOMAIN`: API server domain for client requests
- `REPLIT_DEV_DOMAIN`: Development domain (auto-set by Replit)
- `REPLIT_DOMAINS`: Production domains (auto-set by Replit)

### Key npm Packages

- `drizzle-orm` + `drizzle-zod`: Database ORM with validation
- `pg`: PostgreSQL driver
- `@tanstack/react-query`: Server state management
- `react-native-reanimated`: Animations
- `expo-linear-gradient`, `expo-blur`: Visual effects
- `expo-haptics`: Tactile feedback
- `expo-clipboard`: Clipboard access for copying API keys