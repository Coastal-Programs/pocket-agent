#!/usr/bin/env node
/**
 * CLI for Scheduler Management
 *
 * Can be called by the agent via Bash to manage scheduled tasks.
 * Writes directly to SQLite - the running scheduler will pick up changes.
 *
 * Usage:
 *   node dist/cli/scheduler-cli.js create <name> <schedule> <prompt> [channel]
 *   node dist/cli/scheduler-cli.js list
 *   node dist/cli/scheduler-cli.js delete <name>
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Get database path
function getDbPath(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';

  // Platform-specific paths
  const possiblePaths = [
    path.join(homeDir, 'Library/Application Support/pocket-agent/pocket-agent.db'), // macOS
    path.join(homeDir, '.config/pocket-agent/pocket-agent.db'), // Linux
    path.join(homeDir, 'AppData/Roaming/pocket-agent/pocket-agent.db'), // Windows
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  // If not found, return macOS default (will be created if needed)
  return possiblePaths[0];
}

// Validate cron expression
function validateCron(schedule: string): boolean {
  const parts = schedule.split(' ');
  if (parts.length !== 5) return false;

  const ranges = [
    [0, 59],  // minute
    [0, 23],  // hour
    [1, 31],  // day
    [1, 12],  // month
    [0, 7],   // weekday
  ];

  for (let i = 0; i < 5; i++) {
    const part = parts[i];
    if (part === '*') continue;
    if (part.includes('/')) continue; // step values
    if (part.includes('-')) continue; // ranges
    if (part.includes(',')) continue; // lists

    const num = parseInt(part, 10);
    if (isNaN(num) || num < ranges[i][0] || num > ranges[i][1]) {
      return false;
    }
  }

  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log(JSON.stringify({ error: 'Usage: scheduler-cli <create|list|delete> [args]' }));
    process.exit(1);
  }

  const dbPath = getDbPath();

  if (!fs.existsSync(dbPath)) {
    console.log(JSON.stringify({ error: 'Database not found. Please start Pocket Agent first.' }));
    process.exit(1);
  }

  const db = new Database(dbPath);

  try {
    switch (command) {
      case 'create': {
        const [, name, schedule, prompt, channel = 'desktop'] = args;

        if (!name || !schedule || !prompt) {
          console.log(JSON.stringify({ error: 'Usage: create <name> <schedule> <prompt> [channel]' }));
          process.exit(1);
        }

        if (!validateCron(schedule)) {
          console.log(JSON.stringify({ error: `Invalid cron expression: "${schedule}". Format: "minute hour day month weekday"` }));
          process.exit(1);
        }

        // Check if exists
        const existing = db.prepare('SELECT id FROM cron_jobs WHERE name = ?').get(name);
        if (existing) {
          // Update
          db.prepare('UPDATE cron_jobs SET schedule = ?, prompt = ?, channel = ?, enabled = 1, updated_at = CURRENT_TIMESTAMP WHERE name = ?')
            .run(schedule, prompt, channel, name);
          console.log(JSON.stringify({
            success: true,
            message: `Task "${name}" updated`,
            schedule,
            channel,
            nextStep: 'Task will be active on next scheduler reload (within 60 seconds) or app restart',
          }));
        } else {
          // Insert
          db.prepare('INSERT INTO cron_jobs (name, schedule, prompt, channel, enabled) VALUES (?, ?, ?, ?, 1)')
            .run(name, schedule, prompt, channel);
          console.log(JSON.stringify({
            success: true,
            message: `Task "${name}" created successfully`,
            schedule,
            channel,
            nextStep: 'Task will be active on next scheduler reload (within 60 seconds) or app restart',
          }));
        }
        break;
      }

      case 'list': {
        const jobs = db.prepare('SELECT name, schedule, prompt, channel, enabled FROM cron_jobs').all() as Array<{
          name: string;
          schedule: string;
          prompt: string;
          channel: string;
          enabled: number;
        }>;

        if (jobs.length === 0) {
          console.log(JSON.stringify({ success: true, message: 'No scheduled tasks', tasks: [] }));
        } else {
          console.log(JSON.stringify({
            success: true,
            count: jobs.length,
            tasks: jobs.map(j => ({
              name: j.name,
              schedule: j.schedule,
              prompt: j.prompt.slice(0, 100) + (j.prompt.length > 100 ? '...' : ''),
              channel: j.channel,
              enabled: j.enabled === 1,
            })),
          }));
        }
        break;
      }

      case 'delete': {
        const [, name] = args;

        if (!name) {
          console.log(JSON.stringify({ error: 'Usage: delete <name>' }));
          process.exit(1);
        }

        const result = db.prepare('DELETE FROM cron_jobs WHERE name = ?').run(name);

        if (result.changes > 0) {
          console.log(JSON.stringify({ success: true, message: `Task "${name}" deleted` }));
        } else {
          console.log(JSON.stringify({ success: false, error: `Task "${name}" not found` }));
        }
        break;
      }

      case 'help':
      default:
        console.log(JSON.stringify({
          usage: {
            create: 'scheduler-cli create <name> "<cron>" "<prompt>" [channel]',
            list: 'scheduler-cli list',
            delete: 'scheduler-cli delete <name>',
          },
          cronExamples: {
            'Daily 9 AM': '0 9 * * *',
            'Weekdays 9 AM': '0 9 * * 1-5',
            'Every 30 min': '*/30 * * * *',
            'Mondays 9 AM': '0 9 * * 1',
            'First of month': '0 9 1 * *',
          },
          channels: ['desktop', 'telegram'],
        }));
    }
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.log(JSON.stringify({ error: error.message }));
  process.exit(1);
});
