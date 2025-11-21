# Amnis Web Application - Complete Description

## Overview
Amnis is a React-based web application focused on providing a premium user experience for dream analysis and interpretation services. The application features a sophisticated UI with animated elements, a dual-view architecture (landing and chat), comprehensive authentication system, and subscription-based pricing model. The app uses modern React patterns with lazy loading, TypeScript, Tailwind CSS for styling, and Radix UI primitives for accessibility.

## Project Structure
```
UI/
├── Dockerfile
├── index.html
├── package.json
├── package-lock.json
├── vite.config.ts
├── build/
├── node_modules/
└── src/
    ├── App.tsx
    ├── main.tsx
    ├── index.css
    ├── styles/
    │   └── globals.css
    ├── fonts/
    │   ├── Bainsley.ttf
    │   ├── BainsleyBold.ttf
    │   ├── BainsleyBoldItalic.ttf
    │   ├── BainsleyItalic.ttf
    │   ├── BubbleSans.otf
    │   ├── Novem.ttf
    │   ├── Pulstar.otf
    │   ├── Pulstar.ttf
    │   └── WildRune.otf
    └── components/
        ├── AuthModal.tsx
        ├── ChatWindow.tsx
        ├── LandingView.tsx
        ├── MessageBubble.tsx
        ├── OnboardingModal.tsx
        ├── PhoneVerificationModal.tsx
        ├── PricingCard.tsx
        ├── PricingSection.tsx
        ├── PrimaryCTA.tsx
        ├── ResetPasswordModal.tsx
        ├── SparkleIcon.tsx
        ├── StarField.tsx
        ├── UpsellCard.tsx
        └── ui/ (Shadcn UI components)
```

## Core Features

### 1. Dual View Architecture
- **Landing View**: Marketing-focused view with animated background, value proposition, and call-to-action
- **Chat View**: Interactive conversation interface for dream analysis
- State management between views using React hooks

### 2. Advanced Authentication System
The application implements a comprehensive authentication flow with multiple modal components:
- **AuthModal**: Central authentication modal with login/register toggle
- **PhoneVerificationModal**: SMS-based phone verification system
- **ResetPasswordModal**: Password reset functionality with multiple steps
- **OnboardingModal**: Post-authentication user profile setup

Authentication modals feature:
- Animated transitions using Framer Motion
- Phone number input with country code selection
- SMS verification with timer and resend functionality
- Secure password handling with show/hide toggle
- Form validation and error handling

### 3. Interactive Chat Interface
The ChatWindow component provides:
- Real-time message bubbles with user/amnis differentiation
- Audio playback functionality for messages
- Floating sparkles animation for enhanced UX
- Message input with send and microphone options
- Dynamic message history display
- Upsell cards for premium features
- Animated starfield background

### 4. Pricing and Subscription System
- Multiple pricing tiers with clear value propositions
- Detailed analysis of cost per dream interpretation
- Interactive pricing cards with selection functionality
- Upsell opportunities during chat sessions
- Clear conversion-focused calls-to-action

## Design System & Styling

### Color Palette
- **Primary Background**: `#0D0B24`
- **Secondary Background**: `#1A1640`
- **Tertiary Background**: `#251F5C`
- **Accent Gold**: `#F4E0A7`
- **Accent Lavender**: `#A998FF`
- **Text Primary**: `#E8E6F5`
- **Text Secondary**: `#B8B5D1`
- **User Chat Bubble**: `rgba(77, 74, 168, 0.35)`
- **Amnis Chat Bubble**: `rgba(244, 224, 167, 0.08)`

### Typography
- Custom fonts: Bainsley (serif), BubbleSans (display), Novem, Pulstar, WildRune
- Responsive font scaling with Tailwind utility classes
- Carefully chosen type hierarchy for readability

### Animations & Interactions
- Framer Motion for smooth transitions and animations
- Floating sparkle effects throughout the interface
- Animated starfield background for chat window
- Smooth modal transitions and loading states
- Interactive hover states and micro-interactions

