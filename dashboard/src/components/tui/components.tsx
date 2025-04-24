"use client";
import React, { useRef, useState, useEffect } from "react";
import Link from "next/link";

interface TuiButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  variant?: "primary" | "secondary" | "destructive" | "success";
  size?: "sm" | "md" | "lg";
  shortcut?: string;
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit" | "reset";
}

export function TuiButton({
  children,
  onClick,
  href,
  variant = "primary",
  size = "md",
  shortcut,
  disabled = false,
  className = "",
  type = "button",
}: TuiButtonProps) {
  const [focused, setFocused] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | HTMLAnchorElement>(null);
  
  const variantStyles = {
    primary: "border-tui-cyan text-tui-cyan hover:bg-tui-cyan/20",
    secondary: "border-tui-blue text-tui-blue hover:bg-tui-blue/20",
    destructive: "border-tui-red text-tui-red hover:bg-tui-red/20",
    success: "border-tui-green text-tui-green hover:bg-tui-green/20",
  };
  
  const sizeStyles = {
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-3 py-1",
    lg: "text-base px-4 py-1.5",
  };
  
  const buttonStyle = `
    tui-button font-mono border inline-flex items-center 
    justify-center transition-colors select-none 
    ${variantStyles[variant]} ${sizeStyles[size]} ${focused ? 'outline outline-1 outline-offset-1' : ''}
    ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
    ${className}
  `;
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (focused && (e.key === "Enter" || e.key === " ") && !disabled) {
        e.preventDefault();
        onClick?.();
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [focused, onClick, disabled]);
  
  if (href && !disabled) {
    return (
      <Link
        href={href}
        className={buttonStyle}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        ref={buttonRef as React.RefObject<HTMLAnchorElement>}
      >
        {children}
        {shortcut && <span className="ml-2 opacity-70">[{shortcut}]</span>}
      </Link>
    );
  }
  
  return (
    <button
      type={type}
      className={buttonStyle}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      ref={buttonRef as React.RefObject<HTMLButtonElement>}
    >
      {children}
      {shortcut && <span className="ml-2 opacity-70">[{shortcut}]</span>}
    </button>
  );
}

interface TuiPanelProps {
  children: React.ReactNode;
  title?: string;
  color?: "cyan" | "green" | "blue" | "yellow" | "magenta" | "red" | "white";
  className?: string;
  collapsible?: boolean;
}

export function TuiPanel({
  children,
  title,
  color = "white",
  className = "",
  collapsible = false,
}: TuiPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  
  const colorClass = `tui-${color}`;
  
  const toggleCollapse = () => {
    if (collapsible) {
      setCollapsed(!collapsed);
    }
  };
  
  const renderTitleBox = () => {
    if (!title) return null;
    
    const panelWidth = 40;
    
    const titleTextLength = title.length;
    const bracketSpaceLength = 6; // For "┌─[ " and " ]"
    const collapseButtonLength = collapsible ? 1 : 0;
    const remainingSpace = panelWidth - titleTextLength - bracketSpaceLength - collapseButtonLength;
    
    const padding = remainingSpace > 0 ? "─".repeat(remainingSpace) : "";
    
    const headerLine = `┌─[ ${title} ]${padding}${collapsible ? (collapsed ? "▼" : "▲") : "─"}┐`;
    
    return (
      <div 
        className={`tui-panel-title relative font-mono whitespace-pre ${collapsible ? 'cursor-pointer' : ''}`} 
        onClick={toggleCollapse}
      >
        {headerLine}
      </div>
    );
  };
  
  return (
    <div className={`tui-panel ${colorClass} ${className} mb-3`}>
      {renderTitleBox()}
      {!collapsed && (
        <div className="tui-panel-content select-none">
          {children}
        </div>
      )}
      {!collapsed && (
        <div className="tui-panel-footer font-mono whitespace-pre">
          {`└${"─".repeat(40)}┘`}
        </div>
      )}
    </div>
  );
}

interface TuiInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  className?: string;
  label?: string;
  disabled?: boolean;
  required?: boolean;
  autoFocus?: boolean;
}

