# Dog Boarding Calendar Page - Detailed Specification

## Overview

Create a visual calendar page that displays dog boarding reservations as horizontal bars spanning their stay duration. This provides an at-a-glance view of occupancy, upcoming arrivals/departures, and scheduling density.

## Data Structure

The calendar will display data from the `boardings` table:

```typescript
interface Boarding {
  id: string;
  dog_name: string;
  arrival_datetime: string;   // ISO 8601 with timezone
  departure_datetime: string; // ISO 8601 with timezone
  created_at: string;
}
```

**Note:** If you have a separate `dogs` table with rates, the calendar can optionally join that data to show rates on hover or in the detail panel.

---

## Page Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  Header: "Boarding Calendar"                    [Nav to other pages] │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  [< Prev]  [Today]  [Next >]       January 2026             │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Sun    Mon    Tue    Wed    Thu    Fri    Sat              │    │
│  ├─────────────────────────────────────────────────────────────┤    │
│  │                      1      2      3      4                 │    │
│  │               ┌──────────────────────────┐                  │    │
│  │               │ captain                  │                  │    │
│  │               └──────────────────────────┘                  │    │
│  │               ┌─────────────────────────────────────────┐   │    │
│  │               │ john mclain                             │   │    │
│  │               └─────────────────────────────────────────┘   │    │
│  ├─────────────────────────────────────────────────────────────┤    │
│  │   5      6      7      8      9      10     11              │    │
│  │                      ┌─────────┐                            │    │
│  │                      │ lilly   │                            │    │
│  │                      └─────────┘                            │    │
│  │                             ┌──────────────┐                │    │
│  │                             │ hank         │                │    │
│  │                             └──────────────┘                │    │
│  │  ... more rows ...                                          │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Selected Day Detail Panel (appears when day is clicked)    │    │
│  │                                                              │    │
│  │  January 9, 2026                                            │    │
│  │  ─────────────────                                          │    │
│  │  🐕 hank      Arrives: 2:00 PM   Departs: Jan 11, 9:00 AM   │    │
│  │  🐕 freddy    Arrives: 2:00 PM   Departs: Jan 11, 9:00 AM   │    │
│  │  🐕 millie    Arrives: 2:00 PM   Departs: Jan 11, 9:00 AM   │    │
│  │                                                              │    │
│  │  [Close]                                                     │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Component Breakdown

### 1. CalendarPage (container)

**Responsibilities:**
- Fetch boarding data from Supabase
- Manage current month state
- Handle day selection state
- Pass data to child components

**State:**
```javascript
const [currentMonth, setCurrentMonth] = useState(new Date());
const [selectedDate, setSelectedDate] = useState(null);
const [boardings, setBoardings] = useState([]);
const [loading, setLoading] = useState(true);
```

### 2. CalendarHeader

**Props:** `currentMonth`, `onPrevMonth`, `onNextMonth`, `onToday`

**Elements:**
- Previous month button (←)
- "Today" button
- Next month button (→)
- Current month/year display (e.g., "January 2026")

**Behavior:**
- Clicking Today jumps to current month and optionally highlights today's date
- Month transitions should feel snappy (no heavy animations needed)

### 3. CalendarGrid

**Props:** `currentMonth`, `boardings`, `selectedDate`, `onSelectDate`

**Structure:**
- Header row: Day names (Sun–Sat or Mon–Sun based on locale)
- 5-6 week rows depending on month
- Each cell represents one day

**Rendering logic:**
```
For each week row:
  For each day in week:
    - Render day number
    - Render booking bars that START on this day
    - Render continuation indicators for bookings that span INTO this day
```

### 4. BookingBar

**Props:** `booking`, `startDay`, `endDay`, `color`, `rowIndex`

**Visual:**
- Horizontal bar spanning from start day to end day
- Dog name displayed inside (truncated with ellipsis if too long)
- Rounded corners on both ends
- Subtle shadow for depth
- Color based on dog name (consistent hash-to-color mapping)

**Positioning:**
- Bars that overlap on the same days stack vertically
- Each bar has a `rowIndex` to determine vertical position within the day cell
- Max visible rows per day: 3-4, then show "+N more" indicator

### 5. DayCell

**Props:** `date`, `isToday`, `isWeekend`, `isCurrentMonth`, `bookings`, `isSelected`, `onClick`

