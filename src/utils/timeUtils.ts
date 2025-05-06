/**
 * Time utility functions for formatting timestamps and durations
 */

/**
 * Formats a number of seconds into a human-readable time format (hh:mm:ss)
 * @param seconds - Time in seconds to format
 * @returns Formatted time string in the format of "Xh Ym Zs"
 */
export const formatUptime = (seconds: number): string => {
    if (seconds <= 0) return "0h 0m 0s";

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    return `${hours}h ${minutes}m ${secs}s`;
};

/**
 * Formats a duration in seconds to a more human-friendly format
 * @param seconds - Time in seconds to format
 * @returns Formatted time string (e.g., "2 hours 15 minutes" or "30 seconds")
 */
export const formatDuration = (seconds: number): string => {
    if (seconds <= 0) return "0 seconds";

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const parts = [];

    if (hours > 0) {
        parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
    }

    if (minutes > 0) {
        parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
    }

    if (secs > 0 && hours === 0) {
        parts.push(`${secs} ${secs === 1 ? 'second' : 'seconds'}`);
    }

    return parts.join(' ');
};

/**
 * Formats a date object or timestamp to a standard date string
 * @param date - Date object or timestamp in milliseconds
 * @returns Formatted date string
 */
export const formatDate = (date: Date | number): string => {
    const dateObj = typeof date === 'number' ? new Date(date) : date;
    return dateObj.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
};

/**
 * Formats a date object or timestamp to include time
 * @param date - Date object or timestamp in milliseconds
 * @returns Formatted date and time string
 */
export const formatDateTime = (date: Date | number): string => {
    const dateObj = typeof date === 'number' ? new Date(date) : date;
    return dateObj.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}; 