import { ComputeService } from '../src/services/ComputeService';
import { TaskScheduler } from '../src/services/TaskScheduler';
import { SecurityService } from '../src/services/SecurityService';

async function runLoadTest() {
    const compute = new ComputeService();
    const scheduler = new TaskScheduler();
    const security = new SecurityService();

    // Test parameters
    const numTasks = 100;
    const concurrentTasks = 10;
    const taskSizes = [1024, 4096, 16384]; // Different data sizes
    const priorities = ['high', 'medium', 'low'];

    console.log('Starting load test...');
    console.log(`Total tasks: ${numTasks}`);
    console.log(`Concurrent tasks: ${concurrentTasks}`);

    const results = {
        completed: 0,
        failed: 0,
        avgLatency: 0,
        totalLatency: 0
    };

    // Create test data
    const createTestData = (size: number) => {
        const data = new Float32Array(size);
        for (let i = 0; i < size; i++) {
            data[i] = Math.random();
        }
        return data;
    };

    // Process tasks in batches
    for (let i = 0; i < numTasks; i += concurrentTasks) {
        const batch = [];
        for (let j = 0; j < concurrentTasks && i + j < numTasks; j++) {
            const size = taskSizes[Math.floor(Math.random() * taskSizes.length)];
            const priority = priorities[Math.floor(Math.random() * priorities.length)] as 'high' | 'medium' | 'low';
            const data = createTestData(size);

            const task = scheduler.submitTask(data, 'test-shader', priority);
            batch.push(task);
        }

        // Wait for batch completion
        const startTime = Date.now();
        const batchResults = await Promise.allSettled(batch);
        const endTime = Date.now();

        // Process results
        batchResults.forEach(result => {
            if (result.status === 'fulfilled') {
                results.completed++;
                results.totalLatency += endTime - startTime;
            } else {
                results.failed++;
                console.error('Task failed:', result.reason);
            }
        });

        // Report progress
        console.log(`Processed ${i + batch.length}/${numTasks} tasks`);
        console.log(`Success rate: ${(results.completed / (results.completed + results.failed) * 100).toFixed(2)}%`);
        console.log(`Average latency: ${(results.totalLatency / results.completed).toFixed(2)}ms`);
    }

    // Final report
    console.log('\nLoad Test Results:');
    console.log('==================');
    console.log(`Total tasks: ${numTasks}`);
    console.log(`Completed: ${results.completed}`);
    console.log(`Failed: ${results.failed}`);
    console.log(`Success rate: ${(results.completed / numTasks * 100).toFixed(2)}%`);
    console.log(`Average latency: ${(results.totalLatency / results.completed).toFixed(2)}ms`);
}

runLoadTest().catch(console.error);
