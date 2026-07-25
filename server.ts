import dotenv from 'dotenv';
import express from 'express';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import * as Sentry from '@sentry/node';
import { formatChildAge } from './src/lib/childAge';
import {
  classifySafetyConcern,
  hasUnsafeEmergencyDirective,
  urgentSafetyResponse,
} from './src/lib/safety';

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be configured.`);
  return value;
};

type AppDependencies = {
  // The application uses the service-role client dynamically across several tables.
  // Keep this boundary structural so tests can inject a lightweight fake client.
  supabase: any;
  gemini: GoogleGenAI;
  geminiModel: string;
  rateLimitMax?: number;
  rateLimitWindowSeconds?: number;
  dailyLimitMax?: number;
  staleRequestSeconds?: number;
};

type StoredMessage = {
  id: string;
  conversation_id: string;
  user_id: string;
  role: 'parent' | 'assistant';
  content: string;
  created_at: string;
  response_status: 'pending' | 'failed' | 'completed' | null;
  processing_started_at: string | null;
};

function greetingResponse(nickname: string) {
  return `Hi — I’m here to help you think things through with ${nickname}. What feels most challenging right now?`;
}

function savedContextResponse(profile: {
  nickname: string;
  birth_month: number;
  birth_year: number;
  pronouns: string | null;
  routines: string;
  challenges: string;
  parent_notes: string | null;
}) {
  const details = [
    `${profile.nickname} is ${formatChildAge(profile.birth_month, profile.birth_year)}${profile.pronouns ? ` (${profile.pronouns})` : ''}.`,
    `Their routines: ${profile.routines}`,
    `Right now: ${profile.challenges}`,
  ];

  if (profile.parent_notes) details.push(`Other notes: ${profile.parent_notes}`);

  return `Here’s the context I have saved for ${profile.nickname}:\n\n${details.map((detail) => `• ${detail}`).join('\n')}\n\nWould you like to update anything?`;
}

export function isContextSummaryRequest(message: string) {
  const normalized = message.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return /\bwhat do you know\b/.test(normalized)
    && /\b(my|about|saved|profile|context)\b/.test(normalized);
}

export function isSimpleGreeting(message: string) {
  const normalized = message.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return /^(hi|hello|hey|hiya|good morning|good afternoon|good evening)( there)?$/.test(normalized);
}

export function isUrgentSafetyConcern(message: string) {
  return classifySafetyConcern(message) !== 'none';
}

function logEvent(event: string, requestId: string, details: Record<string, string | number | boolean> = {}) {
  console.info(JSON.stringify({ event, requestId, ...details }));
}

function sendError(response: express.Response, status: number, error: string) {
  return response.status(status).json({ error, requestId: response.locals.requestId });
}

async function getAuthenticatedUser(request: express.Request, response: express.Response, supabase: any) {
  const token = request.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) {
    sendError(response, 401, 'Authentication is required.');
    return null;
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    sendError(response, 401, 'Your session has expired. Please sign in again.');
    return null;
  }

  return { token, user: data.user };
}

export function isStalePendingRequest(
  message: Pick<StoredMessage, 'response_status' | 'processing_started_at' | 'created_at'>,
  staleRequestSeconds: number,
  now = new Date(),
) {
  if (message.response_status !== 'pending') return false;
  const processingStartedAt = new Date(message.processing_started_at ?? message.created_at).getTime();
  return Number.isFinite(processingStartedAt)
    && processingStartedAt <= now.getTime() - staleRequestSeconds * 1000;
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function createApp({
  supabase,
  gemini,
  geminiModel,
  rateLimitMax = 10,
  rateLimitWindowSeconds = 60,
  dailyLimitMax = 100,
  staleRequestSeconds = 90,
}: AppDependencies) {
  const app = express();
  app.use((_request, response, next) => {
    const requestId = randomUUID();
    response.locals.requestId = requestId;
    response.setHeader('X-Request-ID', requestId);
    next();
  });
  app.use(express.json({ limit: '20kb' }));

  app.get('/healthz', (_request, response) => response.status(200).json({ status: 'ok' }));

  app.get('/readyz', async (_request, response) => {
    try {
      const { error } = await supabase.from('child_profiles').select('id').limit(1);
      if (error) throw error;
      return response.status(200).json({ status: 'ready' });
    } catch (error) {
      Sentry.captureException(error, { tags: { event: 'readiness_failed' } });
      logEvent('readiness_failed', response.locals.requestId);
      return sendError(response, 503, 'Cache is not ready.');
    }
  });

  app.get('/api/account/export', async (request, response) => {
    const authenticated = await getAuthenticatedUser(request, response, supabase);
    if (!authenticated) return;

    try {
      const userId = authenticated.user.id;
      const [profileResult, conversationsResult, messagesResult] = await Promise.all([
        supabase.from('child_profiles').select().eq('user_id', userId).maybeSingle(),
        supabase.from('conversations').select().eq('user_id', userId).order('created_at'),
        supabase.from('messages').select().eq('user_id', userId).order('created_at'),
      ]);
      if (profileResult.error || conversationsResult.error || messagesResult.error) {
        throw profileResult.error ?? conversationsResult.error ?? messagesResult.error;
      }

      const exportData = {
        format: 'cache-data-export-v1',
        exportedAt: new Date().toISOString(),
        profile: profileResult.data,
        conversations: conversationsResult.data ?? [],
        messages: messagesResult.data ?? [],
      };
      logEvent('account_exported', response.locals.requestId);
      response.attachment('cache-data-export.json');
      return response.status(200).json(exportData);
    } catch (error) {
      Sentry.captureException(error, { tags: { event: 'account_export_failed' } });
      logEvent('account_export_failed', response.locals.requestId);
      return sendError(response, 500, 'Cache could not prepare your export right now.');
    }
  });

  app.delete('/api/account', async (request, response) => {
    const authenticated = await getAuthenticatedUser(request, response, supabase);
    if (!authenticated) return;

    try {
      const { error: revokeError } = await supabase.auth.admin.signOut(authenticated.token, 'global');
      if (revokeError) throw revokeError;
      const { error: deleteError } = await supabase.auth.admin.deleteUser(authenticated.user.id);
      if (deleteError) throw deleteError;
      logEvent('account_deleted', response.locals.requestId);
      return response.status(204).send();
    } catch (error) {
      Sentry.captureException(error, { tags: { event: 'account_delete_failed' } });
      logEvent('account_delete_failed', response.locals.requestId);
      return sendError(response, 500, 'Cache could not delete your account right now.');
    }
  });

  async function findChatResponse(conversationId: string, clientRequestId: string) {
  const { data: parentMessage, error: parentMessageError } = await supabase.from('messages')
    .select()
    .eq('conversation_id', conversationId)
    .eq('role', 'parent')
    .eq('client_request_id', clientRequestId)
    .maybeSingle();
  if (parentMessageError) throw parentMessageError;
  if (!parentMessage) return null;

  const { data: assistantMessage, error: assistantMessageError } = await supabase.from('messages')
    .select()
    .eq('in_reply_to', parentMessage.id)
    .maybeSingle();
  if (assistantMessageError) throw assistantMessageError;

  return {
    parentMessage: parentMessage as StoredMessage,
    assistantMessage: assistantMessage as StoredMessage | null,
  };
  }

  async function markChatRequest(parentMessageId: string, responseStatus: 'failed' | 'completed') {
  const { error } = await supabase.from('messages')
    .update({ response_status: responseStatus })
    .eq('id', parentMessageId);
  if (error) throw error;
  }

  app.post('/api/chat', async (request, response) => {
  const message = typeof request.body?.message === 'string' ? request.body.message.trim() : '';
  const clientRequestId = typeof request.body?.clientRequestId === 'string' ? request.body.clientRequestId : '';
  if (!message || message.length > 4000) return sendError(response, 400, 'Please send a message up to 4,000 characters.');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientRequestId)) {
    return sendError(response, 400, 'Please refresh Cache and try sending your message again.');
  }

  const authenticated = await getAuthenticatedUser(request, response, supabase);
  if (!authenticated) return;
  const userId = authenticated.user.id;
  let parentMessage: StoredMessage | null = null;
  let responseSaved = false;

  try {
    const { data: profile, error: profileError } = await supabase.from('child_profiles').select().eq('user_id', userId).single();
    if (profileError || !profile) return response.status(409).json({ error: 'Complete your child profile before chatting.' });
    const { data: conversation, error: conversationError } = await supabase.from('conversations').select().eq('user_id', userId).eq('child_profile_id', profile.id).single();
    if (conversationError || !conversation) return response.status(409).json({ error: 'Your conversation is not ready yet. Please refresh and try again.' });
    const existingChatResponse = await findChatResponse(conversation.id, clientRequestId);
    if (existingChatResponse?.assistantMessage) {
      return response.status(200).json({ parentMessage: existingChatResponse.parentMessage, message: existingChatResponse.assistantMessage });
    }

    if (existingChatResponse) {
      const isFailed = existingChatResponse.parentMessage.response_status === 'failed';
      const isStale = isStalePendingRequest(existingChatResponse.parentMessage, staleRequestSeconds);
      if (!isFailed && !isStale) return response.status(202).json({ status: 'processing' });
    }

    const { data: rateLimitAllowed, error: rateLimitError } = await supabase.rpc('consume_chat_rate_limit', {
      p_user_id: userId,
      p_max_requests: rateLimitMax,
      p_window_seconds: rateLimitWindowSeconds,
    });
    if (rateLimitError) throw rateLimitError;
    if (!rateLimitAllowed) {
      response.setHeader('Retry-After', String(rateLimitWindowSeconds));
      return response.status(429).json({ error: 'Cache is receiving a lot of messages. Please wait a moment and try again.' });
    }

    const { data: dailyLimitAllowed, error: dailyLimitError } = await supabase.rpc('consume_daily_chat_quota', {
      p_user_id: userId,
      p_max_requests: dailyLimitMax,
    });
    if (dailyLimitError) throw dailyLimitError;
    if (!dailyLimitAllowed) {
      response.setHeader('Retry-After', '3600');
      return response.status(429).json({ error: 'Cache has reached today’s message limit. Please try again tomorrow.' });
    }

    if (existingChatResponse) {
      const expectedStatus = existingChatResponse.parentMessage.response_status;
      let reclaimRequest = supabase.from('messages')
        .update({
          response_status: 'pending',
          processing_started_at: new Date().toISOString(),
        })
        .eq('id', existingChatResponse.parentMessage.id)
        .eq('response_status', expectedStatus);

      if (expectedStatus === 'pending') {
        reclaimRequest = reclaimRequest.lt(
          'processing_started_at',
          new Date(Date.now() - staleRequestSeconds * 1000).toISOString(),
        );
      }

      const { data: reclaimedParentMessage, error: reclaimError } = await reclaimRequest.select().maybeSingle();
      if (reclaimError) throw reclaimError;
      if (!reclaimedParentMessage) return response.status(202).json({ status: 'processing' });
      parentMessage = reclaimedParentMessage as StoredMessage;
    }

    if (!parentMessage) {
      const { data: createdParentMessage, error: parentMessageError } = await supabase.from('messages').insert({
        conversation_id: conversation.id,
        user_id: userId,
        role: 'parent',
        content: message,
        client_request_id: clientRequestId,
        response_status: 'pending',
        processing_started_at: new Date().toISOString(),
      }).select().single();
      if (parentMessageError || !createdParentMessage) {
        if (parentMessageError?.code === '23505') {
          const duplicateChatResponse = await findChatResponse(conversation.id, clientRequestId);
          if (duplicateChatResponse?.assistantMessage) {
            return response.status(200).json({ parentMessage: duplicateChatResponse.parentMessage, message: duplicateChatResponse.assistantMessage });
          }
          return response.status(202).json({ status: 'processing' });
        }
        throw parentMessageError ?? new Error('Unable to save the message.');
      }
      parentMessage = createdParentMessage as StoredMessage;
    }

    const { data: priorMessages, error: historyError } = await supabase.from('messages')
      .select('role, content')
      .eq('conversation_id', conversation.id)
      .neq('id', parentMessage.id)
      .order('created_at', { ascending: false })
      .limit(20);
    if (historyError) throw historyError;

    if (isContextSummaryRequest(message)) {
      const { data: assistantMessage, error: assistantMessageError } = await supabase.from('messages').insert({
        conversation_id: conversation.id,
        user_id: userId,
        role: 'assistant',
        content: savedContextResponse(profile),
        in_reply_to: parentMessage.id,
      }).select().single();
      if (assistantMessageError || !assistantMessage) throw assistantMessageError ?? new Error('Unable to save the response.');
      responseSaved = true;
      await markChatRequest(parentMessage.id, 'completed');
      await supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversation.id);
      return response.status(200).json({ parentMessage, message: assistantMessage });
    }

    const safetyCategory = classifySafetyConcern(message);
    if (isSimpleGreeting(message) || safetyCategory !== 'none') {
      const { data: assistantMessage, error: assistantMessageError } = await supabase.from('messages').insert({
        conversation_id: conversation.id,
        user_id: userId,
        role: 'assistant',
        content: safetyCategory !== 'none' ? urgentSafetyResponse() : greetingResponse(profile.nickname),
        in_reply_to: parentMessage.id,
      }).select().single();
      if (assistantMessageError || !assistantMessage) throw assistantMessageError ?? new Error('Unable to save the response.');
      responseSaved = true;
      await markChatRequest(parentMessage.id, 'completed');
      await supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversation.id);
      if (safetyCategory !== 'none') {
        logEvent('safety_handoff', response.locals.requestId, { category: safetyCategory });
        Sentry.captureMessage('safety_handoff', { level: 'info', tags: { category: safetyCategory } });
      }
      return response.status(200).json({ parentMessage, message: assistantMessage });
    }

    const history = (priorMessages ?? []).reverse().map((item) => `${item.role === 'parent' ? 'Parent' : 'Cache'}: ${item.content}`).join('\n');
    const age = formatChildAge(profile.birth_month, profile.birth_year);
    const prompt = `You are Cache, a calm, empathetic AI parenting coach. Give practical, age-appropriate parenting ideas. Do not diagnose, provide medical or mental-health treatment, or present yourself as a replacement for a professional. For health, safety, abuse, self-harm, or imminent-risk concerns, state the limitation clearly and encourage the parent to contact the appropriate licensed professional, emergency services, or local crisis support immediately. Never shame the parent or child. Ask one focused follow-up question when context is missing.\n\nAccuracy rules:\n- Treat the child context below as the source of truth.\n- ${profile.nickname}'s saved age is ${age}; never state or imply a different age.\n- Do not invent facts about ${profile.nickname} or their family.\n- If the parent asks what you know about their child, use only the saved child context.\n\nResponse style:\n- Start with the most useful next action, not a long restatement of the situation.\n- For practical guidance, lead with **Try this first:** followed by one concrete action the parent can use today.\n- Add at most three short supporting bullets when they would help; explain the reason briefly and plainly.\n- Keep the response focused enough to read during a busy moment.\n\nChild context:\n- Nickname: ${profile.nickname}\n- Age: ${age}\n- Pronouns: ${profile.pronouns ?? 'not provided'}\n- Routines: ${profile.routines}\n- Current challenges: ${profile.challenges}\n- Parent notes: ${profile.parent_notes ?? 'none'}\n\nRecent conversation:\n${history || '(new conversation)'}\n\nParent: ${message}\n\nRespond as Cache in plain, warm language. Use valid Markdown for emphasis and lists: put each list item on its own line, and never use HTML.`;
    const generated = await gemini.models.generateContent({ model: geminiModel, contents: prompt });
    const generatedContent = generated.text?.trim();
    const assistantContent = generatedContent && hasUnsafeEmergencyDirective(generatedContent)
      ? urgentSafetyResponse()
      : generatedContent;
    if (!assistantContent) throw new Error('Gemini returned an empty response.');
    if (generatedContent && assistantContent !== generatedContent) {
      logEvent('generated_response_safety_handoff', response.locals.requestId);
      Sentry.captureMessage('generated_response_safety_handoff', { level: 'warning' });
    }
    const { data: assistantMessage, error: assistantMessageError } = await supabase.from('messages').insert({
      conversation_id: conversation.id,
      user_id: userId,
      role: 'assistant',
      content: assistantContent,
      in_reply_to: parentMessage.id,
    }).select().single();
    if (assistantMessageError || !assistantMessage) throw assistantMessageError ?? new Error('Unable to save the response.');
    responseSaved = true;
    await markChatRequest(parentMessage.id, 'completed');
    await supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversation.id);
    return response.status(200).json({ parentMessage, message: assistantMessage });
  } catch (error) {
    if (parentMessage && !responseSaved) {
      try {
        await markChatRequest(parentMessage.id, 'failed');
      } catch {
        logEvent('chat_failure_status_update_failed', response.locals.requestId);
      }
    }
    Sentry.captureException(error, { tags: { event: 'chat_request_failed' } });
    logEvent('chat_request_failed', response.locals.requestId);
    return sendError(response, 500, 'Cache could not respond right now. Please try again.');
  }
  });

  return app;
}

