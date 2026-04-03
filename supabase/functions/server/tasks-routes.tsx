import { Hono } from 'npm:hono';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';
import * as kv from './kv_store.tsx';

const tasks = new Hono();

// ────────────────────────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────────────────────────

interface Task {
  id: string;
  companyId: string;
  eventId: string;
  title: string;
  description?: string;
  status: 'backlog' | 'todo' | 'in-progress' | 'review' | 'completed' | 'blocked';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: string;
  assignedTo: string[];
  createdBy: string;
  startDate?: string;
  dueDate?: string;
  completedDate?: string;
  estimatedHours?: number;
  actualHours?: number;
  progress: number; // 0-100
  tags: string[];
  dependencies: string[]; // Task IDs this task depends on
  attachments: string[];
  checklist: {
    id: string;
    text: string;
    completed: boolean;
  }[];
  comments: {
    id: string;
    userId: string;
    userName: string;
    text: string;
    createdAt: string;
  }[];
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

interface Milestone {
  id: string;
  companyId: string;
  eventId: string;
  name: string;
  description?: string;
  dueDate: string;
  status: 'upcoming' | 'in-progress' | 'completed' | 'overdue';
  color: string;
  taskIds: string[];
  completionPercentage: number;
  createdAt: string;
  updatedAt: string;
}

interface TaskTemplate {
  id: string;
  companyId: string;
  name: string;
  description?: string;
  category: string;
  tasks: Omit<Task, 'id' | 'companyId' | 'eventId' | 'createdAt' | 'updatedAt'>[];
  createdAt: string;
  updatedAt: string;
}

interface TimeLog {
  id: string;
  companyId: string;
  taskId: string;
  userId: string;
  userName: string;
  hours: number;
  date: string;
  description?: string;
  createdAt: string;
}

// ────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ────────────────────────────────────────────────────────────────────

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

async function getCompanyId(authHeader: string | null): Promise<string> {
  if (!authHeader) throw new Error('Unauthorized');
  
  const token = authHeader.replace('Bearer ', '');
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
  
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) throw new Error('Unauthorized');
  
  return user.user_metadata?.companyId || user.id;
}

async function updateMilestoneProgress(companyId: string, eventId: string, milestoneId: string) {
  const key = `milestone:${companyId}:${milestoneId}`;
  const milestone = await kv.get<Milestone>(key);
  
  if (!milestone) return;
  
  // Get all tasks in this milestone
  const allTasks = await kv.getByPrefix<Task>(`task:${companyId}:${eventId}:`);
  const milestoneTasks = allTasks.filter(t => milestone.taskIds.includes(t.id));
  
  if (milestoneTasks.length === 0) {
    milestone.completionPercentage = 0;
  } else {
    const totalProgress = milestoneTasks.reduce((sum, t) => sum + t.progress, 0);
    milestone.completionPercentage = Math.round(totalProgress / milestoneTasks.length);
  }
  
  // Update status based on completion and date
  const now = new Date();
  const dueDate = new Date(milestone.dueDate);
  
  if (milestone.completionPercentage === 100) {
    milestone.status = 'completed';
  } else if (now > dueDate) {
    milestone.status = 'overdue';
  } else if (milestone.completionPercentage > 0) {
    milestone.status = 'in-progress';
  } else {
    milestone.status = 'upcoming';
  }
  
  milestone.updatedAt = new Date().toISOString();
  await kv.set(key, milestone);
}

// ────────────────────────────────────────────────────────────────────
// TASKS
// ────────────────────────────────────────────────────────────────────

