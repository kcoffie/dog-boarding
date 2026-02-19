# Dog Boarding App - Progressive Web App (PWA) Specification

## Overview

Transform the dog boarding web app into a fully-featured Progressive Web App that feels native when installed on iPhone or Android. Users should be able to add it to their home screen and have an experience indistinguishable from a native app.

## Goals

1. **Native feel** - No browser chrome, proper status bar integration, smooth animations
2. **Instant loading** - App shell cached, loads immediately even on slow connections
3. **Mobile-first** - Every screen designed for phone-sized viewports first
4. **Reliable** - Works offline for viewing cached data, syncs when back online
5. **Installable** - Proper prompts and icons for home screen installation

---

## PWA Core Files

### 1. Web App Manifest (`public/manifest.json`)

```json
{
  "name": "Dog Boarding Manager",
  "short_name": "Boarding",
  "description": "Manage your dog boarding business",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#ffffff",
  "theme_color": "#3b82f6",
  "icons": [
    {
      "src": "/icons/icon-72x72.png",
      "sizes": "72x72",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-96x96.png",
      "sizes": "96x96",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-128x128.png",
      "sizes": "128x128",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-144x144.png",
      "sizes": "144x144",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-152x152.png",
      "sizes": "152x152",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-384x384.png",
      "sizes": "384x384",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-maskable-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "maskable"
    },
    {
      "src": "/icons/icon-maskable-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ],
  "screenshots": [
    {
      "src": "/screenshots/matrix-mobile.png",
      "sizes": "390x844",
      "type": "image/png",
      "form_factor": "narrow",
      "label": "Boarding matrix view"
    },
    {
      "src": "/screenshots/calendar-mobile.png",
      "sizes": "390x844",
      "type": "image/png",
      "form_factor": "narrow",
      "label": "Calendar view"
    }
  ],
  "categories": ["business", "productivity"],
  "shortcuts": [
    {
      "name": "View Calendar",
      "short_name": "Calendar",
      "url": "/calendar",
      "icons": [{ "src": "/icons/shortcut-calendar.png", "sizes": "96x96" }]
    },
    {
      "name": "Add Boarding",
      "short_name": "Add",
      "url": "/dogs?action=add-boarding",
      "icons": [{ "src": "/icons/shortcut-add.png", "sizes": "96x96" }]
    }
  ]
}
```

### 2. HTML Head Tags (`index.html`)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  
  <!-- Viewport - Critical for mobile -->
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=1.0, user-scalable=no" />
  
  <!-- PWA Meta Tags -->
  <meta name="theme-color" content="#3b82f6" />
  <meta name="background-color" content="#ffffff" />
  <link rel="manifest" href="/manifest.json" />
  
  <!-- iOS Specific -->
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Boarding" />
  
  <!-- iOS Icons -->
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
  <link rel="apple-touch-icon" sizes="152x152" href="/icons/icon-152x152.png" />
  <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-180x180.png" />
  <link rel="apple-touch-icon" sizes="167x167" href="/icons/icon-167x167.png" />
  
  <!-- iOS Splash Screens -->
  <!-- iPhone SE, 8, 7, 6s, 6 (750x1334) -->
  <link rel="apple-touch-startup-image" 
        media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)"
        href="/splash/apple-splash-750-1334.png" />
  
  <!-- iPhone 8 Plus, 7 Plus, 6s Plus, 6 Plus (1242x2208) -->
  <link rel="apple-touch-startup-image"
        media="(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3)"
        href="/splash/apple-splash-1242-2208.png" />
  
  <!-- iPhone X, Xs, 11 Pro, 12 Mini, 13 Mini (1125x2436) -->
  <link rel="apple-touch-startup-image"
        media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)"
        href="/splash/apple-splash-1125-2436.png" />
  
  <!-- iPhone Xr, 11, 12, 12 Pro, 13, 13 Pro, 14 (828x1792) -->
  <link rel="apple-touch-startup-image"
        media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2)"
        href="/splash/apple-splash-828-1792.png" />
  
  <!-- iPhone Xs Max, 11 Pro Max (1242x2688) -->
  <link rel="apple-touch-startup-image"
        media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3)"
        href="/splash/apple-splash-1242-2688.png" />
  
  <!-- iPhone 12 Pro Max, 13 Pro Max, 14 Plus (1284x2778) -->
  <link rel="apple-touch-startup-image"
        media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3)"
        href="/splash/apple-splash-1284-2778.png" />
  
  <!-- iPhone 14 Pro (1179x2556) -->
  <link rel="apple-touch-startup-image"
        media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)"
        href="/splash/apple-splash-1179-2556.png" />
  
  <!-- iPhone 14 Pro Max, 15 Plus, 15 Pro Max (1290x2796) -->
  <link rel="apple-touch-startup-image"
        media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)"
        href="/splash/apple-splash-1290-2796.png" />
  
  <!-- iPhone 15, 15 Pro (1179x2556) -->
  <link rel="apple-touch-startup-image"
        media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)"
        href="/splash/apple-splash-1179-2556.png" />

  <!-- Prevent white flash -->
  <style>
    html, body { background-color: #ffffff; }
  </style>
  
  <!-- Favicon -->
  <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32x32.png" />
  <link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16x16.png" />
  
  <title>Dog Boarding Manager</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>
```

### 3. Service Worker (`public/sw.js`)

```javascript
const CACHE_NAME = 'boarding-app-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

// Install - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip Supabase API calls (always need fresh data)
  if (event.request.url.includes('supabase.co')) return;
  
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone and cache successful responses
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // For navigation requests, return the cached index.html
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});
```

### 4. Service Worker Registration (`src/registerSW.js`)

```javascript
export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('SW registered:', registration);
          
          // Check for updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New version available
                if (confirm('New version available! Reload to update?')) {
                  window.location.reload();
                }
              }
            });
          });
        })
        .catch((error) => {
          console.error('SW registration failed:', error);
        });
    });
  }
}
```

---

## App Icon Design

### Icon Specifications

**Design concept:** Simple paw print or dog silhouette on the app's primary blue (`#3b82f6`) background.

