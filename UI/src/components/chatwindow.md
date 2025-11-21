# ChatWindow Component - Complete Logical Description

## Overview
The ChatWindow component is the central interface for dream analysis interactions with Amnis, the dream keeper AI. It provides a comprehensive chat interface with advanced features including chat history management, voice recording, payment integration, and responsive design. The component manages user authentication, chat state, message streaming, and various business logic triggers.

## Component Architecture

### Core Dependencies
- React hooks: useState, useRef, useEffect, useCallback
- UI library: Lucide React icons
- Animation library: motion/react
- Context providers: AuthContext, PaymentContext
- Backend API: chatApi service functions

### State Variables and Their Functions
- `messages`: Array of message objects (user/AI) with ID, text, user flag, timestamp, and optional task ID
- `inputValue`: Current text in the message input field
- `showUpsell`: Boolean controlling payment upsell card visibility
- `isRecording`: Boolean tracking voice recording status
- `isAiTyping`: Boolean indicating when AI is processing
- `showMenu`: Boolean controlling menu visibility
- `showSidebar`: Boolean controlling sidebar visibility (responsive to screen size)
- `chats`: Array of user's chat objects with ID, title, last message, timestamp
- `currentChatId`: String identifying the currently active chat session
- `currentChatTitle`: String holding the title of the current chat
- `isLoadingChats`: Boolean indicating if chat list is loading
- `isCreatingChat`: Boolean tracking chat creation state
- `showProfileModal`: Boolean controlling profile modal visibility
- `paymentTriggered`: Boolean tracking if payment has been triggered
- `showPaymentWarning`: Boolean controlling payment warning modal
- `renamingChatId`: String identifying chat being renamed (null if none)
- `newChatTitle`: String holding new title during rename operation
- `showCreatingChatModal`: Boolean controlling creating chat modal visibility

## Initialization and Mounting Behavior

### Component Mounting Process
When the ChatWindow component mounts, it performs several initialization steps:
1. Checks for ongoing chat creation in localStorage (cleanup of stale states)
2. Sets up media query hook for responsive design
3. Loads user chats if authenticated
4. Sets up auto-scroll to bottom of messages
5. Initializes speech recognition for voice input

### Startup Sequence
1. Checks localStorage for 'creatingChatState' to restore chat creation modal state
2. Initializes responsive sidebar behavior based on screen size
3. Loads user's chat history from backend if authenticated
4. Sets up auto-resizing textarea for input field
5. Establishes scroll behavior to follow new messages

## API Integration and Network Operations

### Backend API Endpoints Used
- `createChat(title)`: Creates a new chat session with specified title
- `sendMessageStream(message, callback)`: Sends message and streams AI response
- `getUserChats()`: Retrieves all user's chat history from server
- `switchChat(chatId)`: Loads specific chat by ID and returns messages
- `deleteChat(chatId)`: Removes chat from server and database
- `getChatMessages(chatId)`: Gets messages for specific chat (used internally)
- `updateChatTitle(chatId, title)`: Updates chat title on server

### API Request/Response Flow
1. **Chat Creation Request**:
   - Input: Title string
   - Response: Chat ID, title, initial AI greeting
   - Expected Response Format: {chat_id: string, title: string, messages: array}

2. **Message Sending Request**:
   - Input: Message text string, current chat ID
   - Response: Streaming chunks of AI response
   - Expected Response Format: Streamed content with possible triggers

3. **Chat Loading Request**:
   - Input: User authentication token
   - Response: Array of chat objects
   - Expected Response Format: Array of {id, title, updated_at, created_at}

4. **Chat Switching Request**:
   - Input: Chat ID
   - Response: Chat messages and metadata
   - Expected Response Format: {messages: array, title: string}

## Message Processing Logic

### Message Structure
Each message object contains:
- `id`: Unique identifier for the message
- `text`: Content of the message
- `isUser`: Boolean indicating if sent by user (true) or AI (false)
- `timestamp`: Date/time when message was created
- `taskId`: Optional string for tracking async processing tasks

