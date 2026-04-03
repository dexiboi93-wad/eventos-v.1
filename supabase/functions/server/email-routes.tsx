import { Hono } from "npm:hono";
import * as kv from "./kv_store.tsx";

const PREFIX = "/make-server-6c8332a9";

export function createEmailRoutes(app: Hono) {
  /**
   * Send a single email
   * POST /email/send
   */
  app.post(`${PREFIX}/email/send`, async (c) => {
    try {
      const body = await c.req.json();
      const { to, subject, body: emailBody, templateId, variables, eventId, attachments } = body;

      if (!to || !subject || !emailBody) {
        return c.json({ error: 'Missing required fields: to, subject, body' }, 400);
      }

      // Generate unique message ID
      const messageId = `msg-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      // Create email log entry
      const emailLog = {
        id: messageId,
        to: Array.isArray(to) ? to.join(', ') : to,
        from: 'noreply@mastermind-events.com',
        subject,
        body: emailBody,
        templateId,
        status: 'sent',
        sentAt: new Date().toISOString(),
        eventId,
        metadata: {
          variables,
          attachmentCount: attachments?.length || 0,
        },
      };

      // Store email log
      await kv.set(`email_log:${messageId}`, emailLog);

      // In production, this would integrate with:
      // - SendGrid: await sendgridClient.send({ to, from, subject, html: emailBody })
      // - AWS SES: await sesClient.sendEmail({ ... })
      // - Mailgun: await mailgunClient.messages.create({ ... })
      // - Resend: await resend.emails.send({ ... })
      
      console.log(`[Email Service] Email sent to ${to}: ${subject}`);

      return c.json({ 
        success: true, 
        messageId,
        message: 'Email sent successfully (simulated)',
      });
    } catch (error: any) {
      console.error('[Email Service] Send error:', error);
      return c.json({ error: error.message || 'Failed to send email' }, 500);
    }
  });

  /**
   * Send bulk emails
   * POST /email/send-bulk
   */
  app.post(`${PREFIX}/email/send-bulk`, async (c) => {
    try {
      const body = await c.req.json();
      const { recipients, subject, body: emailBody, templateId, variables } = body;

      if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
        return c.json({ error: 'Recipients must be a non-empty array' }, 400);
      }

      if (!subject || !emailBody) {
        return c.json({ error: 'Missing required fields: subject, body' }, 400);
      }

      const results = {
        sent: 0,
        failed: 0,
        errors: [] as string[],
      };

      // Send to each recipient
      for (const recipient of recipients) {
        try {
          const messageId = `msg-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          
          const emailLog = {
            id: messageId,
            to: recipient,
            from: 'noreply@mastermind-events.com',
            subject,
            body: emailBody,
            templateId,
            status: 'sent',
            sentAt: new Date().toISOString(),
            metadata: {
              variables,
              bulkSend: true,
            },
          };

          await kv.set(`email_log:${messageId}`, emailLog);
          
          console.log(`[Email Service] Bulk email sent to ${recipient}: ${subject}`);
          results.sent++;
        } catch (error: any) {
          console.error(`[Email Service] Failed to send to ${recipient}:`, error);
          results.failed++;
          results.errors.push(`${recipient}: ${error.message}`);
        }
      }

      return c.json({
        success: true,
        sent: results.sent,
        failed: results.failed,
        errors: results.errors.length > 0 ? results.errors : undefined,
      });
    } catch (error: any) {
      console.error('[Email Service] Bulk send error:', error);
      return c.json({ error: error.message || 'Failed to send bulk emails' }, 500);
    }
  });

  /**
   * Get all email templates
   * GET /email/templates
   */
  app.get(`${PREFIX}/email/templates`, async (c) => {
    try {
      const category = c.req.query('category');
      
      // Fetch all templates
      const allTemplates = await kv.getByPrefix('email_template:');
      
      let templates = allTemplates.map(t => t.value);

      // Filter by category if specified
      if (category) {
        templates = templates.filter(t => t.category === category);
      }

      return c.json({ templates });
    } catch (error: any) {
      console.error('[Email Service] Fetch templates error:', error);
      return c.json({ error: error.message || 'Failed to fetch templates' }, 500);
    }
  });

  /**
   * Get a single email template
   * GET /email/templates/:id
   */
  app.get(`${PREFIX}/email/templates/:id`, async (c) => {
    try {
      const templateId = c.req.param('id');
      const template = await kv.get(`email_template:${templateId}`);

      if (!template) {
        return c.json({ error: 'Template not found' }, 404);
      }

      return c.json({ template });
    } catch (error: any) {
      console.error('[Email Service] Fetch template error:', error);
      return c.json({ error: error.message || 'Failed to fetch template' }, 500);
    }
  });

  /**
   * Create a new email template
   * POST /email/templates
   */
  app.post(`${PREFIX}/email/templates`, async (c) => {
    try {
      const body = await c.req.json();
      const { name, subject, body: templateBody, category, variables } = body;

      if (!name || !subject || !templateBody || !category) {
        return c.json({ error: 'Missing required fields: name, subject, body, category' }, 400);
      }

      const templateId = `template-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      
      const template = {
        id: templateId,
        name,
        subject,
        body: templateBody,
        category,
        variables: variables || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await kv.set(`email_template:${templateId}`, template);

      console.log(`[Email Service] Template created: ${name}`);

      return c.json({ success: true, template });
    } catch (error: any) {
      console.error('[Email Service] Create template error:', error);
      return c.json({ error: error.message || 'Failed to create template' }, 500);
    }
  });

  /**
   * Update an email template
   * PUT /email/templates/:id
   */
  app.put(`${PREFIX}/email/templates/:id`, async (c) => {
    try {
      const templateId = c.req.param('id');
      const updates = await c.req.json();

      const existingTemplate = await kv.get(`email_template:${templateId}`);
      if (!existingTemplate) {
        return c.json({ error: 'Template not found' }, 404);
      }

      const updatedTemplate = {
        ...existingTemplate,
        ...updates,
        id: templateId, // Ensure ID doesn't change
        createdAt: existingTemplate.createdAt, // Preserve creation date
        updatedAt: new Date().toISOString(),
      };

      await kv.set(`email_template:${templateId}`, updatedTemplate);

      console.log(`[Email Service] Template updated: ${templateId}`);

      return c.json({ success: true, template: updatedTemplate });
    } catch (error: any) {
      console.error('[Email Service] Update template error:', error);
      return c.json({ error: error.message || 'Failed to update template' }, 500);
    }
  });

  /**
   * Delete an email template
   * DELETE /email/templates/:id
   */
  app.delete(`${PREFIX}/email/templates/:id`, async (c) => {
    try {
      const templateId = c.req.param('id');

      const existingTemplate = await kv.get(`email_template:${templateId}`);
      if (!existingTemplate) {
        return c.json({ error: 'Template not found' }, 404);
      }

      await kv.del(`email_template:${templateId}`);

      console.log(`[Email Service] Template deleted: ${templateId}`);

      return c.json({ success: true });
    } catch (error: any) {
      console.error('[Email Service] Delete template error:', error);
      return c.json({ error: error.message || 'Failed to delete template' }, 500);
    }
  });

  /**
   * Get email activity logs
   * GET /email/logs
   */
  app.get(`${PREFIX}/email/logs`, async (c) => {
    try {
      const eventId = c.req.query('eventId');
      const status = c.req.query('status');
      const limit = parseInt(c.req.query('limit') || '100');

      // Fetch all email logs
      let logs = await kv.getByPrefix('email_log:');
      logs = logs.map(l => l.value);

      // Apply filters
      if (eventId) {
        logs = logs.filter(log => log.eventId === eventId);
      }

      if (status) {
        logs = logs.filter(log => log.status === status);
      }

      // Sort by sent date (newest first)
      logs.sort((a, b) => {
        const dateA = new Date(a.sentAt || a.createdAt || 0).getTime();
        const dateB = new Date(b.sentAt || b.createdAt || 0).getTime();
        return dateB - dateA;
      });

      // Apply limit
      logs = logs.slice(0, limit);

      return c.json({ logs });
    } catch (error: any) {
      console.error('[Email Service] Fetch logs error:', error);
      return c.json({ error: error.message || 'Failed to fetch email logs' }, 500);
    }
  });

  /**
   * Initialize default email templates
   */
  app.post(`${PREFIX}/email/init-templates`, async (c) => {
    try {
      const defaultTemplates = [
        {
          name: 'Vendor Welcome',
          subject: 'Welcome to {{eventName}} - Contract & Details',
          body: `Dear {{vendorName}},\n\nWe're excited to have you as part of our team for {{eventName}}!\n\nEvent Details:\n- Date: {{eventDate}}\n- Venue: {{venueName}}\n- Client: {{clientName}}\n\nNext Steps:\n1. Review and sign your contract\n2. Upload required documents\n3. Confirm your attendance\n\nPlease use this link to access your vendor portal: {{portalLink}}\n\nIf you have any questions, please don't hesitate to reach out.\n\nBest regards,\n{{coordinatorName}}\n{{companyName}}`,
          category: 'vendor',
          variables: ['eventName', 'vendorName', 'eventDate', 'venueName', 'clientName', 'portalLink', 'coordinatorName', 'companyName'],
        },
        {
          name: 'Client Welcome',
          subject: 'Welcome! Your Event Planning Journey Begins',
          body: `Dear {{clientName}},\n\nThank you for choosing {{companyName}} to plan your {{eventType}}!\n\nWe're thrilled to help bring your vision to life. Here's what happens next:\n\n1. Your dedicated event coordinator will reach out within 24 hours\n2. We'll schedule a kick-off meeting to discuss your preferences\n3. You'll receive access to your personalized client portal\n\nAccess Your Client Portal:\n{{portalLink}}\n\nIn your portal, you can:\n- View event timeline and milestones\n- Track budget and payments\n- Communicate with your team\n- Approve vendors and contracts\n- Share inspiration and ideas\n\nWe're here to make this journey stress-free and enjoyable!\n\nWarm regards,\n{{coordinatorName}}\nEvent Coordinator\n{{companyName}}`,
          category: 'client',
          variables: ['clientName', 'companyName', 'eventType', 'portalLink', 'coordinatorName'],
        },
        {
          name: 'Event Reminder (7 Days)',
          subject: '{{eventName}} is Coming Up in 7 Days!',
          body: `Hi {{recipientName}},\n\nThis is a friendly reminder that {{eventName}} is just 7 days away!\n\nEvent Details:\n📅 Date: {{eventDate}}\n📍 Location: {{venueName}}, {{venueAddress}}\n⏰ Time: {{eventTime}}\n\nImportant Reminders:\n{{remindersList}}\n\nIf you have any last-minute questions or concerns, please contact us immediately.\n\nLooking forward to seeing you there!\n\nBest,\n{{coordinatorName}}\n{{companyName}}\n{{contactPhone}}`,
          category: 'event',
          variables: ['recipientName', 'eventName', 'eventDate', 'venueName', 'venueAddress', 'eventTime', 'remindersList', 'coordinatorName', 'companyName', 'contactPhone'],
        },
        {
          name: 'Payment Reminder',
          subject: 'Payment Reminder: {{eventName}}',
          body: `Dear {{clientName}},\n\nThis is a friendly reminder about an upcoming payment for {{eventName}}.\n\nPayment Details:\n- Amount Due: ${{amountDue}}\n- Due Date: {{dueDate}}\n- Description: {{description}}\n\nYou can make your payment through your client portal:\n{{paymentLink}}\n\nIf you've already made this payment, please disregard this message.\n\nThank you for your prompt attention to this matter.\n\nBest regards,\n{{coordinatorName}}\nBilling Department\n{{companyName}}`,
          category: 'client',
          variables: ['clientName', 'eventName', 'amountDue', 'dueDate', 'description', 'paymentLink', 'coordinatorName', 'companyName'],
        },
      ];

      const createdTemplates = [];

      for (const template of defaultTemplates) {
        const templateId = `template-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        const fullTemplate = {
          id: templateId,
          ...template,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        await kv.set(`email_template:${templateId}`, fullTemplate);
        createdTemplates.push(fullTemplate);
      }

      console.log(`[Email Service] Initialized ${createdTemplates.length} default templates`);

      return c.json({ 
        success: true, 
        message: `Initialized ${createdTemplates.length} default templates`,
        templates: createdTemplates,
      });
    } catch (error: any) {
      console.error('[Email Service] Init templates error:', error);
      return c.json({ error: error.message || 'Failed to initialize templates' }, 500);
    }
  });

  return app;
}
