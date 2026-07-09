import { api } from './api.js';

/** État de l'assistant IA (activé, quota restant). */
export const aiStatus = () => api('/ai/status');

/** Rattrapage : résumé des messages non lus d'un salon. */
export const aiSummarize = (channelId) => api('/ai/summarize', { method: 'POST', body: { channelId } });

/** Reformuler un message (clair, pro, sans fautes). */
export const aiRewrite = (text) => api('/ai/rewrite', { method: 'POST', body: { text } });