### Message Processing Pipeline
1. User submits message via text input or voice recording
2. Message is validated for content and current chat state
3. Message is added to UI with user flag and timestamp
4. API request is made to send message to backend
5. AI response is received via streaming
6. Response is processed for triggers and displayed to user

### Trigger Processing System
The component implements a trigger detection system to handle special instructions:
- **Payment Triggers**: [PAYMENT_TRIGGER] or similar markers in AI response activate upsell
- **Name Change Triggers**: [NAME_CHANGE="new title"] automatically renames chat
- **Symbol Triggers**: [SYMBOLS="summary"] extracts dream symbols without showing to user
- **Processing Flow**: Triggers are extracted from content but not displayed to user

## Voice Recording Feature

### Speech Recognition Implementation
- Uses browser's SpeechRecognition API or webkitSpeechRecognition
- Handles both modern and legacy browser implementations
- Provides visual feedback during recording (red recording indicator)

### Voice Recording Workflow
1. User clicks microphone button to start recording
2. Browser requests microphone permissions (first time only)
3. Speech recognition begins with visual feedback
4. Transcription appears in input field when recording stops
5. Recording stops automatically on silence or manually when button clicked

### Recording States
- `isRecording` state tracks active recording
- Visual indicator changes to red when active
- Input field is disabled during recording
- Automatic cleanup when recording stops or errors occur

## Chat Management System

### Creating New Chats
1. User clicks "New Chat" button in sidebar
2. Loading state is activated with modal display
3. API call to create new chat with default title "Новый анализ сна"
4. Initial greeting from Amnis is added to chat
5. New chat appears at top of sidebar
6. States are updated to reflect new chat as current

### Loading and Switching Chats
1. User clicks on existing chat in sidebar
2. API call to switchChat with selected chat ID
3. Chat messages are retrieved and processed for triggers
4. UI is updated with new chat's messages
5. Current chat state is updated (ID and title)

### Renaming Chats
1. User activates rename mode in sidebar context menu
2. Input field appears with current title
3. User edits title and confirms changes
4. API call updates title on backend
5. UI is updated in both sidebar and header

### Deleting Chats
1. User clicks delete icon in sidebar context menu
2. Confirmation dialog appears
3. If confirmed, API call deletes chat from server
4. If deleted chat was current, automatically switches to another chat or creates new one
5. UI is updated to reflect removal

## Payment Integration System

### Payment Trigger Detection
- Monitors AI responses for payment-related triggers
- Displays upsell card when payment trigger is detected
- Shows payment warning modal when payment is required

### Pricing Plans Available
The component displays four pricing plans:
- Plan 1: Single analysis, 199 RUB, 199 RUB per analysis
- Plan 5: Starter pack, 799 RUB, 160 RUB per analysis (popular)
- Plan 10: Deep analysis, 1399 RUB, 140 RUB per analysis
- Plan 15: Master pack, 1899 RUB, 127 RUB per analysis (best value)

### Payment Flow Control
1. Payment trigger detected in AI response
2. Upsell card appears in chat area
3. User can click to view payment options
4. Payment modal displays available plans
5. User selects plan and proceeds to payment gateway

## Responsive Design and Layout

### Component Structure
```
ChatWindow
├── Header (fixed height)
│   ├── Menu toggle (mobile)
│   ├── Branding and title
│   └── Profile button
├── Main layout (flex)
│   ├── Sidebar (collapsible on mobile)
│   │   ├── Chat list
│   │   ├── Create chat button
│   │   └── User controls
│   └── Chat area
│       ├── Messages container (scrollable)
│       ├── Background effects
│       └── Input area (fixed position)
└── Input area (fixed bottom)
    ├── Text input (auto-resizing)
    ├── Voice recording button
    └── Send button
```

