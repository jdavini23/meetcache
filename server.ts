import dotenv from 'dotenv';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

dotenv.config();
dotenv.config({ path: '.env.local', override: true });

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be configured.`);
  return value;
};

const supabaseUrl = required('SUPABASE_URL');
const serviceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY');
const geminiApiKey = required('GEMINI_API_KEY');
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const gemini = new GoogleGenAI({ apiKey: geminiApiKey });
const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(express.json({ limit: '20kb' }));

app.post('/api/chat', async (request, response) => {
  const token = request.header('authorization')?.replace(/^Bearer\s+/i, '');
  const message = typeof request.body?.message === 'string' ? request.body.message.trim() : '';
  if (!token) return response.status(401).json({ error: 'Authentication is required.' });
  if (!message || message.length > 4000) return response.status(400).json({ error: 'Please send a message up to 4,000 characters.' });

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return response.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  const userId = authData.user.id;

  try {
    const { data: profile, error: profileError } = await supabase.from('child_profiles').select().eq('user_id', userId).single();
    if (profileError || !profile) return response.status(409).json({ error: 'Complete your child profile before chatting.' });
    const { data: conversation, error: conversationError } = await supabase.from('conversations').select().eq('user_id', userId).eq('child_profile_id', profile.id).single();
    if (conversationError || !conversation) return response.status(409).json({ error: 'Your conversation is not ready yet. Please refresh and try again.' });
    const { data: priorMessages, error: historyError } = await supabase.from('messages').select('role, content').eq('conversation_id', conversation.id).order('created_at', { ascending: false }).limit(20);
    if (historyError) throw historyError;

    const { error: parentMessageError } = await supabase.from('messages').insert({ conversation_id: conversation.id, user_id: userId, role: 'parent', content: message });
    if (parentMessageError) throw parentMessageError;

    const history = (priorMessages ?? []).reverse().map((item) => `${item.role === 'parent' ? 'Parent' : 'Cache'}: ${item.content}`).join('\n');
    const prompt = `You are Cache, a calm, empathetic AI parenting coach. Give practical, age-appropriate parenting ideas. Do not diagnose, provide medical or mental-health treatment, or present yourself as a replacement for a professional. For health, safety, abuse, self-harm, or imminent-risk concerns, state the limitation clearly and encourage the parent to contact the appropriate licensed professional, emergency services, or local crisis support immediately. Never shame the parent or child. Ask one focused follow-up question when context is missing.\n\nChild context:\n- Nickname: ${profile.nickname}\n- Birth month/year: ${profile.birth_month}/${profile.birth_year}\n- Pronouns: ${profile.pronouns ?? 'not provided'}\n- Routines: ${profile.routines}\n- Current challenges: ${profile.challenges}\n- Parent notes: ${profile.parent_notes ?? 'none'}\n\nRecent conversation:\n${history || '(new conversation)'}\n\nParent: ${message}\n\nRespond as Cache in plain, warm language. Keep the response concise and actionable.`;
    const generated = await gemini.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
    const assistantContent = generated.text?.trim();
    if (!assistantContent) throw new Error('Gemini returned an empty response.');
    const { data: assistantMessage, error: assistantMessageError } = await supabase.from('messages').insert({ conversation_id: conversation.id, user_id: userId, role: 'assistant', content: assistantContent }).select().single();
    if (assistantMessageError || !assistantMessage) throw assistantMessageError ?? new Error('Unable to save the response.');
    await supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversation.id);
    return response.status(200).json({ message: assistantMessage });
  } catch (error) {
    console.error('Chat request failed', error);
    return response.status(500).json({ error: 'Cache could not respond right now. Please try again.' });
  }
});

if (process.env.NODE_ENV === 'production') {
  const directory = path.dirname(fileURLToPath(import.meta.url));
  const distPath = path.join(directory, 'dist');
  app.use(express.static(distPath));
  app.get('*', (_request, response) => response.sendFile(path.join(distPath, 'index.html')));
}

app.listen(port, () => console.log(`Cache server listening on port ${port}`));
