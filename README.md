# 👑 Mastermind Event Orchestrator

A luxury all-in-one event planning dashboard built with **React**, **TypeScript**, **Tailwind CSS v4**, and **React Router v7**.

---

## 🎯 **Features**

### **Core Event Management**
- ✅ Multi-event orchestration with calendar view
- ✅ Private venue management with auto-retirement
- ✅ Vendor roster with document management
- ✅ Client CRM with activity trails
- ✅ Guest list management with seating charts
- ✅ Drag-and-drop floor plan designer
- ✅ Contract generation with DocuSign-style e-signatures
- ✅ Timeline task management

### **Integrations** (Requires Backend)
- 🔐 Google OAuth & Microsoft 365 login
- 📅 Google Calendar sync
- 💳 Stripe payment processing
- 📧 Email automation (SendGrid)
- 📱 SMS notifications (Twilio)
- 🔗 Webhook system

### **Enterprise Features**
- 👥 Multi-tenant SaaS architecture
- 🎨 White-label branding
- 📊 Real-time sync engine
- 🔒 Row-level security (RLS)
- 📈 Analytics dashboard

---

## 🚀 **Quick Start**

### **1. Clone & Install**
```bash
git clone <your-repo>
cd mastermind-orchestrator
npm install
```

### **2. Run Development Server**
```bash
npm run dev
```

The app will run in **offline mode** - all core features work without a backend!

---

## 📦 **Project Structure**

```
/src
  /app
    /components      # React components
    /context         # Context providers (Auth, Mastermind, Guest, Sync, Messaging)
    /pages           # Route components
    /utils           # Utility functions
    App.tsx          # Root component
    routes.tsx       # React Router v7 configuration
  /utils             # Shared utilities
    /supabase        # Supabase config
    fetchFallback.ts # Global fetch error handling
  /styles            # Tailwind CSS v4 styles
```

---

## 🔧 **Configuration**

### **Environment Variables**

The app uses Supabase for backend. Your project credentials are in `/utils/supabase/info.tsx`:

```typescript
export const projectId = "nisoirmfszrnsccybmzw"
export const publicAnonKey = "eyJhbGc..."
```

**Note:** These are auto-generated and safe to commit (they're public keys).

---

## 🌐 **Offline Mode (No Backend Required)**

The app is designed to work **fully offline** for development:

- ✅ All UI features functional
- ✅ Data stored in React state (in-memory)
- ✅ No "Failed to fetch" errors
- ✅ Perfect for UI/UX development

**What's Missing:**
- ❌ Data persistence (lost on refresh)
- ❌ OAuth login
- ❌ Payment processing
- ❌ File uploads
- ❌ Email/SMS sending

---

## 🔌 **Backend Setup** (Optional)

To enable server-side features:

### **Step 1: Install Supabase CLI**
```bash
npm install -g supabase
```

### **Step 2: Login & Link Project**
```bash
supabase login
supabase link --project-ref nisoirmfszrnsccybmzw
```

### **Step 3: Deploy Edge Function**

See **`/BACKEND_SETUP_GUIDE.md`** for complete instructions.

**Quick deploy:**
```bash
# Create function
mkdir -p supabase/functions/make-server-6c8332a9

# Copy starter code from BACKEND_SETUP_GUIDE.md

# Deploy
supabase functions deploy make-server-6c8332a9
```

### **Step 4: Enable OAuth**

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Navigate to: **Authentication → Providers**
3. Enable **Google** (and/or Microsoft)
4. Add your OAuth credentials

---

## 🐛 **Troubleshooting**

### **"Failed to fetch" errors?**

**Solution:** Already fixed! ✅

The app now suppresses all fetch errors when backend is unavailable. See `/ERRORS_FIXED.md` for details.

### **BroadcastChannel SecurityError?**

**Solution:** Already fixed! ✅

Polyfills are applied in `/src/app/App.tsx` and `/src/app/context/AuthContext.tsx`.

### **Data not persisting?**

**Expected:** Without a backend, data is stored in-memory only.

**Solution:** Deploy the backend edge function (see Backend Setup).

---

## 📚 **Documentation**

- **`/BACKEND_SETUP_GUIDE.md`** - Complete backend deployment guide
- **`/ERRORS_FIXED.md`** - Technical details on error handling
- **`/src/app/routes.tsx`** - Route configuration
- **`/src/app/context/`** - Context provider documentation

---

## 🎨 **Design System**

### **Colors:**
- **Charcoal:** `#1e293b` (slate-800)
- **Emerald:** `#10b981` (emerald-500)
- **Amber:** `#f59e0b` (amber-500)

### **Font:**
- **Primary:** Acme

### **Aesthetic:**
- Luxury "Mastermind" theme
- Dark mode default
- Premium gradients and shadows

---

## 🧪 **Testing**

### **Test Offline Mode:**
```bash
npm run dev
# Open http://localhost:3000
# Navigate around - everything should work
```

### **Test Backend Integration:**
```bash
# After deploying backend
# Change BACKEND_AVAILABLE to true in /src/utils/fetchFallback.ts
npm run dev
```

---

## 🚢 **Deployment**

### **Frontend Only (Vercel/Netlify):**
```bash
npm run build
# Deploy /dist folder
```

### **Full Stack (Supabase + Vercel):**
1. Deploy edge functions to Supabase
2. Deploy frontend to Vercel
3. Connect OAuth providers
4. Add environment variables

---

## 📝 **Key Technologies**

- **React** 18.3.1
- **TypeScript** (via Vite)
- **Tailwind CSS** v4.1.12
- **React Router** v7.13.0 (Data Mode)
- **Supabase** (Auth, Edge Functions, Storage)
- **Recharts** (Analytics)
- **Lucide React** (Icons)
- **Motion** (Framer Motion successor)
- **Sonner** (Toast notifications)

---

## 🔐 **Security**

- ✅ Row-level security (RLS) in Supabase
- ✅ OAuth 2.0 authentication
- ✅ PKCE flow for secure auth
- ✅ Environment-based secrets
- ✅ CORS headers on edge functions
- ✅ Input sanitization

---

## 📞 **Support**

**Issues?** Check:
1. `/ERRORS_FIXED.md` - Common error solutions
2. `/BACKEND_SETUP_GUIDE.md` - Deployment help
3. Browser console - Look for `[Fetch Fallback]` logs

---

## 📄 **License**

MIT License - Feel free to use for personal or commercial projects.

---

## 🎯 **Roadmap**

- [x] Core event management
- [x] Private venue feature
- [x] Contract generation with e-signatures
- [x] Offline mode with error suppression
- [ ] Database migration (KV → PostgreSQL)
- [ ] Mobile app (React Native)
- [ ] AI-powered event suggestions
- [ ] Real-time collaboration

---

**Built with ❤️ by the Mastermind team**

**Last Updated:** March 28, 2026