| Icon Type | Sizes Needed | Notes |
|-----------|--------------|-------|
| Standard | 72, 96, 128, 144, 152, 192, 384, 512 | Square with rounded corners |
| Maskable | 192, 512 | Safe zone in center 80%, icon may be cropped to circle/squircle |
| Apple Touch | 152, 167, 180 | iOS specific |
| Favicon | 16, 32, 48 | Browser tab |
| Shortcut icons | 96 | For app shortcuts |

### Icon File Structure

```
public/
├── icons/
│   ├── icon-72x72.png
│   ├── icon-96x96.png
│   ├── icon-128x128.png
│   ├── icon-144x144.png
│   ├── icon-152x152.png
│   ├── icon-167x167.png
│   ├── icon-180x180.png
│   ├── icon-192x192.png
│   ├── icon-384x384.png
│   ├── icon-512x512.png
│   ├── icon-maskable-192x192.png
│   ├── icon-maskable-512x512.png
│   ├── apple-touch-icon.png (180x180)
│   ├── favicon-16x16.png
│   ├── favicon-32x32.png
│   ├── favicon.ico
│   ├── shortcut-calendar.png (96x96)
│   └── shortcut-add.png (96x96)
├── splash/
│   ├── apple-splash-750-1334.png
│   ├── apple-splash-828-1792.png
│   ├── apple-splash-1125-2436.png
│   ├── apple-splash-1242-2208.png
│   ├── apple-splash-1242-2688.png
│   ├── apple-splash-1284-2778.png
│   ├── apple-splash-1179-2556.png
│   └── apple-splash-1290-2796.png
└── screenshots/
    ├── matrix-mobile.png (390x844)
    └── calendar-mobile.png (390x844)
```

### Icon Generation Script

Create icons programmatically using a canvas or SVG:

