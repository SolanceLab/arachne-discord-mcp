import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth, requireOperator } from './middleware.js';
import type { EntityRegistry } from '../entity-registry.js';

export function createBugReportsRouter(registry: EntityRegistry): Router {
  const router = Router();

  // POST /api/bug-reports — submit a new bug report (any authenticated user)
  router.post('/', requireAuth, (req: Request, res: Response) => {
    const { title, description, entity_id, server_id } = req.body;

    if (!title || !description) {
      res.status(400).json({ error: 'Title and description are required' });
      return;
    }

    if (typeof title !== 'string' || title.length > 200) {
      res.status(400).json({ error: 'Title must be 200 characters or less' });
      return;
    }

    if (typeof description !== 'string' || description.length > 2000) {
      res.status(400).json({ error: 'Description must be 2000 characters or less' });
      return;
    }

    const report = registry.createBugReport(
      req.user!.sub,
      req.user!.username,
      entity_id || null,
      server_id || null,
      title.trim(),
      description.trim(),
    );

    res.status(201).json(report);
  });

  // GET /api/bug-reports — get current user's reports
  router.get('/', requireAuth, (req: Request, res: Response) => {
    const reports = registry.getBugReportsByUser(req.user!.sub);
    res.json(reports);
  });

  // GET /api/bug-reports/all — get all reports (operator only)
  router.get('/all', requireAuth, requireOperator, (req: Request, res: Response) => {
    const reports = registry.getAllBugReports(req.user!.sub);
    res.json(reports);
  });

  // PATCH /api/bug-reports/:id — update report status (operator only)
  router.patch('/:id', requireAuth, requireOperator, (req: Request, res: Response) => {
    const { status } = req.body;

    if (!status || !['open', 'resolved'].includes(status)) {
      res.status(400).json({ error: 'Status must be "open" or "resolved"' });
      return;
    }

    const updated = registry.updateBugReportStatus(req.params.id as string, status);
    if (!updated) {
      res.status(404).json({ error: 'Bug report not found' });
      return;
    }

    res.json({ success: true });
  });

  // GET /api/bug-reports/:id/messages — get messages for a report
  // Accessible by the reporter or operator
  router.get('/:id/messages', requireAuth, (req: Request, res: Response) => {
    const report = registry.getBugReport(req.params.id as string);
    if (!report) {
      res.status(404).json({ error: 'Bug report not found' });
      return;
    }
    // Only the reporter or operator can read messages
    if (report.reporter_id !== req.user!.sub && !req.user!.is_operator) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    const messages = registry.getBugReportMessages(req.params.id as string);
    // Auto-mark as read when fetching messages
    registry.markBugReportRead(req.params.id as string, req.user!.sub);
    res.json(messages);
  });

  // POST /api/bug-reports/:id/messages — add a message to a report
  // Accessible by the reporter or operator
  router.post('/:id/messages', requireAuth, (req: Request, res: Response) => {
    const { message } = req.body;

    if (!message || typeof message !== 'string' || message.length > 2000) {
      res.status(400).json({ error: 'Message is required (max 2000 characters)' });
      return;
    }

    const report = registry.getBugReport(req.params.id as string);
    if (!report) {
      res.status(404).json({ error: 'Bug report not found' });
      return;
    }
    // Only the reporter or operator can post messages
    if (report.reporter_id !== req.user!.sub && !req.user!.is_operator) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const msg = registry.addBugReportMessage(
      req.params.id as string,
      req.user!.sub,
      req.user!.username,
      req.user!.is_operator,
      message.trim(),
    );

    res.status(201).json(msg);
  });

  return router;
}
