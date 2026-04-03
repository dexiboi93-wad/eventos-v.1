# ✅ Frontend Verification Checklist

Use this checklist to verify all errors are fixed and features are working.

---

## 🧪 **Pre-Flight Check**

### **1. Start Dev Server**
```bash
npm run dev
```

**Expected:** Server starts without errors

---

## 🖥️ **Browser Tests**

### **2. Open Console**
1. Open browser DevTools (F12)
2. Go to Console tab
3. **Expected:** No red errors, only info logs

**Look for:**
- ✅ `[Fetch Fallback] Global error suppression initialized`
- ✅ `[MastermindContext] Backend not available - using local state only`
- ✅ No `TypeError: Failed to fetch` errors

---

### **3. Test Authentication**
1. Navigate to `/login`
2. **Expected:** Login page loads without errors
3. Try "Continue with Google" button
4. **Expected:** If backend not deployed, nothing happens (graceful degradation)

**Note:** Full OAuth requires backend deployment

---

### **4. Test Dashboard**
1. Navigate to `/`
2. **Expected:** Dashboard loads with welcome screen
3. **Verify:**
   - ✅ Crown logo visible
   - ✅ No console errors
   - ✅ Navigation sidebar works

---

### **5. Test Event Creation**
1. Click "Events" in sidebar
2. Click "+ New Event" button
3. Fill out form:
   - Event Name: "Test Wedding"
   - Date: Pick any future date
   - Type: "Wedding"
   - Budget: "$50,000"
4. Click "Create Event"

**Expected:**
- ✅ Event appears in list
- ✅ No fetch errors
- ✅ Event stored in local state

---

### **6. Test Venue Management**
1. Click "Venues" in sidebar
2. Click "+ Add Venue" button
3. Fill out form:
   - Name: "Grand Ballroom"
   - Address: "123 Main St"
   - Capacity: "200"
   - Contact: "John Doe"
4. Check "Private Venue" checkbox
5. Link to an event
6. Save

**Expected:**
- ✅ Venue appears in roster
- ✅ Private venue badge visible
- ✅ No console errors

---

### **7. Test Vendor Roster**
1. Click "Vendors" in sidebar
2. Click "+ Add Vendor" button
3. Fill out form:
   - Name: "Elegant Catering"
   - Category: "Catering"
   - Email: "contact@elegant.com"
4. Save

**Expected:**
- ✅ Vendor appears in roster
- ✅ Can assign to events
- ✅ No errors

---

### **8. Test Client CRM**
1. Click "CRM" in sidebar
2. Click "+ Add Client" button
3. Fill out form:
   - Name: "Jane Smith"
   - Email: "jane@example.com"
   - Status: "Lead"
4. Save

**Expected:**
- ✅ Client appears in list
- ✅ Can view activity trail
- ✅ No errors

---

### **9. Test Guest List**
1. Create an event (if not already done)
2. Navigate to event detail page
3. Click "Guests" tab
4. **Expected:** Guest roster loads
5. Try importing guests (CSV)

**Expected:**
- ✅ Import modal opens
- ✅ Google Contacts shows "Not configured" (without backend)
- ✅ No errors

---

### **10. Test Calendar View**
1. Click "Calendar" in sidebar
2. **Expected:** Calendar view loads
3. Try navigating between months
4. **Expected:** No errors

---

### **11. Test Finances**
1. Click "Finances" in sidebar
2. **Expected:** Finance dashboard loads
3. **Verify:** Charts render correctly (Recharts)

**Expected:**
- ✅ No console errors
- ✅ Charts display mock data

---

### **12. Test Admin Panel**
1. Click "Admin" in sidebar
2. Navigate through tabs:
   - Team Management
   - Integrations
   - Webhooks
   - Email Preferences
3. **Expected:** All tabs load without errors

---

