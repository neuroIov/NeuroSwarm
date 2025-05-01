import { configureStore } from '@reduxjs/toolkit';
import nodeReducer from './slices/nodeSlice';
import taskReducer from './slices/taskSlice';
import sessionReducer from './slices/sessionSlice';  // Import sessionReducer


export const store = configureStore({
    reducer: {
        node: nodeReducer,
        tasks: taskReducer,
        session: sessionReducer,  // Add session slice here

    },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Use throughout your app instead of plain `useDispatch` and `useSelector`
import { useDispatch, useSelector, TypedUseSelectorHook } from 'react-redux';
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector; 