import { Hono } from 'npm:hono';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';
import * as kv from './kv_store.tsx';

const finance = new Hono();

// ────────────────────────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────────────────────────

interface Transaction {
  id: string;
  companyId: string;
  eventId: string;
  type: 'income' | 'expense';
  category: string;
  subcategory?: string;
  relatedEntity?: string;
  amount: number;
  status: 'draft' | 'pending' | 'approved' | 'paid' | 'rejected' | 'cancelled';
  date: string;
  description: string;
  invoiceNumber?: string;
  paymentMethod?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

interface Invoice {
  id: string;
  companyId: string;
  invoiceNumber: string;
  eventId: string;
  clientId: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  issueDate: string;
  dueDate: string;
  paidDate?: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  items: {
    id: string;
    description: string;
    quantity: number;
    rate: number;
    amount: number;
  }[];
  notes?: string;
  terms?: string;
  paymentPlanId?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

interface PaymentPlan {
  id: string;
  companyId: string;
  invoiceId?: string;
  eventId: string;
  clientId: string;
  totalAmount: number;
  contractGenerated: boolean;
  contractSignedByClient: boolean;
  contractSignedByCompany: boolean;
  contractUrl?: string;
  installments: {
    id: string;
    number: number;
    amount: number;
    dueDate: string;
    status: 'pending' | 'paid' | 'overdue' | 'cancelled';
    paidDate?: string;
    description: string;
  }[];
  createdAt: string;
  updatedAt: string;
}

interface BudgetItem {
  id: string;
  companyId: string;
  eventId: string;
  category: string;
  allocatedAmount: number;
  spentAmount: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface ConsolidatedReport {
  period: {
    start: string;
    end: string;
  };
  summary: {
    totalRevenue: number;
    totalExpenses: number;
    netProfit: number;
    profitMargin: number;
    averageEventRevenue: number;
    eventsCount: number;
  };
  byEvent: {
    eventId: string;
    eventName: string;
    revenue: number;
    expenses: number;
    profit: number;
    profitMargin: number;
  }[];
  byCategory: {
    category: string;
    amount: number;
    percentage: number;
  }[];
  cashFlow: {
    month: string;
    income: number;
    expenses: number;
    net: number;
    cumulative: number;
  }[];
}

// ────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ────────────────────────────────────────────────────────────────────

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateInvoiceNumber(companyId: string): string {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.random().toString(36).substr(2, 4).toUpperCase();
  return `INV-${timestamp}-${random}`;
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
  
  // In production, fetch actual company from user metadata
  return user.user_metadata?.companyId || user.id;
}

// ────────────────────────────────────────────────────────────────────
// TRANSACTIONS
// ────────────────────────────────────────────────────────────────────

// Create transaction
finance.post('/transactions', async (c) => {
  try {
    const companyId = await getCompanyId(c.req.header('Authorization'));
    const body = await c.req.json();
    
    const transaction: Transaction = {
      id: generateId('txn'),
      companyId,
      eventId: body.eventId,
      type: body.type,
      category: body.category,
      subcategory: body.subcategory,
      relatedEntity: body.relatedEntity,
      amount: parseFloat(body.amount),
      status: body.status || 'draft',
      date: body.date || new Date().toISOString().split('T')[0],
      description: body.description,
      invoiceNumber: body.invoiceNumber,
      paymentMethod: body.paymentMethod,
      metadata: body.metadata || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: companyId,
    };
    
    await kv.set(`txn:${companyId}:${transaction.id}`, transaction);
    
    // Update budget spent amount if expense
    if (transaction.type === 'expense' && transaction.status === 'paid') {
      const budgetKey = `budget:${companyId}:${transaction.eventId}:${transaction.category}`;
      const budget = await kv.get<BudgetItem>(budgetKey);
      if (budget) {
        budget.spentAmount += transaction.amount;
        budget.updatedAt = new Date().toISOString();
        await kv.set(budgetKey, budget);
      }
    }
    
    return c.json({ success: true, transaction });
  } catch (error) {
    console.error('Error creating transaction:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get transactions
finance.get('/transactions', async (c) => {
  try {
    const companyId = await getCompanyId(c.req.header('Authorization'));
    const { eventId, type, status, startDate, endDate } = c.req.query();
    
    const allTransactions = await kv.getByPrefix<Transaction>(`txn:${companyId}:`);
    
    let filtered = allTransactions.filter(t => t.companyId === companyId);
    
    if (eventId && eventId !== 'all') {
      filtered = filtered.filter(t => t.eventId === eventId);
    }
    if (type) {
      filtered = filtered.filter(t => t.type === type);
    }
    if (status) {
      filtered = filtered.filter(t => t.status === status);
    }
    if (startDate) {
      filtered = filtered.filter(t => t.date >= startDate);
    }
    if (endDate) {
      filtered = filtered.filter(t => t.date <= endDate);
    }
    
    // Sort by date descending
    filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    return c.json({ success: true, transactions: filtered });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Update transaction
finance.put('/transactions/:id', async (c) => {
  try {
    const companyId = await getCompanyId(c.req.header('Authorization'));
    const { id } = c.req.param();
    const body = await c.req.json();
    
    const key = `txn:${companyId}:${id}`;
    const transaction = await kv.get<Transaction>(key);
    
    if (!transaction) {
      return c.json({ success: false, error: 'Transaction not found' }, 404);
    }
    
    // Track old status for budget updates
    const oldStatus = transaction.status;
    const oldAmount = transaction.amount;
    
    // Update fields
    Object.assign(transaction, body);
    transaction.updatedAt = new Date().toISOString();
    
    await kv.set(key, transaction);
    
    // Update budget if status changed to/from paid
    if (transaction.type === 'expense') {
      const budgetKey = `budget:${companyId}:${transaction.eventId}:${transaction.category}`;
      const budget = await kv.get<BudgetItem>(budgetKey);
      
      if (budget) {
        if (oldStatus !== 'paid' && transaction.status === 'paid') {
          budget.spentAmount += transaction.amount;
        } else if (oldStatus === 'paid' && transaction.status !== 'paid') {
          budget.spentAmount -= oldAmount;
        } else if (oldStatus === 'paid' && transaction.status === 'paid' && oldAmount !== transaction.amount) {
          budget.spentAmount = budget.spentAmount - oldAmount + transaction.amount;
        }
        budget.updatedAt = new Date().toISOString();
        await kv.set(budgetKey, budget);
      }
    }
    
    return c.json({ success: true, transaction });
  } catch (error) {
    console.error('Error updating transaction:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Delete transaction
finance.delete('/transactions/:id', async (c) => {
  try {
    const companyId = await getCompanyId(c.req.header('Authorization'));
    const { id } = c.req.param();
    
    const key = `txn:${companyId}:${id}`;
    const transaction = await kv.get<Transaction>(key);
    
    if (!transaction) {
      return c.json({ success: false, error: 'Transaction not found' }, 404);
    }
    
    // Update budget if deleting paid expense
    if (transaction.type === 'expense' && transaction.status === 'paid') {
      const budgetKey = `budget:${companyId}:${transaction.eventId}:${transaction.category}`;
      const budget = await kv.get<BudgetItem>(budgetKey);
      if (budget) {
        budget.spentAmount -= transaction.amount;
        budget.updatedAt = new Date().toISOString();
        await kv.set(budgetKey, budget);
      }
    }
    
    await kv.del(key);
    
    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting transaction:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ────────────────────────────────────────────────────────────────────
// INVOICES
// ────────────────────────────────────────────────────────────────────

// Create invoice
finance.post('/invoices', async (c) => {
  try {
    const companyId = await getCompanyId(c.req.header('Authorization'));
    const body = await c.req.json();
    
    const invoice: Invoice = {
      id: generateId('inv'),
      companyId,
      invoiceNumber: body.invoiceNumber || generateInvoiceNumber(companyId),
      eventId: body.eventId,
      clientId: body.clientId,
      status: body.status || 'draft',
      issueDate: body.issueDate || new Date().toISOString().split('T')[0],
      dueDate: body.dueDate,
      paidDate: body.paidDate,
      subtotal: parseFloat(body.subtotal),
      tax: parseFloat(body.tax || 0),
      discount: parseFloat(body.discount || 0),
      total: parseFloat(body.total),
      items: body.items || [],
      notes: body.notes,
      terms: body.terms,
      paymentPlanId: body.paymentPlanId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: companyId,
    };
    
    await kv.set(`inv:${companyId}:${invoice.id}`, invoice);
    
    // Create income transaction if invoice is paid
    if (invoice.status === 'paid') {
      const transaction: Transaction = {
        id: generateId('txn'),
        companyId,
        eventId: invoice.eventId,
        type: 'income',
        category: 'Client Payment',
        amount: invoice.total,
        status: 'paid',
        date: invoice.paidDate || new Date().toISOString().split('T')[0],
        description: `Payment for Invoice ${invoice.invoiceNumber}`,
        invoiceNumber: invoice.invoiceNumber,
        metadata: { invoiceId: invoice.id },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: companyId,
      };
      await kv.set(`txn:${companyId}:${transaction.id}`, transaction);
    }
    
    return c.json({ success: true, invoice });
  } catch (error) {
    console.error('Error creating invoice:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get invoices
finance.get('/invoices', async (c) => {
  try {
    const companyId = await getCompanyId(c.req.header('Authorization'));
    const { eventId, clientId, status } = c.req.query();
    
    const allInvoices = await kv.getByPrefix<Invoice>(`inv:${companyId}:`);
    
    let filtered = allInvoices.filter(i => i.companyId === companyId);
    
    if (eventId && eventId !== 'all') {
      filtered = filtered.filter(i => i.eventId === eventId);
    }
    if (clientId) {
      filtered = filtered.filter(i => i.clientId === clientId);
    }
    if (status) {
      filtered = filtered.filter(i => i.status === status);
    }
    
    // Sort by issue date descending
    filtered.sort((a, b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime());
    
    return c.json({ success: true, invoices: filtered });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Update invoice
finance.put('/invoices/:id', async (c) => {
  try {
    const companyId = await getCompanyId(c.req.header('Authorization'));
    const { id } = c.req.param();
    const body = await c.req.json();
    
    const key = `inv:${companyId}:${id}`;
    const invoice = await kv.get<Invoice>(key);
    
    if (!invoice) {
      return c.json({ success: false, error: 'Invoice not found' }, 404);
    }
    
    const oldStatus = invoice.status;
    
    Object.assign(invoice, body);
    invoice.updatedAt = new Date().toISOString();
    
    await kv.set(key, invoice);
    
    // Create income transaction if status changed to paid
    if (oldStatus !== 'paid' && invoice.status === 'paid') {
      const transaction: Transaction = {
        id: generateId('txn'),
        companyId,
        eventId: invoice.eventId,
        type: 'income',
        category: 'Client Payment',
        amount: invoice.total,
        status: 'paid',
        date: invoice.paidDate || new Date().toISOString().split('T')[0],
        description: `Payment for Invoice ${invoice.invoiceNumber}`,
        invoiceNumber: invoice.invoiceNumber,
        metadata: { invoiceId: invoice.id },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: companyId,
      };
      await kv.set(`txn:${companyId}:${transaction.id}`, transaction);
    }
    
    return c.json({ success: true, invoice });
  } catch (error) {
    console.error('Error updating invoice:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ────────────────────────────────────────────────────────────────────
// PAYMENT PLANS
// ────────────────────────────────────────────────────────────────────

// Create payment plan
finance.post('/payment-plans', async (c) => {
  try {
    const companyId = await getCompanyId(c.req.header('Authorization'));
    const body = await c.req.json();
    
    const plan: PaymentPlan = {
      id: generateId('plan'),
      companyId,
      invoiceId: body.invoiceId,
      eventId: body.eventId,
      clientId: body.clientId,
      totalAmount: parseFloat(body.totalAmount),
      contractGenerated: body.contractGenerated || false,
      contractSignedByClient: body.contractSignedByClient || false,
      contractSignedByCompany: body.contractSignedByCompany || false,
      contractUrl: body.contractUrl,
      installments: body.installments || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    await kv.set(`plan:${companyId}:${plan.id}`, plan);
    
    return c.json({ success: true, plan });
  } catch (error) {
    console.error('Error creating payment plan:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get payment plans
finance.get('/payment-plans', async (c) => {
  try {
    const companyId = await getCompanyId(c.req.header('Authorization'));
    const { eventId, clientId } = c.req.query();
    
    const allPlans = await kv.getByPrefix<PaymentPlan>(`plan:${companyId}:`);
    
    let filtered = allPlans.filter(p => p.companyId === companyId);
    
    if (eventId && eventId !== 'all') {
      filtered = filtered.filter(p => p.eventId === eventId);
    }
    if (clientId) {
      filtered = filtered.filter(p => p.clientId === clientId);
    }
    
    return c.json({ success: true, plans: filtered });
  } catch (error) {
    console.error('Error fetching payment plans:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Update payment plan
finance.put('/payment-plans/:id', async (c) => {
  try {
    const companyId = await getCompanyId(c.req.header('Authorization'));
    const { id } = c.req.param();
    const body = await c.req.json();
    
    const key = `plan:${companyId}:${id}`;
    const plan = await kv.get<PaymentPlan>(key);
    
    if (!plan) {
      return c.json({ success: false, error: 'Payment plan not found' }, 404);
    }
    
    Object.assign(plan, body);
    plan.updatedAt = new Date().toISOString();
    
    await kv.set(key, plan);
    
    return c.json({ success: true, plan });
  } catch (error) {
    console.error('Error updating payment plan:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Record installment payment
finance.post('/payment-plans/:id/installments/:installmentId/pay', async (c) => {
  try {
    const companyId = await getCompanyId(c.req.header('Authorization'));
    const { id, installmentId } = c.req.param();
    const body = await c.req.json();
    
    const key = `plan:${companyId}:${id}`;
    const plan = await kv.get<PaymentPlan>(key);
    
    if (!plan) {
      return c.json({ success: false, error: 'Payment plan not found' }, 404);
    }
    
    const installment = plan.installments.find(i => i.id === installmentId);
    if (!installment) {
      return c.json({ success: false, error: 'Installment not found' }, 404);
    }
    
    installment.status = 'paid';
    installment.paidDate = body.paidDate || new Date().toISOString().split('T')[0];
    plan.updatedAt = new Date().toISOString();
    
    await kv.set(key, plan);
    
    // Create income transaction
    const transaction: Transaction = {
      id: generateId('txn'),
      companyId,
      eventId: plan.eventId,
      type: 'income',
      category: 'Client Payment',
      subcategory: `Installment ${installment.number}`,
      amount: installment.amount,
      status: 'paid',
      date: installment.paidDate,
      description: installment.description,
      metadata: { 
        paymentPlanId: plan.id,
        installmentId: installment.id,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: companyId,
    };
    await kv.set(`txn:${companyId}:${transaction.id}`, transaction);
    
    return c.json({ success: true, plan, transaction });
  } catch (error) {
    console.error('Error recording installment payment:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ────────────────────────────────────────────────────────────────────
// BUDGETS
// ────────────────────────────────────────────────────────────────────

// Set budget for event category
finance.post('/budgets', async (c) => {
  try {
    const companyId = await getCompanyId(c.req.header('Authorization'));
    const body = await c.req.json();
    
    const budget: BudgetItem = {
      id: generateId('budget'),
      companyId,
      eventId: body.eventId,
      category: body.category,
      allocatedAmount: parseFloat(body.allocatedAmount),
      spentAmount: parseFloat(body.spentAmount || 0),
      notes: body.notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    await kv.set(`budget:${companyId}:${budget.eventId}:${budget.category}`, budget);
    
    return c.json({ success: true, budget });
  } catch (error) {
    console.error('Error creating budget:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get budgets
finance.get('/budgets', async (c) => {
  try {
    const companyId = await getCompanyId(c.req.header('Authorization'));
    const { eventId } = c.req.query();
    
    const prefix = eventId 
      ? `budget:${companyId}:${eventId}:` 
      : `budget:${companyId}:`;
      
    const budgets = await kv.getByPrefix<BudgetItem>(prefix);
    
    return c.json({ success: true, budgets });
  } catch (error) {
    console.error('Error fetching budgets:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ────────────────────────────────────────────────────────────────────
// REPORTS & ANALYTICS
// ────────────────────────────────────────────────────────────────────

// Generate consolidated financial report
finance.get('/reports/consolidated', async (c) => {
  try {
    const companyId = await getCompanyId(c.req.header('Authorization'));
    const { startDate, endDate, eventIds } = c.req.query();
    
    const allTransactions = await kv.getByPrefix<Transaction>(`txn:${companyId}:`);
    
    // Filter by date range
    let filtered = allTransactions.filter(t => 
      t.status === 'paid' &&
      (!startDate || t.date >= startDate) &&
      (!endDate || t.date <= endDate)
    );
    
    // Filter by specific events if provided
    if (eventIds) {
      const eventIdArray = eventIds.split(',');
      filtered = filtered.filter(t => eventIdArray.includes(t.eventId));
    }
    
    // Calculate summary
    const revenue = filtered
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
      
    const expenses = filtered
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
      
    const netProfit = revenue - expenses;
    const profitMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;
    
    // Get unique events
    const eventIdSet = new Set(filtered.map(t => t.eventId));
    const eventsCount = eventIdSet.size;
    const averageEventRevenue = eventsCount > 0 ? revenue / eventsCount : 0;
    
    // Group by event
    const byEventMap = new Map<string, { revenue: number; expenses: number }>();
    filtered.forEach(t => {
      if (!byEventMap.has(t.eventId)) {
        byEventMap.set(t.eventId, { revenue: 0, expenses: 0 });
      }
      const eventData = byEventMap.get(t.eventId)!;
      if (t.type === 'income') {
        eventData.revenue += t.amount;
      } else {
        eventData.expenses += t.amount;
      }
    });
    
    const byEvent = Array.from(byEventMap.entries()).map(([eventId, data]) => ({
      eventId,
      eventName: eventId, // In production, fetch actual event name
      revenue: data.revenue,
      expenses: data.expenses,
      profit: data.revenue - data.expenses,
      profitMargin: data.revenue > 0 ? ((data.revenue - data.expenses) / data.revenue) * 100 : 0,
    }));
    
    // Group by category (expenses only)
    const byCategoryMap = new Map<string, number>();
    filtered
      .filter(t => t.type === 'expense')
      .forEach(t => {
        byCategoryMap.set(
          t.category,
          (byCategoryMap.get(t.category) || 0) + t.amount
        );
      });
      
    const byCategory = Array.from(byCategoryMap.entries())
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: expenses > 0 ? (amount / expenses) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
    
    // Cash flow by month
    const cashFlowMap = new Map<string, { income: number; expenses: number }>();
    filtered.forEach(t => {
      const month = t.date.substring(0, 7); // YYYY-MM
      if (!cashFlowMap.has(month)) {
        cashFlowMap.set(month, { income: 0, expenses: 0 });
      }
      const monthData = cashFlowMap.get(month)!;
      if (t.type === 'income') {
        monthData.income += t.amount;
      } else {
        monthData.expenses += t.amount;
      }
    });
    
    let cumulative = 0;
    const cashFlow = Array.from(cashFlowMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, data]) => {
        const net = data.income - data.expenses;
        cumulative += net;
        return {
          month,
          income: data.income,
          expenses: data.expenses,
          net,
          cumulative,
        };
      });
    
    const report: ConsolidatedReport = {
      period: {
        start: startDate || 'All time',
        end: endDate || 'Present',
      },
      summary: {
        totalRevenue: revenue,
        totalExpenses: expenses,
        netProfit,
        profitMargin,
        averageEventRevenue,
        eventsCount,
      },
      byEvent,
      byCategory,
      cashFlow,
    };
    
    return c.json({ success: true, report });
  } catch (error) {
    console.error('Error generating consolidated report:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Generate P&L statement
finance.get('/reports/pl-statement', async (c) => {
  try {
    const companyId = await getCompanyId(c.req.header('Authorization'));
    const { startDate, endDate, eventId } = c.req.query();
    
    const allTransactions = await kv.getByPrefix<Transaction>(`txn:${companyId}:`);
    
    let filtered = allTransactions.filter(t => 
      t.status === 'paid' &&
      (!startDate || t.date >= startDate) &&
      (!endDate || t.date <= endDate) &&
      (!eventId || eventId === 'all' || t.eventId === eventId)
    );
    
    // Revenue breakdown
    const revenueByCategory = new Map<string, number>();
    filtered
      .filter(t => t.type === 'income')
      .forEach(t => {
        const cat = t.category || 'Other Income';
        revenueByCategory.set(cat, (revenueByCategory.get(cat) || 0) + t.amount);
      });
    
    // Expense breakdown
    const expensesByCategory = new Map<string, number>();
    filtered
      .filter(t => t.type === 'expense')
      .forEach(t => {
        const cat = t.category || 'Other Expenses';
        expensesByCategory.set(cat, (expensesByCategory.get(cat) || 0) + t.amount);
      });
    
    const totalRevenue = Array.from(revenueByCategory.values()).reduce((sum, v) => sum + v, 0);
    const totalExpenses = Array.from(expensesByCategory.values()).reduce((sum, v) => sum + v, 0);
    const netIncome = totalRevenue - totalExpenses;
    
    const statement = {
      period: {
        start: startDate || 'All time',
        end: endDate || 'Present',
      },
      revenue: {
        categories: Array.from(revenueByCategory.entries()).map(([name, amount]) => ({
          name,
          amount,
          percentage: totalRevenue > 0 ? (amount / totalRevenue) * 100 : 0,
        })),
        total: totalRevenue,
      },
      expenses: {
        categories: Array.from(expensesByCategory.entries()).map(([name, amount]) => ({
          name,
          amount,
          percentage: totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0,
        })),
        total: totalExpenses,
      },
      netIncome,
      profitMargin: totalRevenue > 0 ? (netIncome / totalRevenue) * 100 : 0,
    };
    
    return c.json({ success: true, statement });
  } catch (error) {
    console.error('Error generating P&L statement:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Cash flow analysis
finance.get('/reports/cash-flow', async (c) => {
  try {
    const companyId = await getCompanyId(c.req.header('Authorization'));
    const { startDate, endDate, eventId, granularity = 'month' } = c.req.query();
    
    const allTransactions = await kv.getByPrefix<Transaction>(`txn:${companyId}:`);
    
    let filtered = allTransactions.filter(t => 
      t.status === 'paid' &&
      (!startDate || t.date >= startDate) &&
      (!endDate || t.date <= endDate) &&
      (!eventId || eventId === 'all' || t.eventId === eventId)
    );
    
    // Group by time period
    const periodMap = new Map<string, { inflow: number; outflow: number }>();
    
    filtered.forEach(t => {
      let period: string;
      if (granularity === 'day') {
        period = t.date;
      } else if (granularity === 'week') {
        const date = new Date(t.date);
        const week = Math.ceil(date.getDate() / 7);
        period = `${t.date.substring(0, 7)}-W${week}`;
      } else if (granularity === 'quarter') {
        const month = parseInt(t.date.substring(5, 7));
        const quarter = Math.ceil(month / 3);
        period = `${t.date.substring(0, 4)}-Q${quarter}`;
      } else {
        period = t.date.substring(0, 7); // month (YYYY-MM)
      }
      
      if (!periodMap.has(period)) {
        periodMap.set(period, { inflow: 0, outflow: 0 });
      }
      
      const data = periodMap.get(period)!;
      if (t.type === 'income') {
        data.inflow += t.amount;
      } else {
        data.outflow += t.amount;
      }
    });
    
    let runningBalance = 0;
    const cashFlow = Array.from(periodMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([period, data]) => {
        const netCashFlow = data.inflow - data.outflow;
        runningBalance += netCashFlow;
        return {
          period,
          inflow: data.inflow,
          outflow: data.outflow,
          netCashFlow,
          runningBalance,
        };
      });
    
    return c.json({ success: true, cashFlow });
  } catch (error) {
    console.error('Error generating cash flow analysis:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Budget vs Actual report
finance.get('/reports/budget-vs-actual', async (c) => {
  try {
    const companyId = await getCompanyId(c.req.header('Authorization'));
    const { eventId } = c.req.query();
    
    const budgets = await kv.getByPrefix<BudgetItem>(
      eventId ? `budget:${companyId}:${eventId}:` : `budget:${companyId}:`
    );
    
    const analysis = budgets.map(budget => ({
      eventId: budget.eventId,
      category: budget.category,
      budgeted: budget.allocatedAmount,
      actual: budget.spentAmount,
      variance: budget.allocatedAmount - budget.spentAmount,
      variancePercent: budget.allocatedAmount > 0 
        ? ((budget.allocatedAmount - budget.spentAmount) / budget.allocatedAmount) * 100 
        : 0,
      status: budget.spentAmount > budget.allocatedAmount 
        ? 'over' 
        : budget.spentAmount / budget.allocatedAmount > 0.9 
        ? 'warning' 
        : 'good',
    }));
    
    return c.json({ success: true, analysis });
  } catch (error) {
    console.error('Error generating budget vs actual report:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Export to CSV
finance.get('/export/csv', async (c) => {
  try {
    const companyId = await getCompanyId(c.req.header('Authorization'));
    const { type = 'transactions', startDate, endDate, eventId } = c.req.query();
    
    if (type === 'transactions') {
      const allTransactions = await kv.getByPrefix<Transaction>(`txn:${companyId}:`);
      
      let filtered = allTransactions.filter(t => 
        (!startDate || t.date >= startDate) &&
        (!endDate || t.date <= endDate) &&
        (!eventId || eventId === 'all' || t.eventId === eventId)
      );
      
      // Generate CSV
      const headers = ['Date', 'Type', 'Category', 'Description', 'Amount', 'Status', 'Invoice #', 'Payment Method'];
      const rows = filtered.map(t => [
        t.date,
        t.type,
        t.category,
        t.description,
        t.amount.toFixed(2),
        t.status,
        t.invoiceNumber || '',
        t.paymentMethod || '',
      ]);
      
      const csv = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');
      
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="transactions-${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    }
    
    return c.json({ success: false, error: 'Invalid export type' }, 400);
  } catch (error) {
    console.error('Error exporting CSV:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default finance;