**Visual states:**
- Normal day: white/light background
- Weekend: slightly gray background
- Today: blue border or highlight
- Selected: darker border, subtle fill
- Outside current month: faded/muted appearance

**Click behavior:**
- Clicking a day selects it and opens the detail panel
- Clicking again (or clicking X) deselects

### 6. DayDetailPanel

**Props:** `date`, `boardings`, `onClose`

**Content:**
- Full date header (e.g., "Thursday, January 9, 2026")
- List of all dogs with activity on that day:
  - Dog name
  - Arrival time (if arriving on this day)
  - Departure time (if departing on this day)
  - Status: "Arriving", "Departing", "Staying" (if mid-stay)
- Close button

**Optional enhancements:**
- Show night rate if dogs table is joined
- Quick link to edit the boarding
- Show total dogs staying overnight

---

## Color System for Dogs

Generate consistent colors from dog names so the same dog always has the same color:

```javascript
// Hash string to number
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash;
}

// Generate HSL color from hash
function stringToColor(str) {
  const hash = hashString(str.toLowerCase());
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 65%, 55%)`; // Consistent saturation/lightness
}

// Generate lighter version for bar background
function stringToLightColor(str) {
  const hash = hashString(str.toLowerCase());
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 70%, 90%)`; // Light background
}
```

**Color palette considerations:**
- Ensure sufficient contrast for text readability
- Light background with darker text
- Border in the saturated color
- Consider colorblind-friendly palette as enhancement

---

## Data Fetching

### Query for calendar view

```javascript
// Fetch boardings that overlap with the displayed month
async function fetchBoardingsForMonth(year, month) {
  const startOfMonth = new Date(year, month, 1);
  const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59);
  
  const { data, error } = await supabase
    .from('boardings')
    .select('*')
    .or(`arrival_datetime.lte.${endOfMonth.toISOString()},departure_datetime.gte.${startOfMonth.toISOString()}`)
    .gte('departure_datetime', startOfMonth.toISOString())
    .lte('arrival_datetime', endOfMonth.toISOString());
    
  // Actually, simpler approach - get all boardings that have ANY overlap:
  // A boarding overlaps with the month if:
  //   arrival <= end_of_month AND departure >= start_of_month
  
  return data;
}
```

**Better query approach:**

```javascript
async function fetchBoardingsForMonth(year, month) {
  const startOfMonth = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const endOfMonth = new Date(year, month + 1, 0).toISOString().split('T')[0];
  
  const { data, error } = await supabase
    .from('boardings')
    .select('*')
    .lte('arrival_datetime', `${endOfMonth}T23:59:59`)
    .gte('departure_datetime', `${startOfMonth}T00:00:00`);
  
  if (error) throw error;
  return data;
}
```

### Processing data for display

```javascript
function processBookingsForCalendar(boardings, currentMonth) {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  
  return boardings.map(booking => {
    const arrival = new Date(booking.arrival_datetime);
    const departure = new Date(booking.departure_datetime);
    
    // Clamp to current month for display purposes
    const displayStart = arrival < new Date(year, month, 1) 
      ? new Date(year, month, 1) 
      : arrival;
    const displayEnd = departure > new Date(year, month + 1, 0)
      ? new Date(year, month + 1, 0)
      : departure;
    
    return {
      ...booking,
      displayStartDate: displayStart.getDate(),
      displayEndDate: displayEnd.getDate(),
      continuesFromPrevMonth: arrival < new Date(year, month, 1),
      continuesIntoNextMonth: departure > new Date(year, month + 1, 0),
      color: stringToColor(booking.dog_name),
      lightColor: stringToLightColor(booking.dog_name),
    };
  });
}
```

---

## Booking Bar Positioning Algorithm

The trickiest part is positioning bars that span multiple weeks and handling overlaps.

### Approach 1: Row-based stacking (simpler)

Each day tracks which "row slots" are occupied. Bars claim rows.

