import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { SupabaseService, AITask } from './SupabaseService';
import { SolanaService } from './SolanaService';
import { TaskScheduler } from './TaskScheduler';
import { MonitoringService } from './MonitoringService';

export class TaskBridge {
    private readonly BATCH_SIZE = 10;
    private readonly POLL_INTERVAL = 10000; // 10 seconds
    private isProcessing = false;

    constructor(
        private supabaseService: SupabaseService,
        private solanaService: SolanaService,
        private taskScheduler: TaskScheduler,
        private monitoringService: MonitoringService
    ) {
        this.startTaskBridge();
    }

    private async startTaskBridge() {
        setInterval(async () => {
            if (this.isProcessing) return;
            this.isProcessing = true;

            try {
                // 1. Get pending AI tasks from Supabase
                const pendingTasks = await this.supabaseService.getPendingTasks(this.BATCH_SIZE);
                if (pendingTasks.length === 0) return;

                // 2. Process each task
                await Promise.all(pendingTasks.map(task => this.processTask(task)));

            } catch (error) {
                console.error('Task bridge error:', error);
                this.monitoringService.getState().addAlert({
                    type: 'system',
                    severity: 'high',
                    message: `Task bridge error: ${error.message}`
                });
            } finally {
                this.isProcessing = false;
            }
        }, this.POLL_INTERVAL);
    }

    private async processTask(task: AITask) {
        try {
            // 1. Convert AI task requirements to blockchain task requirements
            const requirements = this.convertTaskRequirements(task);

            // 2. Submit to blockchain
            const blockchainTaskId = await this.solanaService.submitTask(
                this.solanaService.getPayer().publicKey,
                task.type,
                requirements,
                this.solanaService.getPayer()
            );

            if (!blockchainTaskId) {
                throw new Error('Failed to create blockchain task');
            }

            // 3. Update Supabase task with blockchain details
            await this.supabaseService.updateTaskBlockchainDetails(task.id, {
                blockchain_task_id: blockchainTaskId,
                status: 'processing'
            });

            // 4. Monitor task status
            this.monitorTaskCompletion(task.id, blockchainTaskId);

        } catch (error) {
            console.error(`Failed to process task ${task.id}:`, error);
            await this.supabaseService.updateTaskBlockchainDetails(task.id, {
                status: 'failed'
            });
        }
    }

    private convertTaskRequirements(task: AITask) {
        // Convert AI task type to compute requirements
        const requirements = {
            minVram: 8, // Default 8GB VRAM
            minHashRate: 50, // Default 50 MH/s
            priority: 'medium' as const
        };

        // Adjust requirements based on task type
        switch (task.type) {
            case 'image_generation':
                requirements.minVram = 12;
                requirements.priority = 'high';
                break;
            case 'image_editing':
                requirements.minVram = 10;
                break;
            case 'chat':
                requirements.minVram = 8;
                requirements.priority = 'low';
                break;
            // Add more task types as needed
        }

        return requirements;
    }

    private async monitorTaskCompletion(taskId: string, blockchainTaskId: string) {
        const checkInterval = setInterval(async () => {
            try {
                const status = await this.solanaService.getTaskStatus(blockchainTaskId);
                
                if (status.completed) {
                    await this.supabaseService.updateTaskBlockchainDetails(taskId, {
                        status: 'completed',
                        node_id: status.nodeId,
                        reward_amount: status.reward,
                        completion_signature: status.signature
                    });
                    clearInterval(checkInterval);
                } else if (status.failed) {
                    await this.supabaseService.updateTaskBlockchainDetails(taskId, {
                        status: 'failed'
                    });
                    clearInterval(checkInterval);
                }
            } catch (error) {
                console.error(`Failed to check task status ${taskId}:`, error);
            }
        }, 5000); // Check every 5 seconds
    }
}
