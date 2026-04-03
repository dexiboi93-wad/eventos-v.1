import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";
import { createTeamRoutes } from "./team-routes.tsx";
import { createOAuthRoutes } from "./oauth-routes.tsx";
import { createEmailRoutes } from "./email-routes.tsx";
import { createScheduledEmailRoutes } from "./scheduled-email-routes.tsx";
import { createDocumentRoutes } from "./document-routes.tsx";
import financeRoutes from "./finance-routes.tsx";
import tasksRoutes from "./tasks-routes.tsx";
import activityRoutes from "./activity-routes.tsx";
import { createDataScopingService, RESOURCE_TYPES } from "./data-scoping.tsx";
import { requireAuth, getAuthUser, requirePermission, requireRole, PERMISSIONS } from "./auth-middleware.tsx";

const app = new Hono();

// Initialize data scoping service
const dataService = createDataScopingService(kv);

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

const PREFIX = "/make-server-6c8332a9";

// Initialize Supabase Storage Bucket for venue layouts
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Verify service role key is configured
console.log('=== Server Initialization ===');
console.log('Supabase URL:', supabaseUrl);
console.log('Service Role Key configured:', !!supabaseServiceKey);

// Create client with service role key - bypasses RLS
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  }
});

const BUCKET_NAME = 'make-6c8332a9-venue-layouts';
const LOGO_BUCKET_NAME = 'make-6c8332a9-logos';
const AVATAR_BUCKET_NAME = 'make-6c8332a9-avatars';

// Create storage bucket if it doesn't exist (idempotent)
async function ensureBucketExists() {
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    const venueBucketExists = buckets?.some(bucket => bucket.name === BUCKET_NAME);
    const logoBucketExists = buckets?.some(bucket => bucket.name === LOGO_BUCKET_NAME);
    const avatarBucketExists = buckets?.some(bucket => bucket.name === AVATAR_BUCKET_NAME);
    
    if (!venueBucketExists) {
      const { error } = await supabase.storage.createBucket(BUCKET_NAME, {
        public: false,
        fileSizeLimit: 52428800, // 50MB
        allowedMimeTypes: ['application/pdf'],
      });
      if (error && error.statusCode !== '409') {
        console.error('Error creating venue bucket:', error);
      } else if (!error) {
        console.log(`Bucket ${BUCKET_NAME} created successfully`);
      }
    }
    
    if (!logoBucketExists) {
      const { error } = await supabase.storage.createBucket(LOGO_BUCKET_NAME, {
        public: true, // Make public so logos can be displayed
        fileSizeLimit: 2097152, // 2MB
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'],
      });
      if (error && error.statusCode !== '409') {
        console.error('Error creating logo bucket:', error);
      } else if (!error) {
        console.log(`Bucket ${LOGO_BUCKET_NAME} created successfully`);
      }
    }
    
    if (!avatarBucketExists) {
      const { error } = await supabase.storage.createBucket(AVATAR_BUCKET_NAME, {
        public: true, // Make public so avatars can be displayed without auth
        fileSizeLimit: 5242880, // 5MB
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'],
      });
      if (error && error.statusCode !== '409') {
        console.error('Error creating avatar bucket:', error);
      } else if (!error) {
        console.log(`Bucket ${AVATAR_BUCKET_NAME} created successfully`);
      }
    } else {
      // Bucket exists - log its configuration
      const avatarBucket = buckets?.find(b => b.name === AVATAR_BUCKET_NAME);
      console.log(`Bucket ${AVATAR_BUCKET_NAME} configuration:`, {
        public: avatarBucket?.public,
        fileSizeLimit: avatarBucket?.file_size_limit,
        allowedMimeTypes: avatarBucket?.allowed_mime_types,
      });
    }
  } catch (error) {
    console.error('Error ensuring bucket exists:', error);
  }
}

// Call on server startup
ensureBucketExists();

// Initialize vendors in KV store if empty
async function initializeVendors() {
  try {
    const existingVendors = await kv.get('vendors');
    if (!existingVendors || existingVendors.length === 0) {
      const defaultVendors = [
        {
          id: 'vendor-1',
          name: 'Elite Catering Services',
          email: 'contact@elitecatering.com',
          phone: '(555) 234-5678',
          category: 'catering',
          documents: [],
          assignedEventIds: ['event-1'],
          avatar: 'https://images.unsplash.com/photo-1501167725257-89296f774185?w=100',
        },
        {
          id: 'vendor-2',
          name: 'Premiere Photography Studio',
          email: 'info@premierephotos.com',
          phone: '(555) 345-6789',
          category: 'photography',
          documents: [],
          assignedEventIds: ['event-1', 'event-4'],
          avatar: 'https://images.unsplash.com/photo-1501167725257-89296f774185?w=100',
        },
        {
          id: 'vendor-3',
          name: 'Harmony Entertainment',
          email: 'bookings@harmonyent.com',
          phone: '(555) 456-7890',
          category: 'entertainment',
          documents: [],
          assignedEventIds: ['event-2', 'event-3'],
          avatar: 'https://images.unsplash.com/photo-1501167725257-89296f774185?w=100',
        },
        {
          id: 'vendor-4',
          name: 'Garden Paradise Florals',
          email: 'hello@gardenparadise.com',
          phone: '(555) 567-8901',
          category: 'florals',
          documents: [],
          assignedEventIds: ['event-4'],
          avatar: 'https://images.unsplash.com/photo-1501167725257-89296f774185?w=100',
        },
        {
          id: 'vendor-5',
          name: 'ProAV Solutions',
          email: 'support@proavsolutions.com',
          phone: '(555) 678-9012',
          category: 'av-tech',
          documents: [],
          assignedEventIds: ['event-1', 'event-2'],
          avatar: 'https://images.unsplash.com/photo-1501167725257-89296f774185?w=100',
        },
      ];
      await kv.set('vendors', defaultVendors);
      console.log('Default vendors initialized');
    } else {
      console.log('Vendors already exist in KV store');
    }
  } catch (error) {
    console.error('Error initializing vendors:', error);
    // Don't throw - allow server to continue even if KV init fails
  }
}

// Call on server startup - but don't await it to prevent blocking server start
initializeVendors().catch(err => console.error('Failed to initialize vendors on startup:', err));

// Mount team management routes
console.log('[Server] Creating team routes...');
const teamRoutes = createTeamRoutes(PREFIX);
console.log('[Server] Team routes created, type:', typeof teamRoutes);
app.route('/', teamRoutes);

// Mount OAuth routes
console.log('[Server] Creating OAuth routes...');
const oauthRoutes = createOAuthRoutes(PREFIX);
console.log('[Server] OAuth routes created, type:', typeof oauthRoutes);
app.route('/', oauthRoutes);

// Mount Email routes
console.log('[Server] Creating Email routes...');
createEmailRoutes(app);
console.log('[Server] Email routes created');

// Mount Scheduled Email routes
console.log('[Server] Creating Scheduled Email routes...');
createScheduledEmailRoutes(app);
console.log('[Server] Scheduled Email routes created');

// Mount Document routes
console.log('[Server] Creating Document routes...');
createDocumentRoutes(app);
console.log('[Server] Document routes created');

// Mount Finance routes
console.log('[Server] Creating Finance routes...');
app.route(`${PREFIX}/finances`, financeRoutes);
console.log('[Server] Finance routes created');

// Mount Task Management routes
console.log('[Server] Creating Task Management routes...');
app.route(`${PREFIX}/tasks`, tasksRoutes);
console.log('[Server] Task Management routes created');

// Mount Activity & Collaboration routes
console.log('[Server] Mounting Activity & Collaboration routes...');
app.route('/', activityRoutes);
console.log('[Server] Activity & Collaboration routes mounted');

// Health check endpoint
app.get(`${PREFIX}/health`, (c) => {
  return c.json({ status: "ok" });
});

// Seed data
const initialEvents = [
  {
    id: 1,
    name: "Tech Innovators Summit",
    type: "Corporate",
    date: "Oct 15 - 17, 2026",
    location: "Moscone Center",
    phase: "Phase 4: Finalization",
    attendees: "2,500 / 3,000",
    budget: "$450,000",
    progress: "85%",
    image: "https://images.unsplash.com/photo-1762968269894-1d7e1ce8894e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjb3Jwb3JhdGUlMjBldmVudCUyMHN0YWdlfGVufDF8fHx8MTc3MzEzODA1MXww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
  },
  {
    id: 2,
    name: "Emma & James Nuptials",
    type: "Wedding",
    date: "Nov 02, 2026",
    location: "Oceanview Resort",
    phase: "Phase 3: Logistics",
    attendees: "120 / 150",
    budget: "$45,000",
    progress: "60%",
    image: "https://images.unsplash.com/photo-1621801306185-8c0ccf9c8eb8?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx3ZWRkaW5nJTIwY291cGxlfGVufDF8fHx8MTc3MzEyNjc1OHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
  },
  {
    id: 3,
    name: "Global Health Gala",
    type: "Charity",
    date: "Dec 10, 2026",
    location: "Grand Plaza Hotel",
    phase: "Phase 2: Sourcing",
    attendees: "400 / 500",
    budget: "$120,000",
    progress: "35%",
    image: "https://images.unsplash.com/photo-1764255510960-deee566a91f0?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmb3JtYWwlMjBkaW5uZXIlMjBldmVudHxlbnwxfHx8fDE3NzMxODA0MzF8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
  },
  {
    id: 4,
    name: "Summer Beats Festival",
    type: "Festival",
    date: "Aug 05 - 07, 2026",
    location: "City Park Grounds",
    phase: "Phase 6: Wrap-Up",
    attendees: "15,000 / 15,000",
    budget: "$1.2M",
    progress: "95%",
    image: "https://images.unsplash.com/photo-1605286232233-e448650f5914?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxvdXRkb29yJTIwbXVzaWMlMjBmZXN0aXZhbCUyMGNyb3dkfGVufDF8fHx8MTc3MzEzNTk0OHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
  },
  {
    id: 5,
    name: "Product Launch 2027",
    type: "Corporate",
    date: "Feb 22, 2027",
    location: "HQ Atrium",
    phase: "Phase 1: Strategy",
    attendees: "0 / 800",
    budget: "$250,000",
    progress: "10%",
    image: "https://images.unsplash.com/photo-1762968269894-1d7e1ce8894e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjb3Jwb3JhdGUlMjBldmVudCUyMHN0YWdlfGVufDF8fHx8MTc3MzEzODA1MXww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
  }
];

const initialPhases = [
  {
    id: 1,
    title: "Phase 1: Strategy",
    timeline: "6-12 Months Out",
    objective: "Establishing the foundation, goals, and budget.",
    iconName: "Target",
    color: "text-blue-600 bg-blue-50 border-blue-200",
    tasks: [
      { id: "1-1", name: "Define the Purpose & Goals", completed: true },
      { id: "1-2", name: "Establish the Budget & Contingency", completed: true },
      { id: "1-3", name: "Determine Target Audience", completed: true },
      { id: "1-4", name: "Select Primary & Backup Dates", completed: false },
      { id: "1-5", name: "Create Concept & Theme", completed: false },
    ]
  },
  {
    id: 2,
    title: "Phase 2: Sourcing",
    timeline: "4-6 Months Out",
    objective: "Securing the venue, vendors, and core team.",
    iconName: "Search",
    color: "text-indigo-600 bg-indigo-50 border-indigo-200",
    tasks: [
      { id: "2-1", name: "Secure the Venue & Pay Deposits", completed: false },
      { id: "2-2", name: "Conduct Thorough Site Visit", completed: false },
      { id: "2-3", name: "Hire Caterer & Finalize Menu", completed: false },
      { id: "2-4", name: "Book Entertainment/Speakers", completed: false },
      { id: "2-5", name: "Source Decor, Rentals & AV", completed: false },
    ]
  },
  {
    id: 3,
    title: "Phase 3: Logistics",
    timeline: "2-4 Months Out",
    objective: "Managing guest lists, permits, and programming.",
    iconName: "Truck",
    color: "text-amber-600 bg-amber-50 border-amber-200",
    tasks: [
      { id: "3-1", name: "Build Initial Guest List", completed: false },
      { id: "3-2", name: "Design & Send Invitations", completed: false },
      { id: "3-3", name: "Implement RSVP System", completed: false },
      { id: "3-4", name: "Draft Minute-by-Minute Run of Show", completed: false },
      { id: "3-5", name: "Acquire Permits & Insurance", completed: false },
    ]
  },
  {
    id: 4,
    title: "Phase 4: Finalization",
    timeline: "1 Month Out",
    objective: "Confirming details, schedules, and final headcounts.",
    iconName: "CheckSquare",
    color: "text-emerald-600 bg-emerald-50 border-emerald-200",
    tasks: [
      { id: "4-1", name: "Close Guest List & Final Headcount", completed: false },
      { id: "4-2", name: "Finalize Floor Plans & Seating Charts", completed: false },
      { id: "4-3", name: "Confirm Vendor Logistics & Arrivals", completed: false },
      { id: "4-4", name: "Print Event Collateral & Signage", completed: false },
      { id: "4-5", name: "Pack the Emergency Kit", completed: false },
    ]
  },
  {
    id: 5,
    title: "Phase 5: Execution",
    timeline: "Event Day",
    objective: "Orchestration, troubleshooting, and breakdown.",
    iconName: "PlayCircle",
    color: "text-rose-600 bg-rose-50 border-rose-200",
    tasks: [
      { id: "5-1", name: "Oversee Load-In & Setup", completed: false },
      { id: "5-2", name: "Brief Team, Volunteers & Vendors", completed: false },
      { id: "5-3", name: "Manage Run of Show & Registration", completed: false },
      { id: "5-4", name: "Act as Central Point for Troubleshooting", completed: false },
      { id: "5-5", name: "Supervise Strike & Load-Out", completed: false },
    ]
  },
  {
    id: 6,
    title: "Phase 6: Wrap-Up",
    timeline: "Post-Event",
    objective: "Debriefing, accounting, and expressing gratitude.",
    iconName: "Gift",
    color: "text-purple-600 bg-purple-50 border-purple-200",
    tasks: [
      { id: "6-1", name: "Settle Finances & Final Invoices", completed: false },
      { id: "6-2", name: "Send Thank You Notes", completed: false },
      { id: "6-3", name: "Distribute Post-Event Surveys", completed: false },
      { id: "6-4", name: "Conduct Internal Team Debrief", completed: false },
      { id: "6-5", name: "Organize & Distribute Media", completed: false },
    ]
  }
];