```javascript
function calculateBarPositions(bookings, daysInMonth) {
  // Track occupied rows per day
  const daySlots = {};
  for (let d = 1; d <= daysInMonth; d++) {
    daySlots[d] = []; // Array of booking IDs occupying each row
  }
  
  // Sort bookings by start date, then by length (longer first)
  const sorted = [...bookings].sort((a, b) => {
    if (a.displayStartDate !== b.displayStartDate) {
      return a.displayStartDate - b.displayStartDate;
    }
    return (b.displayEndDate - b.displayStartDate) - (a.displayEndDate - a.displayStartDate);
  });
  
  return sorted.map(booking => {
    // Find first row that's free for ALL days of this booking
    let row = 0;
    while (true) {
      let rowFree = true;
      for (let d = booking.displayStartDate; d <= booking.displayEndDate; d++) {
        if (daySlots[d][row]) {
          rowFree = false;
          break;
        }
      }
      if (rowFree) break;
      row++;
    }
    
    // Claim this row for all days
    for (let d = booking.displayStartDate; d <= booking.displayEndDate; d++) {
      daySlots[d][row] = booking.id;
    }
    
    return { ...booking, row };
  });
}
```

### Approach 2: Week-based rendering (handles multi-week spans)

For bookings that span multiple weeks, split them into segments per week row.

```javascript
function splitBookingByWeek(booking, weeksInMonth) {
  const segments = [];
  
  for (const week of weeksInMonth) {
    const weekStart = week.startDate;
    const weekEnd = week.endDate;
    
    // Check if booking overlaps this week
    if (booking.displayStartDate <= weekEnd && booking.displayEndDate >= weekStart) {
      segments.push({
        ...booking,
        weekIndex: week.index,
        segmentStart: Math.max(booking.displayStartDate, weekStart),
        segmentEnd: Math.min(booking.displayEndDate, weekEnd),
        isStart: booking.displayStartDate >= weekStart,
        isEnd: booking.displayEndDate <= weekEnd,
      });
    }
  }
  
  return segments;
}
```

---

## Visual Design Specifications

### Colors

```css
/* Base colors */
--calendar-bg: #ffffff;
--calendar-border: #e5e7eb;
--day-hover: #f9fafb;
--day-selected: #eff6ff;
--day-today-border: #3b82f6;
--weekend-bg: #f9fafb;
--outside-month-text: #9ca3af;
--text-primary: #111827;
--text-secondary: #6b7280;

/* Booking bar defaults */
--bar-border-radius: 4px;
--bar-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
--bar-height: 22px;
--bar-gap: 2px;
```

### Typography

```css
/* Calendar header */
.month-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
}

/* Day number */
.day-number {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-secondary);
}

/* Booking bar text */
.bar-text {
  font-size: 0.75rem;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

### Spacing

```css
/* Calendar grid */
.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 1px;
  background: var(--calendar-border);
  border: 1px solid var(--calendar-border);
  border-radius: 8px;
  overflow: hidden;
}

/* Day cell */
.day-cell {
  min-height: 100px;
  padding: 4px;
  background: var(--calendar-bg);
}

/* Day number positioning */
.day-number {
  text-align: right;
  padding: 2px 4px;
}

/* Booking bars container */
.bars-container {
  display: flex;
  flex-direction: column;
  gap: var(--bar-gap);
  margin-top: 2px;
}
```

### Booking Bar Styling

```css
.booking-bar {
  height: var(--bar-height);
  border-radius: var(--bar-border-radius);
  padding: 2px 6px;
  display: flex;
  align-items: center;
  box-shadow: var(--bar-shadow);
  cursor: pointer;
  transition: transform 0.1s, box-shadow 0.1s;
}

.booking-bar:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

/* Bar that starts on this day */
.booking-bar.starts-here {
  border-top-left-radius: var(--bar-border-radius);
  border-bottom-left-radius: var(--bar-border-radius);
  margin-left: 0;
}

/* Bar that ends on this day */
.booking-bar.ends-here {
  border-top-right-radius: var(--bar-border-radius);
  border-bottom-right-radius: var(--bar-border-radius);
  margin-right: 0;
}

/* Bar that continues from/to adjacent days */
.booking-bar.continues-left {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  margin-left: -1px;
}

.booking-bar.continues-right {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
  margin-right: -1px;
}
```

---

## Interaction States

### Day Cell States

| State | Visual Treatment |
|-------|------------------|
| Default | White background |
| Weekend | Light gray background (`#f9fafb`) |
| Today | Blue left border (3px solid `#3b82f6`) |
| Hover | Slightly darker background (`#f3f4f6`) |
| Selected | Light blue background (`#eff6ff`), darker border |
| Outside month | Muted text color, slightly transparent |

### Booking Bar States

