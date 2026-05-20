const { insert, auditLog } = require('./db');
require('dotenv').config();

/**
 * Automatically grants the configured Discord role to a user based on their dashboard role
 * @param {string} discordId - The user's Discord ID
 * @param {string} dashboardRole - The role in the dashboard ('user', 'vip', 'admin')
 * @param {string} username - The shop username (for logging)
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function grantDiscordRole(discordId, dashboardRole = 'user', username = 'Inconnu') {
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  const customerRoleId = process.env.DISCORD_CUSTOMER_ROLE_ID;
  const vipRoleId = process.env.DISCORD_VIP_ROLE_ID;

  if (!token || token === '397742357379809291' || !guildId || !customerRoleId) {
    console.log(`[DISCORD_AUTO_ROLE] Config manquante ou par défaut.`);
    return { success: false, message: 'Configuration Discord incomplète.' };
  }

  if (!/^\d{17,20}$/.test(discordId)) {
    console.log(`[DISCORD_AUTO_ROLE] ID Discord invalide : ${discordId}`);
    return { success: false, message: 'ID Discord invalide.' };
  }

  // Define roles to assign
  const rolesToAssign = [
    { id: customerRoleId, label: 'Customer' }
  ];

  if ((dashboardRole === 'vip' || dashboardRole === 'admin') && vipRoleId) {
    rolesToAssign.push({ id: vipRoleId, label: 'VIP' });
  }

  try {
    let allSuccess = true;
    let messages = [];

    for (const role of rolesToAssign) {
      const url = `https://discord.com/api/v9/guilds/${guildId}/members/${discordId}/roles/${role.id}`;
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `Bot ${token}`,
          'Content-Type': 'application/json',
          'X-Audit-Log-Reason': `Auto role ${role.label} from Ghost Shop dashboard`
        }
      });

      if (response.status === 204) {
        console.log(`[DISCORD_AUTO_ROLE] Rôle ${role.label} accordé avec succès à ${username}`);
        
        try {
          await insert(auditLog, {
            action: 'discord_role_granted',
            ip: 'system',
            created_at: new Date().toISOString(),
            username: username,
            details: { discord_id: discordId, role_id: role.id, role_type: role.label }
          });
        } catch (e) {
          console.error('[DISCORD_AUDIT_LOG_ERROR]', e);
        }
        messages.push(`Rôle ${role.label} attribué !`);
      } else if (response.status === 404) {
        console.log(`[DISCORD_AUTO_ROLE] Utilisateur ${discordId} non trouvé sur le serveur.`);
        return { success: false, message: "L'utilisateur n'a pas été trouvé sur votre serveur Discord." };
      } else {
        const errText = await response.text();
        console.error(`[DISCORD_AUTO_ROLE] Erreur Discord API (Code ${response.status}):`, errText);
        allSuccess = false;
        messages.push(`Erreur pour le rôle ${role.label}.`);
      }
    }

    return { success: allSuccess, message: messages.join(' ') };
  } catch (err) {
    console.error('[DISCORD_AUTO_ROLE_ERROR]', err);
    return { success: false, message: 'Erreur de connexion au service Discord.' };
  }
}

module.exports = { grantDiscordRole };