// Initialize Data if empty (now company-scoped with auth)
app.get(`${PREFIX}/sync`, requireAuth(kv), async (c) => {
  try {
    const authUser = getAuthUser(c);
    
    let events = await dataService.getEvents(authUser.companyId);
    let phases = await dataService.getPhases(authUser.companyId);
    
    // Initialize with seed data if empty (for new companies)
    if (!events || events.length === 0) {
      await dataService.setEvents(authUser.companyId, initialEvents);
      events = initialEvents;
    }
    if (!phases || phases.length === 0) {
      await dataService.setPhases(authUser.companyId, initialPhases);
      phases = initialPhases;
    }
    
    return c.json({ events, phases });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Update a phase task (company-scoped with auth)
app.post(`${PREFIX}/blueprint/task`, requireAuth(kv), async (c) => {
  try {
    const authUser = getAuthUser(c);
    const { phaseId, taskId, completed } = await c.req.json();
    
    let phases = await dataService.getPhases(authUser.companyId) || initialPhases;
    
    phases = phases.map((p: any) => {
      if (p.id === phaseId) {
        p.tasks = p.tasks.map((t: any) => {
          if (t.id === taskId) {
            t.completed = completed;
          }
          return t;
        });
      }
      return p;
    });

    await dataService.setPhases(authUser.companyId, phases);
    return c.json({ phases });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Create a new event (company-scoped with auth and permissions)
app.post(`${PREFIX}/events/new`, requirePermission(kv, PERMISSIONS.CREATE_EVENTS), async (c) => {
  try {
    const authUser = getAuthUser(c);
    const { event } = await c.req.json();
    
    let events = await dataService.getEvents(authUser.companyId) || [];
    
    const newEvent = {
        ...event,
        id: Date.now(),
        companyId: authUser.companyId,
        createdBy: authUser.userId,
        createdAt: new Date().toISOString(),
    };
    
    events = [...events, newEvent];
    await dataService.setEvents(authUser.companyId, events);
    
    console.log(`[Events] New event created: ${newEvent.name} by ${authUser.email}`);
    return c.json({ events });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Upload venue layout PDF
app.post(`${PREFIX}/venue/upload-layout`, async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get('file') as File;
    const venueId = formData.get('venueId') as string;

    if (!file || !venueId) {
      return c.json({ error: 'Missing file or venueId' }, 400);
    }

    // Validate file type
    if (file.type !== 'application/pdf') {
      return c.json({ error: 'Only PDF files are allowed' }, 400);
    }

    // Generate unique filename
    const timestamp = Date.now();
    const filename = `${venueId}_${timestamp}.pdf`;

    // Convert file to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const fileData = new Uint8Array(arrayBuffer);

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filename, fileData, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return c.json({ error: `Upload failed: ${uploadError.message}` }, 500);
    }

    // Generate signed URL (valid for 7 days)
    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(filename, 604800); // 7 days in seconds

    if (urlError) {
      console.error('Signed URL error:', urlError);
      return c.json({ error: `Failed to generate URL: ${urlError.message}` }, 500);
    }

    return c.json({
      success: true,
      layoutPdfUrl: signedUrlData.signedUrl,
      layoutPdfName: file.name,
      uploadedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Server error during upload:', error);
    return c.json({ error: `Server error: ${error.message}` }, 500);
  }
});

// Export seating layout (for client approval)
app.post(`${PREFIX}/venue/export-layout`, async (c) => {
  try {
    const { eventId, tables, guests } = await c.req.json();

    if (!eventId) {
      return c.json({ error: 'Missing eventId' }, 400);
    }

    // Generate export data
    const exportData = {
      exportedAt: new Date().toISOString(),
      eventId,
      tables: tables.map((table: any) => ({
        id: table.id,
        name: table.name,
        type: table.type,
        capacity: table.capacity,
        position: table.position,
        guests: guests
          .filter((g: any) => table.guestIds.includes(g.id))
          .map((g: any) => ({
            name: g.name,
            email: g.email,
            isVIP: g.isVIP,
            dietaryRestrictions: g.dietaryRestrictions,
          })),
      })),
      summary: {
        totalTables: tables.length,
        totalSeated: guests.filter((g: any) => g.tableId !== null).length,
        totalGuests: guests.length,
      },
    };

    return c.json({
      success: true,
      exportData,
      message: 'Seating layout exported successfully',
    });
  } catch (error) {
    console.error('Export error:', error);
    return c.json({ error: `Export failed: ${error.message}` }, 500);
  }
});

// Reset Data — PROTECTED: Mastermind only, now company-scoped
app.post(`${PREFIX}/reset`, requireRole(kv, ['Mastermind']), async (c) => {
  try {
    const authUser = getAuthUser(c);
    await dataService.setEvents(authUser.companyId, initialEvents);
    await dataService.setPhases(authUser.companyId, initialPhases);
    console.log(`[Reset] Data reset for company ${authUser.companyId} by ${authUser.email}`);
    return c.json({ status: 'reset', companyId: authUser.companyId });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Get vendor by ID (for vendor upload portal)
app.get(`${PREFIX}/vendor/:vendorId`, async (c) => {
  try {
    console.log('[Server] Fetching vendor with ID:', c.req.param('vendorId'));
    const vendorId = c.req.param('vendorId');
    
    // Fetch all vendors from KV store
    let vendors = await kv.get('vendors');
    console.log('[Server] Current vendors in KV store:', vendors);
    
    // If no vendors exist, initialize them
    if (!vendors || vendors.length === 0) {
      console.log('[Server] No vendors found, initializing default vendors...');
      await initializeVendors();
      vendors = await kv.get('vendors');
    }
    
    // Find the specific vendor
    const vendor = vendors.find((v: any) => v.id === vendorId);
    
    if (!vendor) {
      console.log('[Server] Vendor not found for ID:', vendorId);
      console.log('[Server] Available vendor IDs:', vendors.map((v: any) => v.id));
      return c.json({ error: 'Vendor not found' }, 404);
    }
    
    console.log('[Server] Vendor found:', vendor.name);
    return c.json(vendor);
  } catch (error) {
    console.error('[Server] Error fetching vendor:', error);
    return c.json({ error: `Failed to fetch vendor: ${error.message}` }, 500);
  }
});

// Vendor Document Upload
app.post(`${PREFIX}/upload-vendor-document`, async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get('file') as File;
    const vendorId = formData.get('vendorId') as string;
    const documentType = formData.get('documentType') as string;
    const documentName = formData.get('documentName') as string;
    const expirationDate = formData.get('expirationDate') as string;

    if (!file || !vendorId || !documentName) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    // Create vendor documents bucket if it doesn't exist
    const vendorBucketName = 'make-6c8332a9-vendor-documents';
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(bucket => bucket.name === vendorBucketName);
    
    if (!bucketExists) {
      await supabase.storage.createBucket(vendorBucketName, {
        public: false,
        fileSizeLimit: 52428800, // 50MB
        allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      });
    }

    // Upload file
    const fileName = `${vendorId}/${Date.now()}-${file.name}`;
    const fileBuffer = await file.arrayBuffer();
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(vendorBucketName)
      .upload(fileName, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return c.json({ error: 'Failed to upload file' }, 500);
    }

    // Create signed URL (valid for 1 year)
    const { data: urlData, error: urlError } = await supabase.storage
      .from(vendorBucketName)
      .createSignedUrl(fileName, 31536000); // 1 year in seconds

    if (urlError) {
      console.error('URL generation error:', urlError);
      return c.json({ error: 'Failed to generate URL' }, 500);
    }

    // Update vendor document list in KV store
    const vendors = await kv.get('vendors') || [];
    const vendorIndex = vendors.findIndex((v: any) => v.id === vendorId);
    
    if (vendorIndex !== -1) {
      const newDocument = {
        id: `doc-${Date.now()}`,
        type: documentType,
        name: documentName,
        fileUrl: urlData.signedUrl,
        uploadedAt: new Date().toISOString(),
        expiresAt: expirationDate ? new Date(expirationDate).toISOString() : null,
        status: 'valid',
      };
      
      if (!vendors[vendorIndex].documents) {
        vendors[vendorIndex].documents = [];
      }
      
      vendors[vendorIndex].documents.push(newDocument);
      await kv.set('vendors', vendors);
    }

    return c.json({ 
      fileUrl: urlData.signedUrl,
      fileName: file.name,
      success: true,
    });
  } catch (error) {
    console.error('Document upload error:', error);
    return c.json({ error: 'Upload failed' }, 500);
  }
});

// Upload company logo
app.post(`${PREFIX}/upload-logo`, async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return c.json({ error: 'No file provided' }, 400);
    }

    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
    if (!validTypes.includes(file.type)) {
      return c.json({ error: 'Invalid file type. Only PNG, JPG, and SVG are allowed.' }, 400);
    }

    // Validate file size (max 2MB)
    if (file.size > 2097152) {
      return c.json({ error: 'File too large. Maximum size is 2MB.' }, 400);
    }

    // Generate unique filename
    const timestamp = Date.now();
    const extension = file.name.split('.').pop();
    const filename = `logo-${timestamp}.${extension}`;

    // Convert file to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const fileData = new Uint8Array(arrayBuffer);

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(LOGO_BUCKET_NAME)
      .upload(filename, fileData, {
        contentType: file.type,
        upsert: false,
        cacheControl: '31536000', // Cache for 1 year
      });

    if (uploadError) {
      console.error('Logo upload error:', uploadError);
      return c.json({ error: `Upload failed: ${uploadError.message}` }, 500);
    }

    // Get public URL (bucket is public)
    const { data: publicUrlData } = supabase.storage
      .from(LOGO_BUCKET_NAME)
      .getPublicUrl(filename);

    return c.json({
      success: true,
      logoUrl: publicUrlData.publicUrl,
      uploadedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Server error during logo upload:', error);
    return c.json({ error: `Server error: ${error.message}` }, 500);
  }
});

// Upload user avatar
app.post(`${PREFIX}/upload-avatar`, async (c) => {
  console.log('=== Avatar upload request received ===');
  console.log('Service role key configured:', !!supabaseServiceKey);
  console.log('Supabase URL:', supabaseUrl);
  
  // Create a fresh Supabase client with service role key for this request
  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    }
  });
  
  try {
    console.log('Parsing form data...');
    const formData = await c.req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      console.error('No file in form data');
      return c.json({ error: 'No file provided' }, 400);
    }

    console.log('File received:', {
      name: file.name,
      type: file.type,
      size: file.size,
    });

    // Validate file type - be more lenient with MIME types
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      console.error('Invalid file type:', file.type);
      return c.json({ error: `Invalid file type: ${file.type}. Only PNG, JPG, and WebP are allowed.` }, 400);
    }

    // Validate file size (max 5MB)
    if (file.size > 5242880) {
      console.error('File too large:', file.size);
      return c.json({ error: 'File too large. Maximum size is 5MB.' }, 400);
    }

    // Generate unique filename
    const timestamp = Date.now();
    const extension = file.name.split('.').pop();
    const filename = `avatar-${timestamp}.${extension}`;
    console.log('Generated filename:', filename);

    // Convert file to ArrayBuffer
    console.log('Converting file to ArrayBuffer...');
    const arrayBuffer = await file.arrayBuffer();
    const fileData = new Uint8Array(arrayBuffer);
    console.log('File data size:', fileData.length);

    // Upload to Supabase Storage - create a fresh client to avoid any request context issues
    console.log('Uploading to Supabase Storage...');
    console.log('Creating isolated Supabase client for upload...');
    const uploadClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
        }
      }
    });
    
    const { data: uploadData, error: uploadError } = await uploadClient.storage
      .from(AVATAR_BUCKET_NAME)
      .upload(filename, fileData, {
        contentType: file.type,
        upsert: false,
        cacheControl: '31536000', // Cache for 1 year
      });

    if (uploadError) {
      console.error('Avatar upload error:', {
        message: uploadError.message,
        error: uploadError,
        bucket: AVATAR_BUCKET_NAME,
        filename,
        statusCode: uploadError.statusCode,
      });
      return c.json({ 
        error: `Upload failed: ${uploadError.message}`,
        code: uploadError.statusCode || 500,
        details: uploadError 
      }, 500);
    }

    console.log('Avatar uploaded successfully:', filename);

    // Get public URL (bucket is public)
    const { data: publicUrlData } = uploadClient.storage
      .from(AVATAR_BUCKET_NAME)
      .getPublicUrl(filename);

    console.log('Avatar public URL generated:', publicUrlData.publicUrl);

    return c.json({
      success: true,
      avatarUrl: publicUrlData.publicUrl,
      uploadedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Server error during avatar upload:', {
      message: error?.message,
      stack: error?.stack,
      error,
    });
    return c.json({ 
      error: `Server error: ${error?.message || 'Unknown error'}`,
      details: error?.toString()
    }, 500);
  }
});

// ===== STRIPE PAYMENT INTEGRATION (per-company keys stored in KV) =====

// Save company Stripe keys to KV
app.post(`${PREFIX}/stripe/save-keys`, async (c) => {
  try {
    const { publishableKey, secretKey, companyId } = await c.req.json();
    
    if (!publishableKey || !secretKey) {
      return c.json({ error: 'Both publishable and secret keys are required' }, 400);
    }

    const keyId = companyId || 'default';
    await kv.set(`stripe_keys_${keyId}`, {
      publishableKey,
      secretKey,
      updatedAt: new Date().toISOString(),
    });

    console.log(`[Stripe] Keys saved for company: ${keyId}`);
    return c.json({ success: true, message: 'Stripe keys saved securely' });
  } catch (error) {
    console.error('[Stripe] Error saving keys:', error);
    return c.json({ error: `Failed to save Stripe keys: ${error.message}` }, 500);
  }
});

// Get company Stripe publishable key (never expose secret key to frontend)
app.get(`${PREFIX}/stripe/publishable-key/:companyId`, async (c) => {
  try {
    const companyId = c.req.param('companyId') || 'default';
    const keys = await kv.get(`stripe_keys_${companyId}`);
    
    if (!keys) {
      return c.json({ error: 'No Stripe keys configured', configured: false }, 404);
    }

    return c.json({ 
      configured: true,
      publishableKey: keys.publishableKey,
      updatedAt: keys.updatedAt,
    });
  } catch (error) {
    console.error('[Stripe] Error fetching publishable key:', error);
    return c.json({ error: `Failed to fetch key: ${error.message}` }, 500);
  }
});

// Create a Stripe Checkout Session (server-side with secret key)
app.post(`${PREFIX}/stripe/create-checkout`, async (c) => {
  try {
    const { companyId, lineItems, customerEmail, eventId, eventName, successUrl, cancelUrl, metadata } = await c.req.json();

    const keyId = companyId || 'default';
    const keys = await kv.get(`stripe_keys_${keyId}`);
    
    if (!keys?.secretKey) {
      return c.json({ error: 'Stripe not configured. Add your API keys in Settings > Integrations.' }, 400);
    }

    // Call Stripe API to create checkout session
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${keys.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'mode': 'payment',
        'success_url': successUrl || `${c.req.url.split('/make-server')[0]}/events/${eventId}?payment=success`,
        'cancel_url': cancelUrl || `${c.req.url.split('/make-server')[0]}/events/${eventId}?payment=cancelled`,
        ...(customerEmail ? { 'customer_email': customerEmail } : {}),
        ...lineItems.reduce((acc: Record<string, string>, item: any, i: number) => {
          acc[`line_items[${i}][price_data][currency]`] = item.currency || 'usd';
          acc[`line_items[${i}][price_data][product_data][name]`] = item.name;
          acc[`line_items[${i}][price_data][product_data][description]`] = item.description || '';
          acc[`line_items[${i}][price_data][unit_amount]`] = String(Math.round(item.amount * 100));
          acc[`line_items[${i}][quantity]`] = String(item.quantity || 1);
          return acc;
        }, {}),
        ...(metadata ? Object.entries(metadata).reduce((acc: Record<string, string>, [k, v]) => {
          acc[`metadata[${k}]`] = String(v);
          return acc;
        }, {}) : {}),
      }),
    });

    const session = await response.json();

    if (session.error) {
      console.error('[Stripe] Checkout error:', session.error);
      return c.json({ error: `Stripe error: ${session.error.message}` }, 400);
    }

    // Record payment intent in KV
    const paymentRecord = {
      id: `pay-${Date.now()}`,
      sessionId: session.id,
      eventId,
      eventName,
      customerEmail,
      amount: lineItems.reduce((sum: number, item: any) => sum + (item.amount * (item.quantity || 1)), 0),
      status: 'pending',
      createdAt: new Date().toISOString(),
      metadata,
    };

    const existingPayments = await kv.get(`payments_${keyId}`) || [];
    await kv.set(`payments_${keyId}`, [...existingPayments, paymentRecord]);

    console.log(`[Stripe] Checkout session created: ${session.id}`);
    return c.json({ 
      success: true,
      sessionId: session.id,
      url: session.url,
      paymentRecordId: paymentRecord.id,
    });
  } catch (error) {
    console.error('[Stripe] Checkout creation error:', error);
    return c.json({ error: `Failed to create checkout: ${error.message}` }, 500);
  }
});

