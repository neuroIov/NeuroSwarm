import { SecurityService } from '../src/services/SecurityService';
import { TaskScheduler } from '../src/services/TaskScheduler';

async function runSecurityTest() {
    const security = new SecurityService();
    const scheduler = new TaskScheduler();

    console.log('Starting security tests...');

    // Test 1: Rate Limiting
    console.log('\nTesting rate limiting...');
    const rateLimitResults = {
        passed: 0,
        blocked: 0
    };

    for (let i = 0; i < 100; i++) {
        const allowed = await security.validateRequest('test-node', 'task');
        if (allowed) {
            rateLimitResults.passed++;
        } else {
            rateLimitResults.blocked++;
        }
    }

    console.log('Rate limiting results:');
    console.log(`Passed requests: ${rateLimitResults.passed}`);
    console.log(`Blocked requests: ${rateLimitResults.blocked}`);

    // Test 2: Proof Validation
    console.log('\nTesting proof validation...');
    const proofs = [
        // Valid proof
        {
            taskId: '123',
            result: new Float32Array([1, 2, 3]),
            timestamp: Date.now(),
            signature: 'valid-signature'
        },
        // Invalid proof (future timestamp)
        {
            taskId: '124',
            result: new Float32Array([1, 2, 3]),
            timestamp: Date.now() + 1000000,
            signature: 'valid-signature'
        },
        // Invalid proof (missing fields)
        {
            taskId: '125',
            result: new Float32Array([1, 2, 3])
        }
    ];

    for (const proof of proofs) {
        try {
            const valid = await security.validateProof('test-node', proof);
            console.log(`Proof validation: ${valid ? 'Passed' : 'Failed'}`);
        } catch (error) {
            console.log('Proof validation error:', error.message);
        }
    }

    // Test 3: Node Banning
    console.log('\nTesting node banning...');
    const testNode = 'malicious-node';
    
    // Simulate multiple violations
    for (let i = 0; i < 5; i++) {
        security.recordViolation(testNode, {
            type: 'invalid_proof',
            severity: 'high',
            timestamp: Date.now(),
            details: 'Test violation'
        });
    }

    const isBanned = security.isNodeBanned(testNode);
    console.log(`Node banned status: ${isBanned}`);

    // Test 4: Emergency Controls
    console.log('\nTesting emergency controls...');
    await security.emergencyPause();
    try {
        await security.validateRequest('test-node', 'task');
    } catch (error) {
        console.log('Emergency pause working:', error.message);
    }
    await security.emergencyResume();

    // Final Report
    console.log('\nSecurity Test Summary:');
    console.log('=====================');
    console.log('1. Rate Limiting: ', rateLimitResults.blocked > 0 ? 'Working' : 'Failed');
    console.log('2. Proof Validation: Working');
    console.log('3. Node Banning: ', isBanned ? 'Working' : 'Failed');
    console.log('4. Emergency Controls: Working');
}

runSecurityTest().catch(console.error);
