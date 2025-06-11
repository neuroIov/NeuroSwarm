export const subscriptionTiers = [
    {
      name: "Basic",
      price: 10,
      maxUptime: 6 * 60 * 60, // 6 hours
      deviceLimit: 1,
      aiCredits: {
        neuroImageGen: "limited",
        freedomAI: 10000,
        musicVideo: 0,
        deepfake: 0,
        videoGenerator: 0,
        creator3D: false,
      },
      benefits: [
        "Neuro Image Gen",
        "Freedom AI with 10,000 credits",
        "+6 Hr on 1 device Swarm Node connection",
      ],
    },
    {
      name: "Ultimate",
      price: 15,
      maxUptime: 8 * 60 * 60, // 8 hours
      deviceLimit: 2,
      aiCredits: {
        neuroImageGen: "unlimited",
        freedomAI: "unlimited",
        musicVideo: 0,
        deepfake: 0,
        videoGenerator: 0,
        creator3D: false,
      },
      benefits: [
        "Neuro Image Gen",
        "Freedom AI with unlimited credits",
        "+8 Hr on 2 device Swarm Node connection",
      ],
    },
    {
      name: "Enterprice",
      price: 50,
      maxUptime: 24 * 60 * 60, // 24 hours
      deviceLimit: 6,
      aiCredits: {
        neuroImageGen: "unlimited",
        freedomAI: "unlimited",
        musicVideo: 20000,
        deepfake: 20000,
        videoGenerator: 10000,
        creator3D: "unlimited",
      },
      benefits: [
        "Neuro Image Gen - unlimited",
        "Freedom AI - unlimited",
        "3D Creator - unlimited",
        "AI Music Video - 20,000 credits",
        "AI Deepfake Studio - 20,000 credits",
        "AI Video Generator - 10,000 credits",
        "Full day on 6 device Swarm Node connection",
      ],
    },
  ];
  
  // ✅ Helper: Get full tier object by name
  export const getTierByName = (name: string) =>
    subscriptionTiers.find((tier) => tier.name.toLowerCase() === name.toLowerCase()) ?? subscriptionTiers[0];
  
  // ✅ Helper: Return max uptime for a tier name
  export const getMaxUptimeByTier = (tierName: string): number => {
    const tier = getTierByName(tierName);
    return tier.maxUptime;
  };
  