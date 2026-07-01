import 'dotenv/config';
import { runAccountDeletionJob } from '../src/lib/accountDeletionJob';

async function main() {
  const result = await runAccountDeletionJob();
  console.log('[account-deletion-job]', JSON.stringify(result));
  if (result.failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[account-deletion-job]', err instanceof Error ? err.message : err);
  process.exit(1);
});
