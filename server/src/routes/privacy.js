import { Router } from 'express';
import db from '../db.js';
import { authMiddleware } from '../auth.js';
import { limit } from '../ratelimit.js';

const router = Router();
router.use(authMiddleware);

/**
 * Export de toutes les données personnelles (droit d'accès et de portabilité,
 * articles 15 et 20 du RGPD).
 *
 * Le fichier doit être lisible par un humain ET réutilisable par une machine :
 * le JSON coche les deux cases. Rien n'est omis de ce qui concerne la personne,
 * et rien n'est ajouté qui concerne quelqu'un d'autre.
 */
router.get('/export', limit('export', 3, 3600, 'Export déjà demandé récemment. Réessayez dans un moment.'), (req, res) => {
  const me = req.userId;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(me);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

  const all = (sql, ...p) => db.prepare(sql).all(...p);

  const data = {
    export: {
      genere_le: new Date().toISOString(),
      application: 'Pulsar',
      a_propos: "Ce fichier contient l'ensemble des données personnelles associées à votre compte, conformément aux articles 15 et 20 du RGPD.",
    },

    compte: {
      identifiant: user.id,
      nom_utilisateur: user.username,
      nom_affiche: user.display_name,
      email: user.email,
      email_confirme: !!user.verified,
      cree_le: user.created_at,
      statut: user.status,
      statut_personnalise: user.custom_status,
      // Le mot de passe n'est jamais exporté : nous n'en avons que l'empreinte,
      // et la divulguer n'aurait aucune utilité pour vous.
      conditions_acceptees_le: user.tos_accepted_at ? new Date(user.tos_accepted_at).toISOString() : null,
      version_des_conditions_acceptee: user.tos_version,
    },

    profil: {
      avatar: user.avatar_url,
      banniere: user.banner_url || user.banner_color,
      poste: user.headline,
      entreprise: user.company,
      localisation: user.location,
      site: user.website,
      email_professionnel: user.email_pro,
      telephone: user.phone,
      competences: user.skills,
      pronoms: user.pronouns,
      cv: user.cv_url ? { fichier: user.cv_name, resume: user.cv_summary } : null,
    },

    preferences: {
      qui_peut_m_ecrire: user.privacy_dm,
      qui_peut_m_ajouter: user.privacy_friend,
      apparaitre_hors_ligne: !!user.hide_presence,
    },

    serveurs: all(`
      SELECT s.id, s.name AS nom, sm.joined_at AS rejoint_le, (s.owner_id = ?) AS je_suis_fondateur
      FROM servers s JOIN server_members sm ON sm.server_id = s.id
      WHERE sm.user_id = ?
    `, me, me),

    messages_dans_les_salons: all(`
      SELECT m.id, m.content AS contenu, m.created_at AS envoye_le, m.attachment_name AS piece_jointe,
             c.name AS salon, s.name AS serveur, (m.thread_parent_id IS NOT NULL) AS dans_un_fil
      FROM messages m
      JOIN channels c ON c.id = m.channel_id
      JOIN servers s ON s.id = c.server_id
      WHERE m.user_id = ? AND m.deleted = 0
      ORDER BY m.id
    `, me),

    messages_prives: all(`
      SELECT d.id, d.content AS contenu, d.created_at AS envoye_le, d.attachment_name AS piece_jointe,
             CASE WHEN d.sender_id = ? THEN 'envoyé' ELSE 'reçu' END AS sens,
             CASE WHEN d.sender_id = ? THEN dest.display_name ELSE exp.display_name END AS correspondant
      FROM dm_messages d
      JOIN users exp ON exp.id = d.sender_id
      JOIN users dest ON dest.id = d.recipient_id
      WHERE (d.sender_id = ? OR d.recipient_id = ?) AND d.deleted = 0
      ORDER BY d.id
    `, me, me, me, me),

    contacts: all(`
      SELECT u.display_name AS nom, u.username AS nom_utilisateur, f.status AS etat, f.created_at AS depuis
      FROM friendships f
      JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
      WHERE f.requester_id = ? OR f.addressee_id = ?
    `, me, me, me),

    taches: all(`
      SELECT t.title AS titre, t.description, t.status AS etat, t.due_at AS echeance, t.created_at AS creee_le
      FROM tasks t WHERE t.assignee_id = ? OR t.creator_id = ?
    `, me, me),

    messages_enregistres: all('SELECT content AS contenu, source AS provenance, created_at AS enregistre_le, remind_at AS rappel_le FROM saved_messages WHERE user_id = ?', me),

    messages_programmes: all('SELECT content AS contenu, send_at AS envoi_prevu_le, sent AS deja_envoye FROM scheduled_messages WHERE user_id = ?', me),

    reactions: all(`
      SELECT r.emoji, m.content AS sur_le_message
      FROM message_reactions r JOIN messages m ON m.id = r.message_id
      WHERE r.user_id = ?
    `, me),

    sessions_ouvertes: all('SELECT user_agent AS appareil, created_at AS ouverte_le, last_seen AS derniere_activite FROM sessions WHERE user_id = ?', me),
  };

  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="pulsar-mes-donnees-${stamp}.json"`);
  res.send(JSON.stringify(data, null, 2));
});

export default router;
