/**
 * Format date string to a human-readable format
 * @param dateString ISO date string
 * @returns Formatted date string
 */
export const formatDate = (dateString: string): string => {
    if (!dateString) return 'N/A';

    try {
        const date = new Date(dateString);

        // If invalid date
        if (isNaN(date.getTime())) return 'Invalid date';

        // Format: Jun 15, 2023
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    } catch (error) {
        console.error('Error formatting date:', error);
        return 'Error';
    }
};

/**
 * Calculate the relative time from now (e.g., "2 days ago")
 * @param dateString ISO date string
 * @returns Relative time string
 */
export const getRelativeTime = (dateString: string): string => {
    if (!dateString) return '';

    try {
        const date = new Date(dateString);
        const now = new Date();

        // If invalid date
        if (isNaN(date.getTime())) return '';

        const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

        if (diffInSeconds < 60) return 'just now';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} min ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
        if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} days ago`;

        // For older dates, use the standard format
        return formatDate(dateString);
    } catch (error) {
        console.error('Error calculating relative time:', error);
        return '';
    }
}; 