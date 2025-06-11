// src/types/subscriptionTiers.ts

export interface AiCredits {
    neuroImageGen: number | 'limited' | 'unlimited';
    freedomAI: number | 'unlimited';
    musicVideo: number;
    deepfake: number;
    videoGenerator: number;
    creator3D: boolean | 'unlimited';
  }
  
  export interface SubscriptionTier {
    name: string;
    price: number;
    maxUptime: number; // in seconds
    deviceLimit: number;
    aiCredits: AiCredits;
    benefits: string[];
  }
  
  export const subscriptionTiers: SubscriptionTier[] = [
    {
      name: "Basic",
      price: 10,
      maxUptime: (4 + 6) * 60 * 60, // 10 hours
      deviceLimit: 1,
      aiCredits: {
        neuroImageGen: "limited",
        freedomAI: 10000,
        musicVideo: 0,
        deepfake: 0,
        videoGenerator: 0,
        creator3D: false
      },
      benefits: [
        "Neuro Image Gen",
        "Freedom AI with 10,000 credits",
        "+6 Hr on 1 device Swarm Node connection"
      ]
    },
    {
      name: "Pro",
      price: 15,
      maxUptime: (4 + 8) * 60 * 60, // 12 hours
      deviceLimit: 2,
      aiCredits: {
        neuroImageGen: "unlimited",
        freedomAI: "unlimited",
        musicVideo: 0,
        deepfake: 0,
        videoGenerator: 0,
        creator3D: false
      },
      benefits: [
        "Neuro Image Gen",
        "Freedom AI with unlimited credits",
        "+8 Hr on 2 device Swarm Node connection"
      ]
    },
    {
      name: "Elite",
      price: 50,
      maxUptime: 24 * 60 * 60, // 24 hours
      deviceLimit: 6,
      aiCredits: {
        neuroImageGen: "unlimited",
        freedomAI: "unlimited",
        musicVideo: 20000,
        deepfake: 20000,
        videoGenerator: 10000,
        creator3D: "unlimited"
      },
      benefits: [
        "Neuro Image Gen - unlimited",
        "Freedom AI - unlimited",
        "3D Creator - unlimited",
        "AI Music Video - 20,000 credits",
        "AI Deepfake Studio - 20,000 credits",
        "AI Video Generator - 10,000 credits",
        "Full day on 6 device Swarm Node connection"
      ]
    }
  ];
  
  export const getTierByName = (name: string): SubscriptionTier => 
    subscriptionTiers.find((tier) => tier.name === name) ?? subscriptionTiers[0];
  
  // Optional: Add a default free tier
  export const freeSubscriptionTier: SubscriptionTier = {
    name: "Free",
    price: 0,
    maxUptime: 4 * 60 * 60, // 1 hour
    deviceLimit: 1,
    aiCredits: {
      neuroImageGen: 100,
      freedomAI: 100,
      musicVideo: 0,
      deepfake: 0,
      videoGenerator: 0,
      creator3D: false
    },
    benefits: [
      "Basic Access",
      "Limited AI Credits"
    ]
  };