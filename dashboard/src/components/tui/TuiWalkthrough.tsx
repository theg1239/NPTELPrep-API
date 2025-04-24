"use client";
import { useState, useEffect } from "react";
import { TuiButton, TuiPanel, TuiAlert } from "./components";

const WALKTHROUGH_STEPS = [
  {
    title: "Welcome to NPTELPrep",
    content: "This dashboard uses a text-based interface (TUI) inspired by terminal applications like Vim and Tmux. Let's learn how to navigate.",
    position: "center",
    asciiArt: `┌─────────────────────────────────┐
│                                 │
│   NPTEL API KEY DASHBOARD       │
│   Terminal User Interface       │
│                                 │
└─────────────────────────────────┘`
  },
  {
    title: "Navigation Modes",
    content: "The dashboard has three modes: NORMAL (for navigation), INSERT (for editing), and COMMAND (for executing commands). Look at the status bar below to see which mode you're in.",
    position: "top-right",
    highlightSelector: ".status-bar",
    asciiArt: `┌─[ MODES ]──────────────────────┐
│                                │
│  [NORMAL]  Navigation mode     │
│  [INSERT]  Text editing mode   │
│  [COMMAND] Execute commands    │
│                                │
└────────────────────────────────┘`
  },
  {
    title: "Vim-style Navigation",
    content: "Use j/k to move up and down, Tab to switch focus between sidebar and content, and Enter to select.",
    position: "left",
    asciiArt: `┌─[ NAVIGATION ]───────────────┐
│                              │
│  j or ↓ : Move down          │
│  k or ↑ : Move up            │
│  h or ← : Go back            │
│  l or → : Select             │
│  Tab    : Switch focus       │
│                              │
└──────────────────────────────┘`
  },
  {
    title: "Command Mode",
    content: "Press ':' to enter command mode. Try commands like ':help', ':logout', or ':go dashboard'.",
    position: "bottom",
    highlightSelector: ".tui-cmdline",
    asciiArt: `┌─[ COMMANDS ]────────────────────┐
│                                 │
│  :help       Show help          │
│  :logout     Log out            │
│  :go keys    Go to keys page    │
│  :q          Exit dashboard     │
│                                 │
└─────────────────────────────────┘`
  },
  {
    title: "Keyboard Shortcuts",
    content: "Quick keys: d (Dashboard), k (API Keys), u (Usage), s (Settings). Press ? anytime for help.",
    position: "right",
    asciiArt: `┌─[ SHORTCUTS ]──────────────────┐
│                                │
│  d : Dashboard                 │
│  k : API Keys                  │
│  u : Usage                     │
│  s : Settings                  │
│  ? : Help                      │
│                                │
└────────────────────────────────┘`
  },
  {
    title: "UI Assistance Mode",
    content: "Toggle UI Assistance mode using the floating button at the bottom right for easier navigation. Try clicking it now!",
    position: "bottom-right",
    highlightSelector: ".fixed.z-50.select-none",
    interactive: true,
    asciiArt: `┌─[ ASSIST MODE ]─────────────────┐
│                                 │
│         ┌───────┐               │
│         │   ≡   │◄── Click me!  │
│         └───────┘               │
│                                 │
└─────────────────────────────────┘`
  }
];

interface TuiWalkthroughProps {
  onComplete: () => void;
  onSkip: () => void;
}

export default function TuiWalkthrough({ onComplete, onSkip }: TuiWalkthroughProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [visible, setVisible] = useState(true);
  const [highlightElement, setHighlightElement] = useState<HTMLElement | null>(null);

  useEffect(() => {
    document.body.classList.add('walkthrough-active');
    
    return () => {
      document.body.classList.remove('walkthrough-active');
    };
  }, []);

  useEffect(() => {
    const currentStepData = WALKTHROUGH_STEPS[currentStep];
    if (currentStepData.highlightSelector) {
      const element = document.querySelector(currentStepData.highlightSelector) as HTMLElement;
      if (element) {
        element.style.zIndex = '60';
        element.style.position = 'relative';
        element.style.boxShadow = '0 0 0 4px var(--tui-cyan), 0 0 15px var(--tui-cyan)';
        setHighlightElement(element);
      }
    }

    return () => {
      if (highlightElement) {
        highlightElement.style.zIndex = '';
        highlightElement.style.position = '';
        highlightElement.style.boxShadow = '';
        setHighlightElement(null);
      }
    };
  }, [currentStep]);

  const handleNext = () => {
    if (currentStep < WALKTHROUGH_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      completeWalkthrough();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const completeWalkthrough = () => {
    setVisible(false);
    localStorage.setItem('tui-walkthrough-completed', 'true');
    onComplete();
  };

  const skipWalkthrough = () => {
    setVisible(false);
    localStorage.setItem('tui-walkthrough-completed', 'true');
    onSkip();
  };

  if (!visible) return null;

  const currentStepData = WALKTHROUGH_STEPS[currentStep];
  const isLastStep = currentStep === WALKTHROUGH_STEPS.length - 1;
  const isFirstStep = currentStep === 0;

  const getPositionClass = () => {
    switch (currentStepData.position) {
      case 'top-right': return 'top-24 right-24';
      case 'top-left': return 'top-24 left-24';
      case 'bottom-right': return 'bottom-24 right-24';
      case 'bottom-left': return 'bottom-24 left-24';
      case 'top': return 'top-24 left-1/2 transform -translate-x-1/2';
      case 'bottom': return 'bottom-24 left-1/2 transform -translate-x-1/2';
      case 'left': return 'left-24 top-1/2 transform -translate-y-1/2';
      case 'right': return 'right-24 top-1/2 transform -translate-y-1/2';
      case 'center': 
      default: return 'top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className={`absolute max-w-md z-50 ${getPositionClass()}`}>
        <TuiPanel title={`Step ${currentStep + 1}/${WALKTHROUGH_STEPS.length}: ${currentStepData.title}`} color="cyan">
          <div className="px-3 py-3">
            <div className="text-tui-white mb-4">
              {currentStepData.content}
            </div>
            
            {currentStepData.asciiArt && (
              <div className="mb-4 p-2 bg-black border border-tui-blue/30">
                <pre className="text-tui-cyan text-xs font-mono whitespace-pre overflow-x-auto bg-black p-0 m-0 leading-tight">
                  {currentStepData.asciiArt}
                </pre>
              </div>
            )}
            
            <div className="flex justify-between">
              <div>
                {!isFirstStep && (
                  <TuiButton 
                    variant="secondary" 
                    size="sm" 
                    onClick={handlePrev}
                  >
                    Previous
                  </TuiButton>
                )}
              </div>
              <div className="flex space-x-2">
                <TuiButton 
                  variant="secondary" 
                  size="sm" 
                  onClick={skipWalkthrough}
                >
                  Skip
                </TuiButton>
                <TuiButton 
                  variant="primary" 
                  size="sm" 
                  onClick={handleNext}
                >
                  {isLastStep ? 'Finish' : 'Next'}
                </TuiButton>
              </div>
            </div>
          </div>
        </TuiPanel>
        <div className="text-center mt-2">
          <div className="flex justify-center space-x-1">
            {WALKTHROUGH_STEPS.map((_, index) => (
              <div 
                key={index} 
                className={`w-2 h-2 rounded-full ${index === currentStep ? 'bg-tui-cyan' : 'bg-tui-gray'}`}
                onClick={() => setCurrentStep(index)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
} 