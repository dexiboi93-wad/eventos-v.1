import { Hono } from "npm:hono";
import * as kv from "./kv_store.tsx";
import { createClient } from "npm:@supabase/supabase-js@2";

const PREFIX = "/make-server-6c8332a9";

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const DOCUMENTS_BUCKET = 'make-6c8332a9-documents';

// Ensure bucket exists
async function ensureDocumentsBucketExists() {
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(bucket => bucket.name === DOCUMENTS_BUCKET);
    
    if (!bucketExists) {
      const { error } = await supabase.storage.createBucket(DOCUMENTS_BUCKET, {
        public: false,
      });
      if (error && error.statusCode !== '409') {
        console.error('[Documents] Error creating bucket:', error);
      } else if (!error) {
        console.log(`[Documents] Bucket ${DOCUMENTS_BUCKET} created successfully`);
      }
    }
  } catch (error) {
    console.error('[Documents] Bucket initialization error:', error);
  }
}

// Initialize on module load
ensureDocumentsBucketExists();

export function createDocumentRoutes(app: Hono) {
  /**
   * Upload a document
   * POST /documents/upload
   */
  app.post(`${PREFIX}/documents/upload`, async (c) => {
    try {
      const formData = await c.req.formData();
      const file = formData.get('file') as File;
      const metadataStr = formData.get('metadata') as string;

      if (!file || !metadataStr) {
        return c.json({ error: 'Missing file or metadata' }, 400);
      }

      const metadata = JSON.parse(metadataStr);

      // Generate unique storage key
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(7);
      const storageKey = `${timestamp}-${randomId}-${file.name}`;

      // Upload to Supabase Storage
      const fileBuffer = await file.arrayBuffer();
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .upload(storageKey, fileBuffer, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        console.error('[Documents] Upload error:', uploadError);
        return c.json({ error: 'Failed to upload file to storage' }, 500);
      }

      // Generate signed URL (valid for 1 year)
      const { data: urlData } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .createSignedUrl(storageKey, 31536000); // 1 year

      const documentId = `doc-${timestamp}-${randomId}`;

      // Create document record
      const document = {
        id: documentId,
        name: metadata.name,
        originalName: metadata.originalName,
        description: metadata.description || '',
        category: metadata.category,
        fileType: metadata.fileType,
        fileSize: metadata.fileSize,
        url: urlData?.signedUrl || '',
        storageKey,
        uploadedBy: 'current-user', // In production, get from auth
        uploadedAt: new Date().toISOString(),
        eventId: metadata.eventId,
        clientId: metadata.clientId,
        vendorId: metadata.vendorId,
        tags: metadata.tags || [],
        version: 1,
        shared: false,
        sharedWith: [],
        downloadCount: 0,
        metadata: metadata.metadata || {},
      };

      await kv.set(`document:${documentId}`, document);

      console.log(`[Documents] Document uploaded: ${document.name}`);

      return c.json({ success: true, document });
    } catch (error: any) {
      console.error('[Documents] Upload error:', error);
      return c.json({ error: error.message || 'Failed to upload document' }, 500);
    }
  });

  /**
   * Get all documents
   * GET /documents
   */
  app.get(`${PREFIX}/documents`, async (c) => {
    try {
      const category = c.req.query('category');
      const eventId = c.req.query('eventId');
      const clientId = c.req.query('clientId');
      const vendorId = c.req.query('vendorId');
      const folderId = c.req.query('folderId');
      const tags = c.req.query('tags')?.split(',');

      let documents = await kv.getByPrefix('document:');
      documents = documents.map(d => d.value);

      // Apply filters
      if (category) {
        documents = documents.filter(d => d.category === category);
      }
      if (eventId) {
        documents = documents.filter(d => d.eventId === eventId);
      }
      if (clientId) {
        documents = documents.filter(d => d.clientId === clientId);
      }
      if (vendorId) {
        documents = documents.filter(d => d.vendorId === vendorId);
      }
      if (folderId) {
        documents = documents.filter(d => d.folderId === folderId);
      }
      if (tags && tags.length > 0) {
        documents = documents.filter(d => 
          tags.some(tag => d.tags?.includes(tag))
        );
      }

      // Sort by upload date (newest first)
      documents.sort((a, b) => {
        return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
      });

      return c.json({ documents });
    } catch (error: any) {
      console.error('[Documents] Fetch error:', error);
      return c.json({ error: error.message || 'Failed to fetch documents' }, 500);
    }
  });

  /**
   * Get a single document
   * GET /documents/:id
   */
  app.get(`${PREFIX}/documents/:id`, async (c) => {
    try {
      const documentId = c.req.param('id');
      const document = await kv.get(`document:${documentId}`);

      if (!document) {
        return c.json({ error: 'Document not found' }, 404);
      }

      return c.json({ document });
    } catch (error: any) {
      console.error('[Documents] Fetch document error:', error);
      return c.json({ error: error.message || 'Failed to fetch document' }, 500);
    }
  });

  /**
   * Update document metadata
   * PUT /documents/:id
   */
  app.put(`${PREFIX}/documents/:id`, async (c) => {
    try {
      const documentId = c.req.param('id');
      const updates = await c.req.json();

      const document = await kv.get(`document:${documentId}`);
      if (!document) {
        return c.json({ error: 'Document not found' }, 404);
      }

      const updatedDocument = {
        ...document,
        ...updates,
        id: documentId,
        uploadedAt: document.uploadedAt,
        uploadedBy: document.uploadedBy,
      };

      await kv.set(`document:${documentId}`, updatedDocument);

      console.log(`[Documents] Document updated: ${documentId}`);

      return c.json({ success: true, document: updatedDocument });
    } catch (error: any) {
      console.error('[Documents] Update error:', error);
      return c.json({ error: error.message || 'Failed to update document' }, 500);
    }
  });

  /**
   * Delete a document
   * DELETE /documents/:id
   */
  app.delete(`${PREFIX}/documents/:id`, async (c) => {
    try {
      const documentId = c.req.param('id');

      const document = await kv.get(`document:${documentId}`);
      if (!document) {
        return c.json({ error: 'Document not found' }, 404);
      }

      // Delete from storage
      const { error: deleteError } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .remove([document.storageKey]);

      if (deleteError) {
        console.error('[Documents] Storage delete error:', deleteError);
      }

      // Delete from KV
      await kv.del(`document:${documentId}`);

      console.log(`[Documents] Document deleted: ${documentId}`);

      return c.json({ success: true });
    } catch (error: any) {
      console.error('[Documents] Delete error:', error);
      return c.json({ error: error.message || 'Failed to delete document' }, 500);
    }
  });

  /**
   * Download a document
   * GET /documents/:id/download
   */
  app.get(`${PREFIX}/documents/:id/download`, async (c) => {
    try {
      const documentId = c.req.param('id');

      const document = await kv.get(`document:${documentId}`);
      if (!document) {
        return c.json({ error: 'Document not found' }, 404);
      }

      // Download from storage
      const { data, error } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .download(document.storageKey);

      if (error || !data) {
        console.error('[Documents] Download error:', error);
        return c.json({ error: 'Failed to download file' }, 500);
      }

      // Update download count
      document.downloadCount = (document.downloadCount || 0) + 1;
      document.lastDownloadedAt = new Date().toISOString();
      await kv.set(`document:${documentId}`, document);

      // Return file
      return new Response(data, {
        headers: {
          'Content-Type': document.fileType,
          'Content-Disposition': `attachment; filename="${document.originalName}"`,
        },
      });
    } catch (error: any) {
      console.error('[Documents] Download error:', error);
      return c.json({ error: error.message || 'Failed to download document' }, 500);
    }
  });

  /**
   * Upload a new version of a document
   * POST /documents/:id/version
   */
  app.post(`${PREFIX}/documents/:id/version`, async (c) => {
    try {
      const parentDocumentId = c.req.param('id');
      const formData = await c.req.formData();
      const file = formData.get('file') as File;
      const notes = formData.get('notes') as string;

      if (!file) {
        return c.json({ error: 'Missing file' }, 400);
      }

      const parentDocument = await kv.get(`document:${parentDocumentId}`);
      if (!parentDocument) {
        return c.json({ error: 'Parent document not found' }, 404);
      }

      // Generate unique storage key
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(7);
      const storageKey = `${timestamp}-${randomId}-${file.name}`;

      // Upload to storage
      const fileBuffer = await file.arrayBuffer();
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .upload(storageKey, fileBuffer, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        return c.json({ error: 'Failed to upload file to storage' }, 500);
      }

      // Generate signed URL
      const { data: urlData } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .createSignedUrl(storageKey, 31536000);

      const versionId = `doc-${timestamp}-${randomId}`;
      const newVersion = parentDocument.version + 1;

      // Create new version document
      const versionDocument = {
        ...parentDocument,
        id: versionId,
        version: newVersion,
        parentDocumentId,
        url: urlData?.signedUrl || '',
        storageKey,
        fileSize: file.size,
        uploadedAt: new Date().toISOString(),
        downloadCount: 0,
        metadata: {
          ...parentDocument.metadata,
          versionNotes: notes,
        },
      };

      await kv.set(`document:${versionId}`, versionDocument);

      // Update parent document version number
      parentDocument.version = newVersion;
      await kv.set(`document:${parentDocumentId}`, parentDocument);

      console.log(`[Documents] Version uploaded: ${versionDocument.name} v${newVersion}`);

      return c.json({ success: true, document: versionDocument });
    } catch (error: any) {
      console.error('[Documents] Version upload error:', error);
      return c.json({ error: error.message || 'Failed to upload version' }, 500);
    }
  });

  /**
   * Get document versions
   * GET /documents/:id/versions
   */
  app.get(`${PREFIX}/documents/:id/versions`, async (c) => {
    try {
      const documentId = c.req.param('id');

      let allDocuments = await kv.getByPrefix('document:');
      allDocuments = allDocuments.map(d => d.value);

      // Find all versions
      const versions = allDocuments.filter(d => 
        d.id === documentId || d.parentDocumentId === documentId
      );

      // Sort by version number
      versions.sort((a, b) => b.version - a.version);

      return c.json({ versions });
    } catch (error: any) {
      console.error('[Documents] Fetch versions error:', error);
      return c.json({ error: error.message || 'Failed to fetch versions' }, 500);
    }
  });

  /**
   * Share a document
   * POST /documents/:id/share
   */
  app.post(`${PREFIX}/documents/:id/share`, async (c) => {
    try {
      const documentId = c.req.param('id');
      const { sharedWith } = await c.req.json();

      const document = await kv.get(`document:${documentId}`);
      if (!document) {
        return c.json({ error: 'Document not found' }, 404);
      }

      document.shared = true;
      document.sharedWith = sharedWith || [];
      await kv.set(`document:${documentId}`, document);

      console.log(`[Documents] Document shared: ${documentId}`);

      return c.json({ success: true });
    } catch (error: any) {
      console.error('[Documents] Share error:', error);
      return c.json({ error: error.message || 'Failed to share document' }, 500);
    }
  });

  /**
   * Get all folders
   * GET /documents/folders
   */
  app.get(`${PREFIX}/documents/folders`, async (c) => {
    try {
      const eventId = c.req.query('eventId');
      const clientId = c.req.query('clientId');
      const vendorId = c.req.query('vendorId');
      const parentFolderId = c.req.query('parentFolderId');

      let folders = await kv.getByPrefix('document_folder:');
      folders = folders.map(f => f.value);

      // Apply filters
      if (eventId) {
        folders = folders.filter(f => f.eventId === eventId);
      }
      if (clientId) {
        folders = folders.filter(f => f.clientId === clientId);
      }
      if (vendorId) {
        folders = folders.filter(f => f.vendorId === vendorId);
      }
      if (parentFolderId !== undefined) {
        folders = folders.filter(f => f.parentFolderId === parentFolderId);
      }

      return c.json({ folders });
    } catch (error: any) {
      console.error('[Documents] Fetch folders error:', error);
      return c.json({ error: error.message || 'Failed to fetch folders' }, 500);
    }
  });

  /**
   * Create a folder
   * POST /documents/folders
   */
  app.post(`${PREFIX}/documents/folders`, async (c) => {
    try {
      const body = await c.req.json();
      const { name, description, eventId, clientId, vendorId, parentFolderId } = body;

      if (!name) {
        return c.json({ error: 'Folder name is required' }, 400);
      }

      const folderId = `folder-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      const folder = {
        id: folderId,
        name,
        description: description || '',
        eventId,
        clientId,
        vendorId,
        parentFolderId,
        documentCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await kv.set(`document_folder:${folderId}`, folder);

      console.log(`[Documents] Folder created: ${name}`);

      return c.json({ success: true, folder });
    } catch (error: any) {
      console.error('[Documents] Create folder error:', error);
      return c.json({ error: error.message || 'Failed to create folder' }, 500);
    }
  });

  /**
   * Delete a folder
   * DELETE /documents/folders/:id
   */
  app.delete(`${PREFIX}/documents/folders/:id`, async (c) => {
    try {
      const folderId = c.req.param('id');

      const folder = await kv.get(`document_folder:${folderId}`);
      if (!folder) {
        return c.json({ error: 'Folder not found' }, 404);
      }

      await kv.del(`document_folder:${folderId}`);

      console.log(`[Documents] Folder deleted: ${folderId}`);

      return c.json({ success: true });
    } catch (error: any) {
      console.error('[Documents] Delete folder error:', error);
      return c.json({ error: error.message || 'Failed to delete folder' }, 500);
    }
  });

  /**
   * Search documents
   * GET /documents/search
   */
  app.get(`${PREFIX}/documents/search`, async (c) => {
    try {
      const query = c.req.query('q')?.toLowerCase() || '';

      if (!query) {
        return c.json({ documents: [] });
      }

      let documents = await kv.getByPrefix('document:');
      documents = documents.map(d => d.value);

      // Search in name, description, tags
      const results = documents.filter(doc => 
        doc.name.toLowerCase().includes(query) ||
        doc.description?.toLowerCase().includes(query) ||
        doc.tags?.some((tag: string) => tag.toLowerCase().includes(query))
      );

      return c.json({ documents: results });
    } catch (error: any) {
      console.error('[Documents] Search error:', error);
      return c.json({ error: error.message || 'Failed to search documents' }, 500);
    }
  });

  /**
   * Get document statistics
   * GET /documents/stats
   */
  app.get(`${PREFIX}/documents/stats`, async (c) => {
    try {
      let documents = await kv.getByPrefix('document:');
      documents = documents.map(d => d.value);

      const totalDocuments = documents.length;
      const totalSize = documents.reduce((sum, doc) => sum + (doc.fileSize || 0), 0);

      // Count by category
      const byCategory: Record<string, number> = {};
      documents.forEach(doc => {
        byCategory[doc.category] = (byCategory[doc.category] || 0) + 1;
      });

      // Recent uploads (last 10)
      const recentUploads = [...documents]
        .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
        .slice(0, 10);

      // Most downloaded (top 10)
      const mostDownloaded = [...documents]
        .filter(d => d.downloadCount > 0)
        .sort((a, b) => b.downloadCount - a.downloadCount)
        .slice(0, 10);

      return c.json({
        totalDocuments,
        totalSize,
        byCategory,
        recentUploads,
        mostDownloaded,
      });
    } catch (error: any) {
      console.error('[Documents] Stats error:', error);
      return c.json({ error: error.message || 'Failed to fetch stats' }, 500);
    }
  });

  return app;
}