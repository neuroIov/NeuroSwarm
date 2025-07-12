import { logger } from '@/utils/logger';
import { TASK_PROCESSING_CONFIG } from './config';
import { TaskType } from './types';

export interface UnclaimedEarnings {
  totalAmount: number;
  taskCounts: {
    image: number;
    text: number;
    three_d: number;
    video: number;
  };
  lastUpdated: string;
}

const STORAGE_KEY = 'neuroswarm_unclaimed_earnings';

/**
 * Get unclaimed earnings from localStorage
 */
export const getUnclaimedEarnings = (userId: string): UnclaimedEarnings => {
  try {
    const stored = localStorage.getItem(`${STORAGE_KEY}_${userId}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        totalAmount: parsed.totalAmount || 0,
        taskCounts: {
          image: parsed.taskCounts?.image || 0,
          text: parsed.taskCounts?.text || 0,
          three_d: parsed.taskCounts?.three_d || 0,
          video: parsed.taskCounts?.video || 0,
        },
        lastUpdated: parsed.lastUpdated || new Date().toISOString(),
      };
    }
  } catch (error) {
    logger.error('Error reading unclaimed earnings from localStorage:', error);
  }

  // Return default structure
  return {
    totalAmount: 0,
    taskCounts: {
      image: 0,
      text: 0,
      three_d: 0,
      video: 0,
    },
    lastUpdated: new Date().toISOString(),
  };
};

/**
 * Save unclaimed earnings to localStorage
 */
export const saveUnclaimedEarnings = (userId: string, earnings: UnclaimedEarnings): void => {
  try {
    const toSave = {
      ...earnings,
      lastUpdated: new Date().toISOString(),
    };
    localStorage.setItem(`${STORAGE_KEY}_${userId}`, JSON.stringify(toSave));
    logger.log(`Saved unclaimed earnings: ${earnings.totalAmount} NLOVE`);
  } catch (error) {
    logger.error('Error saving unclaimed earnings to localStorage:', error);
  }
};

/**
 * Add earnings for a completed task
 */
export const addTaskEarning = (userId: string, taskType: TaskType): number => {
  const currentEarnings = getUnclaimedEarnings(userId);
  const taskAmount = TASK_PROCESSING_CONFIG.EARNINGS_NLOVE[taskType] || 0;

  const updatedEarnings: UnclaimedEarnings = {
    totalAmount: currentEarnings.totalAmount + taskAmount,
    taskCounts: {
      ...currentEarnings.taskCounts,
      [taskType]: currentEarnings.taskCounts[taskType] + 1,
    },
    lastUpdated: new Date().toISOString(),
  };

  saveUnclaimedEarnings(userId, updatedEarnings);
  logger.log(`Added ${taskAmount} NLOVE for ${taskType} task. Total unclaimed: ${updatedEarnings.totalAmount}`);
  
  return updatedEarnings.totalAmount;
};

/**
 * Clear unclaimed earnings after successful claim
 */
export const clearUnclaimedEarnings = (userId: string): void => {
  try {
    localStorage.removeItem(`${STORAGE_KEY}_${userId}`);
    logger.log('Cleared unclaimed earnings from localStorage');
  } catch (error) {
    logger.error('Error clearing unclaimed earnings:', error);
  }
};

/**
 * Get total task count across all types
 */
export const getTotalTaskCount = (earnings: UnclaimedEarnings): number => {
  return Object.values(earnings.taskCounts).reduce((sum, count) => sum + count, 0);
};
