/**
 * Scheduler tools for the agent
 *
 * Allows the agent to create, list, and manage scheduled tasks/reminders
 */

import { getScheduler } from '../scheduler';

/**
 * Schedule task tool definition
 */
export function getScheduleTaskToolDefinition() {
  return {
    name: 'schedule_task',
    description: `Create a scheduled task or reminder that runs on a cron schedule.

Use this when the user asks to:
- Set a reminder
- Schedule a recurring task
- Create an automated check or notification

The task will run at the specified time and the response will be sent to the specified channel.

Cron expression format: "minute hour day month weekday"
Examples:
- "0 9 * * *" = Every day at 9:00 AM
- "0 9 * * 1-5" = Every weekday at 9:00 AM
- "*/30 * * * *" = Every 30 minutes
- "0 */2 * * *" = Every 2 hours
- "0 9 1 * *" = First day of every month at 9:00 AM
- "0 9 * * 1" = Every Monday at 9:00 AM

Channels: "desktop" (notification), "telegram" (if configured)`,
    input_schema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: 'Unique name for this scheduled task (e.g., "daily_standup_reminder")',
        },
        schedule: {
          type: 'string',
          description: 'Cron expression (e.g., "0 9 * * *" for 9 AM daily)',
        },
        prompt: {
          type: 'string',
          description: 'What the agent should do when the task runs (e.g., "Remind me to take a break")',
        },
        channel: {
          type: 'string',
          description: 'Where to send the response: "desktop" or "telegram" (default: desktop)',
        },
      },
      required: ['name', 'schedule', 'prompt'],
    },
  };
}

/**
 * Schedule task tool handler
 */
export async function handleScheduleTaskTool(input: unknown): Promise<string> {
  const scheduler = getScheduler();

  if (!scheduler) {
    console.log('[SchedulerTool] Scheduler not available');
    return JSON.stringify({
      error: 'Scheduler not initialized. Make sure scheduler is enabled in settings.',
    });
  }

  const { name, schedule, prompt, channel } = input as {
    name: string;
    schedule: string;
    prompt: string;
    channel?: string;
  };

  if (!name || !schedule || !prompt) {
    return JSON.stringify({ error: 'Missing required fields: name, schedule, prompt' });
  }

  console.log(`[SchedulerTool] Creating task: ${name} (${schedule})`);

  try {
    const success = await scheduler.createJob(name, schedule, prompt, channel || 'desktop');

    if (success) {
      console.log(`[SchedulerTool] Task created: ${name}`);
      return JSON.stringify({
        success: true,
        message: `Scheduled task "${name}" created`,
        name,
        schedule,
        channel: channel || 'desktop',
      });
    } else {
      return JSON.stringify({
        success: false,
        error: 'Failed to create task. Check if the cron expression is valid.',
      });
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[SchedulerTool] Failed to create task: ${errorMsg}`);
    return JSON.stringify({ error: errorMsg });
  }
}

/**
 * List scheduled tasks tool definition
 */
export function getListScheduledTasksToolDefinition() {
  return {
    name: 'list_scheduled_tasks',
    description: 'List all scheduled tasks and reminders. Shows name, schedule, and status.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  };
}

/**
 * List scheduled tasks handler
 */
export async function handleListScheduledTasksTool(): Promise<string> {
  const scheduler = getScheduler();

  if (!scheduler) {
    return JSON.stringify({ error: 'Scheduler not initialized' });
  }

  const jobs = scheduler.getAllJobs();

  if (jobs.length === 0) {
    return JSON.stringify({
      success: true,
      message: 'No scheduled tasks',
      tasks: [],
    });
  }

  return JSON.stringify({
    success: true,
    count: jobs.length,
    tasks: jobs.map(job => ({
      name: job.name,
      schedule: job.schedule,
      prompt: job.prompt,
      channel: job.channel,
      enabled: job.enabled,
    })),
  });
}

/**
 * Delete scheduled task tool definition
 */
export function getDeleteScheduledTaskToolDefinition() {
  return {
    name: 'delete_scheduled_task',
    description: 'Delete a scheduled task or reminder by name.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: 'Name of the task to delete',
        },
      },
      required: ['name'],
    },
  };
}

/**
 * Delete scheduled task handler
 */
export async function handleDeleteScheduledTaskTool(input: unknown): Promise<string> {
  const scheduler = getScheduler();

  if (!scheduler) {
    return JSON.stringify({ error: 'Scheduler not initialized' });
  }

  const { name } = input as { name: string };

  if (!name) {
    return JSON.stringify({ error: 'Task name is required' });
  }

  const success = scheduler.deleteJob(name);

  if (success) {
    console.log(`[SchedulerTool] Deleted task: ${name}`);
    return JSON.stringify({
      success: true,
      message: `Task "${name}" deleted`,
    });
  } else {
    return JSON.stringify({
      success: false,
      error: `Task "${name}" not found`,
    });
  }
}

/**
 * Get all scheduler tools
 */
export function getSchedulerTools() {
  return [
    {
      ...getScheduleTaskToolDefinition(),
      handler: handleScheduleTaskTool,
    },
    {
      ...getListScheduledTasksToolDefinition(),
      handler: handleListScheduledTasksTool,
    },
    {
      ...getDeleteScheduledTaskToolDefinition(),
      handler: handleDeleteScheduledTaskTool,
    },
  ];
}
