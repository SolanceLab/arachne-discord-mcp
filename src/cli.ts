import 'dotenv/config';
import { EntityRegistry } from './entity-registry.js';
import { createEntityRole, deleteEntityRole, sendAnnouncement } from './api/discord-api.js';

const DB_PATH = process.env.DB_PATH || './arachne.db';

const registry = new EntityRegistry(DB_PATH);
const args = process.argv.slice(2);
const command = args[0];
const subcommand = args[1];

function getFlag(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

async function main() {
  try {
    if (command === 'entity') {
      switch (subcommand) {
        case 'create': {
          const name = getFlag('name');
          if (!name) {
            console.error('Usage: cli entity create --name <name> [--avatar <url>]');
            process.exit(1);
          }
          const avatar = getFlag('avatar');
          const { entity, apiKey } = await registry.createEntity(name, avatar);
          console.log('\n  Entity created:');
          console.log(`  ID:       ${entity.id}`);
          console.log(`  Name:     ${entity.name}`);
          console.log(`  Avatar:   ${entity.avatar_url || '(none)'}`);
          console.log(`  API Key:  ${apiKey}`);
          console.log(`  MCP URL:  /mcp/${entity.id}`);
          console.log('\n  ⚠  Save the API key — it will not be shown again.\n');
          break;
        }

        case 'list': {
          const entities = registry.listEntities();
          if (entities.length === 0) {
            console.log('No active entities.');
            break;
          }
          console.log(`\n  Active entities (${entities.length}):\n`);
          for (const e of entities) {
            const servers = registry.getEntityServers(e.id);
            console.log(`  ${e.name} (${e.id})`);
            console.log(`    Created: ${e.created_at}`);
            console.log(`    Avatar:  ${e.avatar_url || '(none)'}`);
            console.log(`    Servers: ${servers.length === 0 ? '(none)' : servers.map(s => `${s.server_id}${s.role_id ? ` (role: ${s.role_id})` : ''}`).join(', ')}`);
            console.log();
          }
          break;
        }

        case 'deactivate': {
          const id = getFlag('id');
          if (!id) {
            console.error('Usage: cli entity deactivate --id <entity_id>');
            process.exit(1);
          }
          if (registry.deactivateEntity(id)) {
            console.log(`Entity ${id} deactivated.`);
          } else {
            console.error(`Entity ${id} not found.`);
          }
          break;
        }

        case 'key-regen': {
          const id = getFlag('id');
          if (!id) {
            console.error('Usage: cli entity key-regen --id <entity_id>');
            process.exit(1);
          }
          const newKey = await registry.regenerateKey(id);
          if (newKey) {
            console.log(`\n  API key regenerated for entity ${id}`);
            console.log(`  New API Key: ${newKey}`);
            console.log('\n  ⚠  Save the API key — it will not be shown again.\n');
          } else {
            console.error(`Entity ${id} not found.`);
          }
          break;
        }

        default:
          console.error('Usage: cli entity <create|list|deactivate|key-regen>');
          process.exit(1);
      }
    } else if (command === 'server') {
      switch (subcommand) {
        case 'add': {
          const entityId = getFlag('entity');
          const serverId = getFlag('server');
          if (!entityId || !serverId) {
            console.error('Usage: cli server add --entity <id> --server <server_id> [--channels ch1,ch2] [--announce <channel_id>]');
            process.exit(1);
          }
          const entity = registry.getEntity(entityId);
          if (!entity) {
            console.error(`Entity ${entityId} not found.`);
            process.exit(1);
          }
          const channelsStr = getFlag('channels');
          const channels = channelsStr ? channelsStr.split(',').map(c => c.trim()) : [];
          registry.addServer(entityId, serverId, channels);

          // Auto-create Discord role
          let roleId: string | null = null;
          try {
            roleId = await createEntityRole(serverId, entity.name);
            registry.updateServerRoleId(entityId, serverId, roleId);
            console.log(`Entity ${entity.name} added to server ${serverId}`);
            console.log(`  Role created: @${entity.name} (${roleId})`);
          } catch (err) {
            console.log(`Entity ${entity.name} added to server ${serverId}`);
            console.warn(`  ⚠  Could not create Discord role: ${err instanceof Error ? err.message : String(err)}`);
          }

          if (channels.length > 0) {
            console.log(`  Channels: ${channels.join(', ')}`);
          } else {
            console.log('  Channels: all');
          }

          // Auto-announce if requested
          const announceChannel = getFlag('announce');
          if (announceChannel && roleId) {
            try {
              await sendAnnouncement(announceChannel, entity.name, roleId);
              console.log(`  Announced in channel ${announceChannel}`);
            } catch (err) {
              console.warn(`  ⚠  Announcement failed: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
          break;
        }

        case 'remove': {
          const entityId = getFlag('entity');
          const serverId = getFlag('server');
          if (!entityId || !serverId) {
            console.error('Usage: cli server remove --entity <id> --server <server_id>');
            process.exit(1);
          }
          const { removed, roleId } = registry.removeServer(entityId, serverId);
          if (removed) {
            console.log(`Entity ${entityId} removed from server ${serverId}`);
            // Auto-delete Discord role
            if (roleId) {
              try {
                await deleteEntityRole(serverId, roleId);
                console.log(`  Role deleted: ${roleId}`);
              } catch (err) {
                console.warn(`  ⚠  Could not delete Discord role: ${err instanceof Error ? err.message : String(err)}`);
              }
            }
          } else {
            console.error('No matching entity-server record found.');
          }
          break;
        }

        default:
          console.error('Usage: cli server <add|remove>');
          process.exit(1);
      }
    } else {
      console.log('Arachne CLI');
      console.log('  entity create --name <name> [--avatar <url>]');
      console.log('  entity list');
      console.log('  entity deactivate --id <entity_id>');
      console.log('  entity key-regen --id <entity_id>');
      console.log('  server add --entity <id> --server <server_id> [--channels ch1,ch2] [--announce <channel_id>]');
      console.log('  server remove --entity <id> --server <server_id>');
    }
  } finally {
    registry.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
