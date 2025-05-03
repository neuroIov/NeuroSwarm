import { taskPollingService } from './taskPollingService';
import { logger } from '../utils/logger';
import { TASK_PROCESSING_CONFIG } from './config';
import { setUserIdProvider } from './swarmTaskService';
import { store } from '../store';

class StartupService {
    private initialized = false;

    /**
     * Initialize all required services for the application
     */
    init(): void {
        if (this.initialized) {
            logger.log('Services already initialized');
            return;
        }

        // Set up the user ID provider function to break circular dependencies
        setUserIdProvider(() => {
            try {
                const state = store.getState();
                return state.session?.userProfile?.id;
            } catch (error) {
                logger.error('Error getting user ID from store:', error);
                return null;
            }
        });
        logger.log('User ID provider initialized');

        // Configure the polling service to use a throttle
        const pollingInterval = TASK_PROCESSING_CONFIG.POLLING_INTERVAL || 20000;
        const minPollingInterval = 10000; // 10 seconds minimum between polls

        // Start task polling service with a small random offset to avoid synchronization
        const randomOffset = Math.floor(Math.random() * 5000); // 0-5 second offset
        const actualInterval = Math.max(minPollingInterval, pollingInterval + randomOffset);

        logger.log(`Starting task polling service with interval: ${Math.round(actualInterval / 1000)}s`);

        // Use setTimeout to start the service with a slight delay
        // This helps avoid multiple systems starting up simultaneously
        setTimeout(() => {
            taskPollingService.start(undefined, actualInterval);
        }, 2000);

        // Mark as initialized
        this.initialized = true;
        logger.log('All services initialized');
    }

    /**
     * Clean up services on application shutdown
     */
    cleanup(): void {
        // Stop task polling
        taskPollingService.stop();

        logger.log('Services cleaned up');
    }
}

// Create a singleton instance
export const startupService = new StartupService(); 