### Responsive Behavior
- **Desktop (>768px)**: Sidebar always visible, full-width chat area
- **Mobile (<768px)**: Sidebar hidden by default, swipe-in functionality
- **Header**: Adapts to show menu toggle on mobile
- **Messages**: Responsive layout with appropriate spacing
- **Input area**: Maintains consistent height on all devices

### Media Query Implementation
- Uses custom hook `useMediaQuery` to detect screen size
- Breakpoint at 768px (md in Tailwind)
- Automatically shows/hides sidebar based on screen size
- Adjusts layout and component behavior accordingly

## Authentication Integration

### Auth Context Usage
- `isAuthenticated`: Boolean indicating user login status
- `user`: User profile data object
- `logout`: Function to end user session
- `updateUserProfile`: Function to update user profile

### Auth-Dependent Features
- Chat loading only occurs when user is authenticated
- Profile modal accessible when logged in
- User-specific data and preferences maintained
- Secure API calls with authentication tokens

## Error Handling and Validation

### Input Validation
- Message text is trimmed and validated before sending
- Prevents sending empty messages
- Blocks sending while AI is typing
- Prevents sending without active chat session

### API Error Handling
- Graceful degradation when API calls fail
- Fallback behavior for chat creation failures
- Error messages to user for failed operations
- State cleanup after errors occur

### Browser Compatibility
- Feature detection for SpeechRecognition API
- Fallback implementations for older browsers
- Error handling for missing browser features
- Graceful degradation for unsupported features

## UI Components Integration

### MessageBubble Component
- Displays individual messages with distinct styling
- Differentiates between user and AI messages
- Handles message timestamps and formatting
- Integrates with message processing pipeline

### UpsellCard Component
- Displays payment options when triggered
- Shows available pricing plans
- Handles payment flow initiation
- Integrates with payment context

### AnimatedBackground Component
- Provides visual background effects (star field)
- Enhances user experience with animations
- Performance-optimized for smooth rendering
- Responsive to user interactions

## Context and State Management

### AuthContext Integration
- Provides user authentication state
- Handles login/logout functionality
- Manages user profile data
- Secures API access with tokens

### PaymentContext Integration
- Tracks user payment status
- Manages available analysis credits
- Controls payment flow activation
- Updates payment status after transactions

## Performance Optimizations

### Rendering Optimizations
- Memoized components to prevent unnecessary re-renders
- Efficient state updates to minimize re-rendering
- Selective rendering based on state changes
- Optimized scroll behavior for message lists

### Memory Management
- Cleanup of event listeners and references
- Proper disposal of speech recognition instances
- Efficient message storage and display
- LocalStorage state management for persistence

## Security Considerations

### Data Protection
- Secure API communication with HTTPS
- Authentication token management
- Input sanitization for message content
- Prevention of XSS and injection attacks

### Privacy Compliance
- LocalStorage key management
- Secure handling of user data
- Proper cleanup of sensitive information
- Compliance with browser security policies

## User Experience Features

### Auto-scroll Behavior
- Automatically scrolls to newest message
- Preserves scroll position when not at bottom
- Smooth animation for scroll transitions
- Preserves user's reading position intentionally

### Input Field Enhancements
- Auto-resizing textarea based on content
- Keyboard shortcuts (Enter to send, Shift+Enter for new line)
- Voice input integration
- Real-time validation and feedback

### Visual Feedback
- Loading indicators during AI processing
- Recording visual feedback for voice input
- Smooth animations for UI transitions
- Responsive design for all screen sizes

## Component Lifecycle

### Mounting
- Initialize states and refs
- Check for ongoing chat creation in localStorage
- Load user chats if authenticated
- Set up responsive behavior

### Updating
- React to authentication changes
- Update chat list when new chat is created
- Adjust responsive behavior on screen size changes
- Process new messages and triggers

### Unmounting
- Cleanup event listeners
- Store persistent states in localStorage
- Cancel ongoing operations if needed
- Remove temporary data and references

This comprehensive documentation describes all aspects of the ChatWindow component's functionality, from initialization to cleanup, including all API interactions, state management, UI features, and user experience elements.