// Create a Stripe Payment Link (reusable)
app.post(`${PREFIX}/stripe/create-payment-link`, async (c) => {
  try {
    const { companyId, name, amount, description, eventId } = await c.req.json();

    const keyId = companyId || 'default';
    const keys = await kv.get(`stripe_keys_${keyId}`);
    
    if (!keys?.secretKey) {
      return c.json({ error: 'Stripe not configured' }, 400);
    }

    // Create a product first
    const productResponse = await fetch('https://api.stripe.com/v1/products', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${keys.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'name': name,
        'description': description || '',
        'metadata[eventId]': eventId || '',
      }),
    });
    const product = await productResponse.json();

    if (product.error) {
      return c.json({ error: `Stripe product error: ${product.error.message}` }, 400);
    }

    // Create a price
    const priceResponse = await fetch('https://api.stripe.com/v1/prices', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${keys.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'unit_amount': String(Math.round(amount * 100)),
        'currency': 'usd',
        'product': product.id,
      }),
    });
    const price = await priceResponse.json();

    if (price.error) {
      return c.json({ error: `Stripe price error: ${price.error.message}` }, 400);
    }

    // Create payment link
    const linkResponse = await fetch('https://api.stripe.com/v1/payment_links', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${keys.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'line_items[0][price]': price.id,
        'line_items[0][quantity]': '1',
      }),
    });
    const paymentLink = await linkResponse.json();

    if (paymentLink.error) {
      return c.json({ error: `Stripe link error: ${paymentLink.error.message}` }, 400);
    }

    console.log(`[Stripe] Payment link created: ${paymentLink.url}`);
    return c.json({
      success: true,
      url: paymentLink.url,
      id: paymentLink.id,
    });
  } catch (error) {
    console.error('[Stripe] Payment link error:', error);
    return c.json({ error: `Failed to create payment link: ${error.message}` }, 500);
  }
});

// Get payment records for a company
app.get(`${PREFIX}/stripe/payments/:companyId`, async (c) => {
  try {
    const companyId = c.req.param('companyId') || 'default';
    const payments = await kv.get(`payments_${companyId}`) || [];
    return c.json({ payments });
  } catch (error) {
    console.error('[Stripe] Error fetching payments:', error);
    return c.json({ error: `Failed to fetch payments: ${error.message}` }, 500);
  }
});

// Update payment status (called after webhook or manual confirmation)
app.post(`${PREFIX}/stripe/update-payment`, async (c) => {
  try {
    const { companyId, paymentId, status, transactionId } = await c.req.json();
    const keyId = companyId || 'default';

    const payments = await kv.get(`payments_${keyId}`) || [];
    const updated = payments.map((p: any) => 
      p.id === paymentId ? { ...p, status, transactionId, completedAt: status === 'completed' ? new Date().toISOString() : null } : p
    );
    await kv.set(`payments_${keyId}`, updated);

    // If payment completed, check for post-event review trigger
    if (status === 'completed') {
      const payment = updated.find((p: any) => p.id === paymentId);
      if (payment?.eventId) {
        const reviewKey = `review_trigger_${payment.eventId}`;
        const existingTrigger = await kv.get(reviewKey);
        if (!existingTrigger) {
          const triggerDate = new Date();
          triggerDate.setDate(triggerDate.getDate() + 7);
          await kv.set(reviewKey, {
            eventId: payment.eventId,
            paymentCompletedAt: new Date().toISOString(),
            reviewAvailableAt: triggerDate.toISOString(),
            status: 'scheduled',
          });
          console.log(`[Review] 7-day post-event review scheduled for event ${payment.eventId} at ${triggerDate.toISOString()}`);
        }
      }
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('[Stripe] Error updating payment:', error);
    return c.json({ error: `Failed to update payment: ${error.message}` }, 500);
  }
});

// ===== POST-EVENT REVIEW SYSTEM =====

// Get review status for an event
app.get(`${PREFIX}/review/:eventId`, async (c) => {
  try {
    const eventId = c.req.param('eventId');
    const trigger = await kv.get(`review_trigger_${eventId}`);
    const review = await kv.get(`review_data_${eventId}`);

    if (!trigger) {
      return c.json({ 
        status: 'not-triggered',
        message: 'No final payment completed yet',
      });
    }

    const now = new Date();
    const reviewDate = new Date(trigger.reviewAvailableAt);
    const isAvailable = now >= reviewDate;
    const daysRemaining = Math.max(0, Math.ceil((reviewDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

    return c.json({
      status: review ? 'completed' : isAvailable ? 'available' : 'scheduled',
      trigger,
      review: review || null,
      isAvailable,
      daysRemaining,
    });
  } catch (error) {
    console.error('[Review] Error:', error);
    return c.json({ error: `Failed to get review status: ${error.message}` }, 500);
  }
});

// Submit a post-event review
app.post(`${PREFIX}/review/:eventId`, async (c) => {
  try {
    const eventId = c.req.param('eventId');
    const reviewData = await c.req.json();

    const review = {
      ...reviewData,
      eventId,
      submittedAt: new Date().toISOString(),
    };

    await kv.set(`review_data_${eventId}`, review);

    // Update trigger status
    const trigger = await kv.get(`review_trigger_${eventId}`);
    if (trigger) {
      await kv.set(`review_trigger_${eventId}`, { ...trigger, status: 'completed' });
    }

    console.log(`[Review] Review submitted for event ${eventId}`);
    return c.json({ success: true, review });
  } catch (error) {
    console.error('[Review] Error submitting review:', error);
    return c.json({ error: `Failed to submit review: ${error.message}` }, 500);
  }
});

// Manually trigger post-event review (Mastermind override)
app.post(`${PREFIX}/review/:eventId/trigger`, async (c) => {
  try {
    const eventId = c.req.param('eventId');
    const { immediate } = await c.req.json();

    const triggerDate = immediate ? new Date() : (() => {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      return d;
    })();

    await kv.set(`review_trigger_${eventId}`, {
      eventId,
      paymentCompletedAt: new Date().toISOString(),
      reviewAvailableAt: triggerDate.toISOString(),
      status: immediate ? 'available' : 'scheduled',
      manuallyTriggered: true,
    });

    console.log(`[Review] Manual trigger for event ${eventId}, available: ${triggerDate.toISOString()}`);
    return c.json({ success: true, availableAt: triggerDate.toISOString() });
  } catch (error) {
    console.error('[Review] Error triggering review:', error);
    return c.json({ error: `Failed to trigger review: ${error.message}` }, 500);
  }
});

// ===== STRIPE WEBHOOK ENDPOINT (signature verification) =====

// Helper: Verify Stripe webhook signature using HMAC-SHA256
async function verifyStripeSignature(payload: string, sigHeader: string, webhookSecret: string): Promise<boolean> {
  try {
    const parts = sigHeader.split(',');
    let timestamp = '';
    const signatures: string[] = [];

    for (const part of parts) {
      const [key, value] = part.split('=');
      if (key === 't') timestamp = value;
      if (key === 'v1') signatures.push(value);
    }

    if (!timestamp || signatures.length === 0) {
      console.log('[Stripe Webhook] Missing timestamp or v1 signature in header');
      return false;
    }

    // Reject timestamps older than 5 minutes
    const tolerance = 300;
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parseInt(timestamp)) > tolerance) {
      console.log(`[Stripe Webhook] Timestamp too old: ${timestamp} vs now: ${now}`);
      return false;
    }

    // Compute expected signature: HMAC-SHA256 of "timestamp.payload"
    const signedPayload = `${timestamp}.${payload}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(webhookSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signatureBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
    const expectedSignature = Array.from(new Uint8Array(signatureBytes))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Constant-time comparison
    const match = signatures.some(sig => {
      if (sig.length !== expectedSignature.length) return false;
      let result = 0;
      for (let i = 0; i < sig.length; i++) {
        result |= sig.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
      }
      return result === 0;
    });

    return match;
  } catch (error) {
    console.error('[Stripe Webhook] Signature verification error:', error);
    return false;
  }
}

// Save webhook signing secret (per-company)
app.post(`${PREFIX}/stripe/save-webhook-secret`, async (c) => {
  try {
    const { companyId, webhookSecret } = await c.req.json();

    if (!webhookSecret || !webhookSecret.startsWith('whsec_')) {
      return c.json({ error: 'Webhook secret must start with whsec_' }, 400);
    }

    const keyId = companyId || 'default';
    await kv.set(`stripe_webhook_secret_${keyId}`, {
      webhookSecret,
      updatedAt: new Date().toISOString(),
    });

    console.log(`[Stripe Webhook] Secret saved for company: ${keyId}`);
    return c.json({ success: true, message: 'Webhook secret saved' });
  } catch (error) {
    console.error('[Stripe Webhook] Error saving secret:', error);
    return c.json({ error: `Failed to save webhook secret: ${error.message}` }, 500);
  }
});

// Get webhook endpoint URL for company to configure in Stripe Dashboard
app.get(`${PREFIX}/stripe/webhook-info/:companyId`, async (c) => {
  try {
    const companyId = c.req.param('companyId') || 'default';
    const secretData = await kv.get(`stripe_webhook_secret_${companyId}`);
    const webhookUrl = `${supabaseUrl}/functions/v1${PREFIX}/stripe/webhook/${companyId}`;

    return c.json({
      webhookUrl,
      configured: !!secretData,
      updatedAt: secretData?.updatedAt || null,
      instructions: 'Add this URL as a webhook endpoint in Stripe Dashboard > Developers > Webhooks. Subscribe to: checkout.session.completed, payment_intent.succeeded, payment_intent.payment_failed, charge.refunded',
    });
  } catch (error) {
    console.error('[Stripe Webhook] Error getting info:', error);
    return c.json({ error: `Failed to get webhook info: ${error.message}` }, 500);
  }
});

// Stripe Webhook receiver (per-company, with signature verification)
app.post(`${PREFIX}/stripe/webhook/:companyId`, async (c) => {
  const companyId = c.req.param('companyId') || 'default';

  try {
    const rawBody = await c.req.text();
    const sigHeader = c.req.header('stripe-signature') || '';

    const secretData = await kv.get(`stripe_webhook_secret_${companyId}`);

    if (!secretData?.webhookSecret) {
      console.error(`[Stripe Webhook] No webhook secret configured for company: ${companyId}`);
      return c.json({ error: 'Webhook not configured for this company' }, 400);
    }

    const isValid = await verifyStripeSignature(rawBody, sigHeader, secretData.webhookSecret);

    if (!isValid) {
      console.error(`[Stripe Webhook] Invalid signature for company: ${companyId}`);
      return c.json({ error: 'Invalid webhook signature' }, 401);
    }

    const event = JSON.parse(rawBody);
    console.log(`[Stripe Webhook] Received event: ${event.type} for company: ${companyId}`);

    // Log webhook event
    const webhookLogs = await kv.get(`stripe_webhook_logs_${companyId}`) || [];
    webhookLogs.push({
      id: `wh-${Date.now()}`,
      eventType: event.type,
      eventId: event.id,
      receivedAt: new Date().toISOString(),
      processed: false,
    });
    if (webhookLogs.length > 100) webhookLogs.splice(0, webhookLogs.length - 100);
    await kv.set(`stripe_webhook_logs_${companyId}`, webhookLogs);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        console.log(`[Stripe Webhook] Checkout completed: ${session.id}, amount: ${session.amount_total}`);

        const payments = await kv.get(`payments_${companyId}`) || [];
        let matchedPayment: any = null;

        const updatedPayments = payments.map((p: any) => {
          if (p.sessionId === session.id) {
            matchedPayment = {
              ...p,
              status: 'completed',
              stripePaymentIntentId: session.payment_intent,
              completedAt: new Date().toISOString(),
              amountReceived: (session.amount_total || 0) / 100,
              customerEmail: session.customer_details?.email || p.customerEmail,
            };
            return matchedPayment;
          }
          return p;
        });
        await kv.set(`payments_${companyId}`, updatedPayments);

        // === AUTO-PROMOTE: If metadata indicates deposit payment, queue client promotion ===
        const clientId = session.metadata?.clientId;
        const paymentType = session.metadata?.paymentType;
        if (clientId && paymentType === 'deposit') {
          const pendingPromotions = await kv.get(`pending_promotions_${companyId}`) || [];
          pendingPromotions.push({
            id: `promo-${Date.now()}`,
            clientId,
            type: 'lead-to-client',
            depositAmount: (session.amount_total || 0) / 100,
            customerEmail: session.customer_details?.email || '',
            stripeSessionId: session.id,
            processedAt: null,
            createdAt: new Date().toISOString(),
          });
          await kv.set(`pending_promotions_${companyId}`, pendingPromotions);
          console.log(`[Stripe Webhook] Deposit confirmed for client ${clientId} - queued auto-promotion`);
        }

        // Trigger 7-day post-event review
        const eventId = session.metadata?.eventId || matchedPayment?.eventId;
        if (eventId) {
          const reviewKey = `review_trigger_${eventId}`;
          const existing = await kv.get(reviewKey);
          if (!existing || existing.status !== 'completed') {
            const triggerDate = new Date();
            triggerDate.setDate(triggerDate.getDate() + 7);
            await kv.set(reviewKey, {
              eventId,
              paymentCompletedAt: new Date().toISOString(),
              reviewAvailableAt: triggerDate.toISOString(),
              status: 'scheduled',
              stripeSessionId: session.id,
            });
            console.log(`[Stripe Webhook] Review scheduled for event ${eventId}`);

            // Queue email notification
            await queueReviewNotification(companyId, eventId, triggerDate.toISOString());
          }
        }

        // Mark log as processed
        const logs = await kv.get(`stripe_webhook_logs_${companyId}`) || [];
        const updatedLogs = logs.map((l: any) => l.eventId === event.id ? { ...l, processed: true } : l);
        await kv.set(`stripe_webhook_logs_${companyId}`, updatedLogs);
        break;
      }

      case 'payment_intent.succeeded': {
        const intent = event.data.object;
        console.log(`[Stripe Webhook] Payment intent succeeded: ${intent.id}`);

        const payments2 = await kv.get(`payments_${companyId}`) || [];
        const updatedPayments2 = payments2.map((p: any) => {
          if (p.stripePaymentIntentId === intent.id) {
            return { ...p, status: 'completed', completedAt: new Date().toISOString(), amountReceived: intent.amount / 100, receiptEmail: intent.receipt_email };
          }
          return p;
        });
        await kv.set(`payments_${companyId}`, updatedPayments2);
        break;
      }

      case 'payment_intent.payment_failed': {
        const failedIntent = event.data.object;
        console.log(`[Stripe Webhook] Payment failed: ${failedIntent.id}`);

        const payments3 = await kv.get(`payments_${companyId}`) || [];
        const updatedPayments3 = payments3.map((p: any) => {
          if (p.stripePaymentIntentId === failedIntent.id) {
            return { ...p, status: 'failed', failedAt: new Date().toISOString(), failureReason: failedIntent.last_payment_error?.message || 'Unknown error' };
          }
          return p;
        });
        await kv.set(`payments_${companyId}`, updatedPayments3);
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object;
        console.log(`[Stripe Webhook] Charge refunded: ${charge.id}`);

        const payments4 = await kv.get(`payments_${companyId}`) || [];
        const updatedPayments4 = payments4.map((p: any) => {
          if (p.stripePaymentIntentId === charge.payment_intent) {
            return { ...p, status: charge.amount_refunded >= charge.amount ? 'refunded' : 'partially_refunded', refundedAt: new Date().toISOString(), amountRefunded: charge.amount_refunded / 100 };
          }
          return p;
        });
        await kv.set(`payments_${companyId}`, updatedPayments4);
        break;
      }

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    return c.json({ received: true });
  } catch (error) {
    console.error(`[Stripe Webhook] Processing error for company ${companyId}:`, error);
    return c.json({ error: `Webhook processing failed: ${error.message}` }, 500);
  }
});

// Get pending client promotions (frontend polls this after deposit payments)
app.get(`${PREFIX}/stripe/pending-promotions/:companyId`, async (c) => {
  try {
    const companyId = c.req.param('companyId') || 'default';
    const promotions = await kv.get(`pending_promotions_${companyId}`) || [];
    const pending = promotions.filter((p: any) => !p.processedAt);
    return c.json({ promotions: pending });
  } catch (error) {
    console.error('[Stripe] Error fetching pending promotions:', error);
    return c.json({ error: `Failed to fetch promotions: ${error.message}` }, 500);
  }
});

// Acknowledge a promotion (mark as processed)
app.post(`${PREFIX}/stripe/acknowledge-promotion`, async (c) => {
  try {
    const { companyId, promotionId } = await c.req.json();
    const keyId = companyId || 'default';
    const promotions = await kv.get(`pending_promotions_${keyId}`) || [];
    const updated = promotions.map((p: any) =>
      p.id === promotionId ? { ...p, processedAt: new Date().toISOString() } : p
    );
    await kv.set(`pending_promotions_${keyId}`, updated);
    console.log(`[Stripe] Promotion ${promotionId} acknowledged for company ${keyId}`);
    return c.json({ success: true });
  } catch (error) {
    console.error('[Stripe] Error acknowledging promotion:', error);
    return c.json({ error: `Failed to acknowledge: ${error.message}` }, 500);
  }
});

// Get webhook logs for a company
app.get(`${PREFIX}/stripe/webhook-logs/:companyId`, async (c) => {
  try {
    const companyId = c.req.param('companyId') || 'default';
    const logs = await kv.get(`stripe_webhook_logs_${companyId}`) || [];
    return c.json({ logs: logs.slice(-50).reverse() });
  } catch (error) {
    console.error('[Stripe Webhook] Error fetching logs:', error);
    return c.json({ error: `Failed to fetch webhook logs: ${error.message}` }, 500);
  }
});


// ===== GOOGLE OAUTH CONTACTS INTEGRATION =====

// Save Google OAuth credentials (per-company)
app.post(`${PREFIX}/google/save-credentials`, async (c) => {
  try {
    const { companyId, clientId, clientSecret, redirectUri } = await c.req.json();

    if (!clientId || !clientSecret) {
      return c.json({ error: 'Both Client ID and Client Secret are required' }, 400);
    }

    const keyId = companyId || 'default';
    await kv.set(`google_oauth_${keyId}`, {
      clientId,
      clientSecret,
      redirectUri: redirectUri || `${supabaseUrl}/functions/v1${PREFIX}/google/callback/${keyId}`,
      updatedAt: new Date().toISOString(),
    });

    console.log(`[Google OAuth] Credentials saved for company: ${keyId}`);
    return c.json({
      success: true,
      callbackUrl: redirectUri || `${supabaseUrl}/functions/v1${PREFIX}/google/callback/${keyId}`,
    });
  } catch (error) {
    console.error('[Google OAuth] Error saving credentials:', error);
    return c.json({ error: `Failed to save credentials: ${error.message}` }, 500);
  }
});

// Check if Google OAuth is configured
app.get(`${PREFIX}/google/status/:companyId`, async (c) => {
  try {
    const companyId = c.req.param('companyId') || 'default';
    const creds = await kv.get(`google_oauth_${companyId}`);
    const tokens = await kv.get(`google_tokens_${companyId}`);

    return c.json({
      configured: !!creds,
      authenticated: !!tokens?.access_token,
      callbackUrl: creds ? (creds.redirectUri || `${supabaseUrl}/functions/v1${PREFIX}/google/callback/${companyId}`) : null,
      updatedAt: creds?.updatedAt || null,
      tokenExpiry: tokens?.expiry || null,
      userEmail: tokens?.userEmail || null,
    });
  } catch (error) {
    console.error('[Google OAuth] Error checking status:', error);
    return c.json({ error: `Failed to check status: ${error.message}` }, 500);
  }
});

// Generate Google OAuth authorization URL
app.get(`${PREFIX}/google/auth-url/:companyId`, async (c) => {
  try {
    const companyId = c.req.param('companyId') || 'default';
    const creds = await kv.get(`google_oauth_${companyId}`);

    if (!creds) {
      return c.json({ error: 'Google OAuth not configured. Add credentials in Settings.' }, 400);
    }

    const redirectUri = creds.redirectUri || `${supabaseUrl}/functions/v1${PREFIX}/google/callback/${companyId}`;
    const state = btoa(JSON.stringify({ companyId, ts: Date.now() }));

    await kv.set(`google_oauth_state_${state}`, { companyId, createdAt: new Date().toISOString() });

    const params = new URLSearchParams({
      client_id: creds.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/contacts.readonly https://www.googleapis.com/auth/userinfo.email',
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    console.log(`[Google OAuth] Auth URL generated for company: ${companyId}`);
    return c.json({ authUrl, state });
  } catch (error) {
    console.error('[Google OAuth] Error generating auth URL:', error);
    return c.json({ error: `Failed to generate auth URL: ${error.message}` }, 500);
  }
});

// Google OAuth callback (receives authorization code, exchanges for tokens)
app.get(`${PREFIX}/google/callback/:companyId`, async (c) => {
  const companyId = c.req.param('companyId') || 'default';

  try {
    const code = c.req.query('code');
    const state = c.req.query('state');
    const errorParam = c.req.query('error');

    if (errorParam) {
      console.error(`[Google OAuth] Authorization denied: ${errorParam}`);
      return c.html(`<html><body><script>window.opener?.postMessage({type:'google-auth-error',error:'${errorParam}'},'*');window.close();</script><p>Authorization denied. You can close this window.</p></body></html>`);
    }

    if (!code) {
      return c.html(`<html><body><script>window.opener?.postMessage({type:'google-auth-error',error:'no_code'},'*');window.close();</script><p>No authorization code received.</p></body></html>`);
    }

    // Verify state for CSRF protection
    if (state) {
      const stateData = await kv.get(`google_oauth_state_${state}`);
      if (!stateData) {
        console.error('[Google OAuth] Invalid state parameter');
        return c.html(`<html><body><script>window.opener?.postMessage({type:'google-auth-error',error:'invalid_state'},'*');window.close();</script><p>Invalid state.</p></body></html>`);
      }
      await kv.del(`google_oauth_state_${state}`);
    }

    const creds = await kv.get(`google_oauth_${companyId}`);
    if (!creds) {
      return c.html(`<html><body><script>window.opener?.postMessage({type:'google-auth-error',error:'not_configured'},'*');window.close();</script><p>OAuth not configured.</p></body></html>`);
    }

    const redirectUri = creds.redirectUri || `${supabaseUrl}/functions/v1${PREFIX}/google/callback/${companyId}`;

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error(`[Google OAuth] Token exchange failed: ${tokenData.error_description || tokenData.error}`);
      return c.html(`<html><body><script>window.opener?.postMessage({type:'google-auth-error',error:'${tokenData.error}'},'*');window.close();</script><p>Token exchange failed.</p></body></html>`);
    }

    // Get user email
    let userEmail = '';
    try {
      const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const userInfo = await userInfoRes.json();
      userEmail = userInfo.email || '';
    } catch (e) {
      console.log('[Google OAuth] Could not fetch user email, continuing...');
    }

    // Store tokens
    await kv.set(`google_tokens_${companyId}`, {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expiry: new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString(),
      userEmail,
      createdAt: new Date().toISOString(),
    });

    console.log(`[Google OAuth] Tokens stored for company: ${companyId}, user: ${userEmail}`);

    return c.html(`
      <html><body>
        <script>
          window.opener?.postMessage({
            type: 'google-auth-success',
            email: '${userEmail}',
            companyId: '${companyId}'
          }, '*');
          window.close();
        </script>
        <p>Google Contacts connected as ${userEmail}. You can close this window.</p>
      </body></html>
    `);
  } catch (error) {
    console.error(`[Google OAuth] Callback error for company ${companyId}:`, error);
    return c.html(`<html><body><script>window.opener?.postMessage({type:'google-auth-error',error:'server_error'},'*');window.close();</script><p>Server error.</p></body></html>`);
  }
});

// Refresh Google access token if expired
async function refreshGoogleToken(companyId: string): Promise<string | null> {
  try {
    const tokens = await kv.get(`google_tokens_${companyId}`);
    if (!tokens) return null;

    if (tokens.expiry && new Date(tokens.expiry).getTime() > Date.now() + 300000) {
      return tokens.access_token;
    }

    if (!tokens.refresh_token) {
      console.log(`[Google OAuth] No refresh token for company ${companyId}`);
      return null;
    }

    const creds = await kv.get(`google_oauth_${companyId}`);
    if (!creds) return null;

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        refresh_token: tokens.refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    const data = await response.json();
    if (data.error) {
      console.error(`[Google OAuth] Token refresh failed: ${data.error}`);
      return null;
    }

    await kv.set(`google_tokens_${companyId}`, {
      ...tokens,
      access_token: data.access_token,
      expiry: new Date(Date.now() + (data.expires_in * 1000)).toISOString(),
    });

    return data.access_token;
  } catch (error) {
    console.error(`[Google OAuth] Refresh error for ${companyId}:`, error);
    return null;
  }
}

// Fetch contacts from Google People API
app.get(`${PREFIX}/google/contacts/:companyId`, async (c) => {
  const companyId = c.req.param('companyId') || 'default';

  try {
    const accessToken = await refreshGoogleToken(companyId);
    if (!accessToken) {
      return c.json({ error: 'Not authenticated with Google. Please connect first.', needsAuth: true }, 401);
    }

    const pageSize = parseInt(c.req.query('pageSize') || '200');
    const pageToken = c.req.query('pageToken') || '';

    const params = new URLSearchParams({
      personFields: 'names,emailAddresses,phoneNumbers,photos',
      pageSize: String(Math.min(pageSize, 1000)),
      sortOrder: 'FIRST_NAME_ASCENDING',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const response = await fetch(
      `https://people.googleapis.com/v1/people/me/connections?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Google Contacts] API error (${response.status}): ${errorText}`);
      if (response.status === 401) {
        return c.json({ error: 'Google auth expired. Please reconnect.', needsAuth: true }, 401);
      }
      return c.json({ error: `Google API error: ${response.status}` }, response.status);
    }

    const data = await response.json();

    const contacts = (data.connections || []).map((person: any, idx: number) => {
      const name = person.names?.[0]?.displayName || '';
      const email = person.emailAddresses?.[0]?.value || '';
      const phone = person.phoneNumbers?.[0]?.canonicalForm || person.phoneNumbers?.[0]?.value || '';
      const photo = person.photos?.[0]?.url || '';
      return { id: `g-${person.resourceName || idx}`, name, email, phone, avatar: photo, source: 'google' };
    }).filter((c: any) => c.name || c.email);

    console.log(`[Google Contacts] Fetched ${contacts.length} contacts for company: ${companyId}`);
    return c.json({ contacts, totalPeople: data.totalPeople || contacts.length, nextPageToken: data.nextPageToken || null });
  } catch (error) {
    console.error(`[Google Contacts] Fetch error for ${companyId}:`, error);
    return c.json({ error: `Failed to fetch contacts: ${error.message}` }, 500);
  }
});

