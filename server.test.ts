import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp, isContextSummaryRequest, isSimpleGreeting, isUrgentSafetyConcern } from './server';

const dependencies = (getUser = vi.fn()) => ({
  supabase: { auth: { getUser } },
  gemini: {},
  geminiModel: 'test-model',
});

describe('chat safety helpers', () => {
  it('recognizes greetings, context requests, and urgent safety concerns', () => {
    expect(isSimpleGreeting('Hello there!')).toBe(true);
    expect(isContextSummaryRequest('What do you know about my saved profile?')).toBe(true);
    expect(isUrgentSafetyConcern('My child is having trouble breathing')).toBe(true);
  });
});

describe('POST /api/chat', () => {
  it('rejects unauthenticated requests before accessing external services', async () => {
    const getUser = vi.fn();
    const app = createApp(dependencies(getUser) as never);

    const response = await request(app).post('/api/chat').send({
      message: 'Hello',
      clientRequestId: 'f8b67515-5e62-4a65-b7c7-69b7d7c1b471',
    });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Authentication is required.');
    expect(getUser).not.toHaveBeenCalled();
  });

  it('rejects invalid payloads before authentication', async () => {
    const getUser = vi.fn();
    const app = createApp(dependencies(getUser) as never);

    const response = await request(app).post('/api/chat')
      .set('Authorization', 'Bearer token')
      .send({ message: '', clientRequestId: 'not-a-uuid' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Please send a message up to 4,000 characters.');
    expect(getUser).not.toHaveBeenCalled();
  });

  it('rejects expired sessions', async () => {
    const getUser = vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('expired') });
    const app = createApp(dependencies(getUser) as never);

    const response = await request(app).post('/api/chat')
      .set('Authorization', 'Bearer token')
      .send({ message: 'Hello', clientRequestId: 'f8b67515-5e62-4a65-b7c7-69b7d7c1b471' });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Your session has expired. Please sign in again.');
  });
});
