# Event Orchestrator Dashboard - Testing Checklist

## Overview
Systematic testing plan for the consolidated Mastermind Command Center following completion of Phases 1-3.

---

## TEST 1: Day of Timeline Live Functionality

### Setup
1. Open the Dashboard
2. Click "Manage Event" on any event card
3. Navigate to the **"Day of Timeline"** tab

### Test 1.1: Task Display & Auto-Sorting
- [ ] **Expected**: Tasks are displayed in two columns (Staff Tasks | Client Actions)
- [ ] **Expected**: Tasks are sorted chronologically by time
- [ ] **Expected**: Each task shows: Time, Title, Vendor Name (if assigned), Color coding (if assigned)
- [ ] **Expected**: Status indicators are visible and correct

### Test 1.2: Live Status Updates
- [ ] **Expected**: Current time displays at the top and updates
- [ ] **Test**: Check if tasks show correct status based on current time:
  - **Completed** ✓ - Tasks from the past (>5 min ago)
  - **In Progress** 🟢 (pulsing green) - Tasks happening now (within 5 min)
  - **Upcoming** 🟡 (yellow) - Tasks coming up (within 15 min)
  - **Pending** ⚪ (gray) - Tasks in the future (>15 min away)

### Test 1.3: Add New Task
1. Click **"Add Task"** button
2. Fill in:
   - Time: `14:30`
   - Title: `Test Photography Session`
   - Type: Select "Staff Task"
   - Vendor Name: `Photography Team`
   - Color: `#EF4444` (red)
3. Click **"Add Task"**

- [ ] **Expected**: Modal closes
- [ ] **Expected**: New task appears in Staff Tasks column
- [ ] **Expected**: Tasks re-sort chronologically
- [ ] **Expected**: Task displays with red color and vendor name

### Test 1.4: Edit Task
1. Hover over any existing task
2. Click the **Edit** icon (✏️)
3. Change the time to a different value
4. Click **"Update Task"**

- [ ] **Expected**: Task updates with new time
- [ ] **Expected**: Tasks re-sort to new chronological position
- [ ] **Expected**: All other task details remain intact

### Test 1.5: Toggle Task Completion (Staff Tasks Only)
1. Find a task in the **Staff Tasks** column
2. Click the checkbox next to the task

- [ ] **Expected**: Task shows checkmark
- [ ] **Expected**: Text becomes gray and strikethrough
- [ ] **Expected**: Click again to un-complete

### Test 1.6: Delete Task
1. Hover over any task
2. Click the **Trash** icon (🗑️)
3. Confirm deletion

- [ ] **Expected**: Confirmation dialog appears
- [ ] **Expected**: Task is removed from timeline

### Test 1.7: Vendor Color Coding
- [ ] **Expected**: Tasks with assigned colors display titles in that color
- [ ] **Expected**: Completed tasks override color with gray
- [ ] **Expected**: Tasks from same vendor use same color for visual grouping

### Test 1.8: Layout & Responsiveness
- [ ] **Expected**: Timeline fits within modal without cutting off
- [ ] **Expected**: Header and Status Legend remain visible
- [ ] **Expected**: Middle section scrolls independently
- [ ] **Expected**: Center divider line separates Staff | Client columns

---

## TEST 2: Mastermind Override Controls

### Test 2.1: Timeline Override Tab
1. In EventActionsModal, click **"Timeline Override"** tab
2. Verify the Mastermind Override Panel displays

- [ ] **Expected**: Shows timeline override controls
- [ ] **Expected**: Can modify event timeline with God-mode access
- [ ] **Expected**: Override actions work instantly

### Test 2.2: Vendor Mastermind Override
1. From Dashboard, navigate to **Vendors** page
2. Click on any vendor card to open VendorManagementModal
3. Click **"Mastermind Override"** tab at the top

#### Test Actions:
- [ ] **Force Vendor Reassignment**: Change vendor assignment for an event
- [ ] **Override Payment Terms**: Modify payment schedule/terms
- [ ] **Emergency Contact Override**: Update vendor contact instantly
- [ ] **Vendor Status Override**: Change vendor status (Active/Suspended)

- [ ] **Expected**: All actions execute immediately (God-mode)
- [ ] **Expected**: No confirmation dialogs (Mastermind has full authority)
- [ ] **Expected**: Changes reflect across the system

### Test 2.3: Finances Mastermind Override Mode
1. Navigate to **Finances** page
2. Look for **"Mastermind Override Mode"** toggle in top-right
3. Enable Override Mode

- [ ] **Expected**: Interface changes to indicate Override Mode active
- [ ] **Expected**: "Instant Approve" buttons appear on pending transactions

#### Test Override Actions:
1. Click **"Instant Approve"** on a pending expense
   - [ ] **Expected**: Expense approves immediately
   - [ ] **Expected**: No confirmation dialog
   - [ ] **Expected**: Budget updates instantly

2. Try to override a budget limit
   - [ ] **Expected**: Warning appears but allows override
   - [ ] **Expected**: Changes save with "Mastermind Override" notation

3. Bulk approve multiple items
   - [ ] **Expected**: All selected items approve at once

### Test 2.4: Quick Actions Panel
1. In EventActionsModal, click **"Quick Actions"** tab
2. Test the following:

- [ ] **Duplicate Event**: Creates exact copy
- [ ] **Archive Event**: Moves event to archived status
- [ ] **Delete Event**: Removes event (with confirmation)
- [ ] **Expected**: All actions execute from this central panel

---

## TEST 3: End-to-End Workflows