| State | Visual Treatment |
|-------|------------------|
| Default | Dog's assigned color (light fill, darker border) |
| Hover | Slight lift (translateY), increased shadow |
| Clicked | Opens day detail panel with this booking highlighted |

### Navigation Button States

| State | Visual Treatment |
|-------|------------------|
| Default | Light gray background, dark text |
| Hover | Darker background |
| Active/pressed | Even darker, slight inset shadow |
| Disabled | Faded, cursor not-allowed (optional: limit how far back/forward) |

---

## Day Detail Panel

### Content Structure

```
┌────────────────────────────────────────────────────────┐
│  Thursday, January 9, 2026                     [X]     │
├────────────────────────────────────────────────────────┤
│                                                        │
│  ARRIVING TODAY (2)                                    │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 🟢 hank         2:00 PM → Jan 11, 9:00 AM       │  │
│  │    Night rate: $45                               │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 🟢 freddy       2:00 PM → Jan 11, 9:00 AM       │  │
│  │    Night rate: $45                               │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  STAYING (3)                                           │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 🔵 lilly        Since Dec 28 → Jan 6, 9:00 AM   │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 🔵 captain      Since Jan 2 → Jan 5, 9:00 AM    │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  DEPARTING TODAY (1)                                   │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 🔴 buddy d      Dec 31, 2:00 PM → 10:00 AM      │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  ─────────────────────────────────────────────────     │
│  Tonight: 4 dogs staying • Gross: $180 • Net: $117    │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### Status Logic

```javascript
function getBookingStatus(booking, selectedDate) {
  const arrival = new Date(booking.arrival_datetime);
  const departure = new Date(booking.departure_datetime);
  const selected = new Date(selectedDate);
  
  // Normalize to date only (ignore time for date comparison)
  const arrivalDate = arrival.toDateString();
  const departureDate = departure.toDateString();
  const selectedDateStr = selected.toDateString();
  
  if (arrivalDate === selectedDateStr) {
    return 'arriving';
  } else if (departureDate === selectedDateStr) {
    return 'departing';
  } else {
    return 'staying';
  }
}
```

### Panel Positioning

- **Desktop:** Slide-in panel from right side, or modal overlay
- **Mobile:** Full-screen modal or bottom sheet
- **Alternative:** Inline expansion below the calendar

---

## Responsive Design

### Breakpoints

| Breakpoint | Behavior |
|------------|----------|
| Desktop (≥1024px) | Full calendar grid, detail panel as sidebar |
| Tablet (768-1023px) | Full calendar grid, detail panel as modal |
| Mobile (<768px) | Simplified view: list mode or compressed grid, detail as bottom sheet |

### Mobile Considerations

On small screens, the full calendar grid may not fit well. Options:

1. **Horizontal scroll:** Allow horizontal scrolling on the grid
2. **List view toggle:** Switch to a chronological list of bookings
3. **Week view:** Show only one week at a time
4. **Compressed bars:** Show dots/indicators instead of full bars

Recommendation: Start with horizontal scroll, add list view toggle as enhancement.

```jsx
// List view for mobile
function BookingListView({ boardings, currentMonth }) {
  const sorted = [...boardings].sort(
    (a, b) => new Date(a.arrival_datetime) - new Date(b.arrival_datetime)
  );
  
  return (
    <div className="booking-list">
      {sorted.map(booking => (
        <div key={booking.id} className="booking-list-item">
          <div 
            className="color-dot" 
            style={{ background: stringToColor(booking.dog_name) }} 
          />
          <div className="booking-info">
            <div className="dog-name">{booking.dog_name}</div>
            <div className="dates">
              {formatDate(booking.arrival_datetime)} → {formatDate(booking.departure_datetime)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
```

---

## Edge Cases to Handle

| Edge Case | Handling |
|-----------|----------|
| Booking spans entire month | Show continuous bar, mark as "continues from/to" |
| Booking starts before month, ends in month | Start bar at day 1 with left arrow/fade indicator |
| Booking starts in month, ends after | End bar at last day with right arrow/fade indicator |
| 10+ overlapping bookings on one day | Show first 3-4 bars, then "+N more" indicator |
| Same dog booked twice (overlapping) | Show both bars (data issue, but handle gracefully) |
| Single-day boarding (arrive and depart same day) | Show as short bar on that day |
| No bookings in month | Show empty calendar with "No boardings this month" message |
| Loading state | Show skeleton/shimmer animation on calendar |
| Error fetching data | Show error message with retry button |

---

## File Structure

```
src/
├── pages/
│   └── CalendarPage.jsx
├── components/
│   └── calendar/
│       ├── CalendarHeader.jsx
│       ├── CalendarGrid.jsx
│       ├── WeekRow.jsx
│       ├── DayCell.jsx
│       ├── BookingBar.jsx
│       ├── DayDetailPanel.jsx
│       ├── BookingListView.jsx      # Mobile alternative
│       └── CalendarSkeleton.jsx     # Loading state
├── hooks/
│   └── useCalendarBookings.js       # Data fetching hook
├── utils/
│   ├── calendarUtils.js             # Date helpers, week generation
│   ├── colorUtils.js                # String-to-color functions
│   └── bookingPositioning.js        # Bar stacking algorithm
└── styles/
    └── calendar.css                 # Calendar-specific styles (if not using Tailwind)
```

---

## Implementation Phases

### Phase 1: Basic Calendar Grid
1. Create CalendarPage with month state
2. Create CalendarHeader with navigation
3. Create CalendarGrid with day cells
4. Style the basic grid layout
5. **Checkpoint:** Can navigate months, see day numbers

### Phase 2: Data Fetching
1. Create useCalendarBookings hook
2. Fetch bookings for current month from Supabase
3. Handle loading and error states
4. **Checkpoint:** Console.log shows correct bookings for displayed month

### Phase 3: Booking Bars
1. Create BookingBar component
2. Implement color-from-name utility
3. Render bars on their start day
4. **Checkpoint:** Bars appear on correct days with dog names

### Phase 4: Multi-day Spanning
1. Implement bar spanning across days within a week
2. Handle bars that span multiple weeks (split into segments)
3. Style continuation indicators (no rounded corners on continuing sides)
4. **Checkpoint:** Multi-day bookings render correctly across weeks

### Phase 5: Overlap Handling
1. Implement stacking algorithm
2. Assign row positions to overlapping bars
3. Add "+N more" indicator for overcrowded days
4. **Checkpoint:** Overlapping bookings stack vertically

### Phase 6: Day Selection & Detail Panel
1. Add click handler to day cells
2. Create DayDetailPanel component
3. Show arriving/staying/departing status
4. Calculate overnight totals (gross/net)
5. **Checkpoint:** Clicking a day shows correct details

### Phase 7: Polish & Responsive
1. Add hover states and transitions
2. Implement mobile list view or horizontal scroll
3. Add keyboard navigation (optional)
4. Test on various screen sizes
5. **Checkpoint:** Looks good and works on desktop and mobile

---

## Testing Checklist

### Functional Tests
- [ ] Calendar shows correct days for each month
- [ ] Navigation buttons change month correctly
- [ ] "Today" button returns to current month
- [ ] Bookings appear on correct start dates
- [ ] Multi-day bookings span correct number of days
- [ ] Bookings crossing month boundaries show correctly
- [ ] Overlapping bookings stack without overlap
- [ ] Day click shows correct detail panel
- [ ] Detail panel shows correct arriving/staying/departing dogs
- [ ] Gross/net calculations are correct in detail panel
- [ ] Colors are consistent for each dog name

### Visual Tests
- [ ] Weekend days have different background
- [ ] Today is highlighted
- [ ] Selected day is visually distinct
- [ ] Booking bars have correct colors per dog
- [ ] Text is readable on all bar colors
- [ ] Hover states work on bars and days
- [ ] Loading skeleton displays during fetch
- [ ] Error state displays with retry option

### Edge Case Tests
- [ ] Empty month displays correctly
- [ ] Single-day booking displays correctly
- [ ] Booking spanning entire month displays correctly
- [ ] 10+ overlapping bookings shows "+N more"
- [ ] February (28/29 days) renders correctly
- [ ] Month starting on Saturday renders correctly
- [ ] Month ending on Sunday renders correctly

---

## Prompt for Claude Code

> "Create a calendar page for the dog boarding app that visualizes bookings. Here's the detailed spec: [paste this file or reference it].
>
> Start with Phase 1: Create the basic calendar grid with month navigation. Use Tailwind for styling. Show me the components before we add data fetching."

After each phase, test in the browser before continuing to the next phase.