```javascript
// scripts/generateIcons.js
// Run with: node scripts/generateIcons.js

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const sizes = [72, 96, 128, 144, 152, 167, 180, 192, 384, 512];
const PRIMARY_COLOR = '#3b82f6';
const WHITE = '#ffffff';

function generateIcon(size, maskable = false) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  // Background
  ctx.fillStyle = PRIMARY_COLOR;
  if (maskable) {
    // Full bleed for maskable
    ctx.fillRect(0, 0, size, size);
  } else {
    // Rounded corners for standard
    const radius = size * 0.2;
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, radius);
    ctx.fill();
  }
  
  // Paw print (simplified)
  const centerX = size / 2;
  const centerY = size / 2;
  const scale = size / 100;
  
  ctx.fillStyle = WHITE;
  
  // Main pad
  ctx.beginPath();
  ctx.ellipse(centerX, centerY + 10 * scale, 18 * scale, 15 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  
  // Toe pads
  const toes = [
    { x: -15, y: -10, rx: 8, ry: 10 },
    { x: -5, y: -18, rx: 7, ry: 9 },
    { x: 8, y: -18, rx: 7, ry: 9 },
    { x: 18, y: -10, rx: 8, ry: 10 },
  ];
  
  toes.forEach(toe => {
    ctx.beginPath();
    ctx.ellipse(
      centerX + toe.x * scale,
      centerY + toe.y * scale,
      toe.rx * scale,
      toe.ry * scale,
      0, 0, Math.PI * 2
    );
    ctx.fill();
  });
  
  return canvas.toBuffer('image/png');
}

// Generate all icons
const iconsDir = path.join(__dirname, '../public/icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

sizes.forEach(size => {
  // Standard icon
  const standard = generateIcon(size, false);
  fs.writeFileSync(path.join(iconsDir, `icon-${size}x${size}.png`), standard);
  
  // Maskable icon (only for 192 and 512)
  if (size === 192 || size === 512) {
    const maskable = generateIcon(size, true);
    fs.writeFileSync(path.join(iconsDir, `icon-maskable-${size}x${size}.png`), maskable);
  }
});

// Apple touch icon
const appleTouch = generateIcon(180, false);
fs.writeFileSync(path.join(iconsDir, 'apple-touch-icon.png'), appleTouch);

console.log('Icons generated!');
```

---

## Mobile-First Responsive Design

### Breakpoints

```css
/* Mobile first - base styles are for mobile */

/* Small phones */
@media (max-width: 359px) { }

/* Standard phones (default) */
/* 360px - 413px */

/* Large phones */
@media (min-width: 414px) { }

/* Tablets */
@media (min-width: 768px) { }

/* Desktop */
@media (min-width: 1024px) { }
```

### Tailwind Config for Mobile

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      spacing: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-left': 'env(safe-area-inset-left)',
        'safe-right': 'env(safe-area-inset-right)',
      },
      minHeight: {
        'touch': '44px', // Minimum touch target
      },
      minWidth: {
        'touch': '44px',
      },
    },
  },
};
```

### Safe Area Handling

```css
/* Global safe area styles */
.app-container {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}

/* Fixed bottom navigation */
.bottom-nav {
  padding-bottom: calc(16px + env(safe-area-inset-bottom));
}

/* Fixed header */
.app-header {
  padding-top: calc(12px + env(safe-area-inset-top));
}
```

### Layout Component with Safe Areas

```jsx
// components/Layout.jsx
export default function Layout({ children }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header with safe area */}
      <header 
        className="bg-blue-600 text-white sticky top-0 z-50"
        style={{ paddingTop: 'calc(12px + env(safe-area-inset-top))' }}
      >
        <div className="px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold">Boarding</h1>
          <nav className="flex gap-2">
            {/* Nav items */}
          </nav>
        </div>
      </header>
      
      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
      
      {/* Bottom navigation with safe area */}
      <nav 
        className="bg-white border-t border-gray-200 fixed bottom-0 left-0 right-0"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex justify-around py-2">
          <NavButton icon="calendar" label="Calendar" to="/calendar" />
          <NavButton icon="grid" label="Matrix" to="/" />
          <NavButton icon="dog" label="Dogs" to="/dogs" />
          <NavButton icon="settings" label="Settings" to="/settings" />
        </div>
      </nav>
      
      {/* Spacer for fixed bottom nav */}
      <div style={{ height: 'calc(60px + env(safe-area-inset-bottom))' }} />
    </div>
  );
}
```

---

## Touch Interactions

### Touch Target Sizes

All interactive elements must be at least 44x44px:

```jsx
// Good - adequate touch target
<button className="min-h-[44px] min-w-[44px] px-4 py-2">
  Save
</button>

// Bad - too small
<button className="px-2 py-1 text-sm">
  Save
</button>
```

### Prevent Unwanted Behaviors

```css
/* Prevent text selection on UI elements */
.no-select {
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}

/* Prevent pull-to-refresh on main container */
.app-container {
  overscroll-behavior-y: contain;
}

