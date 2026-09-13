# TIQKETS Design Guidelines

## 1. Brand Identity

**Purpose**: TIQKETS eliminates physical waiting by giving customers complete control and transparency over their queue position across multiple organizations.

**Aesthetic Direction**: Professional/Refined - A premium, trustworthy experience that combines the calm efficiency of airport lounges with the clarity of modern banking apps. The design should convey control, transparency, and time-respect.

**Memorable Element**: Live queue visualization with smooth, satisfying animations when positions change. The queue position should feel like a living, breathing entity that users can interact with.

## 2. Navigation Architecture

**Root Navigation**: Tab Bar (3 tabs)
- **Queue** (Home) - Active queue status and join options
- **History** - Past queues and analytics
- **Profile** - Account settings and preferences

**Modal Screens**: QR Scanner, Join Queue Form, Position Swap, Service Change

## 3. Screen-by-Screen Specifications

### Auth Flow
**Login/Signup Screen**
- Header: Transparent, logo centered
- Options: Apple Sign-In, Google Sign-In, WhatsApp OTP, Email
- Layout: Vertical stack with large logo space at top (150px reserved), auth buttons below
- Footer: Privacy policy & terms links

### Tab 1: Queue (Home)
**Active Queue View** (when in queue)
- Header: Transparent with bell icon (notifications) on right
- Content: Non-scrollable, vertically centered
  - Large position indicator (e.g., "#5 in line")
  - Organization name and service type
  - Expected wait time (prominent, updates live)
  - Queue visualization (vertical list showing 3 positions ahead, user, 3 behind - anonymized)
  - Action buttons: Snooze (1/2/3 levels), Swap Position, Change Service, Exit Queue
- Insets: top = headerHeight + Spacing.xl, bottom = tabBarHeight + Spacing.xl

**Empty State** (not in queue)
- Header: Same as above
- Content: Scrollable
  - Empty state illustration centered
  - "Join a Queue" primary button
  - Quick join options: Scan QR Code, Browse Organizations
- Insets: top = headerHeight + Spacing.xl, bottom = tabBarHeight + Spacing.xl

**Join Queue Screen** (Modal)
- Header: "Join Queue" title, X close button (left), Done (right, disabled until valid)
- Content: Scrollable form
  - Organization name (read-only if from QR)
  - Service selection dropdown
  - Dynamic form fields (based on org requirements)
  - Notification preferences: In-App, WhatsApp, SMS (checkboxes)
- Submit button: In header (Done button)
- Insets: top = Spacing.xl, bottom = insets.bottom + Spacing.xl

### Tab 2: History
- Header: "History" title, filter icon (right)
- Content: Scrollable list
  - Grouped by date (Today, This Week, Earlier)
  - Each card: Org name, service, date/time, wait time, status badge
  - Stats card at top: Total queues joined, average wait time
- Empty state: "No queue history yet" with illustration
- Insets: top = headerHeight + Spacing.xl, bottom = tabBarHeight + Spacing.xl

### Tab 3: Profile
- Header: Transparent, settings gear icon (right)
- Content: Scrollable
  - Profile section: Avatar, name, contact info
  - Preferences: Default notification method, language
  - Organizations visited (count badge)
  - Forms library (saved form submissions)
  - Account actions (nested): Log out, Delete account
- Insets: top = headerHeight + Spacing.xl, bottom = tabBarHeight + Spacing.xl

### Special Screens
**QR Scanner** (Modal)
- Full-screen camera view
- White frame overlay with rounded corners
- "Scan QR Code" instruction text below frame
- Cancel button (top-left)

**Position Swap** (Modal)
- Header: "Swap Position" with X close
- Content: List of users ahead willing to swap
- Each card: Position number, reason badge (Emergency/VIP), Swap button
- Confirmation alert before swap

## 4. Color Palette

### Brand Colors
**Primary Brand**: #8c1867 (Magenta/Burgundy - main brand identity)  
**Primary Light**: #a83d82 (Lighter magenta for dark mode)  
**Primary Dark**: #6a1250 (Darker shade for pressed states)  
**Secondary**: #1d499b (Blue - links and secondary actions)  
**Secondary Light**: #3366bb (Lighter blue for dark mode)  
**Accent/Gold**: #ffd700 (Gold - premium features and highlights)  
**Accent Dark**: #e6c200 (Darker gold for light mode)

### Neutral Colors
**White**: #ffffff  
**Light Gray**: #f2f2f2  
**Dark Gray**: #272626  
**Black**: #1a1a1a

### Light Mode
**Background Root**: #F8F9FA  
**Background Default**: #FFFFFF  
**Background Secondary**: #f2f2f2  
**Text Primary**: #272626  
**Text Secondary**: #6B7280  
**Border**: #E5E7EB

### Dark Mode
**Background Root**: #1a1a1a  
**Background Default**: #272626  
**Background Secondary**: #353739  
**Text Primary**: #ECEDEE  
**Text Secondary**: #9BA1A6  
**Border**: #404244

### Status Colors
**Success**: #10B981  
**Warning**: #F59E0B  
**Error**: #EF4444

## 5. Typography
**Font**: Nunito (Google Font - approachable yet professional)  
**Scale**:  
- Hero: 48px/Bold (queue position number)  
- Title: 24px/Bold  
- Heading: 20px/Bold  
- Subheading: 16px/SemiBold  
- Body: 15px/Regular  
- Caption: 13px/Regular

## 6. Visual Design
- Icons: Feather icon set (@expo/vector-icons)
- Floating action buttons: Use subtle shadow (offset: {width: 0, height: 2}, opacity: 0.10, radius: 2)
- Cards: 12px border radius, #E5E7EB border, no shadow
- Buttons: 8px border radius, bold text
- All touchables have pressed state (opacity: 0.7)
- Queue position indicator: Circular badge with gradient (Primary to Primary Dark)

## 7. Assets to Generate
1. **icon.png** - App icon, TIQKETS logo with queue/ticket motif
2. **splash-icon.png** - Launch screen icon
3. **empty-queue.png** - Empty state for Queue tab, illustration of person relaxing with phone, pastel blue tones (USED: Queue tab empty state)
4. **empty-history.png** - Empty state for History tab, calendar with checkmark, soft gray tones (USED: History tab empty state)
5. **avatar-placeholder.png** - Default user avatar, abstract geometric pattern in primary color (USED: Profile tab, position swap cards)
6. **qr-frame.png** - Decorative corners for QR scanner overlay (USED: QR Scanner screen)
7. **swap-success.png** - Success illustration for position swap confirmation, two positions exchanging with checkmark (USED: Swap confirmation dialog)