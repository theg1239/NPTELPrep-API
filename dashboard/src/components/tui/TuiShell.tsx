"use client";
import React, { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import TuiMobileNav from "@/components/tui/TuiMobileNav";
import TuiAssistMode from "@/components/tui/TuiAssistMode";
import TuiWalkthrough from "@/components/tui/TuiWalkthrough";

const NAV_ITEMS = [
  { label: "Dashboard", path: "/dashboard", key: "d" },
  { label: "API Keys", path: "/dashboard/keys", key: "k" },
  { label: "Usage", path: "/dashboard/usage", key: "u" },
  { label: "Settings", path: "/dashboard/settings", key: "s" },
];

type Mode = "NORMAL" | "COMMAND" | "INSERT";

export function TuiShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [mode, setMode] = useState<Mode>("NORMAL");
  const [sidebarFocus, setSidebarFocus] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState(
    Math.max(0, NAV_ITEMS.findIndex((item) => pathname.startsWith(item.path)))
  );
  const [contentFocus, setContentFocus] = useState(false);
  const [commandText, setCommandText] = useState("");
  const [statusText, setStatusText] = useState("");
  const shellRef = useRef<HTMLDivElement>(null);
  const commandInputRef = useRef<HTMLInputElement>(null);
  
  const [scrollPosition, setScrollPosition] = useState(0);
  const maxDisplayedLines = 20;
  
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackEmail, setFeedbackEmail] = useState("");
  
  const isInputElementFocused = () => {
    const activeElement = document.activeElement;
    return activeElement && (
      activeElement.tagName === 'INPUT' || 
      activeElement.tagName === 'TEXTAREA' || 
      activeElement.tagName === 'SELECT' || 
      (activeElement as HTMLElement).isContentEditable ||
      activeElement.classList.contains('tui-input') ||
      activeElement.hasAttribute('contenteditable')
    );
  };
  
  const showStatus = (message: string, duration = 3000) => {
    setStatusText(message);
    setTimeout(() => setStatusText(""), duration);
  };
  
  const submitFeedback = async () => {
    if (!feedbackMessage.trim()) {
      showStatus("Feedback message cannot be empty", 3000);
      return;
    }
    
    showStatus("Thank you for your feedback!", 5000);
    setShowFeedback(false);
    setFeedbackMessage("");
    setFeedbackEmail("");
    
    // try {
    //   await fetch('/api/feedback', {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify({ message: feedbackMessage, email: feedbackEmail })
    //   });
    // } catch (error) {
    //   console.error('Error submitting feedback:', error);
    // }
  };
  
  useEffect(() => {
    const walkthroughCompleted = localStorage.getItem('tui-walkthrough-completed') === 'true';
    setShowWalkthrough(!walkthroughCompleted);
  }, []);
  
  const handleWalkthroughComplete = () => {
    setShowWalkthrough(false);
    localStorage.setItem('tui-assist-mode', 'true');
    showStatus("Walkthrough completed. Press ? for help anytime.", 5000);
  };
  
  const handleWalkthroughSkip = () => {
    setShowWalkthrough(false);
    localStorage.setItem('tui-assist-mode', 'true');
    showStatus("Walkthrough skipped. Press ? for help anytime.", 5000);
  };

  const executeCommand = () => {
    const cmd = commandText.trim();
    
    if (cmd === ":q" || cmd === ":quit") {
      router.push("/");
      showStatus("Exiting dashboard...");
    }
    else if (cmd === ":logout") {
      signOut({ callbackUrl: "/auth/login" });
      showStatus("Logging out...");
    }
    else if (cmd.startsWith(":go")) {
      const page = cmd.split(" ")[1]?.toLowerCase();
      const navItem = NAV_ITEMS.find(item => 
        item.label.toLowerCase().includes(page) || 
        item.path.includes(page)
      );
      
      if (navItem) {
        router.push(navItem.path);
        showStatus(`Navigating to ${navItem.label}...`);
      } else {
        showStatus(`Error: Unknown location '${page}'`, 2000);
      }
    }
    else if (cmd === ":help") {
      showStatus("Available commands: :q, :logout, :go [page], :assist, :feedback", 5000);
    }
    else if (cmd === ":assist") {
      localStorage.setItem('tui-assist-mode', 'true');
      showStatus("Assist mode enabled. Look for the floating button.", 3000);
    }
    else if (cmd === ":feedback") {
      setShowFeedback(true);
      showStatus("Feedback form opened", 2000);
    }
    else {
      showStatus(`Unknown command: ${cmd}`, 2000);
    }
    
    setCommandText("");
    setMode("NORMAL");
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const key = e.key;
      
      if (mode === 'COMMAND') {
        if (key === 'Enter') {
          executeCommand();
          setCommandText('');
          setMode('NORMAL');
          e.preventDefault();
          return;
        } else if (key === 'Escape') {
          setCommandText('');
          setMode('NORMAL');
          e.preventDefault();
          return;
        }
        return;
      }

      if (isInputElementFocused()) {
        if (key === 'Escape') {
          (document.activeElement as HTMLElement)?.blur();
          e.preventDefault();
        }
        return;
      }
      
      if (mode !== 'NORMAL') return;

      switch (key) {
        case ':':
          setMode('COMMAND');
          setCommandText('');
          e.preventDefault();
          break;
        case 'i':
          setMode('INSERT');
          e.preventDefault();
          break;
        case 'Tab':
          setSidebarFocus((f) => !f);
          setContentFocus((f) => !f);
          e.preventDefault();
          break;
        case 'j':
        case 'ArrowDown':
          setSelectedIdx((idx) => (idx + 1) % NAV_ITEMS.length);
          e.preventDefault();
          break;
        case 'k':
        case 'ArrowUp':
          setSelectedIdx((idx) => (idx - 1 + NAV_ITEMS.length) % NAV_ITEMS.length);
          e.preventDefault();
          break;
        case 'l':
        case 'Enter':
        case 'ArrowRight':
          router.push(NAV_ITEMS[selectedIdx].path);
          setSidebarFocus(false);
          setContentFocus(true);
          e.preventDefault();
          break;
        case 'h':
        case 'Escape':
        case 'ArrowLeft':
          setSidebarFocus(true);
          setContentFocus(false);
          e.preventDefault();
          break;
        case 'G':
          setScrollPosition(100);
          e.preventDefault();
          break;
        case 'g':
          if (e.shiftKey === false) {
            setScrollPosition(0);
            e.preventDefault();
          }
          break;
        case 'd':
          if (e.ctrlKey) {
            setScrollPosition(pos => Math.min(pos + 10, 100));
            e.preventDefault();
          } else {
            router.push('/dashboard');
            e.preventDefault();
          }
          break;
        case 'k':
          router.push('/dashboard/keys');
          e.preventDefault();
          break;
        case 'u':
          if (e.ctrlKey) {
            setScrollPosition(pos => Math.max(pos - 10, 0));
            e.preventDefault();
          } else {
            router.push('/dashboard/usage');
            e.preventDefault();
          }
          break;
        case 's':
          router.push('/dashboard/settings');
          e.preventDefault();
          break;
        case 'q':
        case 'Q':
          if (e.shiftKey) {
            router.push('/');
            e.preventDefault();
          }
          break;
        case '?':
          showStatus("Press : for commands, Tab to switch focus", 5000);
          e.preventDefault();
          break;
      }
    };

    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
    };
  }, [mode, commandText, selectedIdx, router]);

  useEffect(() => {
    if (mode === "NORMAL") {
      shellRef.current?.focus();
    }
  }, [mode]);

  function renderLineNumbers() {
    return (
      <div className="tui-line-numbers text-gray-600 text-xs text-right pr-2 select-none w-[3ch]">
        {Array.from({ length: maxDisplayedLines }, (_, i) => 
          <div key={i} className="h-5 leading-5">{i + 1 + scrollPosition}</div>
        )}
      </div>
    );
  }
  
  function renderSidebar() {
    return (
      <div className="flex flex-col h-full">
        <pre
          className="tui-sidebar tui-border tui-cyan px-3 py-2 h-full min-w-[35ch] max-w-[35ch] text-xs overflow-hidden select-none"
          tabIndex={-1}
          aria-label="Sidebar navigation"
        >

          {`┌─[ MAIN NAVIGATION ]${"─".repeat(14)}┐\n`}
          {NAV_ITEMS.map((item, idx) =>
            idx === selectedIdx && sidebarFocus ?
              `│ » ${item.label.padEnd(19)} [${item.key}] │\n` :
              `│   ${item.label.padEnd(19)} [${item.key}] │\n`
          ).join("")}
          {`└${"─".repeat(35)}┘`}
          
          
          {`\n┌─[ KEYBOARD SHORTCUTS ]${"─".repeat(11)}┐\n`}
          {`│ :q           :logout           │\n`}
          {`│ :go <page>   h,j,k,l           │\n`}
          {`│ Esc          Tab               │\n`}
          {`│ Ctrl+d/u     g/G               │\n`}
          {`└${"─".repeat(35)}┘`}
        </pre>
      </div>
    );
  }

  function renderStatusBar() {
    return (
      <div className="flex items-center border-t tui-border tui-blue status-bar">
        <div className={`px-2 py-1 text-xs font-bold ${mode === "NORMAL" ? "bg-tui-blue text-black" : mode === "INSERT" ? "bg-tui-green text-black" : "bg-tui-magenta text-black"}`}>
          {mode}
        </div>
        <div className="flex-1 px-2 py-1 text-xs">
          {statusText || `${pathname} | NPTEL API Dashboard ${scrollPosition > 0 ? `[scroll: ${scrollPosition}]` : ''}`}
        </div>
        <div className="pr-2 py-1 text-xs">
          {new Date().toLocaleTimeString()}
        </div>
      </div>
    );
  }

  function renderCommandLine() {
    return (
      <div className="tui-cmdline border-t tui-border flex items-center bg-black">
        {mode === "COMMAND" ? (
          <input
            ref={commandInputRef}
            type="text"
            value={commandText}
            onChange={(e) => setCommandText(e.target.value)}
            className="flex-1 bg-transparent border-none text-tui-white px-2 py-1 text-xs focus:outline-none font-mono"
            autoFocus
          />
        ) : (
          <div className="flex-1 px-2 py-1 text-xs text-gray-600 font-mono">
            Press : to enter command mode
          </div>
        )}
      </div>
    );
  }

  function renderContentWindow() {
    return (
      <div className="flex flex-row h-full overflow-hidden">
        {renderLineNumbers()}
        <div 
          className={`tui-content-window tui-border ${contentFocus ? 'tui-green' : 'tui-gray'} flex-1 min-h-[calc(100vh-6rem)] max-w-full overflow-auto px-4 py-2`}
          style={{ scrollBehavior: 'smooth', scrollbarWidth: 'none' }}
        >
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={shellRef}
      className="tui-shell bg-black text-green-400 font-mono min-h-screen w-full flex flex-col outline-none overflow-hidden"
      tabIndex={0}
      aria-label="TUI Shell"
    >
      <div className="flex flex-row w-full flex-1 min-h-0 overflow-hidden">
        {/* <div className="hidden md:block">
          {renderSidebar()}
        </div> */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {renderContentWindow()}
        </div>
      </div>
      {renderStatusBar()}
      {renderCommandLine()}
      
      <TuiMobileNav />
      
      <TuiAssistMode />
      
      {showWalkthrough && (
        <TuiWalkthrough 
          onComplete={handleWalkthroughComplete}
          onSkip={handleWalkthroughSkip}
        />
      )}
      
      {showFeedback && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black opacity-80" onClick={() => setShowFeedback(false)}></div>
          
          <div className="relative z-10 border-2 border-tui-cyan bg-black max-w-md w-full overflow-auto">
            <div className="border-b border-tui-cyan px-4 py-2 flex justify-between items-center">
              <div className="font-mono text-tui-cyan">Feedback</div>
              <button onClick={() => setShowFeedback(false)} className="text-tui-blue hover:text-tui-cyan">
                [x]
              </button>
            </div>
            
            <div className="p-4 font-mono text-sm">
              <p className="text-tui-white mb-4">Your feedback helps us improve the dashboard experience!</p>
              
              <div className="mb-4">
                <label className="block text-xs text-tui-cyan mb-1">
                  Email (optional):
                </label>
                <input
                  type="email"
                  value={feedbackEmail}
                  onChange={(e) => setFeedbackEmail(e.target.value)}
                  className="w-full bg-black border border-tui-blue px-2 py-1 text-tui-white font-mono text-sm tui-input"
                  placeholder="your@email.com"
                />
              </div>
              
              <div className="mb-4">
                <label className="block text-xs text-tui-cyan mb-1">
                  Feedback:
                </label>
                <textarea
                  value={feedbackMessage}
                  onChange={(e) => setFeedbackMessage(e.target.value)}
                  className="w-full h-32 bg-black border border-tui-blue px-2 py-1 text-tui-white font-mono text-sm tui-input"
                  placeholder="Tell us what you think..."
                />
              </div>
              
              <div className="flex justify-end">
                <button
                  onClick={() => setShowFeedback(false)}
                  className="border border-tui-blue text-tui-blue px-2 py-1 text-sm mr-2 hover:bg-tui-blue/20"
                >
                  Cancel
                </button>
                <button
                  onClick={submitFeedback}
                  className="border border-tui-cyan text-tui-cyan px-2 py-1 text-sm hover:bg-tui-cyan/20"
                >
                  Submit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TuiShell;