/* Prevent zoom on input focus (iOS) */
input, select, textarea {
  font-size: 16px; /* Prevents iOS zoom */
}

/* Disable tap highlight */
.tap-transparent {
  -webkit-tap-highlight-color: transparent;
}

/* Smooth scrolling */
.scroll-container {
  -webkit-overflow-scrolling: touch;
  scroll-behavior: smooth;
}
```

### Touch Feedback

```jsx
// Button with touch feedback
<button 
  className="
    bg-blue-600 text-white px-4 py-3 rounded-lg
    min-h-[44px]
    active:bg-blue-700 active:scale-[0.98]
    transition-transform duration-75
    select-none
  "
>
  Save Boarding
</button>
```

### Swipe Gestures (optional enhancement)

```jsx
// hooks/useSwipe.js
import { useState, useRef } from 'react';

export function useSwipe(onSwipeLeft, onSwipeRight, threshold = 50) {
  const touchStart = useRef(null);
  const touchEnd = useRef(null);

  const onTouchStart = (e) => {
    touchEnd.current = null;
    touchStart.current = e.targetTouches[0].clientX;
  };

  const onTouchMove = (e) => {
    touchEnd.current = e.targetTouches[0].clientX;
  };

  const onTouchEnd = () => {
    if (!touchStart.current || !touchEnd.current) return;
    
    const distance = touchStart.current - touchEnd.current;
    const isLeftSwipe = distance > threshold;
    const isRightSwipe = distance < -threshold;
    
    if (isLeftSwipe && onSwipeLeft) onSwipeLeft();
    if (isRightSwipe && onSwipeRight) onSwipeRight();
  };

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  };
}