### UI Components
Leverages Shadcn UI components built on Radix UI primitives for accessibility:
- Accordion
- Alert Dialog
- Aspect Ratio
- Avatar
- Badge
- Breadcrumb
- Button
- Calendar
- Card
- Carousel
- Checkbox
- Collapsible
- Command
- Context Menu
- Dialog
- Drawer
- Dropdown Menu
- Form
- Hover Card
- Input
- Input OTP
- Label
- Menubar
- Navigation Menu
- Pagination
- Popover
- Progress
- Radio Group
- Resizable
- Scroll Area
- Select
- Separator
- Sheet
- Sidebar
- Skeleton
- Slider
- Sonner (notifications)
- Switch
- Table
- Tabs
- Textarea
- Toggle
- Toggle Group
- Tooltip
- Custom hooks and utilities

## Technical Architecture

### Frontend Stack
- React 18 with TypeScript
- Vite as build tool
- Tailwind CSS v4 for styling
- Framer Motion for animations
- Radix UI for accessible components
- Lucide React for icons

### Build & Deployment
- Docker containerization with multi-stage build
- Optimized production build with Vite
- Asset optimization and code splitting
- Environmental configuration support

### State Management
- React hooks for local component state
- Lazy loading for performance optimization
- Context-based state management for authentication flow
- Component-level state for modal management

## Page Descriptions

### Landing Page (LandingView.tsx)
**Purpose**: The primary marketing and conversion page that introduces users to the Amnis service and encourages them to start their dream analysis journey.

**Appearance**:
- Full-screen animated starfield background with floating sparkles
- Centered content area with dark-themed gradient overlay
- Elegant typography using custom Bainsley font
- Clear value proposition with key features highlighted
- Primary call-to-action button ("Start Now") with motion animation
- Feature icons (Message, Brain, Compass) with accent colors
- Pricing section with tiered options
- Smooth scrolling experience with parallax effects

**Key Elements**:
- Hero section with title "Amnis" and subtitle
- Feature highlights with animated icons
- Animated background with cosmic theme
- Floating sparkle animations throughout
- Pricing section with interactive cards
- Primary call-to-action with motion effects

### Chat Interface (ChatWindow.tsx)
**Purpose**: The core interactive experience where users engage in conversations with the dream analysis service to interpret their dreams.

**Appearance**:
- Immersive full-screen chat interface with animated starfield background
- Message bubbles arranged in conversation flow
- User messages in purple-themed bubbles (rgba(77, 74, 168, 0.35))
- Amnis responses in gold-themed bubbles (rgba(244, 224, 167, 0.08))
- Floating sparkles animation creating premium atmosphere
- Input area with text field, send button, and microphone icon
- Upsell cards for premium features integrated naturally
- Smooth animations for message appearance and transitions

**Key Elements**:
- Message history display with alternating user/AI bubbles
- Interactive text input with send/microphone options
- Audio playback capability for messages
- Upsell cards for premium analysis
- Animated background with dynamic starfield
- Floating sparkle effects for premium feel

### Authentication Modal (AuthModal.tsx)
**Purpose**: Centralized authentication interface allowing users to log in or register using phone number verification.

**Appearance**:
- Semi-transparent overlay with centered modal
- Elegant card design with gradient background
- Login/Register toggle tab system
- Form with phone number input and country code selector
- Password fields with show/hide toggle
- Social login options
- Animated transitions using Framer Motion
- Sparkle animations for premium feel
- Close button with elegant X icon

**Key Elements**:
- Login/Register mode toggle
- Phone number input with country selector
- Password and confirm password fields
- "Remember me" checkbox
- Social login buttons (Google, Apple, Facebook)
- Forgot password link
- Terms and conditions acceptance
- Primary action button with animation

### Phone Verification Modal (PhoneVerificationModal.tsx)
**Purpose**: Handles SMS-based phone number verification as part of the authentication flow.

**Appearance**:
- Clean modal interface with centered verification form
- Six-digit input field with proper spacing
- Timer countdown for resend functionality
- Clear instructions and status messages
- Animated sparkle elements for visual appeal
- Progress indicators for verification status