### Workflow 3.1: Create New Event → Day of Timeline → Vendor Assignment
1. **Create Event**:
   - Go to Dashboard
   - Click "+ New Event" or use any creation method
   - Fill in event details (Name, Date, Type, Budget)
   - Save event

2. **Access Day of Timeline**:
   - Click "Manage Event" on the newly created event
   - Navigate to "Day of Timeline" tab

3. **Add Timeline Tasks**:
   - Add 3-5 tasks spanning different times
   - Assign vendors to some tasks
   - Use color coding for visual grouping

4. **Verify Integration**:
   - [ ] **Expected**: Event appears in Dashboard
   - [ ] **Expected**: Timeline tasks save and display correctly
   - [ ] **Expected**: Vendor assignments link properly

### Workflow 3.2: Client Management Flow
1. **Access Client Tab**:
   - Open any event's EventActionsModal
   - Click "Client Management" tab

2. **Create New Client**:
   - Click "Create New Client"
   - Fill in: Name, Email, Phone, Company
   - Click "Save Client"

3. **Create Client Portal Account**:
   - Click "Create Client Account"
   - Note the generated password
   - Click "Create Account"

4. **Test Client Association**:
   - [ ] **Expected**: Client is now associated with the event
   - [ ] **Expected**: Client details display in Event Details tab
   - [ ] **Expected**: Client account is created successfully

### Workflow 3.3: Complete Event Management Cycle
1. **Create Event** (Wedding, $50,000 budget, 3 months out)
2. **Assign Client** (Create or select existing)
3. **Add Vendors** (Go to Vendors page, assign to event)
4. **Create Day of Timeline** (Add 10+ tasks across 8-hour period)
5. **Set Budget Items** (Go to Finances, add expenses)
6. **Use Mastermind Override** (Approve expenses instantly)
7. **Verify Everything**:
   - [ ] Event shows correct budget vs actual
   - [ ] Timeline displays all tasks chronologically
   - [ ] Vendors are properly linked
   - [ ] Client can (theoretically) access portal

### Workflow 3.4: Impersonation & Portal Views
1. From Dashboard, find "Impersonate Portal View" option
2. Test impersonation:
   - [ ] **Client Portal View**: See what client sees
   - [ ] **Vendor Portal View**: See what vendor sees
   - [ ] **Expected**: View switches without losing admin access
   - [ ] **Expected**: Can switch back to Mastermind view

---

## TEST 4: Data Consistency & Integration

### Test 4.1: Cross-Page Data Sync
1. Update an event name in EventActionsModal
2. Close modal
3. Check if event name updated on:
   - [ ] Dashboard event card
   - [ ] Events page (if exists)
   - [ ] Any other references

### Test 4.2: Vendor-Event Linking
1. Assign a vendor to an event
2. Check if vendor appears in:
   - [ ] Event's vendor list
   - [ ] Vendor's event assignments (on Vendors page)
   - [ ] Day of Timeline vendor dropdowns

### Test 4.3: Budget Calculations
1. Go to Finances page
2. Add several expenses to an event
3. Verify:
   - [ ] Total calculates correctly
   - [ ] Budget vs Actual displays accurately
   - [ ] Approved vs Pending segregates properly

---

## TEST 5: UI/UX & Performance

### Test 5.1: Modal Behavior
- [ ] EventActionsModal opens smoothly
- [ ] All tabs switch without lag
- [ ] Modal scrolling works (doesn't cut off content)
- [ ] Close button works from all tabs
- [ ] Clicking outside modal closes it

### Test 5.2: Tab Navigation (Excel-like Interface)
- [ ] All tabs visible and accessible
- [ ] Active tab indicated clearly
- [ ] Tab content loads instantly
- [ ] No flickering or layout shifts

### Test 5.3: Mobile Responsiveness (if applicable)
- [ ] Dashboard displays well on mobile
- [ ] Modals are usable on smaller screens
- [ ] Tab navigation works (horizontal scroll if needed)

### Test 5.4: Load Time
- [ ] Dashboard loads in < 2 seconds (per requirement)
- [ ] Event modal opens instantly
- [ ] Tab switches are instantaneous
- [ ] No loading spinners or delays

---

## TEST 6: Known Issues & Edge Cases

### Test 6.1: Duplicate Controls Check
Look for any duplicate functionality:
- [ ] Are there multiple places to approve finances?
- [ ] Are there redundant vendor management controls?
- [ ] Are there overlapping timeline features?

**Document any duplicates found:**
- Location 1: _______________
- Location 2: _______________

### Test 6.2: Error Handling
1. Try to create task without required fields
   - [ ] **Expected**: Validation prevents submission
   - [ ] **Expected**: Clear error message shown

2. Try to delete event with dependencies
   - [ ] **Expected**: Warning shown
   - [ ] **Expected**: Asks for confirmation

### Test 6.3: Edge Cases
- [ ] Add task with time in the past
- [ ] Add task with very long title (100+ characters)
- [ ] Create event with $0 budget
- [ ] Assign 10+ vendors to single event

---

## RESULTS & ISSUES FOUND

### Critical Issues (Blocks Functionality)
_List any critical bugs found during testing_

---

### Medium Issues (Usability Problems)
_List any medium-priority issues_

---

### Minor Issues (Polish & Refinement)
_List any minor issues or suggestions_

---

### Features Working Perfectly ✅
_List what's working great_

---

## NEXT STEPS

Based on testing results:
- [ ] Fix all critical issues
- [ ] Address medium issues
- [ ] Consider minor improvements
- [ ] Proceed to Phase 4 (Timeline consolidation) once stable

---

**Tester**: _________________  
**Date**: _________________  
**Environment**: Development  
**Browser**: _________________
