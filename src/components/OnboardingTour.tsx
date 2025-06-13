import React, { useState, useEffect, forwardRef } from 'react';
import Joyride, { Step, CallBackProps, TooltipRenderProps, BeaconRenderProps } from 'react-joyride';
import { keyframes } from '@emotion/react';
import styled from '@emotion/styled';
import { useLocation } from 'react-router-dom';
import { useAppSelector } from '@/store';
import { Button } from './ui/button';

// Custom beacon animation
const pulse = keyframes`
  0% {
    transform: scale(1);
  }

  55% {
    background-color: rgba(8, 116, 227, 0.9);
    transform: scale(1.6);
  }
`;

// Custom beacon styling
const Beacon = styled.span`
  animation: ${pulse} 1s ease-in-out infinite;
  background-color: rgba(8, 116, 227, 0.6);
  border-radius: 50%;
  display: inline-block;
  height: 2.5rem;
  width: 2.5rem;
`;

// Custom beacon component
const BeaconComponent = forwardRef<HTMLSpanElement, BeaconRenderProps>((props, ref) => {
  return <Beacon ref={ref} {...props} />;
});
BeaconComponent.displayName = 'BeaconComponent';

// Custom tooltip component
const SecondaryButton = styled(Button)`
  background-color: transparent;
  border: 1px solid #112544;
  color: rgba(255, 255, 255, 0.8);

  &:hover {
    background-color: rgba(17, 37, 68, 0.3);
  }
`;

const TooltipComponent = styled.div`
  background-color: #0A1A2F;
  border: 1px solid #112544;
  border-radius: 10px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
  color: #fff;
  padding: 20px;
  max-width: 400px;
  z-index: 9999;
  position: relative;
`;

const CloseButton = styled.button`
  position: absolute;
  top: 15px;
  right: 15px;
  background-color: transparent;
  border: none;
  cursor: pointer;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: rgba(255, 255, 255, 0.6);
  transition: all 0.2s;
  &:hover {
    background-color: rgba(255, 255, 255, 0.1);
    color: #fff;
  }
`;

const TooltipTitle = styled.h4`
  font-weight: 600;
  font-size: 18px;
  margin-bottom: 10px;
  color: #fff;
`;

const TooltipContent = styled.div`
  font-size: 14px;
  margin-bottom: 20px;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.5;
`;

const TooltipButtons = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 20px;
  padding-top: 15px;
  border-top: 1px solid rgba(17, 37, 68, 0.7);
  gap: 10px;
`;

const TooltipButton = styled(Button)`
  background-color: #0066FF;
  color: #fff;
  border: none;
  padding: 10px 20px;
  font-size: 14px;
  cursor: pointer;
  &:hover {
    background-color: #0052CC;
  }
