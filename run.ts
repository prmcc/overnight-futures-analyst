import { runPipeline } from './src/lib/pipeline/orchestrator';

console.log(`[Pipeline] Starting at ${new Date().toISOString()}`);

const result = await runPipeline();

if (result.status === 'completed') {
  console.log(`[Pipeline] Completed in ${(result.durationMs / 1000).toFixed(1)}s`);
  process.exit(0);
} else {
  console.error(`[Pipeline] Failed: ${result.error}`);
  process.exit(1);
}
