const { grantDiscordRole } = require('./server/discord');

async function run() {
  const res = await grantDiscordRole('274291880315486208', 'user', 'Tester'); // Replace with a real ID if needed
  console.log('Result:', res);
}
run();