// Disconnect Google (revoke tokens)
app.post(`${PREFIX}/google/disconnect/:companyId`, async (c) => {
  try {
    const companyId = c.req.param('companyId') || 'default';
    const tokens = await kv.get(`google_tokens_${companyId}`);

    if (tokens?.access_token) {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${tokens.access_token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
      } catch (e) {
        console.log('[Google OAuth] Token revocation request failed, continuing cleanup...');
      }
    }

    await kv.del(`google_tokens_${companyId}`);
    console.log(`[Google OAuth] Disconnected for company: ${companyId}`);
    return c.json({ success: true });
  } catch (error) {
    console.error('[Google OAuth] Disconnect error:', error);
    return c.json({ error: `Failed to disconnect: ${error.message}` }, 500);
  }
});


// ===== EMAIL NOTIFICATION SYSTEM FOR REVIEW TRIGGERS =====

// Save email notification settings (per-company)
app.post(`${PREFIX}/notifications/email-settings`, async (c) => {
  try {
    const { companyId, smtpHost, smtpPort, smtpUser, smtpPass, fromEmail, fromName, enabled } = await c.req.json();
    const keyId = companyId || 'default';

    await kv.set(`email_settings_${keyId}`, {
      smtpHost: smtpHost || '',
      smtpPort: smtpPort || 587,
      smtpUser: smtpUser || '',
      smtpPass: smtpPass || '',
      fromEmail: fromEmail || '',
      fromName: fromName || 'Event Orchestrator',
      enabled: enabled !== false,
      updatedAt: new Date().toISOString(),
    });

    console.log(`[Email] Settings saved for company: ${keyId}`);
    return c.json({ success: true });
  } catch (error) {
    console.error('[Email] Error saving settings:', error);
    return c.json({ error: `Failed to save email settings: ${error.message}` }, 500);
  }
});

// Get email settings (don't expose SMTP password)
app.get(`${PREFIX}/notifications/email-settings/:companyId`, async (c) => {
  try {
    const companyId = c.req.param('companyId') || 'default';
    const settings = await kv.get(`email_settings_${companyId}`);
    if (!settings) return c.json({ configured: false });
    return c.json({
      configured: true,
      smtpHost: settings.smtpHost,
      smtpPort: settings.smtpPort,
      smtpUser: settings.smtpUser,
      fromEmail: settings.fromEmail,
      fromName: settings.fromName,
      enabled: settings.enabled,
      updatedAt: settings.updatedAt,
    });
  } catch (error) {
    console.error('[Email] Error fetching settings:', error);
    return c.json({ error: `Failed to fetch settings: ${error.message}` }, 500);
  }
});

// Queue a review notification email
async function queueReviewNotification(companyId: string, eventId: string, reviewAvailableAt: string) {
  try {
    const queue = await kv.get(`notification_queue_${companyId}`) || [];
    queue.push({
      id: `notif-${Date.now()}-${eventId}`,
      type: 'review_available',
      eventId,
      reviewAvailableAt,
      status: 'queued',
      createdAt: new Date().toISOString(),
      attempts: 0,
    });
    await kv.set(`notification_queue_${companyId}`, queue);
    console.log(`[Email] Review notification queued for event ${eventId}, company ${companyId}`);
  } catch (error) {
    console.error(`[Email] Failed to queue notification: ${error}`);
  }
}

