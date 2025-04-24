
import React, { createContext, useContext, useState, useEffect } from 'react';
import { RewardTier } from '@/utils/hardwareDetection';

interface Node {
  id: string;
  name: string;
  rewardTier: RewardTier;
  status: 'idle' | 'running' | 'offline';
  earnings: number;
  multiplier: number;
}

interface NodeContextType {
  nodes: Node[];
  totalEarnings: number;
  addNode: (node: Omit<Node, 'earnings'>) => void;
  updateNodeStatus: (id: string, status: Node['status']) => void;
  updateNodeEarnings: (id: string, amount: number) => void;
}

const NodeContext = createContext<NodeContextType | null>(null);

export const NodeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [nodes, setNodes] = useState<Node[]>([]);
  
  const totalEarnings = nodes.reduce((sum, node) => sum + node.earnings, 0);
  
  const addNode = (node: Omit<Node, 'earnings'>) => {
    setNodes(prev => [...prev, { ...node, earnings: 0 }]);
  };
  
  const updateNodeStatus = (id: string, status: Node['status']) => {
    setNodes(prev => prev.map(node => 
      node.id === id ? { ...node, status } : node
    ));
  };
  
  const updateNodeEarnings = (id: string, amount: number) => {
    setNodes(prev => prev.map(node => 
      node.id === id ? { ...node, earnings: node.earnings + amount } : node
    ));
  };
  
  return (
    <NodeContext.Provider value={{
      nodes,
      totalEarnings,
      addNode,
      updateNodeStatus,
      updateNodeEarnings,
    }}>
      {children}
    </NodeContext.Provider>
  );
};

export const useNodes = () => {
  const context = useContext(NodeContext);
  if (!context) {
    throw new Error('useNodes must be used within a NodeProvider');
  }
  return context;
};