// Create task
tasks.post('/tasks', async (c) => {
  try {
    const companyId = await getCompanyId(c.req.header('Authorization'));
    const body = await c.req.json();
    
    const task: Task = {
      id: generateId('task'),
      companyId,
      eventId: body.eventId,
      title: body.title,
      description: body.description,
      status: body.status || 'todo',
      priority: body.priority || 'medium',
      category: body.category || 'General',
      assignedTo: body.assignedTo || [],
      createdBy: companyId,
      startDate: body.startDate,
      dueDate: body.dueDate,
      estimatedHours: body.estimatedHours,
      actualHours: 0,
      progress: body.progress || 0,
      tags: body.tags || [],
      dependencies: body.dependencies || [],
      attachments: body.attachments || [],
      checklist: body.checklist || [],
      comments: [],
      metadata: body.metadata || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    await kv.set(`task:${companyId}:${task.eventId}:${task.id}`, task);
    
    return c.json({ success: true, task });
  } catch (error) {
    console.error('Error creating task:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get tasks
tasks.get('/tasks', async (c) => {
  try {
    const companyId = await getCompanyId(c.req.header('Authorization'));
    const { eventId, status, priority, assignedTo, category, milestoneId } = c.req.query();
    
    const prefix = eventId 
      ? `task:${companyId}:${eventId}:` 
      : `task:${companyId}:`;
    
    let allTasks = await kv.getByPrefix<Task>(prefix);
    
    // Apply filters
    if (status) {
      allTasks = allTasks.filter(t => t.status === status);
    }
    if (priority) {
      allTasks = allTasks.filter(t => t.priority === priority);
    }
    if (assignedTo) {
      allTasks = allTasks.filter(t => t.assignedTo.includes(assignedTo));
    }
    if (category) {
      allTasks = allTasks.filter(t => t.category === category);
    }
    if (milestoneId) {
      const milestone = await kv.get<Milestone>(`milestone:${companyId}:${milestoneId}`);
      if (milestone) {
        allTasks = allTasks.filter(t => milestone.taskIds.includes(t.id));
      }
    }
    
    // Sort by due date (upcoming first), then priority
    allTasks.sort((a, b) => {
      if (a.dueDate && b.dueDate) {
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      
      const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
    
    return c.json({ success: true, tasks: allTasks });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get single task
tasks.get('/tasks/:id', async (c) => {
  try {
    const companyId = await getCompanyId(c.req.header('Authorization'));
    const { id } = c.req.param();
    const { eventId } = c.req.query();
    
    if (!eventId) {
      return c.json({ success: false, error: 'eventId is required' }, 400);
    }
    
    const task = await kv.get<Task>(`task:${companyId}:${eventId}:${id}`);
    
    if (!task) {
      return c.json({ success: false, error: 'Task not found' }, 404);
    }
    
    return c.json({ success: true, task });
  } catch (error) {
    console.error('Error fetching task:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Update task
tasks.put('/tasks/:id', async (c) => {
  try {
    const companyId = await getCompanyId(c.req.header('Authorization'));
    const { id } = c.req.param();
    const body = await c.req.json();
    
    const key = `task:${companyId}:${body.eventId}:${id}`;
    const task = await kv.get<Task>(key);
    
    if (!task) {
      return c.json({ success: false, error: 'Task not found' }, 404);
    }
    
    // Track status change for completion date
    const wasCompleted = task.status === 'completed';
    const isNowCompleted = body.status === 'completed';
    
    Object.assign(task, body);
    task.updatedAt = new Date().toISOString();
    
    if (!wasCompleted && isNowCompleted) {
      task.completedDate = new Date().toISOString();
      task.progress = 100;
    } else if (wasCompleted && !isNowCompleted) {
      task.completedDate = undefined;
    }
    
    await kv.set(key, task);
    
    // Update milestone progress if task belongs to one
    const milestones = await kv.getByPrefix<Milestone>(`milestone:${companyId}:`);
    for (const milestone of milestones) {
      if (milestone.taskIds.includes(task.id)) {
        await updateMilestoneProgress(companyId, task.eventId, milestone.id);
      }
    }
    
    return c.json({ success: true, task });
  } catch (error) {
    console.error('Error updating task:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Delete task
tasks.delete('/tasks/:id', async (c) => {
  try {
    const companyId = await getCompanyId(c.req.header('Authorization'));
    const { id } = c.req.param();
    const { eventId } = c.req.query();
    
    if (!eventId) {
      return c.json({ success: false, error: 'eventId is required' }, 400);
    }
    
    const key = `task:${companyId}:${eventId}:${id}`;
    const task = await kv.get<Task>(key);
    
    if (!task) {
      return c.json({ success: false, error: 'Task not found' }, 404);
    }
    
    // Remove from milestones
    const milestones = await kv.getByPrefix<Milestone>(`milestone:${companyId}:`);
    for (const milestone of milestones) {
      if (milestone.taskIds.includes(id)) {
        milestone.taskIds = milestone.taskIds.filter(tid => tid !== id);
        milestone.updatedAt = new Date().toISOString();
        await kv.set(`milestone:${companyId}:${milestone.id}`, milestone);
        await updateMilestoneProgress(companyId, task.eventId, milestone.id);
      }
    }
    
    // Delete associated time logs
    const timeLogs = await kv.getByPrefix<TimeLog>(`timelog:${companyId}:${id}:`);
    for (const log of timeLogs) {
      await kv.del(`timelog:${companyId}:${id}:${log.id}`);
    }
    
    await kv.del(key);
    
    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting task:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Add comment to task
tasks.post('/tasks/:id/comments', async (c) => {
  try {
    const companyId = await getCompanyId(c.req.header('Authorization'));
    const { id } = c.req.param();
    const body = await c.req.json();
    
    const key = `task:${companyId}:${body.eventId}:${id}`;
    const task = await kv.get<Task>(key);
    
    if (!task) {
      return c.json({ success: false, error: 'Task not found' }, 404);
    }
    
    const comment = {
      id: generateId('comment'),
      userId: companyId,
      userName: body.userName || 'User',
      text: body.text,
      createdAt: new Date().toISOString(),
    };
    
    task.comments.push(comment);
    task.updatedAt = new Date().toISOString();
    
    await kv.set(key, task);
    
    return c.json({ success: true, comment, task });
  } catch (error) {
    console.error('Error adding comment:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Update checklist item
tasks.put('/tasks/:id/checklist/:checklistId', async (c) => {
  try {
    const companyId = await getCompanyId(c.req.header('Authorization'));
    const { id, checklistId } = c.req.param();
    const body = await c.req.json();
    
    const key = `task:${companyId}:${body.eventId}:${id}`;
    const task = await kv.get<Task>(key);
    
    if (!task) {
      return c.json({ success: false, error: 'Task not found' }, 404);
    }
    
    const checklistItem = task.checklist.find(item => item.id === checklistId);
    if (!checklistItem) {
      return c.json({ success: false, error: 'Checklist item not found' }, 404);
    }
    
    Object.assign(checklistItem, body);
    
    // Update task progress based on checklist completion
    const completedItems = task.checklist.filter(item => item.completed).length;
    const totalItems = task.checklist.length;
    if (totalItems > 0) {
      task.progress = Math.round((completedItems / totalItems) * 100);
    }
    
    task.updatedAt = new Date().toISOString();
    await kv.set(key, task);
    
    return c.json({ success: true, task });
  } catch (error) {
    console.error('Error updating checklist item:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ────────────────────────────────────────────────────────────────────
// MILESTONES
// ────────────────────────────────────────────────────────────────────

// Create milestone
tasks.post('/milestones', async (c) => {
  try {
    const companyId = await getCompanyId(c.req.header('Authorization'));
    const body = await c.req.json();
    
    const milestone: Milestone = {
      id: generateId('milestone'),
      companyId,
      eventId: body.eventId,
      name: body.name,
      description: body.description,
      dueDate: body.dueDate,
      status: 'upcoming',
      color: body.color || '#10b981',
      taskIds: body.taskIds || [],
      completionPercentage: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    await kv.set(`milestone:${companyId}:${milestone.id}`, milestone);
    await updateMilestoneProgress(companyId, milestone.eventId, milestone.id);
    
    return c.json({ success: true, milestone });
  } catch (error) {
    console.error('Error creating milestone:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get milestones
tasks.get('/milestones', async (c) => {
  try {
    const companyId = await getCompanyId(c.req.header('Authorization'));
    const { eventId, status } = c.req.query();
    
    let milestones = await kv.getByPrefix<Milestone>(`milestone:${companyId}:`);
    
    if (eventId && eventId !== 'all') {
      milestones = milestones.filter(m => m.eventId === eventId);
    }
    if (status) {
      milestones = milestones.filter(m => m.status === status);
    }
    
    // Sort by due date
    milestones.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    
    return c.json({ success: true, milestones });
  } catch (error) {
    console.error('Error fetching milestones:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Update milestone
tasks.put('/milestones/:id', async (c) => {
  try {
    const companyId = await getCompanyId(c.req.header('Authorization'));
    const { id } = c.req.param();
    const body = await c.req.json();
    
    const key = `milestone:${companyId}:${id}`;
    const milestone = await kv.get<Milestone>(key);
    
    if (!milestone) {
      return c.json({ success: false, error: 'Milestone not found' }, 404);
    }
    
    Object.assign(milestone, body);
    milestone.updatedAt = new Date().toISOString();
    
    await kv.set(key, milestone);
    await updateMilestoneProgress(companyId, milestone.eventId, milestone.id);
    
    return c.json({ success: true, milestone });
  } catch (error) {
    console.error('Error updating milestone:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Delete milestone
tasks.delete('/milestones/:id', async (c) => {
  try {
    const companyId = await getCompanyId(c.req.header('Authorization'));
    const { id } = c.req.param();
    
    const key = `milestone:${companyId}:${id}`;
    const milestone = await kv.get<Milestone>(key);
    
    if (!milestone) {
      return c.json({ success: false, error: 'Milestone not found' }, 404);
    }
    
    await kv.del(key);
    
    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting milestone:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ────────────────────────────────────────────────────────────────────
// TIME TRACKING
// ────────────────────────────────────────────────────────────────────

// Log time
tasks.post('/tasks/:taskId/time-logs', async (c) => {
  try {
    const companyId = await getCompanyId(c.req.header('Authorization'));
    const { taskId } = c.req.param();
    const body = await c.req.json();
    
    const timeLog: TimeLog = {
      id: generateId('timelog'),
      companyId,
      taskId,
      userId: companyId,
      userName: body.userName || 'User',
      hours: parseFloat(body.hours),
      date: body.date || new Date().toISOString().split('T')[0],
      description: body.description,
      createdAt: new Date().toISOString(),
    };
    
    await kv.set(`timelog:${companyId}:${taskId}:${timeLog.id}`, timeLog);
    
    // Update task actual hours
    const taskKey = `task:${companyId}:${body.eventId}:${taskId}`;
    const task = await kv.get<Task>(taskKey);
    if (task) {
      task.actualHours = (task.actualHours || 0) + timeLog.hours;
      task.updatedAt = new Date().toISOString();
      await kv.set(taskKey, task);
    }
    
    return c.json({ success: true, timeLog });
  } catch (error) {
    console.error('Error logging time:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get time logs
tasks.get('/tasks/:taskId/time-logs', async (c) => {
  try {
    const companyId = await getCompanyId(c.req.header('Authorization'));
    const { taskId } = c.req.param();
    
    const timeLogs = await kv.getByPrefix<TimeLog>(`timelog:${companyId}:${taskId}:`);
    
    // Sort by date descending
    timeLogs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    return c.json({ success: true, timeLogs });
  } catch (error) {
    console.error('Error fetching time logs:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ────────────────────────────────────────────────────────────────────
// TEMPLATES
// ────────────────────────────────────────────────────────────────────

// Create task template
tasks.post('/templates', async (c) => {
  try {
    const companyId = await getCompanyId(c.req.header('Authorization'));
    const body = await c.req.json();
    
    const template: TaskTemplate = {
      id: generateId('template'),
      companyId,
      name: body.name,
      description: body.description,
      category: body.category,
      tasks: body.tasks || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    await kv.set(`tasktemplate:${companyId}:${template.id}`, template);
    
    return c.json({ success: true, template });
  } catch (error) {
    console.error('Error creating template:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get templates
tasks.get('/templates', async (c) => {
  try {
    const companyId = await getCompanyId(c.req.header('Authorization'));
    
    const templates = await kv.getByPrefix<TaskTemplate>(`tasktemplate:${companyId}:`);
    
    return c.json({ success: true, templates });
  } catch (error) {
    console.error('Error fetching templates:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Apply template to event
tasks.post('/templates/:id/apply', async (c) => {
  try {
    const companyId = await getCompanyId(c.req.header('Authorization'));
    const { id } = c.req.param();
    const body = await c.req.json();
    
    const template = await kv.get<TaskTemplate>(`tasktemplate:${companyId}:${id}`);
    
    if (!template) {
      return c.json({ success: false, error: 'Template not found' }, 404);
    }
    
    const createdTasks: Task[] = [];
    
    for (const templateTask of template.tasks) {
      const task: Task = {
        ...templateTask,
        id: generateId('task'),
        companyId,
        eventId: body.eventId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      await kv.set(`task:${companyId}:${task.eventId}:${task.id}`, task);
      createdTasks.push(task);
    }
    
    return c.json({ success: true, tasks: createdTasks });
  } catch (error) {
    console.error('Error applying template:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ────────────────────────────────────────────────────────────────────
// ANALYTICS
// ────────────────────────────────────────────────────────────────────

// Get task analytics
tasks.get('/analytics', async (c) => {
  try {
    const companyId = await getCompanyId(c.req.header('Authorization'));
    const { eventId, startDate, endDate } = c.req.query();
    
    const prefix = eventId 
      ? `task:${companyId}:${eventId}:` 
      : `task:${companyId}:`;
    
    let allTasks = await kv.getByPrefix<Task>(prefix);
    
    // Filter by date range
    if (startDate) {
      allTasks = allTasks.filter(t => 
        t.createdAt >= startDate || (t.dueDate && t.dueDate >= startDate)
      );
    }
    if (endDate) {
      allTasks = allTasks.filter(t => 
        t.createdAt <= endDate || (t.dueDate && t.dueDate <= endDate)
      );
    }
    
    // Calculate metrics
    const totalTasks = allTasks.length;
    const completedTasks = allTasks.filter(t => t.status === 'completed').length;
    const inProgressTasks = allTasks.filter(t => t.status === 'in-progress').length;
    const blockedTasks = allTasks.filter(t => t.status === 'blocked').length;
    const overdueTasks = allTasks.filter(t => {
      if (!t.dueDate || t.status === 'completed') return false;
      return new Date(t.dueDate) < new Date();
    }).length;
    
    const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
    
    // By status
    const byStatus = {
      backlog: allTasks.filter(t => t.status === 'backlog').length,
      todo: allTasks.filter(t => t.status === 'todo').length,
      'in-progress': inProgressTasks,
      review: allTasks.filter(t => t.status === 'review').length,
      completed: completedTasks,
      blocked: blockedTasks,
    };
    
    // By priority
    const byPriority = {
      urgent: allTasks.filter(t => t.priority === 'urgent').length,
      high: allTasks.filter(t => t.priority === 'high').length,
      medium: allTasks.filter(t => t.priority === 'medium').length,
      low: allTasks.filter(t => t.priority === 'low').length,
    };
    
    // By category
    const categoryMap = new Map<string, number>();
    allTasks.forEach(t => {
      categoryMap.set(t.category, (categoryMap.get(t.category) || 0) + 1);
    });
    const byCategory = Array.from(categoryMap.entries()).map(([name, count]) => ({
      name,
      count,
    }));
    
    // Time tracking
    const totalEstimatedHours = allTasks.reduce((sum, t) => sum + (t.estimatedHours || 0), 0);
    const totalActualHours = allTasks.reduce((sum, t) => sum + (t.actualHours || 0), 0);
    const timeVariance = totalEstimatedHours > 0 
      ? ((totalActualHours - totalEstimatedHours) / totalEstimatedHours) * 100 
      : 0;
    
    // Team performance
    const assigneeMap = new Map<string, { completed: number; total: number }>();
    allTasks.forEach(t => {
      t.assignedTo.forEach(userId => {
        if (!assigneeMap.has(userId)) {
          assigneeMap.set(userId, { completed: 0, total: 0 });
        }
        const stats = assigneeMap.get(userId)!;
        stats.total++;
        if (t.status === 'completed') stats.completed++;
      });
    });
    const teamPerformance = Array.from(assigneeMap.entries()).map(([userId, stats]) => ({
      userId,
      completedTasks: stats.completed,
      totalTasks: stats.total,
      completionRate: stats.total > 0 ? (stats.completed / stats.total) * 100 : 0,
    }));
    
    const analytics = {
      summary: {
        totalTasks,
        completedTasks,
        inProgressTasks,
        blockedTasks,
        overdueTasks,
        completionRate,
      },
      byStatus,
      byPriority,
      byCategory,
      timeTracking: {
        totalEstimatedHours,
        totalActualHours,
        timeVariance,
      },
      teamPerformance,
    };
    
    return c.json({ success: true, analytics });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default tasks;