// Process notification queue (check for due review notifications)
app.post(`${PREFIX}/notifications/process-queue/:companyId`, async (c) => {
  const companyId = c.req.param('companyId') || 'default';

  try {
    const emailSettings = await kv.get(`email_settings_${companyId}`);
    const queue = await kv.get(`notification_queue_${companyId}`) || [];
    const now = new Date();
    const results: any[] = [];

    for (const notif of queue) {
      if (notif.status !== 'queued') continue;

      if (notif.type === 'review_available') {
        const reviewDate = new Date(notif.reviewAvailableAt);

        if (now >= reviewDate) {
          const payments = await kv.get(`payments_${companyId}`) || [];
          const eventPayment = payments.find((p: any) => p.eventId === notif.eventId);
          const clientEmail = eventPayment?.customerEmail;
          const eventName = eventPayment?.eventName || notif.eventId;

          if (emailSettings?.enabled && emailSettings?.smtpHost && clientEmail) {
            const reviewUrl = `${supabaseUrl.replace('.supabase.co', '.app')}/events/${notif.eventId}?tab=review`;

            console.log(`[Email] Sending review notification to ${clientEmail} for event "${eventName}"`);
            console.log(`[Email] Subject: Your post-event review is ready - ${eventName}`);
            console.log(`[Email] From: ${emailSettings.fromName} <${emailSettings.fromEmail}>`);
            console.log(`[Email] Review URL: ${reviewUrl}`);

            // Build email HTML (logged for production SMTP integration)
            buildReviewEmailHtml(eventName, clientEmail, reviewUrl, emailSettings.fromName);

            notif.status = 'sent';
            notif.sentAt = new Date().toISOString();
            notif.recipientEmail = clientEmail;
            results.push({ eventId: notif.eventId, status: 'sent', email: clientEmail });
          } else {
            notif.status = emailSettings?.enabled ? 'no_recipient' : 'email_disabled';
            notif.processedAt = new Date().toISOString();
            results.push({
              eventId: notif.eventId,
              status: notif.status,
              reason: !emailSettings?.enabled ? 'Email notifications disabled' :
                      !clientEmail ? 'No client email found' : 'SMTP not configured',
            });
          }
        }
      }
    }

    await kv.set(`notification_queue_${companyId}`, queue);

    const history = await kv.get(`notification_history_${companyId}`) || [];
    history.push(...results.map(r => ({ ...r, processedAt: new Date().toISOString() })));
    if (history.length > 200) history.splice(0, history.length - 200);
    await kv.set(`notification_history_${companyId}`, history);

    console.log(`[Email] Queue processed for company ${companyId}: ${results.length} notifications handled`);
    return c.json({ success: true, processed: results.length, results });
  } catch (error) {
    console.error(`[Email] Queue processing error for ${companyId}:`, error);
    return c.json({ error: `Queue processing failed: ${error.message}` }, 500);
  }
});

// Get notification history
app.get(`${PREFIX}/notifications/history/:companyId`, async (c) => {
  try {
    const companyId = c.req.param('companyId') || 'default';
    const history = await kv.get(`notification_history_${companyId}`) || [];
    const queue = await kv.get(`notification_queue_${companyId}`) || [];

    return c.json({
      history: history.slice(-50).reverse(),
      pending: queue.filter((n: any) => n.status === 'queued').length,
      total: queue.length,
    });
  } catch (error) {
    console.error('[Email] Error fetching history:', error);
    return c.json({ error: `Failed to fetch history: ${error.message}` }, 500);
  }
});

// Send a test email notification
app.post(`${PREFIX}/notifications/test-email`, async (c) => {
  try {
    const { companyId, recipientEmail } = await c.req.json();
    const keyId = companyId || 'default';
    const emailSettings = await kv.get(`email_settings_${keyId}`);

    if (!emailSettings?.enabled) {
      return c.json({ error: 'Email notifications are not enabled' }, 400);
    }

    console.log(`[Email] Test email would be sent to: ${recipientEmail}`);
    console.log(`[Email] From: ${emailSettings.fromName} <${emailSettings.fromEmail}>`);
    console.log(`[Email] SMTP: ${emailSettings.smtpHost}:${emailSettings.smtpPort}`);

    const history = await kv.get(`notification_history_${keyId}`) || [];
    history.push({
      type: 'test',
      recipientEmail,
      status: 'sent',
      processedAt: new Date().toISOString(),
    });
    await kv.set(`notification_history_${keyId}`, history);

    return c.json({
      success: true,
      message: `Test notification logged. In production, email would be sent to ${recipientEmail} via ${emailSettings.smtpHost}.`,
    });
  } catch (error) {
    console.error('[Email] Test email error:', error);
    return c.json({ error: `Test email failed: ${error.message}` }, 500);
  }
});

// Build review notification email HTML template
function buildReviewEmailHtml(eventName: string, clientEmail: string, reviewUrl: string, companyName: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
    <body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
        <div style="background:white;border-radius:16px;box-shadow:0 4px 6px rgba(0,0,0,0.05);overflow:hidden;">
          <div style="background:linear-gradient(135deg,#1e293b,#334155);padding:32px;text-align:center;">
            <h1 style="color:white;margin:0;font-size:24px;">${companyName}</h1>
            <p style="color:#94a3b8;margin:8px 0 0;font-size:14px;">Post-Event Review</p>
          </div>
          <div style="padding:32px;">
            <h2 style="color:#1e293b;margin:0 0 16px;font-size:20px;">Your review for "${eventName}" is ready</h2>
            <p style="color:#64748b;line-height:1.6;margin:0 0 24px;">
              Thank you for choosing us! We'd love to hear your feedback. Your post-event review is now available.
            </p>
            <div style="text-align:center;margin:32px 0;">
              <a href="${reviewUrl}" style="display:inline-block;background:#d97706;color:white;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:16px;">Write Your Review</a>
            </div>
            <p style="color:#94a3b8;font-size:13px;text-align:center;">This review link is personal to you (${clientEmail}).</p>
          </div>
          <div style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
            <p style="color:#94a3b8;font-size:12px;margin:0;">&copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
          </div>
        </div>
      </div>
    </body></html>`;
}

// ===== GOOGLE CALENDAR SYNC =====

// Update Google OAuth scopes to include Calendar
app.get(`${PREFIX}/google/calendar-auth-url/:companyId`, async (c) => {
  try {
    const companyId = c.req.param('companyId') || 'default';
    const creds = await kv.get(`google_oauth_${companyId}`);

    if (!creds) {
      return c.json({ error: 'Google OAuth not configured. Add credentials in Settings.' }, 400);
    }

    const redirectUri = creds.redirectUri || `${supabaseUrl}/functions/v1${PREFIX}/google/calendar-callback/${companyId}`;
    const state = btoa(JSON.stringify({ companyId, ts: Date.now(), type: 'calendar' }));

    await kv.set(`google_oauth_state_${state}`, { companyId, type: 'calendar', createdAt: new Date().toISOString() });

    const params = new URLSearchParams({
      client_id: creds.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email',
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    console.log(`[Google Calendar] Auth URL generated for company: ${companyId}`);
    return c.json({ authUrl, state });
  } catch (error) {
    console.error('[Google Calendar] Error generating auth URL:', error);
    return c.json({ error: `Failed to generate auth URL: ${error.message}` }, 500);
  }
});

// Google Calendar OAuth callback
app.get(`${PREFIX}/google/calendar-callback/:companyId`, async (c) => {
  const companyId = c.req.param('companyId') || 'default';

  try {
    const code = c.req.query('code');
    const state = c.req.query('state');
    const errorParam = c.req.query('error');

    if (errorParam) {
      return c.html(`<html><body><script>window.opener?.postMessage({type:'google-calendar-error',error:'${errorParam}'},'*');window.close();</script><p>Authorization denied.</p></body></html>`);
    }

    if (!code) {
      return c.html(`<html><body><script>window.opener?.postMessage({type:'google-calendar-error',error:'no_code'},'*');window.close();</script><p>No code received.</p></body></html>`);
    }

    if (state) {
      const stateData = await kv.get(`google_oauth_state_${state}`);
      if (!stateData) {
        return c.html(`<html><body><script>window.opener?.postMessage({type:'google-calendar-error',error:'invalid_state'},'*');window.close();</script></body></html>`);
      }
      await kv.del(`google_oauth_state_${state}`);
    }

    const creds = await kv.get(`google_oauth_${companyId}`);
    if (!creds) {
      return c.html(`<html><body><script>window.opener?.postMessage({type:'google-calendar-error',error:'not_configured'},'*');window.close();</script></body></html>`);
    }

    const redirectUri = creds.redirectUri || `${supabaseUrl}/functions/v1${PREFIX}/google/calendar-callback/${companyId}`;

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      return c.html(`<html><body><script>window.opener?.postMessage({type:'google-calendar-error',error:'${tokenData.error}'},'*');window.close();</script></body></html>`);
    }

    let userEmail = '';
    try {
      const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const userInfo = await userInfoRes.json();
      userEmail = userInfo.email || '';
    } catch (e) {
      console.log('[Google Calendar] Could not fetch user email');
    }

    await kv.set(`google_calendar_tokens_${companyId}`, {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expiry: new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString(),
      userEmail,
      createdAt: new Date().toISOString(),
    });

    console.log(`[Google Calendar] Tokens stored for company: ${companyId}, user: ${userEmail}`);

    return c.html(`<html><body><script>window.opener?.postMessage({type:'google-calendar-success',email:'${userEmail}',companyId:'${companyId}'},'*');window.close();</script><p>Google Calendar connected as ${userEmail}. You can close this window.</p></body></html>`);
  } catch (error) {
    console.error(`[Google Calendar] Callback error for ${companyId}:`, error);
    return c.html(`<html><body><script>window.opener?.postMessage({type:'google-calendar-error',error:'server_error'},'*');window.close();</script></body></html>`);
  }
});

// Refresh Google Calendar token
async function refreshCalendarToken(companyId: string): Promise<string | null> {
  try {
    const tokens = await kv.get(`google_calendar_tokens_${companyId}`);
    if (!tokens) return null;

    if (tokens.expiry && new Date(tokens.expiry).getTime() > Date.now() + 300000) {
      return tokens.access_token;
    }

    if (!tokens.refresh_token) return null;

    const creds = await kv.get(`google_oauth_${companyId}`);
    if (!creds) return null;

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        refresh_token: tokens.refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    const data = await response.json();
    if (data.error) return null;

    await kv.set(`google_calendar_tokens_${companyId}`, {
      ...tokens,
      access_token: data.access_token,
      expiry: new Date(Date.now() + (data.expires_in * 1000)).toISOString(),
    });

    return data.access_token;
  } catch (error) {
    console.error(`[Google Calendar] Refresh error for ${companyId}:`, error);
    return null;
  }
}

// Check calendar connection status
app.get(`${PREFIX}/google/calendar-status/:companyId`, async (c) => {
  try {
    const companyId = c.req.param('companyId') || 'default';
    const tokens = await kv.get(`google_calendar_tokens_${companyId}`);

    return c.json({
      connected: !!tokens?.access_token,
      userEmail: tokens?.userEmail || null,
      tokenExpiry: tokens?.expiry || null,
    });
  } catch (error) {
    return c.json({ error: `Failed to check status: ${error.message}` }, 500);
  }
});

// Fetch events from Google Calendar
app.get(`${PREFIX}/google/calendar-events/:companyId`, async (c) => {
  const companyId = c.req.param('companyId') || 'default';

  try {
    const accessToken = await refreshCalendarToken(companyId);
    if (!accessToken) {
      return c.json({ error: 'Not authenticated with Google Calendar.', needsAuth: true }, 401);
    }

    const timeMin = c.req.query('timeMin') || new Date().toISOString();
    const timeMax = c.req.query('timeMax') || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
    });

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) {
      if (response.status === 401) {
        return c.json({ error: 'Google Calendar auth expired.', needsAuth: true }, 401);
      }
      return c.json({ error: `Google Calendar API error: ${response.status}` }, response.status);
    }

    const data = await response.json();
    return c.json({ events: data.items || [], nextPageToken: data.nextPageToken || null });
  } catch (error) {
    console.error(`[Google Calendar] Fetch error for ${companyId}:`, error);
    return c.json({ error: `Failed to fetch events: ${error.message}` }, 500);
  }
});

// Create event in Google Calendar
app.post(`${PREFIX}/google/calendar-events/:companyId`, async (c) => {
  const companyId = c.req.param('companyId') || 'default';

  try {
    const accessToken = await refreshCalendarToken(companyId);
    if (!accessToken) {
      return c.json({ error: 'Not authenticated with Google Calendar.', needsAuth: true }, 401);
    }

    const eventData = await c.req.json();

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(eventData),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      return c.json({ error: `Failed to create event: ${errText}` }, response.status);
    }

    const created = await response.json();
    console.log(`[Google Calendar] Event created: ${created.id} for company ${companyId}`);
    return c.json({ success: true, event: created });
  } catch (error) {
    console.error(`[Google Calendar] Create error for ${companyId}:`, error);
    return c.json({ error: `Failed to create event: ${error.message}` }, 500);
  }
});

// Delete event from Google Calendar
app.delete(`${PREFIX}/google/calendar-events/:companyId/:eventId`, async (c) => {
  const companyId = c.req.param('companyId') || 'default';
  const eventId = c.req.param('eventId');

  try {
    const accessToken = await refreshCalendarToken(companyId);
    if (!accessToken) {
      return c.json({ error: 'Not authenticated.', needsAuth: true }, 401);
    }

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!response.ok && response.status !== 204) {
      return c.json({ error: `Failed to delete: ${response.status}` }, response.status);
    }

    console.log(`[Google Calendar] Event deleted: ${eventId}`);
    return c.json({ success: true });
  } catch (error) {
    return c.json({ error: `Failed to delete event: ${error.message}` }, 500);
  }
});

// Update (PATCH) an existing event in Google Calendar
app.patch(`${PREFIX}/google/calendar-events/:companyId/:eventId`, async (c) => {
  const companyId = c.req.param('companyId') || 'default';
  const eventId = c.req.param('eventId');

  try {
    const accessToken = await refreshCalendarToken(companyId);
    if (!accessToken) {
      return c.json({ error: 'Not authenticated with Google Calendar.', needsAuth: true }, 401);
    }

    const eventData = await c.req.json();

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(eventData),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Google Calendar] PATCH error for ${eventId}:`, errText);
      return c.json({ error: `Failed to update event: ${errText}` }, response.status);
    }

    const updated = await response.json();
    console.log(`[Google Calendar] Event updated: ${eventId} for company ${companyId}`);
    return c.json({ success: true, event: updated });
  } catch (error) {
    console.error(`[Google Calendar] Update error for ${companyId}/${eventId}:`, error);
    return c.json({ error: `Failed to update event: ${error.message}` }, 500);
  }
});

// Store/retrieve app event -> Google Calendar event ID mappings
app.get(`${PREFIX}/google/calendar-mappings/:companyId`, async (c) => {
  const companyId = c.req.param('companyId') || 'default';
  try {
    const mappings = await kv.get(`gcal_mappings_${companyId}`) || {};
    return c.json({ mappings });
  } catch (error) {
    console.error(`[Google Calendar] Error fetching mappings:`, error);
    return c.json({ error: `Failed to fetch mappings: ${error.message}` }, 500);
  }
});

app.post(`${PREFIX}/google/calendar-mappings/:companyId`, async (c) => {
  const companyId = c.req.param('companyId') || 'default';
  try {
    const { appEventId, googleEventId } = await c.req.json();
    if (!appEventId || !googleEventId) {
      return c.json({ error: 'appEventId and googleEventId are required' }, 400);
    }
    const mappings = await kv.get(`gcal_mappings_${companyId}`) || {};
    mappings[appEventId] = googleEventId;
    await kv.set(`gcal_mappings_${companyId}`, mappings);
    console.log(`[Google Calendar] Mapping saved: ${appEventId} -> ${googleEventId}`);
    return c.json({ success: true, mappings });
  } catch (error) {
    console.error(`[Google Calendar] Error saving mapping:`, error);
    return c.json({ error: `Failed to save mapping: ${error.message}` }, 500);
  }
});

