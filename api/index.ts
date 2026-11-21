// Vercel serverless entry. Wraps the same Express app that server.ts runs locally.
// Env vars come from the Vercel project settings, not .env.local.
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import { createApp } from '../server.js';

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
});

export default app;
