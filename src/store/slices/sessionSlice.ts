// src/store/slices/sessionSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

type Activity = {
  type: string;
  timestamp: string;
  details: Record<string, any>;
};

type SessionState = {
  sessionId: string | null;
  userId: string | null;
  authMethod: 'wallet' | 'gmail' | 'both' | null;
  startTime: string | null;
  activities: Activity[];
};

const initialState: SessionState = {
  sessionId: null,
  userId: null,
  authMethod: null,
  startTime: null,
  activities: [],
};

const sessionSlice = createSlice({
  name: 'session',
  initialState,
  reducers: {
    startSession(state, action: PayloadAction<{ userId: string; authMethod: SessionState['authMethod'] }>) {
      const { userId, authMethod } = action.payload;
      state.sessionId = crypto.randomUUID();
      state.userId = userId;
      state.authMethod = authMethod;
      state.startTime = new Date().toISOString();
      state.activities = [];
    },
    logActivity(state, action: PayloadAction<{ type: string; details: Record<string, any> }>) {
      state.activities.push({
        type: action.payload.type,
        timestamp: new Date().toISOString(),
        details: action.payload.details,
      });
    },
    endSession(state) {
      Object.assign(state, initialState);
    },
  },
});

export const { startSession, logActivity, endSession } = sessionSlice.actions;
export default sessionSlice.reducer;
