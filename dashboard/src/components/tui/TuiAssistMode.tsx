"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { TuiButton } from "./components"; 
import { usePathname } from "next/navigation";
import "../../styles/animations.css";

interface AssistButton {
  label: string;
  icon: string;
  action: () => void;
  color?: string;
}

export default function TuiAssistMode() {
  const [isOpen, setIsOpen] = useState(false);
  const [isEnabled, setIsEnabled] = useState(true);
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [menuPosition, setMenuPosition] = useState<'left' | 'right'>('right');
  const containerRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef(position);
  const dragOffsetRef = useRef(dragOffset);
  const isDraggingRef = useRef(isDragging);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    positionRef.current = position;
    dragOffsetRef.current = dragOffset;
    isDraggingRef.current = isDragging;
  }, [position, dragOffset, isDragging]);

  useEffect(() => {
    function updatePosition() {
      if (!isDraggingRef.current) {
        const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 800;
        const screenHeight = typeof window !== 'undefined' ? window.innerHeight : 600;
        
        const defaultX = screenWidth - 80;
        const defaultY = screenHeight - 80;
        
        const currentPos = positionRef.current;
        const isOutOfBounds = 
          currentPos.x < 0 || 
          currentPos.y < 0 || 
          currentPos.x > screenWidth - 20 || 
          currentPos.y > screenHeight - 20;
        
        if (isOutOfBounds) {
          setPosition({ x: defaultX, y: defaultY });
        } else if (currentPos.x === 20 && currentPos.y === 20) {
          setPosition({ x: defaultX, y: defaultY });
        }
      }
    }

    updatePosition();

    window.addEventListener('resize', updatePosition);

    const assistModeEnabled = localStorage.getItem('tui-assist-mode');
    if (assistModeEnabled === null) {
      localStorage.setItem('tui-assist-mode', 'true');
    } else {
      setIsEnabled(assistModeEnabled === 'true');
    }

    const savedPos = localStorage.getItem('tui-assist-position');
    if (savedPos) {
      try {
        const parsedPos = JSON.parse(savedPos);
        if (typeof parsedPos.x === 'number' && typeof parsedPos.y === 'number') {
          setPosition(parsedPos);
        }
      } catch (e) {
        console.error("Error parsing saved position:", e);
      }
    }

    return () => {
      window.removeEventListener('resize', updatePosition);
    };
  }, []);

  useEffect(() => {
    if (isOpen && typeof window !== 'undefined') {
      const screenWidth = window.innerWidth;
      const buttonLeft = positionRef.current.x;
      const menuWidth = 220;
      
      if (buttonLeft + menuWidth + 20 > screenWidth) {
        setMenuPosition('left');
      } else {
        setMenuPosition('right');
      }
    }
  }, [isOpen]);

  useEffect(() => {
    const saveTimeout = setTimeout(() => {
      if (positionRef.current.x !== 20 || positionRef.current.y !== 20) {
        localStorage.setItem('tui-assist-position', JSON.stringify(positionRef.current));
      }
    }, 500);

    return () => clearTimeout(saveTimeout);
  }, [position]);

  useEffect(() => {
    localStorage.setItem('tui-assist-mode', isEnabled.toString());
  }, [isEnabled]);

  const toggleAssistMode = () => {
    setIsEnabled(prev => !prev);
    if (isEnabled) {
      const notification = document.createElement('div');
      notification.className = 'fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-black border-2 border-tui-cyan px-4 py-2 text-tui-white font-mono text-sm z-50 shadow-lg whitespace-nowrap';
      notification.innerHTML = 'Assist mode disabled. Use <span class="text-tui-cyan">:assist</span> command to enable it again.';
      document.body.appendChild(notification);
      
      setTimeout(() => {
        if (notification && notification.parentNode) {
          notification.classList.add('opacity-0');
          notification.style.transition = 'opacity 0.5s ease';
          setTimeout(() => {
            if (notification && notification.parentNode) {
              notification.parentNode.removeChild(notification);
            }
          }, 500);
        }
      }, 5000);
    }
  };

  const handleToggleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(prev => !prev);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    
    setIsDragging(true);
    const rect = containerRef.current.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDraggingRef.current) {
      const screenWidth = window.innerWidth;
      const screenHeight = window.innerHeight;
      const buttonWidth = 64;
      const buttonHeight = 64;
      
      let newX = e.clientX - dragOffsetRef.current.x;
      let newY = e.clientY - dragOffsetRef.current.y;
      
      newX = Math.max(0, Math.min(screenWidth - buttonWidth, newX));
      newY = Math.max(0, Math.min(screenHeight - buttonHeight, newY));
      
      requestAnimationFrame(() => {
        setPosition({
          x: newX,
          y: newY
        });
      });
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const navigateToPage = (path: string) => {
    router.push(path);
    setIsOpen(false);
  };

  const assistButtons: AssistButton[] = [
    {
      label: "Dashboard",
      icon: "⌂",
      action: () => navigateToPage("/dashboard"),
      color: pathname === "/dashboard" ? "text-tui-green" : ""
    },
    {
      label: "API Keys",
      icon: "🔑",
      action: () => navigateToPage("/dashboard/keys"),
      color: pathname?.includes("/dashboard/keys") ? "text-tui-green" : ""
    },
    {
      label: "Usage",
      icon: "📊",
      action: () => navigateToPage("/dashboard/usage"),
      color: pathname?.includes("/dashboard/usage") ? "text-tui-green" : ""
    },
    {
      label: "Settings",
      icon: "⚙️",
      action: () => navigateToPage("/dashboard/settings"),
      color: pathname?.includes("/dashboard/settings") ? "text-tui-green" : ""
    },
    {
      label: "Help",
      icon: "?",
      action: () => navigateToPage("/dashboard/help")
    },
    {
      label: "Logout",
      icon: "⏻",
      action: () => navigateToPage("/api/auth/signout"),
      color: "text-tui-red"
    }
  ];

  if (!isEnabled) return null;

  return (
    <div
      ref={containerRef}
      className="fixed z-50 select-none"
      style={{ 
        left: `${position.x}px`, 
        top: `${position.y}px`,
        transition: isDragging ? 'none' : 'all 0.3s ease'
      }}
    >
      <div 
        className={`w-16 h-16 rounded-full flex items-center justify-center cursor-pointer transition-all duration-300 ${
          isOpen ? 'bg-tui-blue border-2 border-tui-cyan shadow-lg' : 'bg-black border-2 border-tui-cyan hover:border-tui-magenta shadow-[0_0_15px_rgba(0,234,255,0.6)]'
        }`}
        onClick={handleToggleOpen}
        onMouseDown={handleMouseDown}
      >
        <span className="text-tui-cyan text-2xl font-mono">
          {isOpen ? "×" : "≡"}
        </span>
        {!isOpen && (
          <span className="absolute -top-2 -right-2 w-5 h-5 bg-tui-magenta rounded-full flex items-center justify-center text-xs text-black font-bold">?</span>
        )}
      </div>

      {isOpen && (
        <div 
          className={`fixed bg-black border-2 border-tui-cyan rounded p-3 min-w-[220px] shadow-lg`}
          style={{ 
            left: menuPosition === 'right' ? `${position.x + 70}px` : 'auto', 
            right: menuPosition === 'left' ? `${window.innerWidth - position.x + 10}px` : 'auto',
            bottom: position.y > window.innerHeight - 250 ? `${window.innerHeight - position.y + 40}px` : 'auto',
            top: position.y > window.innerHeight - 250 ? 'auto' : `${position.y + 40}px`
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-tui-cyan font-mono text-sm mb-3 pb-1 border-b border-tui-blue font-bold">
            ┌─[ ASSIST MODE ]──┐
          </div>
          
          <div className="space-y-2 mb-3">
            {assistButtons.map((btn, index) => (
              <div 
                key={index}
                onClick={btn.action}
                className={`flex items-center px-2 py-1 hover:bg-tui-blue/20 cursor-pointer rounded font-mono text-sm ${btn.color || 'text-tui-white'}`}
              >
                <span className="mr-3 w-6 inline-block text-center">{btn.icon}</span>
                <span>{btn.label}</span>
              </div>
            ))}
          </div>
          
          <div className="pt-2 border-t border-tui-gray flex justify-between items-center">
            <div className="text-tui-gray text-xs font-mono">Drag to move</div>
            <div
              className="text-tui-red text-xs font-mono cursor-pointer hover:text-tui-cyan font-bold"
              onClick={toggleAssistMode}
            >
              [DISABLE]
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 