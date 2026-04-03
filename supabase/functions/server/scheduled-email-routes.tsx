import { Hono } from "npm:hono";
import * as kv from "./kv_store.tsx";

const PREFIX = "/make-server-6c8332a9";

export function createScheduledEmailRoutes(app: Hono) {
  /**
   * Schedule an email
   * POST /email/schedule
   */
  app.post(`${PREFIX}/email/schedule`, async (c) => {
    try {
      const body = await c.req.json();
      const { to, subject, body: emailBody, templateId, variables, scheduledFor, eventId } = body;

      if (!to || !subject || !emailBody || !scheduledFor) {
        return c.json({ error: 'Missing required fields: to, subject, body, scheduledFor' }, 400);
      }

      // Validate scheduledFor is in the future
      const scheduleTime = new Date(scheduledFor);
      if (scheduleTime <= new Date()) {
        return c.json({ error: 'scheduledFor must be in the future' }, 400);
      }

      const emailId = `scheduled-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      const scheduledEmail = {
        id: emailId,
        to: Array.isArray(to) ? to.join(', ') : to,
        subject,
        body: emailBody,
        templateId,
        variables,
        scheduledFor,
        status: 'scheduled',
        eventId,
        createdAt: new Date().toISOString(),
      };

      await kv.set(`scheduled_email:${emailId}`, scheduledEmail);

      console.log(`[Scheduled Email] Email scheduled for ${scheduledFor}: ${subject}`);

      return c.json({ success: true, scheduledEmail });
    } catch (error: any) {
      console.error('[Scheduled Email] Schedule error:', error);
      return c.json({ error: error.message || 'Failed to schedule email' }, 500);
    }
  });

  /**
   * Get scheduled emails
   * GET /email/scheduled
   */
  app.get(`${PREFIX}/email/scheduled`, async (c) => {
    try {
      const status = c.req.query('status');
      const eventId = c.req.query('eventId');

      let scheduledEmails = await kv.getByPrefix('scheduled_email:');
      scheduledEmails = scheduledEmails.map(e => e.value);

      // Apply filters
      if (status) {
        scheduledEmails = scheduledEmails.filter(e => e.status === status);
      }

      if (eventId) {
        scheduledEmails = scheduledEmails.filter(e => e.eventId === eventId);
      }

      // Sort by scheduled time
      scheduledEmails.sort((a, b) => {
        return new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime();
      });

      return c.json({ scheduledEmails });
    } catch (error: any) {
      console.error('[Scheduled Email] Fetch error:', error);
      return c.json({ error: error.message || 'Failed to fetch scheduled emails' }, 500);
    }
  });

  /**
   * Cancel a scheduled email
   * POST /email/scheduled/:id/cancel
   */
  app.post(`${PREFIX}/email/scheduled/:id/cancel`, async (c) => {
    try {
      const emailId = c.req.param('id');

      const scheduledEmail = await kv.get(`scheduled_email:${emailId}`);
      if (!scheduledEmail) {
        return c.json({ error: 'Scheduled email not found' }, 404);
      }

      if (scheduledEmail.status !== 'scheduled') {
        return c.json({ error: `Cannot cancel email with status: ${scheduledEmail.status}` }, 400);
      }

      scheduledEmail.status = 'cancelled';
      await kv.set(`scheduled_email:${emailId}`, scheduledEmail);

      console.log(`[Scheduled Email] Cancelled: ${emailId}`);

      return c.json({ success: true });
    } catch (error: any) {
      console.error('[Scheduled Email] Cancel error:', error);
      return c.json({ error: error.message || 'Failed to cancel scheduled email' }, 500);
    }
  });

  /**
   * Process scheduled emails (cron job endpoint)
   * POST /email/process-scheduled
   */
  app.post(`${PREFIX}/email/process-scheduled`, async (c) => {
    try {
      const now = new Date();
      let scheduledEmails = await kv.getByPrefix('scheduled_email:');
      scheduledEmails = scheduledEmails.map(e => e.value);

      // Filter for emails that are due and still scheduled
      const dueEmails = scheduledEmails.filter(email => {
        if (email.status !== 'scheduled') return false;
        const scheduledTime = new Date(email.scheduledFor);
        return scheduledTime <= now;
      });

      let processed = 0;

      for (const email of dueEmails) {
        try {
          // Create email log
          const messageId = `msg-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          const emailLog = {
            id: messageId,
            to: email.to,
            from: 'noreply@mastermind-events.com',
            subject: email.subject,
            body: email.body,
            templateId: email.templateId,
            status: 'sent',
            sentAt: new Date().toISOString(),
            eventId: email.eventId,
            metadata: {
              variables: email.variables,
              scheduledEmail: true,
              originalScheduledFor: email.scheduledFor,
            },
          };

          await kv.set(`email_log:${messageId}`, emailLog);

          // Update scheduled email status
          email.status = 'sent';
          email.sentAt = new Date().toISOString();
          await kv.set(`scheduled_email:${email.id}`, email);

          console.log(`[Scheduled Email] Processed: ${email.subject} to ${email.to}`);
          processed++;
        } catch (error: any) {
          console.error(`[Scheduled Email] Failed to process ${email.id}:`, error);
          
          // Mark as failed
          email.status = 'failed';
          email.errorMessage = error.message;
          await kv.set(`scheduled_email:${email.id}`, email);
        }
      }

      console.log(`[Scheduled Email] Processed ${processed} scheduled emails`);

      return c.json({ success: true, processed });
    } catch (error: any) {
      console.error('[Scheduled Email] Process error:', error);
      return c.json({ error: error.message || 'Failed to process scheduled emails' }, 500);
    }
  });

  /**
   * Get all automation rules
   * GET /email/automation/rules
   */
  app.get(`${PREFIX}/email/automation/rules`, async (c) => {
    try {
      let rules = await kv.getByPrefix('automation_rule:');
      rules = rules.map(r => r.value);

      // Sort by creation date (newest first)
      rules.sort((a, b) => {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      return c.json({ rules });
    } catch (error: any) {
      console.error('[Automation] Fetch rules error:', error);
      return c.json({ error: error.message || 'Failed to fetch automation rules' }, 500);
    }
  });

  /**
   * Create an automation rule
   * POST /email/automation/rules
   */
  app.post(`${PREFIX}/email/automation/rules`, async (c) => {
    try {
      const body = await c.req.json();
      const { name, description, enabled, trigger, action, filters } = body;

      if (!name || !trigger || !action) {
        return c.json({ error: 'Missing required fields: name, trigger, action' }, 400);
      }

      const ruleId = `rule-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      const rule = {
        id: ruleId,
        name,
        description: description || '',
        enabled: enabled !== undefined ? enabled : true,
        trigger,
        action,
        filters: filters || {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        triggerCount: 0,
      };

      await kv.set(`automation_rule:${ruleId}`, rule);

      console.log(`[Automation] Rule created: ${name}`);

      return c.json({ success: true, rule });
    } catch (error: any) {
      console.error('[Automation] Create rule error:', error);
      return c.json({ error: error.message || 'Failed to create automation rule' }, 500);
    }
  });

  /**
   * Update an automation rule
   * PUT /email/automation/rules/:id
   */
  app.put(`${PREFIX}/email/automation/rules/:id`, async (c) => {
    try {
      const ruleId = c.req.param('id');
      const updates = await c.req.json();

      const existingRule = await kv.get(`automation_rule:${ruleId}`);
      if (!existingRule) {
        return c.json({ error: 'Automation rule not found' }, 404);
      }

      const updatedRule = {
        ...existingRule,
        ...updates,
        id: ruleId,
        createdAt: existingRule.createdAt,
        updatedAt: new Date().toISOString(),
      };

      await kv.set(`automation_rule:${ruleId}`, updatedRule);

      console.log(`[Automation] Rule updated: ${ruleId}`);

      return c.json({ success: true, rule: updatedRule });
    } catch (error: any) {
      console.error('[Automation] Update rule error:', error);
      return c.json({ error: error.message || 'Failed to update automation rule' }, 500);
    }
  });

  /**
   * Delete an automation rule
   * DELETE /email/automation/rules/:id
   */
  app.delete(`${PREFIX}/email/automation/rules/:id`, async (c) => {
    try {
      const ruleId = c.req.param('id');

      const existingRule = await kv.get(`automation_rule:${ruleId}`);
      if (!existingRule) {
        return c.json({ error: 'Automation rule not found' }, 404);
      }

      await kv.del(`automation_rule:${ruleId}`);

      console.log(`[Automation] Rule deleted: ${ruleId}`);

      return c.json({ success: true });
    } catch (error: any) {
      console.error('[Automation] Delete rule error:', error);
      return c.json({ error: error.message || 'Failed to delete automation rule' }, 500);
    }
  });

  /**
   * Get all email campaigns
   * GET /email/campaigns
   */
  app.get(`${PREFIX}/email/campaigns`, async (c) => {
    try {
      let campaigns = await kv.getByPrefix('email_campaign:');
      campaigns = campaigns.map(c => c.value);

      // Sort by creation date (newest first)
      campaigns.sort((a, b) => {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      return c.json({ campaigns });
    } catch (error: any) {
      console.error('[Campaigns] Fetch error:', error);
      return c.json({ error: error.message || 'Failed to fetch campaigns' }, 500);
    }
  });

  /**
   * Create an email campaign
   * POST /email/campaigns
   */
  app.post(`${PREFIX}/email/campaigns`, async (c) => {
    try {
      const body = await c.req.json();
      const { name, description, status, templateId, recipientType, customRecipients, scheduledFor, recurring } = body;

      if (!name || !templateId || !recipientType) {
        return c.json({ error: 'Missing required fields: name, templateId, recipientType' }, 400);
      }

      const campaignId = `campaign-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      const campaign = {
        id: campaignId,
        name,
        description: description || '',
        status: status || 'draft',
        templateId,
        recipientType,
        customRecipients,
        scheduledFor,
        recurring,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        totalSent: 0,
        totalFailed: 0,
      };

      await kv.set(`email_campaign:${campaignId}`, campaign);

      console.log(`[Campaigns] Campaign created: ${name}`);

      return c.json({ success: true, campaign });
    } catch (error: any) {
      console.error('[Campaigns] Create error:', error);
      return c.json({ error: error.message || 'Failed to create campaign' }, 500);
    }
  });

  /**
   * Update an email campaign
   * PUT /email/campaigns/:id
   */
  app.put(`${PREFIX}/email/campaigns/:id`, async (c) => {
    try {
      const campaignId = c.req.param('id');
      const updates = await c.req.json();

      const existingCampaign = await kv.get(`email_campaign:${campaignId}`);
      if (!existingCampaign) {
        return c.json({ error: 'Campaign not found' }, 404);
      }

      const updatedCampaign = {
        ...existingCampaign,
        ...updates,
        id: campaignId,
        createdAt: existingCampaign.createdAt,
        updatedAt: new Date().toISOString(),
      };

      await kv.set(`email_campaign:${campaignId}`, updatedCampaign);

      console.log(`[Campaigns] Campaign updated: ${campaignId}`);

      return c.json({ success: true, campaign: updatedCampaign });
    } catch (error: any) {
      console.error('[Campaigns] Update error:', error);
      return c.json({ error: error.message || 'Failed to update campaign' }, 500);
    }
  });

  /**
   * Delete an email campaign
   * DELETE /email/campaigns/:id
   */
  app.delete(`${PREFIX}/email/campaigns/:id`, async (c) => {
    try {
      const campaignId = c.req.param('id');

      const existingCampaign = await kv.get(`email_campaign:${campaignId}`);
      if (!existingCampaign) {
        return c.json({ error: 'Campaign not found' }, 404);
      }

      await kv.del(`email_campaign:${campaignId}`);

      console.log(`[Campaigns] Campaign deleted: ${campaignId}`);

      return c.json({ success: true });
    } catch (error: any) {
      console.error('[Campaigns] Delete error:', error);
      return c.json({ error: error.message || 'Failed to delete campaign' }, 500);
    }
  });

  /**
   * Send a campaign immediately
   * POST /email/campaigns/:id/send
   */
  app.post(`${PREFIX}/email/campaigns/:id/send`, async (c) => {
    try {
      const campaignId = c.req.param('id');

      const campaign = await kv.get(`email_campaign:${campaignId}`);
      if (!campaign) {
        return c.json({ error: 'Campaign not found' }, 404);
      }

      // Get template
      const template = await kv.get(`email_template:${campaign.templateId}`);
      if (!template) {
        return c.json({ error: 'Template not found' }, 404);
      }

      // Determine recipients (simulated - in production would query actual data)
      let recipients: string[] = [];
      
      if (campaign.recipientType === 'custom' && campaign.customRecipients) {
        recipients = campaign.customRecipients;
      } else {
        // Simulate getting recipients based on type
        recipients = [`${campaign.recipientType}@example.com`]; // Placeholder
      }

      let sent = 0;
      let failed = 0;

      // Send to all recipients
      for (const recipient of recipients) {
        try {
          const messageId = `msg-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          
          const emailLog = {
            id: messageId,
            to: recipient,
            from: 'noreply@mastermind-events.com',
            subject: template.subject,
            body: template.body,
            templateId: campaign.templateId,
            status: 'sent',
            sentAt: new Date().toISOString(),
            metadata: {
              campaignId,
              campaignName: campaign.name,
            },
          };

          await kv.set(`email_log:${messageId}`, emailLog);
          sent++;
        } catch (error) {
          console.error(`Failed to send to ${recipient}:`, error);
          failed++;
        }
      }

      // Update campaign stats
      campaign.totalSent += sent;
      campaign.totalFailed += failed;
      campaign.lastSentAt = new Date().toISOString();
      await kv.set(`email_campaign:${campaignId}`, campaign);

      console.log(`[Campaigns] Campaign sent: ${campaign.name} (${sent} sent, ${failed} failed)`);

      return c.json({ success: true, sent, failed });
    } catch (error: any) {
      console.error('[Campaigns] Send error:', error);
      return c.json({ error: error.message || 'Failed to send campaign' }, 500);
    }
  });

  return app;
}
