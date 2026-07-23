import dotenv from 'dotenv';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import { formatChildAge } from './src/lib/childAge';

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
};

type StoredMessage = {
  id: string;
  conversation_id: string;
  user_id: string;
  role: 'parent' | 'assistant';
  content: string;
  created_at: string;
  response_status: 'pending' | 'failed' | 'completed' | null;
};

function greetingResponse(nickname: string) {
  return `Hi — I’m here to help you think things through with ${nickname}. What feels most challenging right now?`;
}

function urgentSafetyResponse() {
  return 'I’m sorry you’re dealing with this. Because this could involve an immediate safety or health risk, I can’t assess it here. Please contact your local emergency number or go to the nearest emergency department now. If you can do so safely, stay with the person and seek help from a trusted adult or professional nearby.';
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
  return /\b(not breathing|trouble breathing|blue lips|unconscious|seizure|overdose|poison(?:ed|ing)?|swallowed (?:a |the )?(?:pill|battery|magnet)|suicid(?:e|al)|self[ -]?harm|kill myself|hurt (?:myself|someone)|abuse|unsafe at home)\b/i.test(message);
}

export function createApp({ supabase, gemini, geminiModel }: AppDependencies) {
  const app = express();
  app.use(express.json({ limit: '20kb' }));

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
  const token = request.header('authorization')?.replace(/^Bearer\s+/i, '');
  const message = typeof request.body?.message === 'string' ? request.body.message.trim() : '';
  const clientRequestId = typeof request.body?.clientRequestId === 'string' ? request.body.clientRequestId : '';
  if (!token) return response.status(401).json({ error: 'Authentication is required.' });
  if (!message || message.length > 4000) return response.status(400).json({ error: 'Please send a message up to 4,000 characters.' });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientRequestId)) {
    return response.status(400).json({ error: 'Please refresh Cache and try sending your message again.' });
  }

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return response.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  const userId = authData.user.id;
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
      if (existingChatResponse.parentMessage.response_status !== 'failed') return response.status(202).json({ status: 'processing' });
      const { data: reclaimedParentMessage, error: reclaimError } = await supabase.from('messages')
        .update({ response_status: 'pending' })
        .eq('id', existingChatResponse.parentMessage.id)
        .eq('response_status', 'failed')
        .select()
        .maybeSingle();
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

    if (isSimpleGreeting(message) || isUrgentSafetyConcern(message)) {
      const { data: assistantMessage, error: assistantMessageError } = await supabase.from('messages').insert({
        conversation_id: conversation.id,
        user_id: userId,
        role: 'assistant',
        content: isUrgentSafetyConcern(message) ? urgentSafetyResponse() : greetingResponse(profile.nickname),
        in_reply_to: parentMessage.id,
      }).select().single();
      if (assistantMessageError || !assistantMessage) throw assistantMessageError ?? new Error('Unable to save the response.');
      responseSaved = true;
      await markChatRequest(parentMessage.id, 'completed');
      await supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversation.id);
      return response.status(200).json({ parentMessage, message: assistantMessage });
    }

    const history = (priorMessages ?? []).reverse().map((item) => `${item.role === 'parent' ? 'Parent' : 'Cache'}: ${item.content}`).join('\n');
    const age = formatChildAge(profile.birth_month, profile.birth_year);
    const prompt = `You are Cache, a calm, empathetic AI parenting coach. Give practical, age-appropriate parenting ideas. Do not diagnose, provide medical or mental-health treatment, or present yourself as a replacement for a professional. For health, safety, abuse, self-harm, or imminent-risk concerns, state the limitation clearly and encourage the parent to contact the appropriate licensed professional, emergency services, or local crisis support immediately. Never shame the parent or child. Ask one focused follow-up question when context is missing.\n\nAccuracy rules:\n- Treat the child context below as the source of truth.\n- ${profile.nickname}'s saved age is ${age}; never state or imply a different age.\n- Do not invent facts about ${profile.nickname} or their family.\n- If the parent asks what you know about their child, use only the saved child context.\n\nResponse style:\n- Start with the most useful next action, not a long restatement of the situation.\n- For practical guidance, lead with **Try this first:** followed by one concrete action the parent can use today.\n- Add at most three short supporting bullets when they would help; explain the reason briefly and plainly.\n- Keep the response focused enough to read during a busy moment.\n\nChild context:\n- Nickname: ${profile.nickname}\n- Age: ${age}\n- Pronouns: ${profile.pronouns ?? 'not provided'}\n- Routines: ${profile.routines}\n- Current challenges: ${profile.challenges}\n- Parent notes: ${profile.parent_notes ?? 'none'}\n\nRecent conversation:\n${history || '(new conversation)'}\n\nParent: ${message}\n\nRespond as Cache in plain, warm language. Use valid Markdown for emphasis and lists: put each list item on its own line, and never use HTML.`;
    const generated = await gemini.models.generateContent({ model: geminiModel, contents: prompt });
    const assistantContent = generated.text?.trim();
    if (!assistantContent) throw new Error('Gemini returned an empty response.');
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
      } catch (statusError) {
        console.error('Unable to mark failed chat request', statusError);
      }
    }
    console.error('Chat request failed', error);
    return response.status(500).json({ error: 'Cache could not respond right now. Please try again.' });
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
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const gemini = new GoogleGenAI({ apiKey: geminiApiKey });
  const app = createApp({ supabase, gemini, geminiModel });
  const port = Number(process.env.PORT ?? 3000);

  if (process.env.NODE_ENV === 'production') {
  const directory = path.dirname(fileURLToPath(import.meta.url));
  const distPath = path.join(directory, 'dist');
  app.use(express.static(distPath));
  app.get('*', (_request, response) => response.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(port, () => console.log(`Cache server listening on port ${port}`));
}

if (!process.env.VITEST) startServer();