**Key Elements**:
- Six-digit code input field
- Resend code functionality with timer
- Phone number display for reference
- Verification status indicators
- Error handling and validation messages

### Password Reset Modal (ResetPasswordModal.tsx)
**Purpose**: Allows users to reset their password through a multi-step process.

**Appearance**:
- Multi-step form modal with clear progress indication
- Step-by-step instructions with visual feedback
- Form fields for new password with validation
- Eye icons for password visibility toggle
- Animated transitions between steps
- Success feedback with checkmark animation

**Key Elements**:
- Email verification step
- New password creation step
- Password strength indicators
- Confirmation step with success feedback
- Progress navigation controls

### Onboarding Modal (OnboardingModal.tsx)
**Purpose**: Collects essential user information after successful authentication to personalize the dream analysis experience.

**Appearance**:
- Clean, focused form with user profile fields
- Name and birth date input fields
- Date picker for birth date selection
- Minimalist design with accent colors
- Progress indicators for onboarding completion
- Animated transitions for smooth UX

**Key Elements**:
- Name input field
- Date of birth selection with calendar component
- Form validation and error handling
- Profile completion progress
- Confirmation button with animation

### Pricing Section (PricingSection.tsx & PricingCard.tsx)
**Purpose**: Displays subscription options and pricing tiers to convert users to paying customers.

**Appearance**:
- Three-tier pricing structure with clear differentiation
- Premium plan highlighted with accent border
- Clean card design with subtle shadows
- Feature comparison with checkmarks
- Pricing details with cost per analysis calculations
- Animated entry effects for each pricing card
- Sparkle icons highlighting premium features

**Key Elements**:
- Basic, Premium, and Ultimate plan cards
- Feature comparison with checkmarks
- Cost per analysis calculations
- Monthly/yearly toggle
- Current plan indicators
- Action buttons with different styling

### Upsell Card (UpsellCard.tsx)
**Purpose**: Promotes premium features within the chat interface to increase conversion rates during active sessions.

**Appearance**:
- Compact card design that fits naturally in chat flow
- Premium features highlighted with accent colors
- "Upgrade Now" call-to-action button
- Feature list with checkmarks
- Subtle animation for attention-grabbing
- Clean design that doesn't disrupt chat experience

**Key Elements**:
- Feature list with checkmarks
- Upgrade price display
- Premium feature highlights
- Conversion-focused call-to-action
- Close/dismiss option

## User Experience Flow

1. **Landing View**
   - Animated background with starfield effect
   - Value proposition and feature highlights
   - "Start Now" primary call-to-action
   - Pricing section access

2. **Authentication Flow**
   - Central modal with login/register toggle
   - Phone number verification
   - Password reset if needed
   - Onboarding with name and birth date collection

3. **Chat Experience**
   - Interactive conversation interface
   - Message history display
   - Audio playback for messages
   - Premium upselling during session
   - Subscription conversion points

## Specialized Components

### Animated Backgrounds
- **StarField**: Canvas-based animated starry background
- **FloatingSparkles**: Particle effects for premium feel
- **SparkleIcon**: Animated sparkle elements throughout UI

### Interactive Elements
- **MessageBubble**: Differentiated styling for user/AI messages
- **PrimaryCTA**: Animated call-to-action buttons
- **UpsellCard**: Contextual premium feature promotion
- **PricingCard**: Interactive pricing tier selection

### Modal System
- Centralized modal state management
- Animated entry/exit transitions
- Overlay and backdrop effects
- Accessible keyboard navigation

## Performance Considerations
- Lazy loading of chat window component
- Code splitting for different views
- Optimized animations using requestAnimationFrame
- Efficient canvas rendering for starfield
- Tree-shaking for unused components

## Custom Fonts
The application includes a custom font collection:
- Bainsley family (Regular, Bold, Italic variants) - Serif font for headings
- BubbleSans - Display font for special elements
- Novem, Pulstar, WildRune - Specialty fonts for unique text elements

## Accessibility Features
Built on Radix UI primitives ensuring:
- Proper ARIA attributes
- Keyboard navigation support
- Screen reader compatibility
- Focus management
- Semantic HTML structure