function startServer() {
  dotenv.config();
  dotenv.config({ path: '.env.local', override: true });
  const supabaseUrl = required('SUPABASE_URL');
  const serviceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY');
  const geminiApiKey = required('GEMINI_API_KEY');
  const geminiModel = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  const rateLimitMax = positiveInteger(process.env.CHAT_RATE_LIMIT_MAX, 10);
  const rateLimitWindowSeconds = positiveInteger(process.env.CHAT_RATE_LIMIT_WINDOW_SECONDS, 60);
  const dailyLimitMax = positiveInteger(process.env.CHAT_DAILY_LIMIT_MAX, 100);
  const staleRequestSeconds = positiveInteger(process.env.CHAT_REQUEST_STALE_SECONDS, 90);
  const sentryDsn = process.env.SENTRY_DSN;
  if (sentryDsn) {
    Sentry.init({
      dsn: sentryDsn,
      environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
      sendDefaultPii: false,
      beforeSend(event) {
        if (event.request) {
          event.request.data = undefined;
          event.request.headers = {};
          event.request.cookies = undefined;
        }
        event.user = undefined;
        return event;
      },
      beforeBreadcrumb(breadcrumb) {
        if (breadcrumb.category === 'http') return null;
        return breadcrumb;
      },
    });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const gemini = new GoogleGenAI({ apiKey: geminiApiKey });
  const app = createApp({
    supabase,
    gemini,
    geminiModel,
    rateLimitMax,
    rateLimitWindowSeconds,
    dailyLimitMax,
    staleRequestSeconds,
  });
  const port = Number(process.env.PORT ?? 3000);

  if (process.env.NODE_ENV === 'production') {
  const distPath = path.resolve(process.cwd(), 'dist');
  app.use(express.static(distPath));
  app.get('*', (_request, response) => response.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(port, () => logEvent('server_started', 'startup', { port }));
}

if (!process.env.VITEST) startServer();