// Usage in Calendar
function CalendarPage() {
  const swipeHandlers = useSwipe(
    () => nextMonth(),  // Swipe left = next month
    () => prevMonth()   // Swipe right = previous month
  );
  
  return (
    <div {...swipeHandlers}>
      {/* Calendar content */}
    </div>
  );
}
```

---

## Page-Specific Mobile Optimizations

### Boarding Matrix (Mobile View)

The matrix table doesn't fit well on phones. Provide alternative mobile view:

```jsx
// components/MatrixMobileView.jsx
export function MatrixMobileView({ dates, dogs, boardings }) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  return (
    <div className="p-4">
      {/* Horizontal date scroller */}
      <div className="flex overflow-x-auto gap-2 pb-3 -mx-4 px-4 snap-x">
        {dates.map(date => (
          <button
            key={date.toISOString()}
            onClick={() => setSelectedDate(date)}
            className={`
              flex-shrink-0 w-14 py-2 rounded-lg text-center snap-start
              ${isSameDay(date, selectedDate) 
                ? 'bg-blue-600 text-white' 
                : 'bg-white border border-gray-200'
              }
            `}
          >
            <div className="text-xs opacity-75">
              {date.toLocaleDateString('en-US', { weekday: 'short' })}
            </div>
            <div className="text-lg font-semibold">
              {date.getDate()}
            </div>
          </button>
        ))}
      </div>
      
      {/* Dogs list for selected date */}
      <div className="mt-4 space-y-3">
        {getDogsForDate(selectedDate).map(dog => (
          <div 
            key={dog.id}
            className="bg-white rounded-lg p-4 shadow-sm border border-gray-100"
          >
            <div className="flex justify-between items-start">
              <div>
                <div className="font-medium">{dog.name}</div>
                <div className="text-sm text-gray-500">
                  {formatDateRange(dog.arrival, dog.departure)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-500">Tonight</div>
                <div className="font-semibold">${dog.nightRate}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {/* Daily totals */}
      <div className="mt-4 bg-gray-100 rounded-lg p-4">
        <div className="flex justify-between text-sm">
          <span>Dogs overnight:</span>
          <span className="font-medium">{overnightCount}</span>
        </div>
        <div className="flex justify-between text-sm mt-1">
          <span>Gross:</span>
          <span className="font-medium">${grossTotal}</span>
        </div>
        <div className="flex justify-between text-sm mt-1">
          <span>Net (65%):</span>
          <span className="font-semibold text-green-600">${netTotal}</span>
        </div>
      </div>
    </div>
  );
}
```

### Calendar Page (Mobile)

```jsx
// Calendar already works well, but optimize day cells
<div className="grid grid-cols-7">
  {days.map(day => (
    <button
      key={day}
      onClick={() => setSelectedDate(day)}
      className={`
        aspect-square p-1 text-center relative
        min-h-[44px]  /* Touch target */
        ${isSelected ? 'bg-blue-100' : ''}
      `}
    >
      <span className="text-sm">{day}</span>
      {/* Booking indicators as dots on mobile */}
      {bookingCount > 0 && (
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
          {Array(Math.min(bookingCount, 3)).fill(0).map((_, i) => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          ))}
          {bookingCount > 3 && (
            <span className="text-[10px] text-gray-500">+</span>
          )}
        </div>
      )}
    </button>
  ))}
</div>
```

### Dogs Page (Mobile)

```jsx
// Card-based list instead of table
<div className="p-4 space-y-3">
  {dogs.map(dog => (
    <div 
      key={dog.id}
      className="bg-white rounded-xl p-4 shadow-sm border border-gray-100"
    >
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-semibold text-gray-900">{dog.name}</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Day: ${dog.dayRate} · Night: ${dog.nightRate}
          </p>
        </div>
        <button 
          className="p-2 -m-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
          onClick={() => openEditModal(dog)}
        >
          <EditIcon className="w-5 h-5 text-gray-400" />
        </button>
      </div>
      
      {/* Upcoming boardings preview */}
      {dog.upcomingBoardings?.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">
            Upcoming
          </p>
          {dog.upcomingBoardings.slice(0, 2).map(b => (
            <p key={b.id} className="text-sm text-gray-600">
              {formatDateRange(b.arrival, b.departure)}
            </p>
          ))}
        </div>
      )}
    </div>
  ))}
</div>
```

### Forms (Mobile)

```jsx
// Mobile-optimized form
<form className="p-4 space-y-4">
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">
      Dog Name
    </label>
    <input
      type="text"
      className="
        w-full px-4 py-3 
        text-base  /* Prevents iOS zoom */
        border border-gray-300 rounded-lg
        focus:ring-2 focus:ring-blue-500 focus:border-blue-500
      "
      placeholder="Enter dog name"
    />
  </div>
  
  <div className="grid grid-cols-2 gap-4">
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Day Rate
      </label>
      <input
        type="number"
        inputMode="decimal"  /* Numeric keyboard on mobile */
        className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg"
        placeholder="$0"
      />
    </div>
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Night Rate
      </label>
      <input
        type="number"
        inputMode="decimal"
        className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg"
        placeholder="$0"
      />
    </div>
  </div>
  
  <button
    type="submit"
    className="
      w-full py-4 
      bg-blue-600 text-white font-semibold rounded-lg
      active:bg-blue-700 active:scale-[0.99]
      transition-transform
      min-h-[50px]
    "
  >
    Save Dog
  </button>
</form>
```

---

## Bottom Navigation Component

```jsx
// components/BottomNav.jsx
import { NavLink, useLocation } from 'react-router-dom';

const navItems = [
  { to: '/calendar', icon: CalendarIcon, label: 'Calendar' },
  { to: '/', icon: GridIcon, label: 'Matrix' },
  { to: '/dogs', icon: DogIcon, label: 'Dogs' },
  { to: '/settings', icon: SettingsIcon, label: 'Settings' },
];

export function BottomNav() {
  return (
    <nav 
      className="
        fixed bottom-0 left-0 right-0 
        bg-white border-t border-gray-200
        z-50
      "
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex justify-around">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `
              flex flex-col items-center py-2 px-4
              min-h-[50px] min-w-[64px]
              ${isActive ? 'text-blue-600' : 'text-gray-500'}
            `}
          >
            <item.icon className="w-6 h-6" />
            <span className="text-xs mt-1">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
```

---

## Splash Screen / Loading State

```jsx
// components/SplashScreen.jsx
export function SplashScreen() {
  return (
    <div className="fixed inset-0 bg-blue-600 flex items-center justify-center z-50">
      <div className="text-center">
        <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center mb-4 mx-auto shadow-lg">
          <PawIcon className="w-12 h-12 text-blue-600" />
        </div>
        <h1 className="text-white text-xl font-semibold">Boarding</h1>
        <div className="mt-4">
          <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
        </div>
      </div>
    </div>
  );
}

// Usage in App.jsx
function App() {
  const { loading } = useAuth();
  
  if (loading) {
    return <SplashScreen />;
  }
  
  return <AppRoutes />;
}
```

---

## Testing Checklist

### iOS Safari Testing

- [ ] Add to Home Screen works
- [ ] App icon appears correctly on home screen
- [ ] Splash screen shows on launch
- [ ] Status bar blends with header
- [ ] No white flash on load
- [ ] Notch area handled correctly (iPhone X+)
- [ ] Home indicator area has proper spacing
- [ ] Pull-to-refresh disabled or works correctly
- [ ] Text selection disabled on UI elements
- [ ] Input zoom prevented (font-size >= 16px)
- [ ] Swipe back gesture works for navigation
- [ ] Keyboard doesn't push content awkwardly

### Android Chrome Testing

- [ ] Install prompt appears
- [ ] App icon shows correctly (including maskable)
- [ ] Splash screen shows on launch
- [ ] Status bar color matches theme
- [ ] Navigation bar color matches app
- [ ] Back button works correctly
- [ ] App shortcuts work (long-press icon)

### Responsive Testing

Test on these viewport sizes:

| Device | Width | Notes |
|--------|-------|-------|
| iPhone SE | 375px | Smallest common phone |
| iPhone 14 | 390px | Standard size |
| iPhone 14 Pro Max | 430px | Large phone |
| iPad Mini | 768px | Small tablet |
| iPad | 1024px | Standard tablet |

### Visual Checklist

- [ ] No horizontal scrolling on any page
- [ ] All touch targets >= 44px
- [ ] Text readable without zooming
- [ ] Buttons have visible feedback on press
- [ ] Forms usable with thumb
- [ ] Modals/sheets don't overflow viewport
- [ ] Calendar fits without horizontal scroll
- [ ] Matrix has appropriate mobile alternative

---

## Implementation Phases

### Phase 1: Basic PWA Setup
1. Create manifest.json
2. Add meta tags to index.html
3. Register service worker
4. Test "Add to Home Screen" on iPhone
5. **Checkpoint:** App installable, no browser UI when launched

### Phase 2: App Icons
1. Design or generate icon set
2. Create all required sizes
3. Create iOS splash screens
4. Add maskable icons for Android
5. **Checkpoint:** Icons look good on both platforms

### Phase 3: Safe Area Handling
1. Add CSS variables for safe areas
2. Update header with top safe area
3. Add bottom nav with bottom safe area
4. Test on iPhone X+ and Android with gesture nav
5. **Checkpoint:** No content hidden by notch or home indicator

### Phase 4: Touch Optimization
1. Audit all touch targets (>= 44px)
2. Add active states to buttons
3. Prevent unwanted behaviors (select, zoom, callout)
4. Add swipe gestures to calendar
5. **Checkpoint:** App feels native to tap and swipe

### Phase 5: Mobile Layouts
1. Create mobile matrix view
2. Optimize calendar for small screens
3. Convert tables to card layouts
4. Optimize forms for mobile input
5. **Checkpoint:** All pages work well at 375px width

### Phase 6: Performance & Polish
1. Add splash/loading screen
2. Optimize images and assets
3. Test service worker caching
4. Add page transitions
5. **Checkpoint:** App loads fast, feels smooth

### Phase 7: Final Testing
1. Test on real iPhone (multiple models)
2. Test on real Android device
3. Run through full testing checklist
4. Fix any issues found
5. **Checkpoint:** Production-ready PWA

---

## Prompt for Claude Code

> "Make this app a production-ready PWA. Here's my spec: [paste or reference this file].
>
> Start with Phase 1: Add manifest.json, meta tags, and service worker registration. I want to test 'Add to Home Screen' on my iPhone before we continue.
>
> Use these brand colors:
> - Primary: #3b82f6 (blue-500)
> - Background: #ffffff
> 
> Generate a simple paw print icon for the app."

After Phase 1 works, continue phase by phase, testing on your actual phone at each checkpoint.

---

## Quick Reference: Testing on iPhone

1. Open Safari on your iPhone
2. Navigate to your app (localhost won't work - need deployed URL or use ngrok)
3. Tap the Share button (square with arrow)
4. Scroll down, tap "Add to Home Screen"
5. Name it and tap "Add"
6. Open from home screen - should launch without Safari UI

**For local testing with ngrok:**
```bash
# In one terminal
npm run dev

# In another terminal
ngrok http 5173
```

This gives you a public URL you can open on your phone.