export function TuiInput({
  value,
  onChange,
  placeholder = "",
  type = "text",
  className = "",
  label,
  disabled = false,
  required = false,
  autoFocus = false,
}: TuiInputProps) {
  const [focused, setFocused] = useState(false);
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape') {
      e.stopPropagation();
    }
  };
  
  return (
    <div className="tui-input-wrapper">
      {label && (
        <label className="block text-xs text-tui-cyan mb-1 font-mono">
          {label}
          {required && <span className="text-tui-red ml-1">*</span>}
        </label>
      )}
      <div className={`relative border ${focused ? 'border-tui-green' : 'border-tui-blue'}`}>
        <input
          type={type}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          className={`
            w-full bg-transparent font-mono text-sm px-2 py-1
            focus:outline-none ${disabled ? 'opacity-50' : ''}
            tui-input ${className}
          `}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          autoFocus={autoFocus}
          required={required}
        />
        {focused && (
          <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs text-tui-green">
            [INSERT]
          </div>
        )}
      </div>
    </div>
  );
}

interface TuiTableProps {
  headers: string[];
  rows: React.ReactNode[][];
  className?: string;
  onRowSelect?: (index: number) => void;
  keyboardNav?: boolean;
}

export function TuiTable({
  headers,
  rows,
  className = "",
  onRowSelect,
  keyboardNav = true,
}: TuiTableProps) {
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!keyboardNav) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement !== tableRef.current) return;
      
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedRow((prev) => {
          const newIndex = prev === null ? 0 : Math.min(prev + 1, rows.length - 1);
          onRowSelect?.(newIndex);
          return newIndex;
        });
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedRow((prev) => {
          const newIndex = prev === null ? rows.length - 1 : Math.max(prev - 1, 0);
          onRowSelect?.(newIndex);
          return newIndex;
        });
      } else if (e.key === "Enter" && selectedRow !== null) {
        e.preventDefault();
        onRowSelect?.(selectedRow);
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [keyboardNav, onRowSelect, rows.length, selectedRow]);
  
  return (
    <div 
      className={`tui-table-wrapper overflow-x-auto ${className}`}
      ref={tableRef}
      tabIndex={keyboardNav ? 0 : -1}
    >
      <table className="w-full border-collapse text-xs font-mono">
        <thead>
          <tr className="border-b border-tui-blue">
            {headers.map((header, i) => (
              <th 
                key={i}
                className="px-2 py-1 text-left text-tui-blue font-mono uppercase text-xs"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr 
              key={rowIndex}
              className={`
                border-b border-gray-800 hover:bg-black/40
                ${selectedRow === rowIndex ? 'bg-tui-blue/20' : ''}
              `}
              onClick={() => {
                setSelectedRow(rowIndex);
                onRowSelect?.(rowIndex);
              }}
            >
              {row.map((cell, cellIndex) => (
                <td 
                  key={cellIndex}
                  className="px-2 py-1 whitespace-nowrap"
                >
                  {selectedRow === rowIndex && cellIndex === 0 && (
                    <span className="mr-1 text-tui-green">»</span>
                  )}
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface TuiFormProps {
  children: React.ReactNode;
  onSubmit: (e: React.FormEvent) => void;
  title?: string;
  className?: string;
}

export function TuiForm({
  children,
  onSubmit,
  title,
  className = "",
}: TuiFormProps) {
  return (
    <form onSubmit={onSubmit} className={`tui-form ${className}`}>
      {title && (
        <div className="text-tui-cyan text-sm mb-3">
          {`┌─[ ${title} ]${"─".repeat(Math.max(0, 30 - title.length - 4))}┐`}
        </div>
      )}
      
      <div className="border border-tui-cyan p-4">
        {children}
      </div>
      
      {title && (
        <div className="text-tui-cyan text-sm mt-1">
          {`└${"─".repeat(Math.max(0, 30))}┘`}
        </div>
      )}
    </form>
  );
}

interface TuiSelectProps {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
}

export function TuiSelect({
  options,
  value,
  onChange,
  label,
  className = "",
  disabled = false,
  required = false,
}: TuiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const selectRef = useRef<HTMLDivElement>(null);
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape') {
      e.stopPropagation();
    }
    
    if (e.key === 'ArrowDown' && !isOpen) {
      setIsOpen(true);
      e.preventDefault();
    } else if (e.key === 'Escape' && isOpen) {
      setIsOpen(false);
      e.preventDefault();
    }
  };
  
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  
  const selectedOption = options.find(opt => opt.value === value);
  
  return (
    <div className="tui-select-wrapper" ref={selectRef}>
      {label && (
        <label className="block text-xs text-tui-cyan mb-1 font-mono">
          {label}
          {required && <span className="text-tui-red ml-1">*</span>}
        </label>
      )}
      
      <div 
        className={`
          relative border cursor-pointer tui-input
          ${focused ? 'border-tui-green' : 'border-tui-blue'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${className}
        `}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={handleKeyDown}
        tabIndex={disabled ? -1 : 0}
      >
        <div className="px-2 py-1 font-mono text-sm flex justify-between items-center">
          <span>{selectedOption?.label || "Select an option"}</span>
          <span className="text-tui-cyan">{isOpen ? "▲" : "▼"}</span>
        </div>
        
        {isOpen && (
          <div className="absolute z-10 left-0 right-0 mt-1 border border-tui-blue bg-black max-h-40 overflow-y-auto">
            {options.map((option) => (
              <div
                key={option.value}
                className={`
                  px-2 py-1 font-mono text-sm cursor-pointer
                  ${option.value === value ? 'bg-tui-blue/20 text-tui-cyan' : 'hover:bg-tui-blue/10'}
                `}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(option.value);
                  setIsOpen(false);
                }}
              >
                {option.value === value ? `» ${option.label}` : `  ${option.label}`}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface TuiProgressProps {
  value: number;
  max?: number;
  size?: "sm" | "md" | "lg";
  color?: "cyan" | "green" | "blue" | "yellow" | "magenta" | "red";
  showLabel?: boolean;
  className?: string;
}

export function TuiProgress({
  value,
  max = 100,
  size = "md",
  color = "green",
  showLabel = true,
  className = "",
}: TuiProgressProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  
  const sizeStyles = {
    sm: "h-1",
    md: "h-2",
    lg: "h-3",
  };
  
  const colorStyles = {
    cyan: "text-tui-cyan",
    green: "text-tui-green",
    blue: "text-tui-blue",
    yellow: "text-tui-yellow",
    magenta: "text-tui-magenta",
    red: "text-tui-red",
  };
  
  const asciiBar = () => {
    const width = 30; // Fixed width for consistency
    const filledChars = Math.round((percentage / 100) * width);
    const emptyChars = width - filledChars;
    return `[${"|".repeat(filledChars)}${" ".repeat(emptyChars)}]`;
  };
  
  return (
    <div className={`tui-progress ${className}`}>
      <pre className={`${colorStyles[color]} font-mono text-xs whitespace-pre m-0 p-0 leading-none`}>
        {showLabel && `${percentage.toFixed(0)}% `}{asciiBar()}
      </pre>
    </div>
  );
}

interface TuiTabsProps {
  tabs: { id: string; label: string; content: React.ReactNode }[];
  className?: string;
}

export function TuiTabs({ tabs, className = "" }: TuiTabsProps) {
  const [activeTab, setActiveTab] = useState<string>(tabs[0]?.id || "");
  
  return (
    <div className={`tui-tabs ${className}`}>
      <div className="tui-tabs-header flex border-b border-tui-blue">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`
              px-3 py-1 cursor-pointer font-mono text-sm
              ${activeTab === tab.id ? 'text-tui-cyan border-b-2 border-tui-cyan -mb-px' : 'text-tui-blue'}
            `}
            onClick={() => setActiveTab(tab.id)}
          >
            {activeTab === tab.id ? `» ${tab.label}` : tab.label}
          </div>
        ))}
      </div>
      
      <div className="tui-tabs-content pt-4">
        {tabs.find(tab => tab.id === activeTab)?.content}
      </div>
    </div>
  );
}

interface TuiAlertProps {
  type: "info" | "success" | "warning" | "error";
  message: string;
  onClose?: () => void;
  className?: string;
}

export function TuiAlert({
  type,
  message,
  onClose,
  className = "",
}: TuiAlertProps) {
  const typeStyles = {
    info: "border-tui-blue text-tui-blue",
    success: "border-tui-green text-tui-green",
    warning: "border-tui-yellow text-tui-yellow",
    error: "border-tui-red text-tui-red",
  };
  
  const symbols = {
    info: "[i]",
    success: "[✓]",
    warning: "[!]",
    error: "[✗]",
  };
  
  return (
    <div className={`tui-alert border px-3 py-2 flex items-center ${typeStyles[type]} ${className}`}>
      <span className="mr-2 font-bold">{symbols[type]}</span>
      <span className="flex-1 font-mono text-sm">{message}</span>
      {onClose && (
        <button onClick={onClose} className="ml-2 focus:outline-none">
          [x]
        </button>
      )}
    </div>
  );
}

interface TuiCodeProps {
  code: string;
  language?: string;
  className?: string;
}

export function TuiCode({ code, language, className = "" }: TuiCodeProps) {
  return (
    <div className={`tui-code ${className}`}>
      <div className="mb-1 font-mono text-xs text-tui-blue">
        {`┌─[ ${language || "code"} ]${"─".repeat(Math.max(0, 20 - (language || "code").length))}`}
      </div>
      <pre className="bg-black border border-tui-blue p-3 overflow-x-auto font-mono text-xs">
        {code}
      </pre>
    </div>
  );
}

interface TuiKeyHintProps {
  shortcut: string;
  description: string;
  className?: string;
}

export function TuiKeyHint({ shortcut, description, className = "" }: TuiKeyHintProps) {
  return (
    <div className={`tui-key-hint inline-flex items-center text-xs font-mono ${className}`}>
      <span className="border border-tui-blue px-1.5 rounded text-tui-blue">{shortcut}</span>
      <span className="ml-1.5 text-gray-400">{description}</span>
    </div>
  );
}

interface TuiSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  className?: string;
  disabled?: boolean;
}

export function TuiSwitch({
  checked,
  onChange,
  label,
  className = "",
  disabled = false,
}: TuiSwitchProps) {
  return (
    <label className={`tui-switch inline-flex items-center cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}>
      {label && <span className="mr-2 text-sm font-mono">{label}</span>}
      
      <div 
        className={`relative inline-flex cursor-pointer ${disabled ? 'cursor-not-allowed' : ''}`}
        onClick={() => !disabled && onChange(!checked)}
      >
        <span className="px-2 border text-xs font-mono">
          {checked ? '[ON]' : '[OFF]'}
        </span>
      </div>
    </label>
  );
}

interface TuiModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function TuiModal({
  isOpen,
  onClose,
  title,
  children,
  className = "",
}: TuiModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isOpen && e.key === "Escape") {
        onClose();
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black opacity-80" onClick={onClose}></div>
      
      <div className={`relative z-10 border border-tui-blue bg-black max-w-md w-full max-h-[90vh] overflow-auto ${className}`}>
        <div className="tui-modal-header border-b border-tui-blue px-4 py-2 flex justify-between items-center">
          <div className="font-mono text-tui-cyan">{title}</div>
          <button onClick={onClose} className="text-tui-blue hover:text-tui-cyan">
            [x]
          </button>
        </div>
        
        <div className="tui-modal-body p-4 font-mono text-sm">
          {children}
        </div>
      </div>
    </div>
  );
}

interface TuiStatProps {
  value: string | number;
  label: string;
  icon?: string;
  color?: "cyan" | "green" | "blue" | "yellow" | "magenta" | "red" | "white";
  size?: "sm" | "md" | "lg";
  className?: string;
  showBar?: boolean;
  barValue?: number;
  barMax?: number;
}

export function TuiStat({
  value,
  label,
  icon,
  color = "cyan",
  size = "md",
  className = "",
  showBar = false,
  barValue = 0,
  barMax = 100
}: TuiStatProps) {
  const colorClass = `text-tui-${color}`;
  
  const sizeClasses = {
    sm: "text-base",
    md: "text-2xl",
    lg: "text-3xl"
  };
  
  const generateAsciiBar = () => {
    const width = 20;
    const percentage = Math.min(100, Math.max(0, (barValue / barMax) * 100));
    const filledChars = Math.round((percentage / 100) * width);
    const emptyChars = width - filledChars;
    
    return (
      <div className={`font-mono text-xs ${colorClass} whitespace-pre mt-1`}>
        {`[${"█".repeat(filledChars)}${" ".repeat(emptyChars)}] ${percentage.toFixed(0)}%`}
      </div>
    );
  };
  
  return (
    <div className={`tui-stat py-2 px-3 border border-tui-${color}/30 bg-black ${className}`}>
      <div className="text-center">
        {icon && <div className={`${colorClass} text-xl mb-1`}>{icon}</div>}
        <div className={`${colorClass} ${sizeClasses[size]} font-bold font-mono`}>
          {value}
        </div>
        <div className="text-xs text-tui-gray mt-1 font-mono">{label}</div>
        {showBar && generateAsciiBar()}
      </div>
    </div>
  );
} 