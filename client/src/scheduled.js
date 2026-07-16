import { api } from './api.js';

/** Messages programmés en attente (salons et privés confondus). */
export const listScheduled = () => api('/scheduled');

/** Programme un message : { channelId } ou { toUserId }, plus content et sendAt (secondes). */
export const scheduleMessage = (body) => api('/scheduled', { method: 'POST', body });

/** Annule un message programmé encore en attente. */
export const cancelScheduled = (id) => api(`/scheduled/${id}`, { method: 'DELETE' });
