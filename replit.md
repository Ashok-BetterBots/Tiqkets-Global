# TIQKETS

## Overview

TIQKETS is a mobile-first queue and appointment management application aimed at eliminating physical waiting. It enables users to join queues remotely, monitor their position, snooze, swap positions, and change services. It also includes an appointment booking system with time slots and automatic check-in via location detection. The application is built using React Native with Expo for cross-platform compatibility (iOS, Android, web) and an Express.js backend. Its vision is to streamline customer flow for businesses and enhance user convenience.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend

The frontend is a React Native application built with Expo SDK 54, utilizing React Navigation v7 for navigation and React Context with TanStack Query for state management. It supports light/dark modes and custom theming.

Key features include:
-   **Appointment System**: Manages booking states, a multi-step booking flow, and location-based auto check-in (100m geofence).
-   **Organization Dashboard**: A comprehensive web interface for managing queues, branches, services, bookings, and staff. It supports various queue processing modes (FIFO, Selective, Dine-In, Multi-Stage), configurable push and WhatsApp notifications, and detailed queue control (Start/Pause/End) at branch, service, or desk levels.
-   **Position Swap**: Allows customers to request position swaps with others ahead in the queue, including premium swaps for top positions.
-   **User Access Management**: Implements role-based access control (RBAC) with organization-scoped permissions (Admin, Location Manager, Floor Manager, Front Desk) and multi-branch assignment.
-   **Super Admin Web Portal**: A web interface for global system oversight, managing organizations, users, transactions, and audit logs.
-   **Web-Based App Clip**: Progressive Web App (PWA) functionality for quick queue joining and reservation booking via `/join/{branchId}` and `/reserve/{branchId}` URLs, including offline support.
-   **Reports & Analytics**: Comprehensive reporting with various filters and CSV export, covering overview, trends, service performance, staff/desk utilization, and customer insights.
-   **Speaker Announcements**: Real-time audio announcements via Server-Sent Events (SSE) for calling tickets, configurable per `queueMode` with customizable templates and alert sounds. Multi-language: super admins can define announcement templates per language for each queue mode (templates stored as a JSONB map on `notification_settings.templates` plus legacy `template_en`/`template_ar` columns for back-compat). Each branch picks an announcement language from a shared catalog (`shared/languages.ts`, ~25 languages) and can optionally toggle "also announce in English" — when ON the announcement plays once in the chosen language and once in English, when OFF it plays twice in the chosen language. Supports dedicated announcement devices per branch (each device has its own language). Speech is synthesised on the device using browser/native voices; the SSE payload carries `spokenText`+`language`+`languageBcp47` plus `fallbackText`/`fallbackLanguage` and still emits legacy `spokenTextEn`/`spokenTextAr` for older clients.

### Backend

The backend is developed with Express.js 5 and TypeScript, providing API routes for all frontend functionalities and serving PWA assets.

### Data Storage

PostgreSQL is used as the primary database, managed with Drizzle ORM. Local persistence for user sessions and queue state is handled by AsyncStorage.

## External Dependencies

### Third-Party Services

-   **Camera Access**: `expo-camera` for QR code scanning.
-   **Location Services**: `expo-location` for geofencing.
-   **Push Notifications**: `expo-notifications` for various alerts and queue updates.
-   **WhatsApp Integration**: WhatsApp Business API for OTP authentication and customer notifications (e.g., get-ready, position updates, turn alerts).
-   **Payment Gateway**: Razorpay for payment processing.
-   **Authentication**: Planned integrations for Apple Sign-In, Google Sign-In, and SMS notifications.

### Database

-   **PostgreSQL**: Configured via `DATABASE_URL`.

### Environment Variables

-   `DATABASE_URL`
-   `EXPO_PUBLIC_DOMAIN`, `APP_DOMAIN`, `REPLIT_DEV_DOMAIN`, `REPLIT_DOMAINS` (domain configuration)
-   `ALLOWED_ORIGINS` (CORS)
-   `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN`
-   `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`