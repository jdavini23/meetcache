// Vercel serverless entry. Wraps the same Express app that server.ts runs locally.
// Env vars come from the Vercel project settings, not .env.local.
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import type { IncomingMessage, ServerResponse } from 'node:http';
import * as Sentry from '@sentry/node';
import { createApp, initServerSentry, waitlistAlertFromEnv } from '../server.js';

// Initialize before the rest of the app is built.
const sentryEnabled = initServerSentry();

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const positiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const supabase = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const app = createApp({
  supabase,
  gemini: new GoogleGenAI({ apiKey: required('GEMINI_API_KEY') }),
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
  rateLimitMax: positiveInteger(process.env.CHAT_RATE_LIMIT_MAX, 10),
  rateLimitWindowSeconds: positiveInteger(process.env.CHAT_RATE_LIMIT_WINDOW_SECONDS, 60),
  dailyLimitMax: positiveInteger(process.env.CHAT_DAILY_LIMIT_MAX, 100),
  staleRequestSeconds: positiveInteger(process.env.CHAT_REQUEST_STALE_SECONDS, 90),
  waitlistAlert: waitlistAlertFromEnv(),
});

// Serverless instances can freeze as soon as the response ends, dropping queued
// Sentry events. Flush them before the response is finished.
export default function handler(request: IncomingMessage, response: ServerResponse) {
  if (sentryEnabled) {
    const end = response.end.bind(response) as (...args: unknown[]) => ServerResponse;
    response.end = ((...args: unknown[]) => {
      Sentry.flush(2000).catch(() => undefined).finally(() => end(...args));
      return response;
    }) as ServerResponse['end'];
  }
  return app(request as never, response as never);
}