### **13. Test Settings**
1. Click gear icon (⚙️) in sidebar
2. Navigate to "Account Settings"
3. Try uploading an avatar
4. **Expected:** Shows "Upload" option (won't save without backend)

---

### **14. Test Event Portal**
1. Create an event with a client
2. Navigate to the event
3. Click "Event Portal" or similar option
4. **Expected:** Portal loads with contract builder, forms, music planner

---

### **15. Test Contract Generation**
1. In Event Portal, go to "Contracts" tab
2. Generate a venue contract
3. **Expected:** Contract preview loads
4. Try signing (DocuSign-style)
5. **Expected:** Signature canvas works

---

### **16. Test Navigation**
Test all these routes manually:
- [ ] `/` - Dashboard
- [ ] `/login` - Login page
- [ ] `/events` - Events list
- [ ] `/events/:id` - Event detail
- [ ] `/calendar` - Calendar view
- [ ] `/crm` - Client CRM
- [ ] `/vendors` - Vendor roster
- [ ] `/venues` - Venue management
- [ ] `/finances` - Finance dashboard
- [ ] `/admin` - Admin panel

**Expected:** All routes load without errors

---

## 🎨 **Visual Tests**

### **17. Check Design System**
- [ ] Charcoal background (`#1e293b`)
- [ ] Emerald accents (`#10b981`)
- [ ] Amber highlights (`#f59e0b`)
- [ ] Acme font loaded
- [ ] Dark mode active by default

---

### **18. Responsive Design**
1. Resize browser window to mobile size
2. **Expected:** Sidebar collapses to hamburger menu
3. Test on different screen sizes:
   - [ ] Desktop (1920x1080)
   - [ ] Tablet (768px)
   - [ ] Mobile (375px)

---

## 🔍 **Console Verification**

### **19. Check Console Logs**

**Should See:**
- ✅ `[Fetch Fallback] Global error suppression initialized`
- ✅ `[AuthContext] Supabase client initialized`
- ✅ `[MastermindContext] Backend not available - using local state only`
- ✅ `[App] Polyfills applied silently`

**Should NOT See:**
- ❌ `TypeError: Failed to fetch`
- ❌ `Uncaught (in promise) TypeError`
- ❌ Red error messages
- ❌ `BroadcastChannel SecurityError`

---

### **20. Network Tab Check**
1. Open DevTools → Network tab
2. Navigate around the app
3. **Look for:** Failed requests to Supabase edge functions
4. **Expected:** Requests fail gracefully (503 status or caught errors)

**Verify:**
- ✅ No uncaught network errors
- ✅ App continues working despite failed requests

---

## 🧩 **Feature-Specific Tests**

### **21. Private Venue Auto-Retirement**
1. Create a private venue
2. Link it to an event
3. Mark the event as "Completed"
4. Navigate back to Venues
5. **Expected:** 
   - ✅ Venue shows "Retired" badge
   - ✅ Notification appears about auto-retirement

---

### **22. Guest Seating Chart**
1. Create an event with guests
2. Go to "Guests" tab
3. Click "Floor Plan"
4. Add a table (e.g., "Round 8-top")
5. Drag a guest to the table
6. **Expected:**
   - ✅ Drag-and-drop works
   - ✅ Guest seated at table
   - ✅ Dietary restrictions displayed

---

### **23. Timeline Tasks**
1. Open an event
2. Go to "Timeline" tab
3. Add a timeline task
4. **Expected:** Task appears in timeline view

---

### **24. Notifications**
1. Trigger an action (e.g., create event, update client)
2. Look for bell icon (🔔) in top right
3. **Expected:** Notification badge shows count
4. Click to view notifications
5. **Expected:** Notification drawer opens

---

## 🎯 **Integration Tests** (Requires Backend)

### **25. Google OAuth** ⚠️ (Backend Required)
- [ ] Enable Google provider in Supabase
- [ ] Test login flow
- [ ] Verify user session persists

### **26. Stripe Payments** ⚠️ (Backend Required)
- [ ] Configure Stripe keys
- [ ] Create payment link
- [ ] Test checkout flow

### **27. Google Calendar Sync** ⚠️ (Backend Required)
- [ ] Connect Google Calendar
- [ ] Sync an event
- [ ] Verify event appears in Google Calendar

---

## 📊 **Performance Tests**

### **28. Load Time**
1. Hard refresh (Ctrl+Shift+R)
2. Check DevTools → Performance tab
3. **Expected:** App loads in < 2 seconds

---

### **29. Memory Leaks**
1. Open DevTools → Memory tab
2. Take a heap snapshot
3. Navigate around the app for 2 minutes
4. Take another snapshot
5. **Expected:** Memory usage stable (no significant increase)

---

## ✅ **Final Verification**

### **30. Overall Health Check**

- [ ] No red console errors
- [ ] All routes accessible
- [ ] All CRUD operations work (Create, Read, Update, Delete)
- [ ] Data persists in local state (until page refresh)
- [ ] UI is responsive and smooth
- [ ] No "Failed to fetch" errors
- [ ] Notifications work
- [ ] Navigation is smooth

---

## 🎉 **Success Criteria**

**All tests passed?** ✅

Your frontend is **production-ready** for offline/local development!

**Next Steps:**
1. Deploy backend (see `/BACKEND_SETUP_GUIDE.md`)
2. Enable OAuth providers
3. Configure integrations (Stripe, Google Calendar, etc.)
4. Test with real users

---

## 🐛 **Found an Issue?**

1. Check `/ERRORS_FIXED.md` for known issues
2. Check console for `[Fetch Fallback]` logs
3. Verify polyfills are loaded (see `/src/app/App.tsx`)
4. Clear browser cache and hard refresh

---

**Testing Date:** _________________
**Tester:** _________________
**Status:** [ ] PASS  [ ] FAIL

**Notes:**
_________________________________________
_________________________________________
_________________________________________