`;

const CustomTooltip = (props: TooltipRenderProps) => {
  const { backProps, closeProps, continuous, index, primaryProps, skipProps, step, tooltipProps, isLastStep } = props;

  return (
    <TooltipComponent {...tooltipProps}>
      <CloseButton {...closeProps}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </CloseButton>
      {step.title && <TooltipTitle>{step.title}</TooltipTitle>}
      <TooltipContent>{step.content}</TooltipContent>
      <TooltipButtons>
        <div>
          {continuous && (
            <SecondaryButton {...skipProps}>
              Skip Tour
            </SecondaryButton>
          )}
        </div>
        <div className="flex gap-2">
          {continuous && index > 0 && (
            <SecondaryButton {...backProps}>
              Back
            </SecondaryButton>
          )}
          <TooltipButton {...primaryProps}>
            {isLastStep ? 'Finish' : 'Next'}
          </TooltipButton>
        </div>
      </TooltipButtons>
    </TooltipComponent>
  );
};

// Define step types based on router paths
const DASHBOARD_STEPS: Step[] = [
  {
    target: '.welcome-step',
    content: 'Welcome to NeuroSwarm! Join our network and start earning rewards by contributing your device resources.',
    title: 'Welcome to NeuroSwarm',
    placement: 'center',
    disableBeacon: true,
  },
  {
    target: '.login-button',
    content: 'Sign up with your email address here. If you have a referral code, you can add it in the referral tab.',
    title: 'Create Your Account',
    placement: 'bottom',
  },
  {
    target: '.node-control-panel',
    content: (
      <div>
        <p className="mb-2">The Node Control Panel allows you to:</p>
        <ol className="list-decimal pl-5">
          <li>Scan your device and register it as a node</li>
          <li>If you're not satisfied with the scan results, you can scan again or raise a concern if your device is unable to scan properly</li>
          <li>Start your node to begin processing tasks</li>
          <li>Complete tasks to earn rewards based on your tier and accumulate Swarm points</li>
        </ol>
      </div>
    ),
    title: 'Node Control Panel',
  },
  {
    target: '.task-pipeline',
    content: (
      <div>
        <p className="mb-2">The Task Pipeline shows all your tasks and their status:</p>
        <ul className="list-disc pl-5">
          <li>Pending tasks waiting to be processed</li>
          <li>Processing tasks currently running</li>
          <li>Completed tasks that have earned rewards</li>
          <li>Error tasks that encountered problems</li>
        </ul>
      </div>
    ),
    title: 'Task Pipeline',
  },
  {
    target: '.sidebar-earnings',
    content: (
      <div>
        <p className="mb-2">In the Earnings section, you can:</p>
        <ul className="list-disc pl-5">
          <li>Track all your earnings from completed tasks</li>
          <li>Check out your earnings in your wallet (coming soon)</li>
          <li>Get daily rewards by checking in daily</li>
          <li>See all your recent transactions</li>
        </ul>
      </div>
    ),
    title: 'Track Your Earnings',
  },
  {
    target: '.sidebar-referral',
    content: (
      <div>
        <p className="mb-2">The Referral Program allows you to:</p>
        <ul className="list-disc pl-5">
          <li>Add a referral code if you were invited by someone and earn direct 500 Swarm Points</li>
          <li>View users you've referred to the platform</li>
          <li>Claim earnings from your referrals based on their activity</li>
        </ul>
      </div>
    ),
    title: 'Referral Program',
  },
  {
    target: '.sidebar-global-stats',
    content: (
      <div>
        <p className="mb-2">Global Statistics provides:</p>
        <ul className="list-disc pl-5">
          <li>A global perspective on network activity</li>
          <li>Leaderboards based on earnings and task completion</li>
        </ul>
      </div>
    ),
    title: 'Global Statistics',
  },
];

interface OnboardingTourProps {
  run: boolean;
  onComplete: () => void;
}

export const OnboardingTour = ({ run, onComplete }: OnboardingTourProps) => {
  const [steps, setSteps] = useState<Step[]>([]);
  const location = useLocation();
  const { userProfile } = useAppSelector((state) => state.session);

  // Determine which steps to show based on current route
  useEffect(() => {
    setSteps(DASHBOARD_STEPS);
  }, [location.pathname]);

  const handleCallback = (data: CallBackProps) => {
    const { status, type } = data;
    
    if (type === 'tour:end' || status === 'finished') {
      // Tour completed
      onComplete();
    }
  };

  return (
    <Joyride
      steps={steps}
      run={run && steps.length > 0}
      continuous={true}
      showSkipButton={true}
      showProgress={true}
      scrollToFirstStep={true}
      spotlightClicks={true}
      beaconComponent={BeaconComponent}
      tooltipComponent={CustomTooltip}
      callback={handleCallback}
      disableOverlayClose={true}
      styles={{
        options: {
          zIndex: 10000,
          primaryColor: '#0874E3',
          arrowColor: '#041220',
          backgroundColor: '#041220',
          textColor: '#ffffff',
          overlayColor: 'rgba(0, 0, 0, 0.7)',
        }
      }}
      locale={{
        back: 'Back',
        close: 'Close',
        last: 'Finish',
        next: 'Next',
        skip: 'Skip Tour',
        open: 'Open the guide',
      }}
    />
  );
};
