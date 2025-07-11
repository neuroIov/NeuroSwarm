import { logger } from '../utils/logger';
import { TASK_PROCESSING_CONFIG } from './config';
import { store } from '../store';
import { startUptimeTracking, stopUptimeTracking } from '../store/slices/taskSlice';

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

        // Configure the proxy task service with a small random offset to avoid synchronization
        const randomOffset = Math.floor(Math.random() * 5000); // 0-5 second offset
        
        logger.log(`Starting proxy task service`);

        // Use setTimeout to start the service with a slight delay
        // This helps avoid multiple systems starting up simultaneously
        setTimeout(() => {
            startUptimeTracking();
            logger.log('Uptime tracking started for proxy task generation');
        }, 2000 + randomOffset);

        // Mark as initialized
        this.initialized = true;
        logger.log('All services initialized');
    }

    /**
     * Clean up services on application shutdown
     */
    cleanup(): void {
        // Stop uptime tracking
        stopUptimeTracking();
        
        logger.log('Services cleaned up');
    }
}

// Create a singleton instance
export const startupService = new StartupService(); 