// Disconnect Google Calendar
app.post(`${PREFIX}/google/calendar-disconnect/:companyId`, async (c) => {
  try {
    const companyId = c.req.param('companyId') || 'default';
    const tokens = await kv.get(`google_calendar_tokens_${companyId}`);

    if (tokens?.access_token) {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${tokens.access_token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
      } catch (e) {
        console.log('[Google Calendar] Token revocation failed, continuing...');
      }
    }

    await kv.del(`google_calendar_tokens_${companyId}`);
    console.log(`[Google Calendar] Disconnected for company: ${companyId}`);
    return c.json({ success: true });
  } catch (error) {
    return c.json({ error: `Failed to disconnect: ${error.message}` }, 500);
  }
});

// ─── Event Portal Questionnaires ───────────────────────────────

// GET questionnaires for an event
app.get(`${PREFIX}/portal/questionnaires/:eventId`, async (c) => {
  try {
    const eventId = c.req.param('eventId');
    const data = await kv.get(`portal_questions_${eventId}`);
    console.log(`[Portal Q&A] Loaded ${(data || []).length} questions for event ${eventId}`);
    return c.json({ questions: data || [] });
  } catch (error) {
    console.log(`[Portal Q&A] Error loading questions for event: ${error.message}`);
    return c.json({ error: `Failed to load questionnaires: ${error.message}` }, 500);
  }
});

// PUT (save) questionnaires for an event
app.put(`${PREFIX}/portal/questionnaires/:eventId`, async (c) => {
  try {
    const eventId = c.req.param('eventId');
    const { questions } = await c.req.json();
    if (!Array.isArray(questions)) {
      return c.json({ error: 'Invalid payload: questions must be an array' }, 400);
    }
    await kv.set(`portal_questions_${eventId}`, questions);
    console.log(`[Portal Q&A] Saved ${questions.length} questions for event ${eventId}`);
    return c.json({ success: true, count: questions.length });
  } catch (error) {
    console.log(`[Portal Q&A] Error saving questions: ${error.message}`);
    return c.json({ error: `Failed to save questionnaires: ${error.message}` }, 500);
  }
});

// POST send portal invite email (simulated)
app.post(`${PREFIX}/portal/send-invite/:eventId`, async (c) => {
  try {
    const eventId = c.req.param('eventId');
    const { recipientEmail, recipientName, eventName, portalUrl, magicLinkUrl, senderName } = await c.req.json();
    if (!recipientEmail || !eventName) {
      return c.json({ error: 'Missing required fields: recipientEmail, eventName' }, 400);
    }
    // Log the invite for audit trail
    const inviteRecord = {
      eventId,
      recipientEmail,
      recipientName: recipientName || 'Client',
      eventName,
      portalUrl,
      magicLinkUrl: magicLinkUrl || null,
      senderName: senderName || 'Coordinator',
      sentAt: new Date().toISOString(),
    };
    // Store invite history
    const existingInvites = await kv.get(`portal_invites_${eventId}`) || [];
    existingInvites.push(inviteRecord);
    await kv.set(`portal_invites_${eventId}`, existingInvites);
    console.log(`[Portal Invite] Sent invite to ${recipientEmail} for event ${eventId} (${eventName})`);
    return c.json({ success: true, invite: inviteRecord });
  } catch (error) {
    console.log(`[Portal Invite] Error sending invite: ${error.message}`);
    return c.json({ error: `Failed to send invite: ${error.message}` }, 500);
  }
});

// GET invite history for an event
app.get(`${PREFIX}/portal/invites/:eventId`, async (c) => {
  try {
    const eventId = c.req.param('eventId');
    const data = await kv.get(`portal_invites_${eventId}`);
    return c.json({ invites: data || [] });
  } catch (error) {
    return c.json({ error: `Failed to load invites: ${error.message}` }, 500);
  }
});

// ─── Moodboard CRUD ────────────────────────────────────────────

app.get(`${PREFIX}/portal/moodboard/:eventId`, async (c) => {
  try {
    const eventId = c.req.param('eventId');
    const data = await kv.get(`portal_moodboard_${eventId}`);
    console.log(`[Portal Moodboard] Loaded ${(data || []).length} items for event ${eventId}`);
    return c.json({ items: data || [] });
  } catch (error) {
    console.log(`[Portal Moodboard] Load error: ${error.message}`);
    return c.json({ error: `Failed to load moodboard: ${error.message}` }, 500);
  }
});

app.put(`${PREFIX}/portal/moodboard/:eventId`, async (c) => {
  try {
    const eventId = c.req.param('eventId');
    const { items } = await c.req.json();
    if (!Array.isArray(items)) {
      return c.json({ error: 'Invalid payload: items must be an array' }, 400);
    }
    await kv.set(`portal_moodboard_${eventId}`, items);
    console.log(`[Portal Moodboard] Saved ${items.length} items for event ${eventId}`);
    return c.json({ success: true, count: items.length });
  } catch (error) {
    console.log(`[Portal Moodboard] Save error: ${error.message}`);
    return c.json({ error: `Failed to save moodboard: ${error.message}` }, 500);
  }
});

// ─── Floor Plan Table Positions ────────────────────────────────

app.get(`${PREFIX}/portal/floorplan/:eventId`, async (c) => {
  try {
    const eventId = c.req.param('eventId');
    const data = await kv.get(`portal_floorplan_${eventId}`);
    console.log(`[Portal FloorPlan] Loaded positions for event ${eventId}`);
    return c.json({ positions: data || {} });
  } catch (error) {
    console.log(`[Portal FloorPlan] Load error: ${error.message}`);
    return c.json({ error: `Failed to load floor plan: ${error.message}` }, 500);
  }
});

app.put(`${PREFIX}/portal/floorplan/:eventId`, async (c) => {
  try {
    const eventId = c.req.param('eventId');
    const { positions } = await c.req.json();
    if (typeof positions !== 'object') {
      return c.json({ error: 'Invalid payload: positions must be an object' }, 400);
    }
    await kv.set(`portal_floorplan_${eventId}`, positions);
    console.log(`[Portal FloorPlan] Saved ${Object.keys(positions).length} table positions for event ${eventId}`);
    return c.json({ success: true });
  } catch (error) {
    console.log(`[Portal FloorPlan] Save error: ${error.message}`);
    return c.json({ error: `Failed to save floor plan: ${error.message}` }, 500);
  }
});

// ─── Email Template Settings ───────────────────────────────────

app.get(`${PREFIX}/portal/email-template/:companyId`, async (c) => {
  try {
    const companyId = c.req.param('companyId') || 'default';
    const data = await kv.get(`portal_email_template_${companyId}`);
    console.log(`[Email Template] Loaded template for company ${companyId}`);
    return c.json({ template: data || null });
  } catch (error) {
    console.log(`[Email Template] Load error: ${error.message}`);
    return c.json({ error: `Failed to load email template: ${error.message}` }, 500);
  }
});

app.put(`${PREFIX}/portal/email-template/:companyId`, async (c) => {
  try {
    const companyId = c.req.param('companyId') || 'default';
    const { template } = await c.req.json();
    if (!template || typeof template !== 'object') {
      return c.json({ error: 'Invalid payload: template must be an object' }, 400);
    }
    await kv.set(`portal_email_template_${companyId}`, template);
    console.log(`[Email Template] Saved template for company ${companyId}`);
    return c.json({ success: true });
  } catch (error) {
    console.log(`[Email Template] Save error: ${error.message}`);
    return c.json({ error: `Failed to save email template: ${error.message}` }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════
// MUSIC PLANNER - per-event music planning data
// ═══════════════════════════════════════════════════════════════
app.get(`${PREFIX}/portal/music/:eventId`, async (c) => {
  try {
    const eventId = c.req.param('eventId');
    const data = await kv.get(`portal_music_${eventId}`);
    return c.json(data || {});
  } catch (error) {
    console.log(`[Music] Load error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

app.put(`${PREFIX}/portal/music/:eventId`, async (c) => {
  try {
    const eventId = c.req.param('eventId');
    const body = await c.req.json();
    await kv.set(`portal_music_${eventId}`, body);
    return c.json({ success: true });
  } catch (error) {
    console.log(`[Music] Save error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════
// CONTRACTS - per-event contract management
// ═══════════════════════════════════════════════════════════════
app.get(`${PREFIX}/portal/contracts/:eventId`, async (c) => {
  try {
    const eventId = c.req.param('eventId');
    const data = await kv.get(`portal_contracts_${eventId}`);
    return c.json(data || {});
  } catch (error) {
    console.log(`[Contracts] Load error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

app.put(`${PREFIX}/portal/contracts/:eventId`, async (c) => {
  try {
    const eventId = c.req.param('eventId');
    const body = await c.req.json();
    await kv.set(`portal_contracts_${eventId}`, body);
    return c.json({ success: true });
  } catch (error) {
    console.log(`[Contracts] Save error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════
// CUSTOM FORMS - per-event form builder data
// ═══════════════════════════════════════════════════════════════
app.get(`${PREFIX}/portal/forms/:eventId`, async (c) => {
  try {
    const eventId = c.req.param('eventId');
    const data = await kv.get(`portal_forms_${eventId}`);
    return c.json(data || {});
  } catch (error) {
    console.log(`[Forms] Load error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

app.put(`${PREFIX}/portal/forms/:eventId`, async (c) => {
  try {
    const eventId = c.req.param('eventId');
    const body = await c.req.json();
    await kv.set(`portal_forms_${eventId}`, body);
    return c.json({ success: true });
  } catch (error) {
    console.log(`[Forms] Save error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════
// WORKFLOW AUTOMATIONS
// ═══════════════════════════════════════════════════════════════
app.get(`${PREFIX}/automations/:scopeId`, async (c) => {
  try {
    const scopeId = c.req.param('scopeId');
    const data = await kv.get(`automations_${scopeId}`);
    return c.json(data || {});
  } catch (error) {
    console.log(`[Automations] Load error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

app.put(`${PREFIX}/automations/:scopeId`, async (c) => {
  try {
    const scopeId = c.req.param('scopeId');
    const body = await c.req.json();
    await kv.set(`automations_${scopeId}`, body);
    return c.json({ success: true });
  } catch (error) {
    console.log(`[Automations] Save error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════
// SMS SETTINGS
// ═══════════════════════════════════════════════════════════════
app.get(`${PREFIX}/settings/sms/:companyId`, async (c) => {
  try {
    const companyId = c.req.param('companyId');
    const data = await kv.get(`sms_settings_${companyId}`);
    return c.json(data || {});
  } catch (error) {
    console.log(`[SMS Settings] Load error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

app.put(`${PREFIX}/settings/sms/:companyId`, async (c) => {
  try {
    const companyId = c.req.param('companyId');
    const body = await c.req.json();
    await kv.set(`sms_settings_${companyId}`, body);
    return c.json({ success: true });
  } catch (error) {
    console.log(`[SMS Settings] Save error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════
// PUBLIC BOOKING - lead capture → auto CRM lead creation
// ═══════════════════════════════════════════════════════════════
app.post(`${PREFIX}/public/booking-inquiry`, async (c) => {
  try {
    const inquiry = await c.req.json();
    const id = `inquiry_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const clientId = `crm_lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const receivedAt = new Date().toISOString();

    // 1. Store raw inquiry
    await kv.set(id, { ...inquiry, status: 'new', receivedAt });

    // 2. Auto-create CRM lead entry
    const crmLead = {
      id: clientId,
      name: inquiry.name || 'Unknown',
      email: inquiry.email || '',
      phone: inquiry.phone || '',
      company: inquiry.company || '',
      status: 'lead',
      depositPaid: false,
      fullPaymentReceived: false,
      source: 'booking-page',
      notes: [
        `Event type: ${inquiry.eventType || 'Not specified'}`,
        inquiry.eventDate ? `Preferred date: ${inquiry.eventDate}` : '',
        inquiry.guestCount ? `Guest count: ${inquiry.guestCount}` : '',
        inquiry.budget ? `Budget: ${inquiry.budget}` : '',
        inquiry.message ? `Vision: ${inquiry.message}` : '',
        inquiry.hearAboutUs ? `Referral source: ${inquiry.hearAboutUs}` : '',
      ].filter(Boolean).join('\n'),
      activityTrail: [
        {
          id: `trail-${Date.now()}`,
          type: 'note',
          content: `New lead captured from public booking page. Event type: ${inquiry.eventType || 'N/A'}, Budget: ${inquiry.budget || 'N/A'}, Guest count: ${inquiry.guestCount || 'N/A'}`,
          author: 'System (Auto-capture)',
          authorRole: 'System',
          timestamp: receivedAt,
        },
      ],
      receivedAt,
      inquiryData: inquiry,
    };
    await kv.set(clientId, crmLead);

    // 3. Try to send SMS notification to coordinator if Twilio is configured
    try {
      const smsData = await kv.get('sms_settings_default');
      if (smsData && smsData.config && smsData.config.isConnected && smsData.config.smsEnabled !== false) {
        const { twilioAccountSid, twilioAuthToken, twilioPhoneNumber } = smsData.config;
        const template = (smsData.config.templates || []).find(
          (t: any) => t.trigger === 'new-lead' && t.isActive
        );
        if (template && twilioAccountSid && twilioAuthToken && twilioPhoneNumber) {
          const msg = template.message
            .replace(/\{\{leadName\}\}/g, inquiry.name || 'Unknown')
            .replace(/\{\{clientName\}\}/g, inquiry.name || 'Unknown')
            .replace(/\{\{eventType\}\}/g, inquiry.eventType || 'Event');
          console.log(`[SMS] New lead alert queued: ${msg}`);
        }
      }
    } catch (smsErr) {
      console.log(`[SMS] Non-critical SMS error: ${smsErr.message}`);
    }

    // 4. Auto-dispatch webhooks for "New Lead Captured" event
    try {
      const webhookResults = await dispatchWebhooks('default', 'New Lead Captured', {
        name: inquiry.name,
        email: inquiry.email,
        phone: inquiry.phone,
        eventType: inquiry.eventType,
        eventDate: inquiry.eventDate,
        budget: inquiry.budget,
        guestCount: inquiry.guestCount,
        message: inquiry.message,
        source: 'booking-page',
        capturedAt: receivedAt,
      });
      if (webhookResults.length > 0) {
        console.log(`[Booking] Dispatched ${webhookResults.length} webhook(s) for new lead`);
      }
    } catch (whErr) {
      console.log(`[Booking] Non-critical webhook dispatch error: ${whErr.message}`);
    }

    console.log(`[Booking] New inquiry from ${inquiry.name} for ${inquiry.eventType} -> CRM lead ${clientId} auto-created`);
    return c.json({ success: true, id, clientId });
  } catch (error) {
    console.log(`[Booking] Submit error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// GET all CRM leads (from booking page auto-capture)
app.get(`${PREFIX}/crm/leads`, async (c) => {
  try {
    const leads = await kv.getByPrefix('crm_lead_');
    console.log(`[CRM] Fetched ${leads ? leads.length : 0} auto-captured leads`);
    return c.json({ leads: leads || [] });
  } catch (error) {
    console.log(`[CRM] Fetch leads error: ${error.message}`);
    return c.json({ error: error.message, leads: [] }, 500);
  }
});

// DELETE a CRM lead after it's been synced to context
app.delete(`${PREFIX}/crm/leads/:leadId`, async (c) => {
  try {
    const leadId = c.req.param('leadId');
    await kv.del(leadId);
    console.log(`[CRM] Deleted synced lead ${leadId}`);
    return c.json({ success: true });
  } catch (error) {
    console.log(`[CRM] Delete lead error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════
// SMS - Send SMS via Twilio REST API
// ═══════════════════════════════════════════════════════════════
app.post(`${PREFIX}/sms/send`, async (c) => {
  try {
    const { to, message, companyId } = await c.req.json();
    if (!to || !message) {
      return c.json({ error: 'Missing required fields: to, message' }, 400);
    }

    const key = companyId || 'default';
    const smsData = await kv.get(`sms_settings_${key}`);
    if (!smsData || !smsData.config) {
      return c.json({ error: 'SMS settings not configured. Add Twilio credentials in Settings > SMS.' }, 400);
    }

    const { twilioAccountSid, twilioAuthToken, twilioPhoneNumber, isConnected } = smsData.config;
    if (!isConnected || !twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
      return c.json({ error: 'Twilio is not connected. Please verify your credentials in Settings > SMS.' }, 400);
    }

    // Call Twilio REST API
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
    const authHeader = 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`);

    const formBody = new URLSearchParams({
      To: to,
      From: twilioPhoneNumber,
      Body: message,
    });

    const twilioRes = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formBody.toString(),
    });

    const twilioData = await twilioRes.json();

    if (!twilioRes.ok) {
      const errMsg = twilioData.message || twilioData.error_message || 'Unknown Twilio error';
      console.log(`[SMS] Twilio API error (${twilioRes.status}): ${errMsg}`);
      return c.json({ error: `Twilio error: ${errMsg}`, status: twilioRes.status }, 400);
    }

    // Update monthly sent counter
    smsData.config.monthlySent = (smsData.config.monthlySent || 0) + 1;
    await kv.set(`sms_settings_${key}`, smsData);

    console.log(`[SMS] Message sent to ${to}. SID: ${twilioData.sid}`);
    return c.json({
      success: true,
      sid: twilioData.sid,
      status: twilioData.status,
      to: twilioData.to,
    });
  } catch (error) {
    console.log(`[SMS] Send error: ${error.message}`);
    return c.json({ error: `Failed to send SMS: ${error.message}` }, 500);
  }
});

// Send SMS using a specific template
app.post(`${PREFIX}/sms/send-template`, async (c) => {
  try {
    const { to, templateId, variables, companyId } = await c.req.json();
    if (!to || !templateId) {
      return c.json({ error: 'Missing required fields: to, templateId' }, 400);
    }

    const key = companyId || 'default';
    const smsData = await kv.get(`sms_settings_${key}`);
    if (!smsData?.config?.isConnected) {
      return c.json({ error: 'SMS not connected' }, 400);
    }

    const template = (smsData.config.templates || []).find((t: any) => t.id === templateId);
    if (!template) {
      return c.json({ error: `Template ${templateId} not found` }, 404);
    }

    let message = template.message;
    if (variables && typeof variables === 'object') {
      for (const [varKey, varVal] of Object.entries(variables)) {
        message = message.replace(new RegExp(`\\{\\{${varKey}\\}\\}`, 'g'), String(varVal));
      }
    }

    const { twilioAccountSid, twilioAuthToken, twilioPhoneNumber } = smsData.config;
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
    const authHeader = 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`);

    const formBody = new URLSearchParams({ To: to, From: twilioPhoneNumber, Body: message });
    const twilioRes = await fetch(twilioUrl, {
      method: 'POST',
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody.toString(),
    });

    const twilioData = await twilioRes.json();
    if (!twilioRes.ok) {
      return c.json({ error: `Twilio error: ${twilioData.message || 'Unknown'}` }, 400);
    }

    smsData.config.monthlySent = (smsData.config.monthlySent || 0) + 1;
    await kv.set(`sms_settings_${key}`, smsData);

    console.log(`[SMS] Template "${template.name}" sent to ${to}. SID: ${twilioData.sid}`);
    return c.json({ success: true, sid: twilioData.sid, templateName: template.name });
  } catch (error) {
    console.log(`[SMS Template] Send error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════
// BOOKING WIDGET CONFIG
// ═══════════════════════════════════════════════════════════════
app.get(`${PREFIX}/settings/booking-widget/:companyId`, async (c) => {
  try {
    const companyId = c.req.param('companyId');
    const data = await kv.get(`booking_widget_${companyId}`);
    return c.json(data || {});
  } catch (error) {
    console.log(`[Booking Widget] Load error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

app.put(`${PREFIX}/settings/booking-widget/:companyId`, async (c) => {
  try {
    const companyId = c.req.param('companyId');
    const body = await c.req.json();
    await kv.set(`booking_widget_${companyId}`, body);
    return c.json({ success: true });
  } catch (error) {
    console.log(`[Booking Widget] Save error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════
// GUEST PORTAL - RSVP & preferences
// ═══════════════════════════════════════════════════════════════
app.get(`${PREFIX}/portal/guest-rsvp/:eventId`, async (c) => {
  try {
    const eventId = c.req.param('eventId');
    const data = await kv.get(`guest_rsvp_${eventId}`);
    return c.json(data || {});
  } catch (error) {
    console.log(`[Guest RSVP] Load error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

app.put(`${PREFIX}/portal/guest-rsvp/:eventId`, async (c) => {
  try {
    const eventId = c.req.param('eventId');
    const body = await c.req.json();
    await kv.set(`guest_rsvp_${eventId}`, body);
    console.log(`[Guest RSVP] Saved RSVP for event ${eventId}`);
    return c.json({ success: true });
  } catch (error) {
    console.log(`[Guest RSVP] Save error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════
// WEBHOOK MANAGEMENT + DISPATCH - KV-persisted webhook configs
// ═══════════════════════════════════════════════════════════════
app.get(`${PREFIX}/webhooks/:companyId`, async (c) => {
  try {
    const companyId = c.req.param('companyId');
    const data = await kv.get(`webhooks_${companyId}`);
    return c.json(data || { webhooks: [] });
  } catch (error) {
    console.log(`[Webhooks] Load error: ${error.message}`);
    return c.json({ webhooks: [] }, 500);
  }
});

app.put(`${PREFIX}/webhooks/:companyId`, async (c) => {
  try {
    const companyId = c.req.param('companyId');
    const body = await c.req.json();
    await kv.set(`webhooks_${companyId}`, body);
    console.log(`[Webhooks] Saved ${body.webhooks?.length || 0} webhooks for ${companyId}`);
    return c.json({ success: true });
  } catch (error) {
    console.log(`[Webhooks] Save error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════
// WEBHOOK DISPATCH - Fire webhooks for a given event type
// ═══════════════════════════════════════════════════════════════
async function dispatchWebhooks(companyId: string, eventType: string, payload: any) {
  const results: any[] = [];
  try {
    const data = await kv.get(`webhooks_${companyId}`);
    const webhooks = data?.webhooks || [];
    const matching = webhooks.filter(
      (w: any) => w.status === 'active' && w.events?.includes(eventType)
    );

    if (matching.length === 0) {
      console.log(`[Webhooks] No active webhooks for event "${eventType}"`);
      return results;
    }

    for (const webhook of matching) {
      try {
        const isSlack = webhook.url.includes('hooks.slack.com');

        const body = isSlack
          ? {
              text: `*${eventType}* triggered`,
              blocks: [
                { type: 'header', text: { type: 'plain_text', text: `🔔 ${eventType}`, emoji: true } },
                {
                  type: 'section',
                  fields: [
                    { type: 'mrkdwn', text: `*Name:*\n${payload.name || 'N/A'}` },
                    { type: 'mrkdwn', text: `*Email:*\n${payload.email || 'N/A'}` },
                    ...(payload.phone ? [{ type: 'mrkdwn', text: `*Phone:*\n${payload.phone}` }] : []),
                    ...(payload.eventType ? [{ type: 'mrkdwn', text: `*Event Type:*\n${payload.eventType}` }] : []),
                    ...(payload.budget ? [{ type: 'mrkdwn', text: `*Budget:*\n${payload.budget}` }] : []),
                    ...(payload.eventDate ? [{ type: 'mrkdwn', text: `*Date:*\n${payload.eventDate}` }] : []),
                  ],
                },
                ...(payload.message
                  ? [{ type: 'section', text: { type: 'mrkdwn', text: `*Vision:*\n> ${payload.message}` } }]
                  : []),
                { type: 'context', elements: [{ type: 'mrkdwn', text: `Sent from Event Mastermind at ${new Date().toISOString()}` }] },
              ],
            }
          : {
              event: eventType,
              timestamp: new Date().toISOString(),
              data: payload,
            };

        const res = await fetch(webhook.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        results.push({ webhookId: webhook.id, webhookName: webhook.name, success: res.ok, status: res.status });
        console.log(`[Webhooks] Dispatched "${eventType}" to "${webhook.name}" -> ${res.status}`);
      } catch (whErr) {
        results.push({ webhookId: webhook.id, webhookName: webhook.name, success: false, error: whErr.message });
        console.log(`[Webhooks] Failed to dispatch to "${webhook.name}": ${whErr.message}`);
      }
    }
  } catch (error) {
    console.log(`[Webhooks] Dispatch error: ${error.message}`);
  }
  return results;
}

app.post(`${PREFIX}/webhooks/dispatch`, async (c) => {
  try {
    const { companyId, eventType, payload } = await c.req.json();
    if (!eventType) return c.json({ error: 'Missing eventType' }, 400);
    const results = await dispatchWebhooks(companyId || 'default', eventType, payload || {});
    return c.json({ success: true, results });
  } catch (error) {
    console.log(`[Webhooks] Dispatch endpoint error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

app.post(`${PREFIX}/webhooks/test`, async (c) => {
  try {
    const { url } = await c.req.json();
    if (!url) return c.json({ error: 'Missing url' }, 400);

    const isSlack = url.includes('hooks.slack.com');
    const testBody = isSlack
      ? {
          text: '✅ Webhook test from Event Mastermind',
          blocks: [
            { type: 'header', text: { type: 'plain_text', text: '✅ Webhook Test Successful', emoji: true } },
            { type: 'section', text: { type: 'mrkdwn', text: 'Your Slack webhook is connected to *Event Mastermind*. You will receive notifications for your subscribed events.' } },
            { type: 'context', elements: [{ type: 'mrkdwn', text: `Test sent at ${new Date().toISOString()}` }] },
          ],
        }
      : {
          event: 'webhook.test',
          timestamp: new Date().toISOString(),
          data: { message: 'Webhook test from Event Mastermind. Connection verified.' },
        };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testBody),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown error');
      return c.json({ success: false, status: res.status, error: errText });
    }

    console.log(`[Webhooks] Test successful to ${url} -> ${res.status}`);
    return c.json({ success: true, status: res.status });
  } catch (error) {
    console.log(`[Webhooks] Test error: ${error.message}`);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════
// AUTOMATION ENGINE - Trigger workflow execution server-side
// ═══════════════════════════════════════════════════════════════
app.post(`${PREFIX}/automations/trigger`, async (c) => {
  try {
    const { triggerType, context, scopeId } = await c.req.json();
    if (!triggerType) return c.json({ error: 'Missing triggerType' }, 400);

    const key = scopeId || 'global';
    const data = await kv.get(`automations_${key}`);
    const workflows = data?.workflows || [];

    const matching = workflows.filter(
      (w: any) => w.isActive && w.trigger?.type === triggerType
    );

    if (matching.length === 0) {
      console.log(`[Automations] No active workflows for trigger "${triggerType}"`);
      return c.json({ success: true, executed: 0, results: [] });
    }

    const executionResults: any[] = [];

    for (const workflow of matching) {
      const actions = workflow.actions || [];
      const actionResults: any[] = [];

      for (const action of actions) {
        try {
          switch (action.type) {
            case 'send-email': {
              const subject = (action.config?.subject || 'Notification')
                .replace(/\{\{clientName\}\}/g, context?.name || 'Client')
                .replace(/\{\{eventType\}\}/g, context?.eventType || 'Event')
                .replace(/\{\{eventName\}\}/g, context?.eventName || 'Event');
              console.log(`[Automations] Email action: To=${context?.email || 'N/A'}, Subject="${subject}"`);
              actionResults.push({ actionId: action.id, type: 'send-email', status: 'executed', detail: `Email queued: "${subject}" to ${context?.email || 'N/A'}` });
              break;
            }
            case 'send-sms': {
              if (context?.phone) {
                try {
                  const smsData = await kv.get('sms_settings_default');
                  if (smsData?.config?.isConnected) {
                    const { twilioAccountSid, twilioAuthToken, twilioPhoneNumber } = smsData.config;
                    const msg = (action.config?.message || 'Hello!')
                      .replace(/\{\{clientName\}\}/g, context?.name || 'there')
                      .replace(/\{\{eventType\}\}/g, context?.eventType || 'Event');

                    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
                    const authHeader = 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`);
                    const formBody = new URLSearchParams({ To: context.phone, From: twilioPhoneNumber, Body: msg });

                    const twilioRes = await fetch(twilioUrl, {
                      method: 'POST',
                      headers: { 'Authorization': authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
                      body: formBody.toString(),
                    });
                    const twilioData = await twilioRes.json();

                    if (twilioRes.ok) {
                      smsData.config.monthlySent = (smsData.config.monthlySent || 0) + 1;
                      await kv.set('sms_settings_default', smsData);
                      actionResults.push({ actionId: action.id, type: 'send-sms', status: 'sent', sid: twilioData.sid });
                      console.log(`[Automations] SMS sent to ${context.phone}, SID: ${twilioData.sid}`);
                    } else {
                      actionResults.push({ actionId: action.id, type: 'send-sms', status: 'failed', error: twilioData.message });
                    }
                  } else {
                    actionResults.push({ actionId: action.id, type: 'send-sms', status: 'skipped', reason: 'Twilio not connected' });
                  }
                } catch (smsErr) {
                  actionResults.push({ actionId: action.id, type: 'send-sms', status: 'error', error: smsErr.message });
                }
              } else {
                actionResults.push({ actionId: action.id, type: 'send-sms', status: 'skipped', reason: 'No phone number' });
              }
              break;
            }
            case 'create-task': {
              const taskTitle = (action.config?.title || 'Task')
                .replace(/\{\{clientName\}\}/g, context?.name || 'Client')
                .replace(/\{\{eventType\}\}/g, context?.eventType || 'Event');
              const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
              await kv.set(taskId, {
                id: taskId, title: taskTitle, assignee: action.config?.assignee || 'coordinator',
                status: 'pending', createdAt: new Date().toISOString(),
                createdBy: 'Automation Engine', triggerWorkflow: workflow.name, context,
              });
              actionResults.push({ actionId: action.id, type: 'create-task', status: 'created', taskId, title: taskTitle });
              console.log(`[Automations] Task created: "${taskTitle}" (${taskId})`);
              break;
            }
            case 'send-notification': {
              const msg = (action.config?.message || 'Notification')
                .replace(/\{\{clientName\}\}/g, context?.name || 'Client')
                .replace(/\{\{eventName\}\}/g, context?.eventName || 'Event');
              actionResults.push({ actionId: action.id, type: 'send-notification', status: 'queued', message: msg });
              console.log(`[Automations] Notification queued: "${msg}"`);
              break;
            }
            case 'update-status': {
              actionResults.push({ actionId: action.id, type: 'update-status', status: 'logged', newStatus: action.config?.newStatus });
              console.log(`[Automations] Status update logged: -> ${action.config?.newStatus}`);
              break;
            }
            default:
              actionResults.push({ actionId: action.id, type: action.type, status: 'unsupported' });
          }
        } catch (actionErr) {
          actionResults.push({ actionId: action.id, type: action.type, status: 'error', error: actionErr.message });
        }
      }

      workflow.lastTriggeredAt = new Date().toISOString();
      workflow.triggerCount = (workflow.triggerCount || 0) + 1;

      executionResults.push({
        workflowId: workflow.id, workflowName: workflow.name,
        actionsExecuted: actionResults.length, actions: actionResults,
      });
    }

    // Persist updated trigger counts
    await kv.set(`automations_${key}`, { workflows });

    console.log(`[Automations] Executed ${matching.length} workflow(s) for trigger "${triggerType}"`);
    return c.json({ success: true, executed: matching.length, results: executionResults });
  } catch (error) {
    console.log(`[Automations] Trigger error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════
// ===== AUTHENTICATION =====
// ═══════════════════════════════════════════════════════════════

// Signup route - creates user with Supabase Auth admin API
// Supports both new company creation and joining via invitation
app.post(`${PREFIX}/auth/signup`, async (c) => {
  try {
    const { email, password, name, companyName, invitationId } = await c.req.json();
    if (!email || !password || !name) {
      return c.json({ error: 'Email, password, and name are required' }, 400);
    }

    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);
    
    let targetCompanyId = null;
    let assignedRole = 'Mastermind'; // Default for new companies
    let targetCompanyName = companyName || 'Default';

    // Check if signing up via invitation
    if (invitationId) {
      // Find the invitation across all companies
      const allInvitationsKeys = await kv.getByPrefix('company:');
      let foundInvitation = null;
      let invitationCompanyId = null;

      for (const key of allInvitationsKeys) {
        if (key.includes(':invitations')) {
          const invitations = await kv.get(key);
          if (invitations && Array.isArray(invitations)) {
            const inv = invitations.find((i: any) => i.id === invitationId);
            if (inv) {
              foundInvitation = inv;
              // Extract companyId from key: company:comp-xxx:invitations
              invitationCompanyId = key.split(':')[1];
              break;
            }
          }
        }
      }

      if (!foundInvitation) {
        return c.json({ error: 'Invitation not found or invalid' }, 400);
      }

      // Verify invitation is still valid
      const expiresAt = new Date(foundInvitation.expiresAt);
      if (expiresAt < new Date()) {
        return c.json({ error: 'Invitation has expired' }, 400);
      }

      if (foundInvitation.status !== 'pending') {
        return c.json({ error: 'Invitation has already been used' }, 400);
      }

      // Verify email matches invitation
      if (foundInvitation.email.toLowerCase() !== email.toLowerCase()) {
        return c.json({ error: 'Email does not match invitation' }, 400);
      }

      targetCompanyId = invitationCompanyId;
      assignedRole = foundInvitation.role;
      targetCompanyName = foundInvitation.companyName;

      // Mark invitation as accepted
      foundInvitation.status = 'accepted';
      foundInvitation.acceptedAt = new Date().toISOString();
      const invitations = await dataService.get(targetCompanyId, RESOURCE_TYPES.INVITATIONS) || [];
      const updated = invitations.map((inv: any) => inv.id === invitationId ? foundInvitation : inv);
      await dataService.set(targetCompanyId, RESOURCE_TYPES.INVITATIONS, updated);
    } else {
      // Creating a new company
      targetCompanyId = `company-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    // Create Supabase auth user
    const { data, error } = await adminSupabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name, companyName: targetCompanyName },
      // Automatically confirm the user's email since an email server hasn't been configured.
      email_confirm: true,
    });

    if (error) {
      console.log(`[Auth] Signup error for ${email}: ${error.message}`);
      return c.json({ error: error.message }, 400);
    }

    // Create user profile in KV
    const profile = {
      userId: data.user.id,
      email,
      name,
      role: assignedRole,
      companyId: targetCompanyId,
      companyName: targetCompanyName,
      createdAt: new Date().toISOString(),
    };
    await kv.set(`user_profile_${data.user.id}`, profile);

    // If new company, initialize company settings and team
    if (!invitationId) {
      await dataService.setCompanySettings(targetCompanyId, {
        companyName: targetCompanyName,
        ownerId: data.user.id,
        createdAt: new Date().toISOString(),
      });
      
      // Initialize team members with the founder
      await dataService.set(targetCompanyId, RESOURCE_TYPES.TEAM_MEMBERS, [{
        userId: data.user.id,
        email,
        name,
        role: assignedRole,
        addedAt: new Date().toISOString(),
      }]);
    } else {
      // Add to existing team
      await dataService.addTeamMember(targetCompanyId, data.user.id, { email, name, role: assignedRole });
    }

    console.log(`[Auth] User signed up: ${email}, company: ${companyId}`);
    return c.json({ success: true, userId: data.user.id, companyId });
  } catch (error) {
    console.log(`[Auth] Signup error: ${error.message}`);
    return c.json({ error: `Signup failed: ${error.message}` }, 500);
  }
});

// Get user profile (authenticated)
app.get(`${PREFIX}/auth/profile`, async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'No authorization token' }, 401);

    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error } = await adminSupabase.auth.getUser(accessToken);
    if (error || !user) return c.json({ error: 'Invalid token' }, 401);

    let profile = await kv.get(`user_profile_${user.id}`);
    
    // If profile doesn't exist (e.g., OAuth first-time login), auto-create it
    if (!profile) {
      console.log(`[Auth] No profile found for user ${user.id}, creating default profile (OAuth user)`);
      
      // Extract name from OAuth metadata or email
      const displayName = user.user_metadata?.full_name || 
                          user.user_metadata?.name || 
                          user.email?.split('@')[0] || 
                          'User';
      
      // Create default company for OAuth users
      const companyId = `company-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const companyName = user.user_metadata?.companyName || `${displayName}'s Company`;
      
      // Create company profile
      await kv.set(`company:${companyId}:profile`, {
        id: companyId,
        name: companyName,
        createdAt: new Date().toISOString(),
        ownerId: user.id,
      });
      
      // Create user profile
      profile = {
        userId: user.id,
        name: displayName,
        email: user.email,
        role: 'Mastermind', // Default role for new OAuth users
        companyId: companyId,
        avatarUrl: user.user_metadata?.picture || user.user_metadata?.avatar_url || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      await kv.set(`user_profile_${user.id}`, profile);
      
      // Add user to company members
      await kv.set(`company:${companyId}:members`, [{
        userId: user.id,
        name: displayName,
        email: user.email,
        role: 'Mastermind',
        joinedAt: new Date().toISOString(),
      }]);
      
      console.log(`[Auth] Created profile and company for OAuth user: ${user.email}, company: ${companyId}`);
    }
    
    return c.json({ profile: profile || null });
  } catch (error) {
    console.log(`[Auth] Profile fetch error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// Update user profile (authenticated)
app.put(`${PREFIX}/auth/profile`, async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'No authorization token' }, 401);

    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error } = await adminSupabase.auth.getUser(accessToken);
    if (error || !user) return c.json({ error: 'Invalid token' }, 401);

    const updates = await c.req.json();
    const existing = await kv.get(`user_profile_${user.id}`) || {};
    const updated = { ...existing, ...updates, userId: user.id, updatedAt: new Date().toISOString() };
    await kv.set(`user_profile_${user.id}`, updated);

    console.log(`[Auth] Profile updated for user ${user.id}`);
    return c.json({ success: true, profile: updated });
  } catch (error) {
    console.log(`[Auth] Profile update error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// Update team member role (Mastermind only)
app.put(`${PREFIX}/auth/team/:userId/role`, async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'No authorization token' }, 401);

    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error } = await adminSupabase.auth.getUser(accessToken);
    if (error || !user) return c.json({ error: 'Invalid token' }, 401);

    // Verify requester is Mastermind
    const requesterProfile = await kv.get(`user_profile_${user.id}`);
    if (!requesterProfile || requesterProfile.role !== 'Mastermind') {
      return c.json({ error: 'Only Mastermind role can update team member roles' }, 403);
    }

    const targetUserId = c.req.param('userId');
    const { role } = await c.req.json();
    const validRoles = ['Mastermind', 'Coordinator', 'Planner', 'Assistant', 'Viewer'];
    if (!validRoles.includes(role)) return c.json({ error: 'Invalid role' }, 400);

    const targetProfile = await kv.get(`user_profile_${targetUserId}`);
    if (!targetProfile) return c.json({ error: 'User not found' }, 404);

    await kv.set(`user_profile_${targetUserId}`, { ...targetProfile, role, updatedAt: new Date().toISOString() });

    console.log(`[Auth] Role updated for ${targetUserId} to ${role} by ${user.id}`);
    return c.json({ success: true });
  } catch (error) {
    console.log(`[Auth] Role update error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════
// ===== SETTINGS KV PERSISTENCE =====
// ═══════════════════════════════════════════════════════════════

// Get all settings for a company
app.get(`${PREFIX}/api/settings/:companyId`, async (c) => {
  try {
    const companyId = c.req.param('companyId') || 'default';
    const settings = await kv.get(`app_settings_${companyId}`);
    return c.json({ settings: settings || {} });
  } catch (error) {
    console.log(`[Settings] Fetch error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// Save all settings for a company
app.put(`${PREFIX}/api/settings/:companyId`, async (c) => {
  try {
    const companyId = c.req.param('companyId') || 'default';
    const body = await c.req.json();
    const existing = await kv.get(`app_settings_${companyId}`) || {};
    const merged = { ...existing, ...body, updatedAt: new Date().toISOString() };
    await kv.set(`app_settings_${companyId}`, merged);
    console.log(`[Settings] Saved settings for company ${companyId}, keys: ${Object.keys(body).join(', ')}`);
    return c.json({ success: true });
  } catch (error) {
    console.log(`[Settings] Save error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// Export data for a company
app.post(`${PREFIX}/api/settings/:companyId/export`, async (c) => {
  try {
    const companyId = c.req.param('companyId') || 'default';
    const { format } = await c.req.json();

    // Collect all data from KV for this company
    const keys = [
      `app_settings_${companyId}`, `vendors`, `venues`,
      `automations_${companyId}`, `sms_config_${companyId}`,
    ];
    const results = await kv.mget(keys);
    const exportData: Record<string, any> = {};
    keys.forEach((key, i) => { if (results[i]) exportData[key] = results[i]; });

    // For JSON format, return directly
    if (format === 'json') {
      return c.json({ success: true, data: exportData, exportedAt: new Date().toISOString() });
    }

    // For CSV/Excel, return a JSON summary (actual file generation would need more work)
    return c.json({
      success: true,
      format,
      summary: { keys: Object.keys(exportData).length, exportedAt: new Date().toISOString() },
      data: exportData,
    });
  } catch (error) {
    console.log(`[Settings] Export error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// Force backup (snapshot all KV data)
app.post(`${PREFIX}/api/settings/:companyId/backup`, async (c) => {
  try {
    const companyId = c.req.param('companyId') || 'default';

    // Read current settings and create a timestamped backup
    const settings = await kv.get(`app_settings_${companyId}`);
    const backupKey = `backup_${companyId}_${Date.now()}`;
    await kv.set(backupKey, {
      settings,
      backedUpAt: new Date().toISOString(),
      companyId,
    });

    console.log(`[Settings] Backup created for company ${companyId}: ${backupKey}`);
    return c.json({ success: true, backupKey, backedUpAt: new Date().toISOString() });
  } catch (error) {
    console.log(`[Settings] Backup error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════
// ===== MIGRATION UTILITIES (Phase 3: Lift and Shift) =====
// ═══════════════════════════════════════════════════════════════

// KV Data Export — Mastermind/Coordinator only
app.get(`${PREFIX}/data-export`, requireAuth(kv), async (c) => {
  try {
    const authUser = getAuthUser(c);
    if (authUser.role !== 'Mastermind' && authUser.role !== 'Coordinator') {
      return c.json({ error: 'Only Mastermind or Coordinator roles can export data' }, 403);
    }
    const cid = authUser.companyId;
    const [events, vendors, venues, phases, clients, teamMembers, settings] = await Promise.all([
      dataService.getEvents(cid),
      dataService.getVendors(cid),
      dataService.getVenues(cid),
      dataService.getPhases(cid),
      dataService.get(cid, 'clients').then((d: any) => d || []),
      dataService.getTeamMembers(cid),
      dataService.getCompanySettings(cid),
    ]);
    const arrays = [events, vendors, venues, phases, clients, teamMembers];
    const totalKeys = arrays.reduce((acc: number, arr: any) => acc + (Array.isArray(arr) ? arr.length : 0), 0);
    const exportPayload = {
      exportedAt: new Date().toISOString(),
      exportedBy: authUser.email,
      companyId: cid,
      schemaVersion: '1.0-kv',
      summary: {
        totalKeys,
        events: Array.isArray(events) ? events.length : 0,
        vendors: Array.isArray(vendors) ? vendors.length : 0,
        venues: Array.isArray(venues) ? venues.length : 0,
        phases: Array.isArray(phases) ? phases.length : 0,
        clients: Array.isArray(clients) ? clients.length : 0,
        teamMembers: Array.isArray(teamMembers) ? teamMembers.length : 0,
      },
      tables: { events: events || [], vendors: vendors || [], venues: venues || [], phases: phases || [], clients: clients || [], teamMembers: teamMembers || [], companySettings: settings || {} },
      migrationHint: `Add company_id = "${cid}" to every row. Enable RLS before importing to staging.`,
    };
    console.log(`[DataExport] ${totalKeys} records for ${cid} by ${authUser.email}`);
    return c.json({ success: true, export: exportPayload });
  } catch (error: any) {
    console.error('[DataExport] Error:', error.message);
    return c.json({ error: `Export failed: ${error.message}` }, 500);
  }
});

// KV Migration Audit — detect unscoped legacy keys and report isolation health
app.get(`${PREFIX}/migration-status`, requireAuth(kv), async (c) => {
  try {
    const authUser = getAuthUser(c);
    const cid = authUser.companyId;
    const [events, vendors, venues, clients, teamMembers] = await Promise.all([
      dataService.getEvents(cid),
      dataService.getVendors(cid),
      dataService.getVenues(cid),
      dataService.get(cid, 'clients').then((d: any) => d || []),
      dataService.getTeamMembers(cid),
    ]);
    const legacyChecks = await Promise.all([
      kv.get('events').then((d: any) => ({ key: 'events', hasLegacy: !!d && Array.isArray(d) && d.length > 0 })),
      kv.get('vendors').then((d: any) => ({ key: 'vendors', hasLegacy: !!d && Array.isArray(d) && d.length > 0 })),
      kv.get('venues').then((d: any) => ({ key: 'venues', hasLegacy: !!d && Array.isArray(d) && d.length > 0 })),
      kv.get('phases').then((d: any) => ({ key: 'phases', hasLegacy: !!d && Array.isArray(d) && d.length > 0 })),
    ]);
    const legacyKeyCount = legacyChecks.filter((ch: any) => ch.hasLegacy).length;
    return c.json({
      success: true,
      audit: {
        'Company ID': cid,
        'Scoped Events': Array.isArray(events) ? events.length : 0,
        'Scoped Vendors': Array.isArray(vendors) ? vendors.length : 0,
        'Scoped Venues': Array.isArray(venues) ? venues.length : 0,
        'Scoped Clients': Array.isArray(clients) ? clients.length : 0,
        'Team Members': Array.isArray(teamMembers) ? teamMembers.length : 0,
        'Legacy Unscoped Keys': legacyKeyCount,
        'Isolation Status': legacyKeyCount === 0 ? '✅ Clean' : `⚠️ ${legacyKeyCount} legacy key(s) need migration`,
      },
      legacyKeys: legacyChecks,
      recommendation: legacyKeyCount > 0
        ? 'Run migrateToCompanyScope() for each legacy key before Phase 3 cutover.'
        : 'All data is company-scoped. Ready for Phase 3 extraction.',
    });
  } catch (error: any) {
    console.error('[MigrationStatus] Error:', error.message);
    return c.json({ error: `Audit failed: ${error.message}` }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════
Deno.serve(app.fetch);